"""End-to-end tests that run real FFmpeg renders."""
import json
import subprocess

import pytest
from conftest import SRT, needs_ffmpeg, wait_for_videos

pytestmark = needs_ffmpeg


def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", str(path)],
                         capture_output=True, text=True, check=True).stdout
    data = json.loads(out)
    v = next(s for s in data["streams"] if s["codec_type"] == "video")
    a = next((s for s in data["streams"] if s["codec_type"] == "audio"), None)
    return v, a, float(data["format"]["duration"])


def upload(client, path, name="clip.mp4"):
    with open(path, "rb") as f:
        r = client.post("/api/projects", files={"file": (name, f, "video/mp4")})
    assert r.status_code == 200, r.text
    return r.json()


def attach_srt(client, pid):
    r = client.post(f"/api/projects/{pid}/transcript", files={"file": ("a.srt", SRT.encode(), "text/plain")})
    assert r.status_code == 200, r.text


def render(client, pid, platforms, **options):
    r = client.post(f"/api/projects/{pid}/render", json={"platforms": platforms, "options": options})
    assert r.status_code == 200, r.text
    return wait_for_videos(client, [v["id"] for v in r.json()])


def test_full_edit_trims_silence_and_fillers_and_matches_platform_spec(client, sample_video):
    p = upload(client, sample_video)
    assert p["duration"] == pytest.approx(12.0, abs=0.2) and p["width"] == 1280
    attach_srt(client, p["id"])
    vids = render(client, p["id"], ["instagram_reels", "youtube"], style="viral_pop", broll="off")
    assert [v["status"] for v in vids] == ["done", "done"], [v["message"] for v in vids]
    reels, yt = vids
    v, a, dur = probe(_save(client, reels))
    assert (v["width"], v["height"]) == (1080, 1920) and a is not None
    assert dur < 10.5                                   # 12 s source, ~3 s of silence gone
    assert reels["stats"]["fillers_removed"] == 3
    assert reels["stats"]["silence_removed"] > 2.5
    assert reels["srt_url"] and "Eden" in client.get(reels["srt_url"]).text
    v2, _, _ = probe(_save(client, yt))
    assert (v2["width"], v2["height"]) == (1920, 1080)


def _save(client, video):
    r = client.get(video["download_url"])
    assert r.status_code == 200
    import pathlib
    import tempfile
    path = pathlib.Path(tempfile.mkdtemp()) / "out.mp4"
    path.write_bytes(r.content)
    return path


def test_range_requests_work_for_playback(client, sample_video):
    p = upload(client, sample_video)
    [v] = render(client, p["id"], ["tiktok"], broll="off", captions=False)
    assert v["status"] == "done"
    r = client.get(v["file_url"], headers={"Range": "bytes=0-99"})
    assert r.status_code == 206 and len(r.content) == 100


def test_works_without_any_transcript_or_speech_engine(client, sample_video):
    """The no-AI, no-Whisper path: silence removal still works and the user is told why captions are missing."""
    p = upload(client, sample_video)
    [v] = render(client, p["id"], ["tiktok"], captions=True, remove_fillers=True)
    assert v["status"] == "done"
    assert v["stats"]["silence_removed"] > 2.0
    from eden.transcript import whisper_available
    if not whisper_available():
        assert any("speech engine" in w for w in v["warnings"])


def test_vertical_source_without_audio(client, vertical_video):
    p = upload(client, vertical_video, "v.mp4")
    assert p["has_audio"] is False
    [v] = render(client, p["id"], ["instagram_reels"], captions=True)
    assert v["status"] == "done", v["message"]
    stream, audio, _ = probe(_save(client, v))
    assert audio is None and (stream["width"], stream["height"]) == (1080, 1920)


def test_fit_framing_and_zoom_render(client, sample_video):
    p = upload(client, sample_video)
    attach_srt(client, p["id"])
    [v] = render(client, p["id"], ["facebook_feed"], framing="fit", zoom=True, pacing="tight", style="bold_impact")
    assert v["status"] == "done", v["message"]
    stream, _, _ = probe(_save(client, v))
    assert (stream["width"], stream["height"]) == (1080, 1080)


