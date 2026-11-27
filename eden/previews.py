"""Exact still previews of captions and the brand kit.

The previews are rendered by the same code that renders real videos (the ASS caption builder, the
bundled fonts, libass), so what a person sees in the app is what ends up in the finished video.
Each preview is a small PNG, cached by its inputs.
"""
from __future__ import annotations

import hashlib
import json
import tempfile
from pathlib import Path
from typing import Any, Optional

from . import brand as brand_mod
from . import captions as cap_mod
from .config import Config
from .editor import FinalPlan, build_final_graph
from .fonts import stage_fonts
from .media import MediaError, run_ffmpeg
from .presets import CAPTION_PRESETS, get_platform
from .system import filter_graph_args
from .transcript import Word

PREVIEW_W, PREVIEW_H = 540, 960
SAMPLE_TEXT = "Make every second count"


def _digest(payload: Any) -> str:
    return hashlib.sha1(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()[:20]


def _words(text: str) -> list[Word]:
    toks = (text or SAMPLE_TEXT).split()[:12]
    return [Word(round(i * 0.5, 2), round(i * 0.5 + 0.46, 2), t) for i, t in enumerate(toks)]


def render_preview(cfg: Config, settings: dict[str, Any], *, preset: Optional[str], position: Optional[str],
                   scale: float, apply_brand: bool, text: str = "", show_brand: bool = False) -> Path:
    """Render one 540x960 PNG. ``show_brand`` adds the logo and handle, as in a finished video."""
    logo_file = cfg.assets_dir / "logo.png"
    has_logo = logo_file.exists()
    brand = brand_mod.from_settings(settings, has_logo=has_logo)
    key = preset or "viral_pop"
    if key != "brand" and key not in CAPTION_PRESETS:
        raise KeyError(f"Unknown caption look '{key}'")
    style = brand_mod.caption_style(key, brand, apply_brand, position=position, scale=scale)
    plat = get_platform("instagram_reels")
    logo_stamp = logo_file.stat().st_mtime_ns if (show_brand and has_logo) else 0
    digest = _digest([key, position, round(scale, 2), apply_brand, text[:80], show_brand, logo_stamp, style,
                      brand.logo_position, brand.logo_size, brand.handle_text if show_brand else "",
                      brand.show_handle, "v3"])
    out = cfg.cache_dir / "previews" / f"{digest}.png"
    if out.exists() and out.stat().st_size > 500:
        return out
    out.parent.mkdir(parents=True, exist_ok=True)

    words = _words(text)
    chunks = cap_mod.group_words(words, style["max_words"], style["max_chars_line"])
    pick = next((c for c in chunks if len(c.words) >= 2), chunks[0])
    t = round(pick.start + min(0.75, (pick.end - pick.start) * 0.6) + 0.1, 2)
    watermark = None
    show_logo = show_brand and has_logo
    if show_brand and apply_brand and brand.show_handle and brand.handle_text:
        right = brand.logo_position.endswith("right") and show_logo
        watermark = {"text": brand.handle_text, "align": 7 if right or not show_logo else 9, "color": "#FFFFFF"}
    ass = cap_mod.build_ass(chunks, style, PREVIEW_W, PREVIEW_H, plat["safe_bottom"], plat["safe_top"],
                            emphasis=[], watermark=watermark, total=t + 5)
    with tempfile.TemporaryDirectory(dir=cfg.work_dir) as tmp:
        work = Path(tmp)
        (work / "p.ass").write_text(ass, encoding="utf-8")
        fonts = stage_fonts(work, [style.get("font", ""), "inter_semibold"], cfg.assets_dir / "fonts")
        plan = FinalPlan(width=PREVIEW_W, height=PREVIEW_H, fps=30, duration=1.0, ass_name="p.ass", fonts_dir=fonts,
                         logo=logo_file if show_logo else None, logo_top=plat["safe_top"] + 0.01,
                         logo_bottom=plat["safe_bottom"] + 0.01, logo_pos=brand.logo_position,
                         logo_frac=brand.logo_fraction, has_audio=False)
        graph = build_final_graph(plan)
        (work / "g.txt").write_text(graph, encoding="utf-8")
        bg = (f"gradients=s={PREVIEW_W}x{PREVIEW_H}:r=30:d={t + 6}:c0=0x23324b:c1=0x5a4478:x0=0:y0=0:"
              f"x1={PREVIEW_W}:y1={PREVIEW_H}")
        args = ["-f", "lavfi", "-i", bg]
        if plan.logo is not None:
            args += ["-i", str(plan.logo)]
        args += [*filter_graph_args(cfg.ffmpeg, work / "g.txt"), "-map", "[vout]", "-ss", f"{t}", "-frames:v", "1",
                 str(out)]
        try:
            run_ffmpeg(cfg, args, cwd=work)
        except MediaError:
            # very old FFmpeg without the gradients source
            args[1:4] = ["lavfi", "-i", f"color=c=0x3a3f63:s={PREVIEW_W}x{PREVIEW_H}:r=30:d={t + 6}"]
            args[0:1] = ["-f"]
            run_ffmpeg(cfg, args, cwd=work)
    return out
