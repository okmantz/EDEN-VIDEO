"""Platform targets and editing styles.

Everything the editor needs to know about *where* a video is going (platforms)
and *how* it should feel (styles) lives here, as plain data, so it is easy to
tweak without touching the engine.

``recommended_max_s`` values are soft guidance only: the app warns but never
refuses. Platforms change their limits regularly, so check current specs.
"""
from __future__ import annotations

from copy import deepcopy
from typing import Any

# --------------------------------------------------------------------------- #
# Platforms
# --------------------------------------------------------------------------- #
PLATFORMS: dict[str, dict[str, Any]] = {
    "instagram_reels": {
        "label": "Instagram Reels", "group": "Instagram", "width": 1080, "height": 1920,
        "fps": 30, "recommended_max_s": 90, "safe_bottom": 0.24, "safe_top": 0.10,
        "vbitrate": "9M", "note": "9:16 vertical",
    },
    "instagram_feed": {
        "label": "Instagram Feed", "group": "Instagram", "width": 1080, "height": 1350,
        "fps": 30, "recommended_max_s": 60, "safe_bottom": 0.12, "safe_top": 0.06,
        "vbitrate": "8M", "note": "4:5 portrait",
    },
    "tiktok": {
        "label": "TikTok", "group": "TikTok", "width": 1080, "height": 1920,
        "fps": 30, "recommended_max_s": 180, "safe_bottom": 0.26, "safe_top": 0.10,
        "vbitrate": "9M", "note": "9:16 vertical",
    },
    "facebook_reels": {
        "label": "Facebook Reels", "group": "Facebook", "width": 1080, "height": 1920,
        "fps": 30, "recommended_max_s": 90, "safe_bottom": 0.24, "safe_top": 0.10,
        "vbitrate": "9M", "note": "9:16 vertical",
    },
    "facebook_feed": {
        "label": "Facebook Feed", "group": "Facebook", "width": 1080, "height": 1080,
        "fps": 30, "recommended_max_s": 180, "safe_bottom": 0.10, "safe_top": 0.05,
        "vbitrate": "8M", "note": "1:1 square",
    },
    "youtube_shorts": {
        "label": "YouTube Shorts", "group": "YouTube", "width": 1080, "height": 1920,
        "fps": 30, "recommended_max_s": 180, "safe_bottom": 0.22, "safe_top": 0.08,
        "vbitrate": "9M", "note": "9:16 vertical",
    },
    "youtube": {
        "label": "YouTube", "group": "YouTube", "width": 1920, "height": 1080,
        "fps": 30, "recommended_max_s": None, "safe_bottom": 0.09, "safe_top": 0.04,
        "vbitrate": "12M", "note": "16:9 landscape",
    },
}

# --------------------------------------------------------------------------- #
# Pacing: how aggressively silence is tightened.
#   noise_db      silence threshold (dBFS) - above this counts as sound
#   min_silence   pauses shorter than this are left alone
#   keep          how much of a removed pause survives (split across both sides)
# --------------------------------------------------------------------------- #
PACING: dict[str, dict[str, float]] = {
    "relaxed":  {"noise_db": -32.0, "min_silence": 0.70, "keep": 0.45},
    "balanced": {"noise_db": -32.0, "min_silence": 0.45, "keep": 0.24},
    "tight":    {"noise_db": -30.0, "min_silence": 0.28, "keep": 0.12},
}

