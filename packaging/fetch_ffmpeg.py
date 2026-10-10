#!/usr/bin/env python3
"""Download a static FFmpeg + FFprobe for the current OS into a folder, and check it can do what Eden needs
(H.264 encoding and caption drawing). Standard library only, except macOS which uses the `static-ffmpeg` package.

    python packaging/fetch_ffmpeg.py build/ffbin            fail loudly if anything is wrong
    python packaging/fetch_ffmpeg.py build/ffbin --soft     on problems, warn and bundle nothing (exit 0)
    python packaging/fetch_ffmpeg.py build/ffbin --from DIR use binaries already in DIR (for testing)
"""
from __future__ import annotations

import argparse
import platform
import shutil
import sys
import tarfile
import tempfile
import urllib.request
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from eden.system import ffmpeg_info  # noqa: E402

BTBN = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/"
URLS = {
    "Linux": BTBN + "ffmpeg-master-latest-linux64-gpl.tar.xz",
    "Windows": BTBN + "ffmpeg-master-latest-win64-gpl.zip",
}


def download(url: str, dest: Path) -> None:
    print(f"  downloading {url}", flush=True)
    req = urllib.request.Request(url, headers={"User-Agent": "eden-video-build"})
    with urllib.request.urlopen(req, timeout=300) as r, open(dest, "wb") as f:
        shutil.copyfileobj(r, f)


def find_tools(root: Path) -> dict[str, Path]:
    found: dict[str, Path] = {}
    for p in root.rglob("*"):
        if p.is_file() and p.stem in ("ffmpeg", "ffprobe") and p.suffix in ("", ".exe") and p.parent.name == "bin":
            found.setdefault(p.stem, p)
    return found


def fetch(tmp: Path) -> dict[str, Path]:
    system = platform.system()
    if system in URLS:
        archive = tmp / ("ff.zip" if URLS[system].endswith(".zip") else "ff.tar.xz")
        download(URLS[system], archive)
        out = tmp / "x"
        if archive.suffix == ".zip":
            with zipfile.ZipFile(archive) as z:
                z.extractall(out)
        else:
            with tarfile.open(archive) as t:
                t.extractall(out)  # noqa: S202 - our own pinned download
        return find_tools(out)
    # macOS (and anything else): the static-ffmpeg package ships both tools
    from static_ffmpeg import run  # type: ignore
    ff, fp = run.get_or_fetch_platform_executables_else_raise()
    return {"ffmpeg": Path(ff), "ffprobe": Path(fp)}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("dest")
    ap.add_argument("--soft", action="store_true")
    ap.add_argument("--from", dest="src")
    args = ap.parse_args()
    dest = Path(args.dest)
    shutil.rmtree(dest, ignore_errors=True)
    dest.mkdir(parents=True)

    def bail(msg: str) -> int:
        print(f"  PROBLEM: {msg}")
        shutil.rmtree(dest, ignore_errors=True)
        dest.mkdir(parents=True)
        if args.soft:
            print("  Continuing WITHOUT a bundled FFmpeg (the app will help the user install one).")
            return 0
        return 1

    try:
        if args.src:
            tools = find_tools(Path(args.src).parent) if not (Path(args.src) / "ffmpeg").exists() else {
                n: Path(args.src) / n for n in ("ffmpeg", "ffprobe")}
        else:
            with tempfile.TemporaryDirectory() as t:
                tools = fetch(Path(t))
                for name, p in tools.items():
                    shutil.copy2(p, dest / p.name)
                tools = {n: dest / p.name for n, p in tools.items()}
    except Exception as e:  # noqa: BLE001 - network, archive and import problems all end the same way
        return bail(f"could not get FFmpeg ({type(e).__name__}: {e})")

    if args.src:
        for name, p in tools.items():
            shutil.copy2(p, dest / p.name)
    if not (list(dest.glob("ffmpeg*")) and list(dest.glob("ffprobe*"))):
        return bail("ffmpeg and ffprobe were not both found")
    exe = next(dest.glob("ffmpeg*"))
    exe.chmod(0o755)
    next(dest.glob("ffprobe*")).chmod(0o755)

    info = ffmpeg_info(str(exe))
    print(f"  {info.version}\n  H.264 encoder: {info.libx264}   caption filter (libass): {info.libass}")
    if not info.usable:
        return bail("this FFmpeg cannot encode H.264")
    if not info.libass:
        return bail("this FFmpeg cannot draw captions (no libass)")
    print(f"  OK: bundled FFmpeg is in {dest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
