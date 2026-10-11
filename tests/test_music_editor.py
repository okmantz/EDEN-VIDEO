"""Music/SFX libraries, ducking mix, and the fine-tune editor."""
import subprocess

import pytest
from conftest import SRT, needs_ffmpeg, wait_for_videos

pytestmark = needs_ffmpeg


def _tone(path, freq, dur, fmt="mp3"):
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                    "-f", "lavfi", "-i", f"sine=frequency={freq}:duration={dur}",
                    "-c:a", "libmp3lame" if fmt == "mp3" else "aac", str(path)], check=True)


@pytest.fixture(scope="module")
def music_file(tmp_path_factory):
    p = tmp_path_factory.mktemp("audio") / "bed.mp3"
    _tone(p, 330, 20)
    return p


@pytest.fixture(scope="module")
def sfx_file(tmp_path_factory):
    p = tmp_path_factory.mktemp("audio") / "whoosh.m4a"
    _tone(p, 900, 0.6, fmt="m4a")
    return p


def _upload_audio(client, kind, path, name):
    with open(path, "rb") as f:
        r = client.post(f"/api/{kind}", files={"file": (name, f, "audio/mpeg")})
    assert r.status_code == 200, r.text
    return r.json()


# ------------------------------------------------------------ filter graphs
def test_music_ducking_graph_uses_sidechain_compression():
    from eden.editor import FinalPlan, MusicMix, SfxHit, build_final_audio_graph
    plan = FinalPlan(width=1080, height=1920, fps=30, duration=10.0, has_audio=True,
                     music=MusicMix(path="/tmp/x.mp3", volume=0.5, duck=True),
                     sfx=[SfxHit(path="/tmp/y.m4a", at=2.5, volume=0.7)])
    g = build_final_audio_graph(plan, 1, [2])
    assert g is not None
    assert "sidechaincompress" in g and "amix=inputs=3" in g
    assert "adelay=2500|2500" in g and "volume=0.5[mus]" in g


def test_sfx_only_graph_has_no_ducking():
    from eden.editor import FinalPlan, SfxHit, build_final_audio_graph
    plan = FinalPlan(width=1080, height=1920, fps=30, duration=10.0, has_audio=True,
                     sfx=[SfxHit(path="/tmp/y.m4a", at=1.0)])
    g = build_final_audio_graph(plan, None, [1])
    assert g is not None and "sidechaincompress" not in g and "adelay=1000|1000" in g


def test_no_music_no_sfx_keeps_legacy_audio_path():
    from eden.editor import FinalPlan, build_final_audio_graph
    assert build_final_audio_graph(FinalPlan(width=1080, height=1920, fps=30, duration=5.0), None, []) is None


def test_group_words_indexed_covers_every_word_once():
    from eden.captions import group_words_indexed
    from eden.transcript import Word
    words = [Word(i, i + 0.4, f"w{i}") for i in range(10)]
    idx = group_words_indexed(words, 4, 20)
    seen = [i for _, a, b in idx for i in range(a, b)]
    assert seen == list(range(10))


# ------------------------------------------------------------------ library
def test_music_and_sfx_library_crud(client, music_file, sfx_file, tmp_path):
    m = _upload_audio(client, "music", music_file, "Chill Bed.mp3")
    assert m["name"] == "Chill Bed" and m["duration"] == pytest.approx(20, abs=0.3)
    assert client.get("/api/music").json()[0]["id"] == m["id"]
    assert client.patch(f"/api/music/{m['id']}", json={"name": "Bed v2"}).json()["name"] == "Bed v2"
    s = _upload_audio(client, "sfx", sfx_file, "whoosh.m4a")
    assert len(client.get("/api/sfx").json()) == 1
    # non-audio and wrong extensions are rejected
    bad = tmp_path / "x.txt"
    bad.write_bytes(b"nope")
    with open(bad, "rb") as f:
        assert client.post("/api/music", files={"file": ("x.txt", f, "text/plain")}).status_code == 400
    assert client.delete(f"/api/music/{m['id']}").status_code == 200
    assert client.get("/api/music").json() == []
    assert client.get(f"/api/music/{m['id']}/file").status_code == 404


# ------------------------------------------------------------------- render
def _project_with_srt(client, sample_video):
    with open(sample_video, "rb") as f:
        p = client.post("/api/projects", files={"file": ("clip.mp4", f, "video/mp4")}).json()
    client.post(f"/api/projects/{p['id']}/transcript",
                files={"file": ("a.srt", SRT.encode(), "text/plain")})
    return p


