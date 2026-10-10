"""Shared service container + settings resolution."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .config import Config
from .db import Database


@dataclass
class Services:
    cfg: Config
    db: Database

    def settings(self) -> dict[str, Any]:
        return effective_settings(self.cfg, self.db)


def effective_settings(cfg: Config, db: Database) -> dict[str, Any]:
    base: dict[str, Any] = {
        "display_name": "",
        "brand_color": "#2EE6A6",
        "use_brand_color": False,
        "default_style": "viral_pop",
        "default_platforms": ["instagram_reels", "tiktok", "youtube_shorts"],
        "caption_font": "Inter",
        "whisper_model": cfg.whisper_model,
        "language": "auto",
        "ollama_enabled": False,
        "ollama_url": cfg.ollama_url,
        "ollama_model": cfg.ollama_model,
        "pexels_key": cfg.pexels_key,
        "logo_enabled": False,
        "loudness": -14.0,
    }
    base.update(db.get_settings())
    return base
