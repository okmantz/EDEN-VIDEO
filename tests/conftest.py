import shutil
import subprocess
import time
from pathlib import Path

import pytest

HAS_FFMPEG = bool(shutil.which("ffmpeg") and shutil.which("ffprobe"))
needs_ffmpeg = pytest.mark.skipif(not HAS_FFMPEG, reason="FFmpeg is not installed")

SRT = """1
00:00:00,000 --> 00:00:02,000
So um this is Eden video

2
00:00:03,500 --> 00:00:06,500
and uh it removes silence and um filler words

3
00:00:08,500 --> 00:00:12,000
automatically, which makes editing fast and easy
"""


def _run(*args: str) -> None:
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args], check=True)


@pytest.fixture(scope="session")
def sample_video(tmp_path_factory) -> Path:
    """12 s, 1280x720 video. Sound at 0-2 s, 3.5-6.5 s and 8.5-12 s; silence between."""
    if not HAS_FFMPEG:
        pytest.skip("FFmpeg is not installed")
    out = tmp_path_factory.mktemp("media") / "sample.mp4"
    _run("-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=25:duration=12",
         "-f", "lavfi", "-i",
         "aevalsrc='sin(2*PI*220*t)*(between(t,0,2)+between(t,3.5,6.5)+between(t,8.5,12))*0.5':s=48000:d=12",
         "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(out))
    return out


@pytest.fixture(scope="session")
def vertical_video(tmp_path_factory) -> Path:
    if not HAS_FFMPEG:
        pytest.skip("FFmpeg is not installed")
    out = tmp_path_factory.mktemp("media") / "vertical.mp4"
    _run("-f", "lavfi", "-i", "testsrc2=size=720x1280:rate=30:duration=4", "-c:v", "libx264",
         "-pix_fmt", "yuv420p", str(out))   # no audio track on purpose
    return out


@pytest.fixture(scope="session")
def broll_clip(tmp_path_factory) -> Path:
    if not HAS_FFMPEG:
        pytest.skip("FFmpeg is not installed")
    out = tmp_path_factory.mktemp("media") / "broll.mp4"
    _run("-f", "lavfi", "-i", "smptebars=size=640x360:rate=30:duration=5", "-c:v", "libx264",
         "-pix_fmt", "yuv420p", str(out))
    return out


@pytest.fixture()
def client(tmp_path):
    from fastapi.testclient import TestClient

    from eden.config import Config
    from eden.main import create_app

    app = create_app(Config(data_dir=tmp_path / "data"))
    with TestClient(app) as c:
        yield c


def wait_for_videos(client, ids, timeout=180):
    deadline = time.time() + timeout
    while time.time() < deadline:
        vids = [client.get(f"/api/videos/{i}").json() for i in ids]
        if all(v["status"] in ("done", "failed", "cancelled") for v in vids):
            return vids
        time.sleep(0.5)
    raise TimeoutError("Render did not finish in time")
