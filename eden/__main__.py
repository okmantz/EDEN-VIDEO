"""Command line for Eden.

    python -m eden               start Eden and open it in your browser
    python -m eden --lan         also let phones / other computers on your network use it
    python -m eden doctor        check that everything Eden needs is in place
    python -m eden download-model  fetch the speech model now (so the first edit starts instantly)
"""
from __future__ import annotations

import argparse
import dataclasses
import os
import secrets
import subprocess
import sys
import threading
import webbrowser

from . import APP_NAME, TAGLINE, __version__
from .config import Config, load_config
from .system import (
    ffmpeg_info,
    ffmpeg_install_plan,
    format_checks,
    lan_address,
    locate_binary,
    pick_port,
    run_checks,
)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="eden", description=f"{APP_NAME} - {TAGLINE}")
    p.add_argument("command", nargs="?", default="run", choices=["run", "doctor", "download-model"],
                   help="run (default), doctor, or download-model")
    p.add_argument("--lan", action="store_true",
                   help="listen on your local network too (a password is created for you if none is set)")
    p.add_argument("--host", help="address to listen on (default 127.0.0.1)")
    p.add_argument("--port", type=int, help="port to use (default 8000)")
    p.add_argument("--no-browser", action="store_true", help="do not open the browser automatically")
    p.add_argument("-y", "--yes", action="store_true", help="install missing pieces without asking")
    p.add_argument("--version", action="version", version=f"{APP_NAME} {__version__}")
    return p


def _ensure_ffmpeg(cfg: Config, assume_yes: bool) -> Config:
    """Make sure a working FFmpeg exists; offer to install it, or exit with the exact command."""
    info = ffmpeg_info(cfg.ffmpeg)
    if info.usable:
        return cfg
    plan = ffmpeg_install_plan()
    problem = info.problems[0] if info.problems else "FFmpeg is not available."
    print(f"\n  {problem}\n  Eden uses FFmpeg to cut, caption and export your videos.\n")
    interactive = sys.stdin.isatty() and sys.stdout.isatty()
    if plan.argv and (assume_yes or interactive):
        print(f"  This computer looks like: {plan.os_name}\n  Install command:  {plan.command}\n")
        go = assume_yes
        if not go:
            try:
                go = input("  Install FFmpeg now? [Y/n] ").strip().lower() in ("", "y", "yes")
            except EOFError:
                go = False
        if go:
            try:
                rc = subprocess.call(list(plan.argv))
            except OSError as e:
                print(f"  Could not run the installer: {e}")
                rc = 1
            ffmpeg, ffprobe = locate_binary("ffmpeg"), locate_binary("ffprobe")
            if rc == 0 and ffmpeg and ffprobe:
                print("\n  FFmpeg installed.\n")
                return dataclasses.replace(cfg, ffmpeg=ffmpeg, ffprobe=ffprobe)
            print("\n  The install did not finish.")
    print("  To fix this, run:\n")
    print(f"      {plan.command}\n")
    if plan.note:
        print(f"  {plan.note}\n")
    print("  then start Eden again. Running `python -m eden doctor` checks everything.")
    raise SystemExit(1)


def _cmd_doctor(cfg: Config) -> int:
    checks = run_checks(cfg)
    print(f"\n  {APP_NAME} {__version__} - system check\n")
    print(format_checks(checks))
    bad = [c for c in checks if c.status == "fail"]
    print("\n  " + ("Everything Eden needs is ready." if not bad and all(c.status == "ok" for c in checks)
                    else "Eden can run, with the notes above." if not bad
                    else "Fix the [FAIL] items above, then run this check again."))
    print()
    return 1 if bad else 0


def _cmd_download_model(cfg: Config) -> int:
    try:
        from faster_whisper import WhisperModel
    except Exception:
        print("\n  The speech engine is not installed. Run:  pip install faster-whisper\n")
        return 1
    print(f"\n  Downloading the '{cfg.whisper_model}' speech model (one time, then it works offline)...")
    try:
        WhisperModel(cfg.whisper_model, device="cpu", compute_type="int8")
    except Exception as e:
        print(f"  Download failed: {e}\n  Check your internet connection and try again.\n")
        return 1
    print("  Done.\n")
    return 0


def main(argv: list[str] | None = None) -> None:
    args = build_parser().parse_args(argv)
    cfg = load_config()

    if args.command == "doctor":
        raise SystemExit(_cmd_doctor(cfg))
    if args.command == "download-model":
        raise SystemExit(_cmd_download_model(cfg))

    cfg = _ensure_ffmpeg(cfg, args.yes)

    host = args.host or ("0.0.0.0" if args.lan else cfg.host)
    password = cfg.password
    if host not in ("127.0.0.1", "localhost", "::1") and not password:
        password = secrets.token_urlsafe(6)
    wanted = args.port or cfg.port
    port = pick_port(host, wanted)
    cfg = dataclasses.replace(cfg, host=host, port=port, password=password)

    local_url = f"http://localhost:{port}"
    print(f"\n  {APP_NAME} {__version__} - {TAGLINE}\n")
    if port != wanted:
        print(f"  Port {wanted} is busy, so Eden is using {port}.")
    print(f"  Open:         {local_url}")
    if host not in ("127.0.0.1", "localhost", "::1"):
        print(f"  On your network:  http://{lan_address()}:{port}")
        print(f"  Password:     {password}   (username: anything)")
        print("  Anyone on your network with the password can use Eden. Stop it with Ctrl+C.")
    print(f"  Data folder:  {cfg.data_dir}")
    print("  Stop Eden any time with Ctrl+C.\n")

    if not args.no_browser and host in ("127.0.0.1", "localhost", "0.0.0.0") and not os.environ.get("EDEN_NO_BROWSER"):
        threading.Timer(1.2, lambda: webbrowser.open(local_url)).start()

    import uvicorn

    from .main import create_app
    uvicorn.run(create_app(cfg), host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