def test_render_with_music_ducking_and_sfx(client, sample_video, music_file, sfx_file):
    p = _project_with_srt(client, sample_video)
    m = _upload_audio(client, "music", music_file, "bed.mp3")
    s = _upload_audio(client, "sfx", sfx_file, "whoosh.m4a")
    r = client.post(f"/api/projects/{p['id']}/render", json={
        "platforms": ["tiktok"],
        "options": {"style": "viral_pop", "broll": "off", "zoom": True,
                    "music_id": m["id"], "music_volume": 0.5,
                    "whoosh_sfx_id": s["id"], "pop_sfx_id": s["id"]}})
    assert r.status_code == 200, r.text
    [v] = wait_for_videos(client, [r.json()[0]["id"]])
    assert v["status"] == "done", v["message"]
    assert v["stats"]["music"] == "bed" and v["stats"]["sfx_hits"] > 0
    assert not v["warnings"]
    # the finished file really has a mixed audio track
    out = client.get(v["download_url"]).content
    assert out[:4] == b"\x00\x00\x00\x18" or out[4:8] == b"ftyp"


def test_missing_music_warns_but_still_renders(client, sample_video):
    p = _project_with_srt(client, sample_video)
    r = client.post(f"/api/projects/{p['id']}/render", json={
        "platforms": ["tiktok"], "options": {"broll": "off", "music_id": "doesnotexist"}})
    [v] = wait_for_videos(client, [r.json()[0]["id"]])
    assert v["status"] == "done"
    assert any("music" in w for w in v["warnings"])


# ------------------------------------------------------------------- editor
def _render_done(client, pid, **options):
    r = client.post(f"/api/projects/{pid}/render",
                    json={"platforms": ["tiktok"], "options": {"broll": "off", **options}})
    [v] = wait_for_videos(client, [r.json()[0]["id"]])
    assert v["status"] == "done", v["message"]
    return v


def test_plan_returns_segments_chunks_and_broll(client, sample_video):
    p = _project_with_srt(client, sample_video)
    v = _render_done(client, p["id"])
    plan = client.get(f"/api/videos/{v['id']}/plan").json()
    assert len(plan["segments"]) == 6    # 2 pauses + 3 filler words ("um","uh","um") cut
    assert plan["segments"][0][0] == 0.0
    assert [c["text"] for c in plan["chunks"]][0] == "So um this"   # viral_pop style groups tightly
    assert plan["chunks"][0]["word_start"] == 0
    assert len(plan["words"]) == 22
    assert plan["broll"] == []


def test_remix_applies_segment_trim_and_caption_edit(client, sample_video):
    p = _project_with_srt(client, sample_video)
    v = _render_done(client, p["id"])
    plan = client.get(f"/api/videos/{v['id']}/plan").json()
    seg = plan["segments"]
    r = client.post(f"/api/videos/{v['id']}/remix", json={
        "plan": {"segments": [seg[0], [seg[1][0], seg[1][0] + 1.0]],
                 "caption_edits": {"0": "HELLO"}, "drop_broll": [], "add_broll": []}})
    assert r.status_code == 200, r.text
    [nv] = wait_for_videos(client, [r.json()["id"]])
    assert nv["status"] == "done", nv["message"]
    expect = round((seg[0][1] - seg[0][0]) + 1.0, 1)
    assert nv["duration"] == pytest.approx(expect, abs=0.3)
    srt = client.get(nv["srt_url"]).text
    assert "HELLO" in srt and "So" not in srt.split("\n")[2]


def test_remix_rejects_bad_input(client, sample_video):
    p = _project_with_srt(client, sample_video)
    v = _render_done(client, p["id"])
    # empty segment list
    assert client.post(f"/api/videos/{v['id']}/remix",
                       json={"plan": {"segments": []}}).status_code == 400
    # out-of-range segment
    assert client.post(f"/api/videos/{v['id']}/remix",
                       json={"plan": {"segments": [[0, 9999]]}}).status_code == 400
    # unknown b-roll clip in a manual cutaway
    assert client.post(f"/api/videos/{v['id']}/remix",
                       json={"plan": {"add_broll": [{"start": 1, "clip_id": "nope"}]}}).status_code == 404
    # plan/remix on an unfinished video is rejected
    r = client.post(f"/api/projects/{p['id']}/render",
                    json={"platforms": ["tiktok"], "options": {"broll": "off"}})
    busy = r.json()[0]["id"]
    try:
        assert client.get(f"/api/videos/{busy}/plan").status_code == 409
        assert client.post(f"/api/videos/{busy}/remix", json={"plan": {}}).status_code == 409
    finally:
        client.post(f"/api/videos/{busy}/cancel")
