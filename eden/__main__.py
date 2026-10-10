"""``python -m eden`` starts the app and opens it in your browser."""
from __future__ import annotations

import shutil
import threading
import webbrowser

import uvicorn

from . import APP_NAME, TAGLINE, __version__
from .config import load_config
from .main import create_app


def main() -> None:
    cfg = load_config()
    if not shutil.which(cfg.ffmpeg) or not shutil.which(cfg.ffprobe):
        raise SystemExit(
            "FFmpeg was not found on your PATH.\n"
            "  macOS:   brew install ffmpeg\n"
            "  Ubuntu:  sudo apt install ffmpeg\n"
            "  Windows: winget install Gyan.FFmpeg\n"
            "Then run this command again.")
    url = f"http://{'localhost' if cfg.host in ('127.0.0.1', '0.0.0.0') else cfg.host}:{cfg.port}"
    print(f"\n  {APP_NAME} {__version__} - {TAGLINE}\n  Open {url}\n  Data folder: {cfg.data_dir}\n")
    if cfg.host in ("127.0.0.1", "localhost"):
        threading.Timer(1.2, lambda: webbrowser.open(url)).start()
    uvicorn.run(create_app(cfg), host=cfg.host, port=cfg.port, log_level="info")


if __name__ == "__main__":
    main()
