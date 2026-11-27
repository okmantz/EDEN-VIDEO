"""The person's brand kit: name, handle, colours, font and logo placement.

One small, dependency-free module so the API, the pipeline and the tests all read the brand the
same way. A brand is *applied* to a video by recolouring captions, placing the logo and showing the
handle; nothing about a brand can break a render (every value is validated and has a default).
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Optional

from .presets import BRAND_CAPTION_KEY, CAPTION_FONTS, get_caption_preset

HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
LOGO_POSITIONS = ("top_left", "top_right", "bottom_left", "bottom_right")
LOGO_SIZES = {"small": 0.11, "medium": 0.16, "large": 0.22}   # fraction of the frame width
DEFAULT_PRIMARY = "#2EE6A6"


def clean_hex(value: Any, fallback: str) -> str:
    v = str(value or "").strip()
    return v.upper() if HEX_RE.match(v) else fallback


def rgb(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def luminance(hex_color: str) -> float:
    """WCAG relative luminance, 0 (black) .. 1 (white)."""
    def lin(c: int) -> float:
        x = c / 255
        return x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4
    r, g, b = rgb(hex_color)
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)


def ink_for(hex_color: str) -> str:
    """Black or white, whichever reads better on ``hex_color``."""
    return "#111111" if luminance(hex_color) > 0.38 else "#FFFFFF"


@dataclass(frozen=True)
class Brand:
    name: str = ""
    handle: str = ""
    primary: str = DEFAULT_PRIMARY
    secondary: str = "#101418"
    text: str = "#FFFFFF"
    font: str = "montserrat_extrabold"
    logo_position: str = "top_right"
    logo_size: str = "medium"
    show_handle: bool = False
    apply: bool = True
    has_logo: bool = False

    @property
    def configured(self) -> bool:
        """True once the person has made the kit their own (so defaults never recolour anything)."""
        return bool(self.name or self.handle or self.has_logo or self.primary != DEFAULT_PRIMARY)

    @property
    def handle_text(self) -> str:
        h = self.handle.strip()
        if not h:
            return ""
        return h if h.startswith(("@", "#")) or "." in h else "@" + h

    @property
    def logo_fraction(self) -> float:
        return LOGO_SIZES.get(self.logo_size, LOGO_SIZES["medium"])


def from_settings(s: dict[str, Any], has_logo: bool = False) -> Brand:
    font = s.get("brand_font") or "montserrat_extrabold"
    pos = s.get("logo_position")
    size = s.get("logo_size")
    return Brand(
        name=str(s.get("brand_name") or "").strip()[:60],
        handle=str(s.get("brand_handle") or "").strip()[:40],
        primary=clean_hex(s.get("brand_color"), DEFAULT_PRIMARY),
        secondary=clean_hex(s.get("brand_secondary"), "#101418"),
        text=clean_hex(s.get("brand_text"), "#FFFFFF"),
        font=font if font in CAPTION_FONTS else "montserrat_extrabold",
        logo_position=pos if pos in LOGO_POSITIONS else "top_right",
        logo_size=size if size in LOGO_SIZES else "medium",
        show_handle=bool(s.get("show_handle")),
        apply=bool(s.get("apply_brand", True)),
        has_logo=has_logo,
    )


def caption_style(preset_key: str, brand: Optional[Brand] = None, apply_brand: bool = True,
                  position: Optional[str] = None, scale: float = 1.0) -> dict[str, Any]:
    """The finished caption style for one video: preset, then brand colours, then the per-video tweaks."""
    base = get_caption_preset(preset_key)
    if brand is not None and brand.configured:
        if preset_key == BRAND_CAPTION_KEY:
            base.update(font=brand.font, color=brand.text, highlight=brand.primary)
            if base.get("box"):
                base.update(box_color=brand.secondary)
        elif apply_brand:
            if base.get("word_highlight") or base.get("glow"):
                base["highlight"] = brand.primary
            if base.get("glow"):
                base["glow"] = brand.primary
            if base.get("box"):
                role_color = brand.primary if base.get("box_role") == "accent" else brand.secondary
                base["box_color"] = role_color
                base["color"] = ink_for(role_color)
                base["highlight"] = base["color"]
    if position in ("top", "center", "bottom"):
        base["position"] = position
    base["size"] = round(float(base["size"]) * max(0.6, min(1.6, scale)), 4)
    return base
