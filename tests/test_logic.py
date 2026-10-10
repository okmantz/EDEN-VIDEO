"""Pure-logic tests: no FFmpeg needed."""
import pytest

from eden import captions as cap
from eden import keywords as kw
from eden import timeline as tl
from eden.broll import Clip, parse_tags, plan_broll
from eden.models import RenderRequest
from eden.transcript import Word, normalize, parse_subtitles


def W(start, end, text):
    return Word(start, end, text)


# ------------------------------------------------------------------ silence
def test_speech_segments_shortens_long_pauses_and_keeps_short_ones():
    # 0-2 speech, 2-4 silence (long), 4-5 speech, 5-5.2 silence (short, not detected)
    segs = tl.speech_segments([(2.0, 4.0)], duration=6.0, pad=0.1)
    assert segs == [(0.0, 2.1), (3.9, 6.0)]
    # A kept pause equals 2*pad
    assert round(segs[1][0] - segs[0][1], 3) == 1.8  # 2.1 -> 3.9 ; pad only trims, 4 s - 2 pad


def test_speech_segments_merges_when_pause_is_shorter_than_two_pads():
    assert tl.speech_segments([(2.0, 2.15)], duration=5.0, pad=0.1) == [(0.0, 5.0)]


def test_speech_segments_handles_unterminated_and_leading_silence():
    segs = tl.speech_segments([(0.0, 1.5), (4.0, float("inf"))], duration=6.0, pad=0.1)
    assert segs == [(1.4, 4.1)]


def test_all_silence_returns_empty():
    assert tl.speech_segments([(0.0, 5.0)], duration=5.0, pad=0.1) == []


def test_subtract_splits_and_drops_tiny_pieces():
    out = tl.subtract([(0.0, 10.0)], [(2.0, 3.0), (9.95, 10.0)])
    assert out == [(0.0, 2.0), (3.0, 9.95)]
    assert tl.subtract([(0.0, 1.0)], [(0.0, 0.95)]) == []


def test_snap_aligns_to_frame_grid():
    out = tl.snap([(0.013, 1.0), (2.0, 3.01)], fps=30, duration=3.0)
    for s, e in out:
        assert abs(s * 30 - round(s * 30)) < 1e-3 and abs(e * 30 - round(e * 30)) < 1e-3
    assert out[-1][1] <= 3.0


def test_timeline_maps_time_and_words():
    t = tl.Timeline([(0.0, 2.0), (5.0, 8.0)])
    assert t.total == 5.0
    assert t.map(1.0) == 1.0 and t.map(6.0) == 3.0
    assert t.map(3.0) is None
    mapped = t.map_words([W(0.5, 0.9, "a"), W(3.0, 3.5, "gone"), W(5.5, 6.0, "b")])
    assert [w.text for w in mapped] == ["a", "b"]
    assert mapped[1].start == 2.5


# ------------------------------------------------------------------ fillers
def test_filler_words_are_cut_and_swallow_preceding_pause():
    words = [W(0.0, 0.4, "So"), W(1.2, 1.5, "um"), W(1.6, 2.0, "this"), W(2.0, 2.4, "works")]
    cuts = tl.find_filler_cuts(words)
    assert len(cuts) == 1
    (start, end), label = cuts[0]
    assert label == "um"
    assert 0.4 <= start <= 0.5          # most of the 0.8 s pause before "um" goes too
    assert 1.5 <= end <= 1.6            # but never into the next word


def test_real_words_survive():
    words = [W(0, 0.4, "Like"), W(0.5, 0.8, "I"), W(0.8, 1.0, "mean"), W(1.0, 1.4, "actually")]
    assert tl.find_filler_cuts(words) == []


def test_filler_phrases_only_when_opted_in():
    words = [W(0, 0.4, "Well"), W(0.5, 0.7, "you"), W(0.7, 1.0, "know,"), W(1.1, 1.5, "it")]
    assert tl.find_filler_cuts(words) == []
    cuts = tl.find_filler_cuts(words, phrases=True)
    assert cuts and cuts[0][1] == "you know"


# --------------------------------------------------------------- transcripts
def test_parse_srt_and_vtt():
    srt = "1\n00:00:01,000 --> 00:00:03,000\nHello brave world\n\n2\n00:00:04,000 --> 00:00:05,000\n<i>Bye</i>\n"
    words = parse_subtitles(srt)
    assert [w.text for w in words] == ["Hello", "brave", "world", "Bye"]
    assert words[0].start == 1.0 and abs(words[2].end - 3.0) < 0.01 and words[3].start == 4.0
    vtt = "WEBVTT\n\n00:01.000 --> 00:02.000\nHi there\n"
    assert [w.text for w in parse_subtitles(vtt)] == ["Hi", "there"]


