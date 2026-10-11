"""Runtime configuration, resolved from environment variables at startup."""
from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from pathlib import Path

from .system import is_frozen, locate_binary


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


def _default_data_dir() -> Path:
    # The downloadable app keeps your videos in a "data" folder right next to it.
    if is_frozen():
        return Path(sys.executable).resolve().parent / "data"
    return Path("./data")


@dataclass(frozen=True)
class Config:
    data_dir: Path
    host: str = "127.0.0.1"
    port: int = 8000
    max_upload_mb: int = 4096
    workers: int = 1
    ffmpeg: str = "ffmpeg"
    ffprobe: str = "ffprobe"
    x264_preset: str = "veryfast"
    # Optional HTTP basic auth for when the app is reachable by other people.
    password: str = ""
    # Defaults for optional integrations (all can be changed in Settings).
    ollama_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "llama3.2"
    pexels_key: str = ""
    whisper_model: str = "base"
    whisper_device: str = "auto"

    @classmethod
    def from_env(cls) -> "Config":
        e = os.environ.get
        return cls(
            data_dir=Path(e("EDEN_DATA_DIR") or _default_data_dir()).resolve(),
            host=e("EDEN_HOST", "127.0.0.1"),
            port=_env_int("EDEN_PORT", 8000),
            max_upload_mb=_env_int("EDEN_MAX_UPLOAD_MB", 4096),
            workers=max(1, _env_int("EDEN_WORKERS", 1)),
            ffmpeg=locate_binary("ffmpeg", e("EDEN_FFMPEG", "")) or "ffmpeg",
            ffprobe=locate_binary("ffprobe", e("EDEN_FFPROBE", "")) or "ffprobe",
            x264_preset=e("EDEN_X264_PRESET", "veryfast"),
            password=e("EDEN_PASSWORD", ""),
            ollama_url=e("OLLAMA_URL", "http://127.0.0.1:11434"),
            ollama_model=e("OLLAMA_MODEL", "llama3.2"),
            pexels_key=e("PEXELS_API_KEY", ""),
            whisper_model=e("EDEN_WHISPER_MODEL", "base"),
            whisper_device=e("EDEN_WHISPER_DEVICE", "auto"),
        )

    @property
    def uploads_dir(self) -> Path:
        return self.data_dir / "uploads"

    @property
    def renders_dir(self) -> Path:
        return self.data_dir / "renders"

    @property
    def broll_dir(self) -> Path:
        return self.data_dir / "broll"

    @property
    def music_dir(self) -> Path:
        return self.data_dir / "music"

    @property
    def sfx_dir(self) -> Path:
        return self.data_dir / "sfx"

    @property
    def cache_dir(self) -> Path:
        return self.data_dir / "cache"

    @property
    def work_dir(self) -> Path:
        return self.data_dir / "work"

    @property
    def assets_dir(self) -> Path:
        return self.data_dir / "assets"

    @property
    def db_path(self) -> Path:
        return self.data_dir / "eden.db"

    def ensure_dirs(self) -> None:
        for d in (self.data_dir, self.uploads_dir, self.renders_dir, self.broll_dir,
                  self.music_dir, self.sfx_dir, self.cache_dir, self.work_dir, self.assets_dir):
            d.mkdir(parents=True, exist_ok=True)


def load_config() -> Config:
    cfg = Config.from_env()
    cfg.ensure_dirs()
    return cfg
