"""Staging the bundled caption fonts for FFmpeg.

FFmpeg's ``ass`` filter reads fonts from a ``fontsdir``. Passing an absolute path is fragile (spaces,
Windows drive letters), so each render copies just the fonts it needs into its own work folder and
points FFmpeg at the short relative path ``fonts``. A person's own fonts, dropped into
``<data>/assets/fonts``, are available too.
"""
from __future__ import annotations

import shutil
from pathlib import Path
from typing import Iterable, Optional

from .presets import CAPTION_FONTS

BUNDLED_DIR = Path(__file__).resolve().parent / "static" / "fonts"
EXTRA_SUFFIXES = {".ttf", ".otf", ".ttc"}


def stage_fonts(work: Path, keys: Iterable[str], extra_dir: Optional[Path] = None) -> Optional[str]:
    """Copy the fonts named in ``keys`` (plus any of the person's own) into ``work/fonts``.

    Returns the relative folder name to hand to FFmpeg, or None when there was nothing to stage."""
    dst = work / "fonts"
    copied = 0
    for key in dict.fromkeys(keys):
        meta = CAPTION_FONTS.get(key)
        if not meta:
            continue
        src = BUNDLED_DIR / meta["file"]
        if src.exists():
            dst.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(src, dst / src.name)
            copied += 1
    if extra_dir and extra_dir.is_dir():
        for p in sorted(extra_dir.iterdir())[:60]:
            if p.suffix.lower() in EXTRA_SUFFIXES and p.is_file():
                dst.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(p, dst / p.name)
                copied += 1
    return "fonts" if copied else None
