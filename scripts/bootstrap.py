#!/usr/bin/env python3
"""One-step setup and launch for Eden. Uses only the Python standard library.

    python3 scripts/bootstrap.py            install what is missing, then start Eden
    python3 scripts/bootstrap.py --lite     skip the speech engine (captions then need an .srt file)
    python3 scripts/bootstrap.py --setup    install only, do not start

Every other option (--lan, --port 9000, --no-browser, doctor, ...) is passed on to `python -m eden`.
Safe to run again at any time: it only installs when something changed.
"""
from __future__ import annotations

import hashlib
import os
import subprocess
import sys
import venv
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VENV = ROOT / ".venv"
IS_WIN = os.name == "nt"


def say(msg: str = "") -> None:
    print(msg, flush=True)


def venv_python() -> Path:
    return VENV / ("Scripts/python.exe" if IS_WIN else "bin/python")


def fail(msg: str) -> "None":
    say(f"\n  {msg}\n")
    raise SystemExit(1)


def make_venv() -> None:
    if venv_python().exists():
        return
    say("  Creating a private Python environment (.venv)...")
    try:
        venv.EnvBuilder(with_pip=True, clear=False).create(VENV)
    except Exception as e:  # noqa: BLE001 - any failure gets the same helpful message
        hint = ""
        if sys.platform.startswith("linux"):
            hint = "On Ubuntu / Debian run:  sudo apt install -y python3-venv python3-pip   and try again."
        fail(f"Could not create the Python environment ({e}).\n  {hint}")
    if not venv_python().exists():
        fail("The Python environment was created without Python in it. "
             "On Ubuntu / Debian run:  sudo apt install -y python3-venv   then delete the .venv folder and try again.")


def pip(*args: str) -> int:
    return subprocess.call([str(venv_python()), "-m", "pip", "--disable-pip-version-check", *args], cwd=ROOT)


def stamp_for(files: list[str]) -> str:
    h = hashlib.sha256()
    for f in files:
        p = ROOT / f
        h.update(p.read_bytes() if p.exists() else b"")
    h.update(sys.version.encode())
    return h.hexdigest()[:16]


def install(lite: bool) -> None:
    core_stamp = VENV / ".eden-core"
    speech_stamp = VENV / ".eden-speech"
    want_core = stamp_for(["requirements-core.txt"])
    if not core_stamp.exists() or core_stamp.read_text() != want_core:
        say("  Installing Eden (one time, about a minute)...")
        if pip("install", "--quiet", "--upgrade", "pip") != 0:
            say("  (could not upgrade pip, continuing)")
        if pip("install", "--quiet", "-r", "requirements-core.txt") != 0:
            fail("Installing Eden's packages failed. Check your internet connection and run this again.")
        core_stamp.write_text(want_core)

    if lite:
        return
    want_speech = stamp_for(["requirements.txt"])
    if speech_stamp.exists() and speech_stamp.read_text() == want_speech:
        return
    say("  Installing the local speech engine for captions (one time, about 100 MB)...")
    if pip("install", "--quiet", "-r", "requirements.txt") == 0:
        speech_stamp.write_text(want_speech)
    else:
        say("  The speech engine could not be installed. Eden still works: attach an .srt\n"
            "  file for captions, or try again later with:  python3 scripts/bootstrap.py")


def main() -> int:
    if sys.version_info < (3, 10):
        fail(f"Eden needs Python 3.10 or newer (this is {sys.version_info.major}.{sys.version_info.minor}).\n"
             "  Get it from https://www.python.org/downloads/")
    args = sys.argv[1:]
    lite = "--lite" in args
    setup_only = "--setup" in args
    rest = [a for a in args if a not in ("--lite", "--setup")]

    say("\n  EDEN VIDEO")
    make_venv()
    install(lite)
    if setup_only:
        say("  Setup complete. Start Eden with start.sh / start.bat, or:  .venv/bin/python -m eden\n")
        return 0
    say("  Starting Eden...")
    try:
        return subprocess.call([str(venv_python()), "-m", "eden", *rest], cwd=ROOT)
    except KeyboardInterrupt:
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