def test_parse_subtitles_rejects_garbage():
    with pytest.raises(ValueError):
        parse_subtitles("this is not a caption file")


def test_normalize():
    assert normalize("Um,") == "um" and normalize("don't!") == "don't"


# ------------------------------------------------------------------ captions
def make_words(n=12):
    return [W(i * 0.4, i * 0.4 + 0.35, f"word{i}" + ("." if i % 6 == 5 else "")) for i in range(n)]


def test_group_words_respects_limits_and_sentences():
    chunks = cap.group_words(make_words(12), max_words=3, max_chars=20)
    assert all(len(c.words) <= 3 for c in chunks)
    assert sum(len(c.words) for c in chunks) == 12
    ends = cap.group_words(make_words(12), max_words=8, max_chars=60)
    assert any(c.words[-1].text.endswith(".") for c in ends)


def test_ass_document_structure():
    from eden.presets import STYLES
    chunks = cap.group_words(make_words(6), 3, 16)
    ass = cap.build_ass(chunks, STYLES["viral_pop"]["caption"], 1080, 1920)
    assert "PlayResX: 1080" in ass and "PlayResY: 1920" in ass
    assert ass.count("Dialogue:") == 6                 # one event per word (word highlight)
    assert "WORD0" in ass                              # uppercase style
    plain = cap.build_ass(chunks, STYLES["clean_pro"]["caption"], 1080, 1920)
    assert plain.count("Dialogue:") == len(chunks)


def test_ass_escapes_braces_and_ts_format():
    from eden.presets import STYLES
    chunks = cap.group_words([W(0, 1, "{\\b1}hack")], 3, 16)
    ass = cap.build_ass(chunks, STYLES["clean_pro"]["caption"], 1080, 1920)
    assert "{\\b1}" not in ass.split("[Events]")[1]
    assert cap._ts(3661.5) == "1:01:01.50"
    assert cap.ass_color("#FFE24A") == "&H004AE2FF"


def test_srt_output():
    srt = cap.build_srt(make_words(8))
    assert srt.startswith("1\n00:00:00,000 --> ")


# ------------------------------------------------------------------ keywords
def test_keywords_ignore_stopwords_and_rank_by_frequency():
    text = "Coffee is great. The coffee shop sells coffee and pastries, pastries everywhere."
    got = kw.extract_keywords(text, 3)
    assert got[0] == "coffee" and "pastries" in got and "the" not in got
    assert kw.hashtags(["coffee", "pastries"]) == ["#coffee", "#pastries"]
    assert kw.stem("editing") == kw.stem("edits") or kw.stem("editing") == "edit"


# --------------------------------------------------------------------- b-roll
def clips():
    return [Clip("/a.mp4", 5.0, ["coffee", "cafe"], "a"), Clip("/b.mp4", 4.0, [], "b")]


def spoken(total=40):
    return [W(i * 0.5, i * 0.5 + 0.4, "word") for i in range(int(total * 2))]


def test_broll_off_or_no_clips_returns_nothing():
    assert plan_broll(spoken(), 40, clips(), "off") == []
    assert plan_broll(spoken(), 40, [], "high") == []


def test_broll_keyword_match_lands_on_word():
    words = spoken()
    words[30] = W(15.0, 15.4, "Coffee,")
    plan = plan_broll(words, 40, clips(), "low")
    hit = [p for p in plan if p.reason.startswith("keyword")]
    assert hit and abs(hit[0].start - 15.0) <= 0.4 and hit[0].clip.name == "a"


def test_broll_fills_long_stretches_and_respects_guards():
    plan = plan_broll(spoken(60), 60, clips(), "high")
    assert len(plan) >= 6
    for p in plan:
        assert p.start >= 2.0 and p.end <= 60 - 1.5
    for a, b in zip(plan, plan[1:]):
        assert b.start >= a.end + 1.8 - 1e-6


def test_broll_skips_very_short_videos():
    assert plan_broll(spoken(4), 4, clips(), "high") == []


def test_parse_tags():
    assert parse_tags("Coffee, office;desk ,") == ["coffee", "office", "desk"]


# --------------------------------------------------------------------- models
def test_render_request_validation():
    assert RenderRequest(platforms=["tiktok", "tiktok"]).platforms == ["tiktok"]
    with pytest.raises(ValueError):
        RenderRequest(platforms=["myspace"])
    with pytest.raises(ValueError):
        RenderRequest(platforms=["tiktok"], options={"style": "nope"})
    with pytest.raises(ValueError):
        RenderRequest(platforms=[])