def test_broll_cutaways_are_composited(client, tmp_path):
    import subprocess as sp
    # 40 s talking head so cutaways fit between the hook and the end
    src = tmp_path / "long.mp4"
    sp.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=25:duration=40",
            "-f", "lavfi", "-i", "sine=f=220:d=40", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", str(src)], check=True)
    clip = tmp_path / "b.mp4"
    sp.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "smptebars=size=640x360:rate=30:duration=5",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", str(clip)], check=True)
    with open(clip, "rb") as f:
        r = client.post("/api/broll", files={"file": ("bars.mp4", f, "video/mp4")}, data={"tags": "demo"})
    assert r.status_code == 200 and r.json()["tags"] == "demo"
    p = upload(client, src, "long.mp4")
    [v] = render(client, p["id"], ["youtube"], broll="medium", captions=False, remove_silence=False, zoom=False)
    assert v["status"] == "done", v["message"]
    assert v["stats"]["broll_count"] >= 2
    assert all(b["clip"] == "bars" for b in v["meta"]["broll"])


def test_logo_overlay(client, sample_video, tmp_path):
    import subprocess as sp
    png = tmp_path / "logo.png"
    sp.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=red:s=200x100", "-frames:v", "1", str(png)], check=True)
    with open(png, "rb") as f:
        assert client.post("/api/settings/logo", files={"file": ("logo.png", f, "image/png")}).json()["logo_url"]
    p = upload(client, sample_video)
    [v] = render(client, p["id"], ["tiktok"], captions=False, remove_fillers=False, logo=True, broll="off")
    assert v["status"] == "done", v["message"]
    assert not v["warnings"]


def test_cancel_and_retry(client, sample_video):
    p = upload(client, sample_video)
    r = client.post(f"/api/projects/{p['id']}/render", json={"platforms": ["youtube"], "options": {}})
    vid = r.json()[0]["id"]
    client.post(f"/api/videos/{vid}/cancel")
    [v] = wait_for_videos(client, [vid])
    assert v["status"] in ("cancelled", "done")           # may finish before the cancel lands
    if v["status"] == "cancelled":
        assert client.post(f"/api/videos/{vid}/retry").status_code == 200
        [v] = wait_for_videos(client, [vid])
        assert v["status"] == "done"


def test_delete_video_and_project_clean_up_files(client, sample_video):
    p = upload(client, sample_video)
    [v] = render(client, p["id"], ["tiktok"], broll="off")
    assert client.get("/api/videos").json()[0]["project_name"] == "clip"
    assert client.delete(f"/api/videos/{v['id']}").status_code == 200
    assert client.get(f"/api/videos/{v['id']}").status_code == 404
    assert client.delete(f"/api/projects/{p['id']}").status_code == 200
    assert client.get("/api/projects").json() == []


def test_whisper_gets_audio_samples_not_a_file_name(tmp_path, monkeypatch, sample_video):
    """faster-whisper's own decoder (PyAV) breaks across versions, so Eden decodes the audio itself."""
    import sys
    import types

    import numpy as np

    from eden import transcript
    from eden.config import Config
    from eden.media import extract_audio_wav

    cfg = Config(data_dir=tmp_path)
    wav = tmp_path / "a.wav"
    extract_audio_wav(cfg, sample_video, wav)
    seen = {}

    class Seg:
        start, end = 0.0, 1.0
        words = [types.SimpleNamespace(word=" hello", start=0.1, end=0.5)]

    class FakeModel:
        def __init__(self, *a, **k):
            pass

        def transcribe(self, audio, **kw):
            seen["audio"] = audio
            return iter([Seg()]), types.SimpleNamespace(language="en")

    monkeypatch.setitem(sys.modules, "faster_whisper", types.SimpleNamespace(WhisperModel=FakeModel))
    monkeypatch.setattr(transcript, "whisper_available", lambda: True)
    monkeypatch.setattr(transcript, "_models", {})
    words, lang = transcript.transcribe_whisper(wav, "base", "cpu", "auto", 1.0)
    assert [w.text for w in words] == ["hello"] and lang == "en"
    assert isinstance(seen["audio"], np.ndarray) and seen["audio"].dtype == np.float32
    assert 11.0 < len(seen["audio"]) / 16000 < 13.0 and float(np.abs(seen["audio"]).max()) > 0.05
