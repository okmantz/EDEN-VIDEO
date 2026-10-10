#!/usr/bin/env python3
"""Start the built app, check it serves the web UI, and do one real render with its bundled FFmpeg.

    python packaging/smoke_test.py dist/EDEN-VIDEO/eden-video[.exe]
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import time
import urllib.request
import uuid
from pathlib import Path

PORT = 8799
BASE = f"http://127.0.0.1:{PORT}"


def get(path: str):
    with urllib.request.urlopen(BASE + path, timeout=20) as r:
        return r.status, r.read()


def post_json(path: str, body: dict):
    req = urllib.request.Request(BASE + path, json.dumps(body).encode(), {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def upload(path: str, file: Path):
    boundary = uuid.uuid4().hex
    data = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{file.name}\"\r\n"
            f"Content-Type: video/mp4\r\n\r\n").encode() + file.read_bytes() + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(BASE + path, data, {"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())


def main() -> int:
    exe = Path(sys.argv[1]).resolve()
    print("== doctor")
    doc = subprocess.run([str(exe), "doctor"], capture_output=True, text=True, timeout=120)
    print(doc.stdout)
    if "[FAIL]" in doc.stdout:
        print("doctor reported a failure")
        return 1

    work = Path(tempfile.mkdtemp())
    proc = subprocess.Popen([str(exe), "--no-browser", "--port", str(PORT)], cwd=work,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    try:
        for _ in range(90):
            try:
                status, body = get("/api/health")
                if status == 200:
                    break
            except OSError:
                time.sleep(1)
        else:
            print("server never came up")
            return 1
        health = json.loads(body)
        print("health:", health)
        assert health["ffmpeg"], "no working FFmpeg"
        assert get("/")[0] == 200 and get("/static/js/app.js")[0] == 200, "web UI files missing"

        print("== render")
        ffmpeg = next(p for p in exe.parent.rglob("ffmpeg*") if p.stem == "ffmpeg" and p.is_file())
        sample = work / "sample.mp4"
        subprocess.run([str(ffmpeg), "-hide_banner", "-loglevel", "error", "-y",
                        "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:duration=8",
                        "-f", "lavfi", "-i", "aevalsrc='sin(2*PI*220*t)*(between(t,0,2)+between(t,3.5,8))*0.5':s=48000:d=8",
                        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(sample)], check=True)
        pid = upload("/api/projects", sample)["id"]
        vid = post_json(f"/api/projects/{pid}/render", {"platforms": ["tiktok"],
                                                       "options": {"captions": False, "remove_fillers": False}})[0]["id"]
        for _ in range(180):
            v = json.loads(get(f"/api/videos/{vid}")[1])
            if v["status"] in ("done", "failed"):
                break
            time.sleep(1)
        print("render:", v["status"], v.get("message"))
        assert v["status"] == "done", "render failed"
        size = len(get(f"/api/videos/{vid}/download")[1])
        assert size > 10_000, "output video is empty"
        print(f"OK: finished video is {size // 1024} KB")
        return 0
    except AssertionError as e:
        print("FAILED:", e)
        return 1
    finally:
        proc.terminate()
        try:
            proc.wait(15)
        except subprocess.TimeoutExpired:
            proc.kill()


if __name__ == "__main__":
    raise SystemExit(main())
