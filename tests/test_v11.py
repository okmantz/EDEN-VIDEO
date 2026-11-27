"""Tests for the 1.1 features: brand kit, caption looks, built-in music, adaptive pauses, previews."""
import numpy as np
import pytest

from conftest import SRT, needs_ffmpeg, wait_for_videos
from eden import brand as brand_mod
from eden import musicgen
from eden.broll import CARDS_PER_MINUTE
from eden.captions import build_ass
from eden.media import estimate_threshold, silences_from_levels
from eden.presets import CAPTION_PRESETS, STYLES, get_caption_preset
from eden.timeline import find_repeat_cuts
from eden.transcript import Word


def test_every_style_points_at_real_preset_and_music():
    for key, s in STYLES.items():
        assert s["caption_preset"] in CAPTION_PRESETS, key
        assert s["music"] in musicgen.TRACKS, key
    assert len(CAPTION_PRESETS) >= 10


def test_brand_recolours_caption_and_handles_bad_hex():
    b = brand_mod.from_settings({"brand_color": "#7C5CFF", "brand_name": "X", "brand_handle": "x"}, has_logo=False)
    st = brand_mod.caption_style("viral_pop", b, True, position=None, scale=1.0)
    assert st["highlight"].upper() == "#7C5CFF"
    plain = brand_mod.caption_style("viral_pop", b, False, position=None, scale=1.0)
    assert plain["highlight"] == get_caption_preset("viral_pop")["highlight"]
    big = brand_mod.caption_style("viral_pop", b, True, position="top", scale=1.5)
    assert big["position"] == "top" and big["size"] > st["size"]
    assert brand_mod.clean_hex("zzz", "#112233") == "#112233"


def test_ass_glow_slide_and_watermark():
    words = [Word(0.0, 0.4, "hello"), Word(0.5, 0.9, "brand"), Word(1.0, 1.4, "world")]
    from eden.captions import group_words
    for key in ("neon_glow", "elegant", "viral_pop"):
        st = brand_mod.caption_style(key, brand_mod.from_settings({}, has_logo=False), False, position=None, scale=1.0)
        chunks = group_words(words, st["max_words"], st["max_chars_line"])
        ass = build_ass(chunks, st, 1080, 1920, 0.2, 0.1, [], None, None,
                        watermark={"text": "@eden", "align": 7, "color": "#FFFFFF"}, total=3)
        assert "[Events]" in ass and "@eden" in ass and "Dialogue:" in ass


def test_adaptive_threshold_keeps_quiet_speaker():
    rng = np.random.default_rng(1)
    levels = np.concatenate([rng.normal(-52, 1, 100), rng.normal(-38, 2, 200), rng.normal(-52, 1, 100), rng.normal(-36, 2, 200)])
    thr = estimate_threshold(levels)
    assert thr["adaptive"] and -52 <= thr["threshold"] <= -38
    spans = silences_from_levels(levels, thr["threshold"], 0.4)
    assert len(spans) >= 1


def test_repeat_cuts_only_real_stutters():
    w = [Word(0.0, 0.2, "I"), Word(0.25, 0.45, "I"), Word(0.5, 0.9, "think"), Word(1.0, 1.2, "that"), Word(1.25, 1.5, "that"), Word(1.6, 2.0, "works")]
    cuts = find_repeat_cuts(w)
    assert len(cuts) == 1 and cuts[0][0][0] < 0.25


def test_builtin_music_loops_cleanly(tmp_path):
    import wave
    p = musicgen.ensure_track(tmp_path, "calm_horizon")
    with wave.open(str(p)) as f:
        n, ch = f.getnframes(), f.getnchannels()
        data = np.frombuffer(f.readframes(n), dtype=np.int16).reshape(-1, ch).astype(float) / 32768
    assert np.isfinite(data).all() and np.abs(data).max() < 0.95
    seam = np.abs(data[0] - data[-1]).max()
    assert seam < 0.05
    assert {t["key"] for t in musicgen.catalog()} == set(musicgen.TRACKS)


def test_card_budget_constants():
    assert CARDS_PER_MINUTE["low"] < CARDS_PER_MINUTE["medium"] < CARDS_PER_MINUTE["high"]


def test_settings_brand_roundtrip_and_validation(client):
    r = client.put("/api/settings", json={"brand_name": "Eden Studio", "brand_handle": "eden", "brand_color": "#7C5CFF",
                                          "brand_font": "anton", "logo_position": "bottom_left", "show_handle": True})
    assert r.status_code == 200
    s = client.get("/api/settings").json()
    assert s["brand_name"] == "Eden Studio" and s["brand_font"] == "anton" and s["logo_position"] == "bottom_left"
    assert client.put("/api/settings", json={"brand_color": "purple"}).status_code == 422
    assert client.put("/api/settings", json={"brand_font": "nope"}).status_code in (400, 422)


def test_meta_exposes_new_catalogs(client):
    m = client.get("/api/meta").json()
    assert len(m["caption_presets"]) >= 10 and len(m["music_tracks"]) == 6 and m["caption_fonts"]


def test_builtin_music_endpoint(client):
    assert len(client.get("/api/music/builtin").json()) == 6
    r = client.get("/api/music/builtin/soft_focus/file")
    assert r.status_code == 200 and r.headers["content-type"].startswith("audio/")
    assert client.get("/api/music/builtin/nope/file").status_code == 404


@needs_ffmpeg
def test_caption_preview_png(client):
    r = client.get("/api/preview/caption.png?preset=viral_pop&brand=1")
    assert r.status_code == 200 and r.content[:4] == b"\x89PNG"
    assert client.get("/api/preview/caption.png?preset=nope").status_code == 404


@needs_ffmpeg
def test_one_click_render_with_brand_music_and_cards(client, sample_video):
    with open(sample_video, "rb") as f:
        p = client.post("/api/projects", files={"file": ("a.mp4", f, "video/mp4")}).json()
    client.post(f"/api/projects/{p['id']}/transcript", files={"file": ("a.srt", SRT.encode(), "text/plain")})
    a = client.post(f"/api/projects/{p['id']}/analyze").json()
    assert a["has_audio"] and "audio" in a
    client.put("/api/settings", json={"brand_name": "Eden", "brand_color": "#7C5CFF", "brand_handle": "eden", "show_handle": True})
    vids = client.post(f"/api/projects/{p['id']}/render", json={"platforms": ["instagram_reels"], "options": {
        "caption_preset": "neon_glow", "music_id": "auto", "broll": "high", "brand": True}}).json()
    done = wait_for_videos(client, [v["id"] for v in vids])
    v = done[0]
    assert v["status"] == "done", v.get("message")
    assert v["stats"]["caption_preset"] and v["stats"]["music"]