# --------------------------------------------------------------------------- #
# Styles
# --------------------------------------------------------------------------- #
# caption keys:
#   font, size (fraction of frame height), color, highlight, outline_color,
#   outline (px at 1080 wide), shadow, box (bool), box_color, uppercase,
#   max_words, max_chars_line, word_highlight, pop, bold, position
#   (bottom|center|top)
STYLES: dict[str, dict[str, Any]] = {
    "viral_pop": {
        "label": "Viral Pop",
        "tagline": "Fast cuts, bold word-by-word captions",
        "pacing": "tight", "zoom": True, "broll": "medium",
        "grade": "eq=contrast=1.06:saturation=1.18:brightness=0.01,unsharp=5:5:0.5",
        "caption": {
            "font": "Inter", "size": 0.062, "color": "#FFFFFF", "highlight": "#FFE24A",
            "outline_color": "#000000", "outline": 7, "shadow": 2, "box": False,
            "uppercase": True, "max_words": 3, "max_chars_line": 16,
            "word_highlight": True, "pop": True, "bold": True, "position": "bottom",
        },
    },
    "clean_pro": {
        "label": "Clean Pro",
        "tagline": "Understated and polished",
        "pacing": "balanced", "zoom": False, "broll": "low",
        "grade": "eq=contrast=1.03:saturation=1.05",
        "caption": {
            "font": "Inter", "size": 0.043, "color": "#FFFFFF", "highlight": "#7CF5C8",
            "outline_color": "#000000", "outline": 3, "shadow": 1, "box": False,
            "uppercase": False, "max_words": 6, "max_chars_line": 30,
            "word_highlight": False, "pop": False, "bold": True, "position": "bottom",
        },
    },
    "podcast_clip": {
        "label": "Podcast Clip",
        "tagline": "Boxed captions, gentle pace",
        "pacing": "balanced", "zoom": True, "broll": "off",
        "grade": "eq=contrast=1.04:saturation=1.08",
        "caption": {
            "font": "Inter", "size": 0.044, "color": "#FFFFFF", "highlight": "#FFFFFF",
            "outline_color": "#000000", "outline": 0, "shadow": 0, "box": True,
            "box_color": "#101418", "uppercase": False, "max_words": 5,
            "max_chars_line": 26, "word_highlight": False, "pop": False,
            "bold": True, "position": "bottom",
        },
    },
    "bold_impact": {
        "label": "Bold Impact",
        "tagline": "Huge centered captions",
        "pacing": "tight", "zoom": True, "broll": "high",
        "grade": "eq=contrast=1.1:saturation=1.25,unsharp=5:5:0.6",
        "caption": {
            "font": "Inter", "size": 0.078, "color": "#FFFFFF", "highlight": "#FF3D71",
            "outline_color": "#000000", "outline": 9, "shadow": 3, "box": False,
            "uppercase": True, "max_words": 2, "max_chars_line": 12,
            "word_highlight": True, "pop": True, "bold": True, "position": "center",
        },
    },
    "cinematic": {
        "label": "Cinematic",
        "tagline": "Filmic grade, calm pace",
        "pacing": "relaxed", "zoom": False, "broll": "low",
        "grade": "eq=contrast=1.12:saturation=0.92:gamma=0.96,vignette=PI/6",
        "caption": {
            "font": "Inter", "size": 0.038, "color": "#F4EFE6", "highlight": "#F4EFE6",
            "outline_color": "#000000", "outline": 2, "shadow": 2, "box": False,
            "uppercase": False, "max_words": 7, "max_chars_line": 34,
            "word_highlight": False, "pop": False, "bold": False, "position": "bottom",
        },
    },
}

BROLL_DENSITY: dict[str, dict[str, float]] = {
    # max_gap: longest stretch of unbroken talking head before a cutaway
    # length:  default cutaway length (s)
    "off":    {"max_gap": 0.0,  "length": 0.0},
    "low":    {"max_gap": 16.0, "length": 2.6},
    "medium": {"max_gap": 9.0,  "length": 2.8},
    "high":   {"max_gap": 5.5,  "length": 2.4},
}

# Always removed when "remove filler words" is on. Deliberately conservative:
# only sounds that are never real content.
FILLER_WORDS = {
    "um", "umm", "ummm", "uh", "uhh", "uhhh", "uhm", "uhmm", "er", "erm", "err",
    "ah", "ahh", "eh", "hmm", "hm", "hmmm", "mm", "mmm",
}
# Removed only when the user opts in to "filler phrases".
FILLER_PHRASES = [("you", "know"), ("i", "mean")]
FILLER_SINGLE_EXTENDED = {"basically"}


def get_style(key: str) -> dict[str, Any]:
    if key not in STYLES:
        raise KeyError(f"Unknown style '{key}'")
    return deepcopy(STYLES[key])


def get_platform(key: str) -> dict[str, Any]:
    if key not in PLATFORMS:
        raise KeyError(f"Unknown platform '{key}'")
    return deepcopy(PLATFORMS[key])


def public_catalog() -> dict[str, Any]:
    """What the UI needs to render pickers."""
    return {
        "platforms": [{"key": k, **{f: v[f] for f in ("label", "group", "width", "height", "note", "recommended_max_s")}}
                      for k, v in PLATFORMS.items()],
        "styles": [{"key": k, "label": v["label"], "tagline": v["tagline"], "pacing": v["pacing"],
                    "zoom": v["zoom"], "broll": v["broll"], "caption": v["caption"]}
                   for k, v in STYLES.items()],
        "pacing": list(PACING.keys()),
        "broll": list(BROLL_DENSITY.keys()),
    }
