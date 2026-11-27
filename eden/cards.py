"""Animated keyword cards: the B-roll fallback that needs no footage.

When there is no B-roll in the library and no stock-footage key, Eden still cuts away at the moment a
key word is spoken, to a short branded card that shows that word large over a slowly moving gradient
in the person's brand colours. Cards are tiny, rendered once per word/size/colours, and cached.
"""
from __future__ import annotations

import hashlib
import tempfile
from pathlib import Path
from typing import Optional

from .brand import ink_for, luminance
from .config import Config
from .fonts import stage_fonts
from .media import MediaError, ProcHandle, run_ffmpeg
from .presets import CAPTION_FONTS, caption_family

CARD_SECONDS = 2.8


def mix(a: str, b: str, t: float) -> str:
    """Blend hex colour ``a`` towards ``b`` by ``t`` (0..1)."""
    pa = [int(a.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4)]
    pb = [int(b.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4)]
    return "#" + "".join(f"{round(x + (y - x) * t):02X}" for x, y in zip(pa, pb))


def card_palette(primary: str, secondary: str) -> tuple[str, str, str, str]:
    """(gradient start, gradient end, text colour, accent colour) that always keep the text readable."""
    dark = 0.62 if luminance(primary) > 0.35 else 0.38
    c0 = mix(secondary, "#000000", 0.25) if luminance(secondary) < 0.25 else mix(primary, "#000000", 0.78)
    c1 = mix(primary, "#000000", dark)
    text = "#FFFFFF"
    return c0, c1, text, primary if luminance(primary) > 0.12 else mix(primary, "#FFFFFF", 0.4)


def _ass_color(hex_color: str) -> str:
    h = hex_color.lstrip("#")
    return f"&H00{h[4:6]}{h[2:4]}{h[0:2]}".upper()


def card_path(cache_dir: Path, text: str, width: int, height: int, primary: str, secondary: str,
              font_key: str) -> Path:
    digest = hashlib.sha1(f"v2|{text}|{width}x{height}|{primary}|{secondary}|{font_key}".encode()).hexdigest()[:16]
    return cache_dir / "cards" / f"{digest}.mp4"


def make_card(cfg: Config, text: str, width: int, height: int, primary: str, secondary: str,
              font_key: str, handle: Optional[ProcHandle] = None) -> Optional[Path]:
    """Render (or reuse) one keyword card. Returns None if this FFmpeg cannot draw it."""
    out = card_path(cfg.cache_dir, text, width, height, primary, secondary, font_key)
    if out.exists() and out.stat().st_size > 2000:
        return out
    out.parent.mkdir(parents=True, exist_ok=True)
    word = "".join(ch for ch in text.upper() if ch not in "{}\\").strip()[:22]
    if not word:
        return None
    c0, c1, txt, accent = card_palette(primary, secondary)
    family, _ = caption_family(font_key if font_key in CAPTION_FONTS else "montserrat_extrabold")
    size = int(min(0.115 * height, 0.84 * width / (0.47 * max(4, len(word)))))
    cx, cy = width // 2, int(height * 0.47)
    bar_w, bar_h = int(width * 0.16), max(6, int(height * 0.006))
    ass = (
        "[Script Info]\nScriptType: v4.00+\n"
        f"PlayResX: {width}\nPlayResY: {height}\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n"
        "[V4+ Styles]\n"
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, "
        "Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
        "Alignment, MarginL, MarginR, MarginV, Encoding\n"
        f"Style: Card,{family},{size},{_ass_color(txt)},{_ass_color(txt)},&H00000000,&H80000000,0,0,0,0,100,100,"
        f"{max(1, size // 40)},0,1,{max(2, size // 22)},{max(2, size // 30)},5,40,40,0,1\n\n"
        "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
        f"Dialogue: 1,0:00:00.00,0:00:{CARD_SECONDS:05.2f},Card,,0,0,0,,"
        f"{{\\an5\\pos({cx},{cy})\\fscx86\\fscy86\\alpha&HFF&\\t(0,260,\\fscx100\\fscy100\\alpha&H00&)"
        f"\\t(260,{int(CARD_SECONDS * 1000)},\\fscx104\\fscy104)}}{word}\n"
    )
    fonts_needed = [font_key if font_key in CAPTION_FONTS else "montserrat_extrabold", "inter_semibold"]
    with tempfile.TemporaryDirectory(dir=cfg.work_dir) as tmp:
        work = Path(tmp)
        (work / "card.ass").write_text(ass, encoding="utf-8")
        fonts = stage_fonts(work, fonts_needed)
        ass_opt = "ass=filename=card.ass" + (f":fontsdir={fonts}" if fonts else "")
        bar = (f"drawbox=x={(width - bar_w) // 2}:y={int(height * 0.47 + size * 0.62)}:w={bar_w}:h={bar_h}:"
               f"color={accent}@0.95:t=fill")
        sources = (
            f"gradients=s={width}x{height}:r=30:d={CARD_SECONDS}:c0={c0}:c1={c1}:x0=0:y0=0:x1={width}:y1={height}:speed=0.012",
            f"color=c={mix(c0, c1, 0.5)}:s={width}x{height}:r=30:d={CARD_SECONDS}",   # older FFmpeg builds
        )
        last_error: Exception = MediaError("card failed")
        for src in sources:
            try:
                run_ffmpeg(cfg, ["-f", "lavfi", "-i", src, "-vf", f"{bar},{ass_opt},format=yuv420p",
                                 "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
                                 "-t", f"{CARD_SECONDS}", "-movflags", "+faststart", str(out)],
                           handle=handle, cwd=work)
                return out
            except MediaError as e:
                last_error = e
                out.unlink(missing_ok=True)
        _ = last_error
    return None
