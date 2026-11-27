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
# Caption fonts
# --------------------------------------------------------------------------- #
# Every font is bundled with EDEN (eden/static/fonts/<key>.ttf + .woff2) so captions look
# identical on every computer. ``family`` is the exact name FFmpeg/libass looks up, ``css`` is the
# same name used by the web interface for live previews.
CAPTION_FONTS: dict[str, dict[str, str]] = {
    "inter_regular":        {"label": "Inter",                    "group": "Clean",   "family": "Eden Inter"},
    "inter_semibold":       {"label": "Inter Semibold",           "group": "Clean",   "family": "Eden Inter SemiBold"},
    "inter_bold":           {"label": "Inter Bold",               "group": "Clean",   "family": "Eden Inter Bold"},
    "inter_extrabold":      {"label": "Inter Extra Bold",         "group": "Clean",   "family": "Eden Inter ExtraBold"},
    "poppins_medium":       {"label": "Poppins",                  "group": "Clean",   "family": "Eden Poppins Medium"},
    "poppins_bold":         {"label": "Poppins Bold",             "group": "Clean",   "family": "Eden Poppins Bold"},
    "space_grotesk":        {"label": "Space Grotesk",            "group": "Clean",   "family": "Eden Space Grotesk SemiBold"},
    "montserrat_semibold":  {"label": "Montserrat Semibold",      "group": "Bold",    "family": "Eden Montserrat SemiBold"},
    "montserrat_extrabold": {"label": "Montserrat Extra Bold",    "group": "Bold",    "family": "Eden Montserrat ExtraBold"},
    "oswald_medium":        {"label": "Oswald",                   "group": "Bold",    "family": "Eden Oswald Medium"},
    "oswald_bold":          {"label": "Oswald Bold",              "group": "Bold",    "family": "Eden Oswald Bold"},
    "anton":                {"label": "Anton",                    "group": "Bold",    "family": "Eden Anton"},
    "bebas_neue":           {"label": "Bebas Neue",               "group": "Bold",    "family": "Eden Bebas Neue"},
    "archivo_black":        {"label": "Archivo Black",            "group": "Bold",    "family": "Eden Archivo Black"},
    "righteous":            {"label": "Righteous",                "group": "Fun",     "family": "Eden Righteous"},
    "orbitron":             {"label": "Orbitron",                 "group": "Fun",     "family": "Eden Orbitron Bold"},
    "bangers":              {"label": "Bangers",                  "group": "Fun",     "family": "Eden Bangers"},
    "permanent_marker":     {"label": "Permanent Marker",         "group": "Fun",     "family": "Eden Permanent Marker"},
    "pacifico":             {"label": "Pacifico",                 "group": "Script",  "family": "Eden Pacifico"},
    "lobster":              {"label": "Lobster",                  "group": "Script",  "family": "Eden Lobster"},
    "caveat":               {"label": "Caveat",                   "group": "Script",  "family": "Eden Caveat Bold"},
    "playfair_bold":        {"label": "Playfair Display",         "group": "Elegant", "family": "Eden Playfair Display Bold"},
    "dm_serif":             {"label": "DM Serif Display",         "group": "Elegant", "family": "Eden DM Serif Display"},
    "cinzel":               {"label": "Cinzel",                   "group": "Elegant", "family": "Eden Cinzel Bold"},
}
for _k, _f in CAPTION_FONTS.items():
    _f["key"] = _k
    _f["css"] = _f["family"]
    _f["file"] = f"{_k}.ttf"

DEFAULT_CAPTION_FONT = "inter_bold"

# --------------------------------------------------------------------------- #
# Caption presets
# --------------------------------------------------------------------------- #
# font            key in CAPTION_FONTS (a plain family name also works)
# size            fraction of the frame height
# color/highlight base text colour / active-word colour (word_highlight presets)
# outline         px at 1080 px wide, shadow likewise
# box, box_color  filled box behind the text instead of an outline
# glow            colour of a soft glow behind the text (or None)
# anim            how each caption line arrives: none | pop | fade | slide
# word_highlight  colour the word being spoken (needs word timings)
# position        bottom | center | top
CAPTION_PRESETS: dict[str, dict[str, Any]] = {
    "viral_pop": {
        "label": "Viral Pop", "tagline": "Bold, uppercase, yellow word-by-word",
        "font": "montserrat_extrabold", "size": 0.058, "color": "#FFFFFF", "highlight": "#FFE24A",
        "outline_color": "#000000", "outline": 8, "shadow": 2, "box": False, "uppercase": True,
        "max_words": 3, "max_chars_line": 16, "word_highlight": True, "anim": "pop", "position": "bottom",
    },
    "bold_impact": {
        "label": "Bold Impact", "tagline": "Huge centred words that hit hard",
        "font": "anton", "size": 0.084, "color": "#FFFFFF", "highlight": "#FF3D71",
        "outline_color": "#000000", "outline": 9, "shadow": 3, "box": False, "uppercase": True,
        "max_words": 2, "max_chars_line": 12, "word_highlight": True, "anim": "pop", "position": "center",
    },
    "clean_pro": {
        "label": "Clean Pro", "tagline": "Understated and polished",
        "font": "inter_semibold", "size": 0.042, "color": "#FFFFFF", "highlight": "#7CF5C8",
        "outline_color": "#000000", "outline": 3, "shadow": 1, "box": False, "uppercase": False,
        "max_words": 6, "max_chars_line": 30, "word_highlight": False, "anim": "fade", "position": "bottom",
    },
    "podcast_box": {
        "label": "Podcast Box", "tagline": "Readable on a soft dark box",
        "font": "poppins_medium", "size": 0.040, "color": "#FFFFFF", "highlight": "#FFFFFF",
        "outline_color": "#000000", "outline": 0, "shadow": 0, "box": True, "box_color": "#101418",
        "uppercase": False, "max_words": 5, "max_chars_line": 26, "word_highlight": False, "anim": "fade",
        "position": "bottom",
    },
    "highlighter": {
        "label": "Highlighter", "tagline": "Black on a bright marker box",
        "font": "montserrat_extrabold", "size": 0.050, "color": "#111111", "highlight": "#111111",
        "outline_color": "#000000", "outline": 0, "shadow": 0, "box": True, "box_color": "#FFE24A",
        "box_alpha": 0, "box_role": "accent", "uppercase": True, "max_words": 3, "max_chars_line": 18, "word_highlight": False,
        "anim": "pop", "position": "bottom",
    },
    "neon_glow": {
        "label": "Neon Glow", "tagline": "Cyan glow on the spoken word",
        "font": "space_grotesk", "size": 0.054, "color": "#FFFFFF", "highlight": "#27F2FF",
        "outline_color": "#0A1020", "outline": 3, "shadow": 0, "box": False, "uppercase": True,
        "glow": "#27F2FF", "max_words": 3, "max_chars_line": 18, "word_highlight": True, "anim": "pop",
        "position": "bottom",
    },
    "cinematic": {
        "label": "Cinematic", "tagline": "Elegant serif, slow fade",
        "font": "playfair_bold", "size": 0.041, "color": "#F4EFE6", "highlight": "#F4EFE6",
        "outline_color": "#000000", "outline": 2, "shadow": 2, "box": False, "uppercase": False,
        "max_words": 7, "max_chars_line": 34, "word_highlight": False, "anim": "fade", "position": "bottom",
    },
    "elegant": {
        "label": "Elegant", "tagline": "Spaced capitals with a gold accent",
        "font": "cinzel", "size": 0.040, "color": "#FFFFFF", "highlight": "#E9C46A",
        "outline_color": "#000000", "outline": 2, "shadow": 2, "box": False, "uppercase": True, "spacing": 2,
        "max_words": 4, "max_chars_line": 24, "word_highlight": True, "anim": "fade", "position": "bottom",
    },
    "minimal": {
        "label": "Minimal", "tagline": "Quiet lowercase, stays out of the way",
        "font": "inter_regular", "size": 0.036, "color": "#FFFFFF", "highlight": "#FFFFFF",
        "outline_color": "#000000", "outline": 2, "shadow": 1, "box": False, "uppercase": False,
        "max_words": 8, "max_chars_line": 38, "word_highlight": False, "anim": "fade", "position": "bottom",
    },
    "comic_pop": {
        "label": "Comic Pop", "tagline": "Playful, chunky and loud",
        "font": "bangers", "size": 0.068, "color": "#FFFFFF", "highlight": "#FFD23F",
        "outline_color": "#1B1B1B", "outline": 10, "shadow": 3, "box": False, "uppercase": True, "spacing": 1,
        "max_words": 3, "max_chars_line": 14, "word_highlight": True, "anim": "pop", "position": "center",
    },
    "handwritten": {
        "label": "Handwritten", "tagline": "Warm and personal, great for vlogs",
        "font": "caveat", "size": 0.062, "color": "#FFFFFF", "highlight": "#FFD6A5",
        "outline_color": "#000000", "outline": 4, "shadow": 1, "box": False, "uppercase": False,
        "max_words": 5, "max_chars_line": 24, "word_highlight": False, "anim": "slide", "position": "bottom",
    },
}
# "brand" is built on the fly from the person's brand kit (see eden/brand.py).
BRAND_CAPTION_KEY = "brand"
BRAND_CAPTION_BASE: dict[str, Any] = {
    "label": "My Brand", "tagline": "Your colours and font",
    "font": "montserrat_extrabold", "size": 0.054, "color": "#FFFFFF", "highlight": "#FFE24A",
    "outline_color": "#000000", "outline": 6, "shadow": 2, "box": False, "uppercase": True,
    "max_words": 3, "max_chars_line": 18, "word_highlight": True, "anim": "pop", "position": "bottom",
}

# --------------------------------------------------------------------------- #
# Edit styles: pacing + framing + colour + the default caption look and music mood.
# --------------------------------------------------------------------------- #
STYLES: dict[str, dict[str, Any]] = {
    "viral_pop": {
        "label": "Viral Pop", "tagline": "Fast cuts, bold word-by-word captions",
        "pacing": "tight", "zoom": True, "broll": "medium", "caption_preset": "viral_pop", "music": "bright_side",
        "grade": "eq=contrast=1.06:saturation=1.18:brightness=0.01,unsharp=5:5:0.5",
    },
    "clean_pro": {
        "label": "Clean Pro", "tagline": "Understated and polished",
        "pacing": "balanced", "zoom": False, "broll": "low", "caption_preset": "clean_pro", "music": "minimal_pulse",
        "grade": "eq=contrast=1.03:saturation=1.05",
    },
    "podcast_clip": {
        "label": "Podcast Clip", "tagline": "Boxed captions, gentle pace",
        "pacing": "balanced", "zoom": True, "broll": "off", "caption_preset": "podcast_box", "music": "soft_focus",
        "grade": "eq=contrast=1.04:saturation=1.08",
    },
    "bold_impact": {
        "label": "Bold Impact", "tagline": "Huge centred captions",
        "pacing": "tight", "zoom": True, "broll": "high", "caption_preset": "bold_impact", "music": "night_drive",
        "grade": "eq=contrast=1.1:saturation=1.25,unsharp=5:5:0.6",
    },
    "cinematic": {
        "label": "Cinematic", "tagline": "Filmic grade, calm pace",
        "pacing": "relaxed", "zoom": False, "broll": "low", "caption_preset": "cinematic", "music": "cinematic_rise",
        "grade": "eq=contrast=1.12:saturation=0.92:gamma=0.96,vignette=PI/6",
    },
    "lifestyle": {
        "label": "Lifestyle", "tagline": "Warm, friendly, vlog-ready",
        "pacing": "balanced", "zoom": False, "broll": "medium", "caption_preset": "handwritten",
        "music": "calm_horizon",
        "grade": "eq=contrast=1.04:saturation=1.12:brightness=0.01,colorbalance=rs=0.04:bs=-0.04",
    },
    "explainer": {
        "label": "Explainer", "tagline": "Crisp pace for tutorials and tips",
        "pacing": "tight", "zoom": True, "broll": "medium", "caption_preset": "highlighter",
        "music": "minimal_pulse",
        "grade": "eq=contrast=1.05:saturation=1.1,unsharp=5:5:0.4",
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
# Small words people stumble over ("I I think", "the the") are cut once when they repeat back to
# back. Words that can be repeated on purpose ("that that", "had had", "very very") are left alone.
STUTTER_WORDS = {
    "i", "i'm", "i'll", "i've", "we", "you", "they", "he", "she", "it", "the", "a", "an", "and", "but",
    "so", "to", "of", "in", "on", "for", "with", "is", "are", "was", "my", "our", "your", "this", "if",
    "because", "then", "like",
}

# Resolve each style's default caption preset so ``style["caption"]`` keeps working.
for _s in STYLES.values():
    _s["caption"] = deepcopy(CAPTION_PRESETS[_s["caption_preset"]])


def get_style(key: str) -> dict[str, Any]:
    if key not in STYLES:
        raise KeyError(f"Unknown style '{key}'")
    return deepcopy(STYLES[key])


def get_platform(key: str) -> dict[str, Any]:
    if key not in PLATFORMS:
        raise KeyError(f"Unknown platform '{key}'")
    return deepcopy(PLATFORMS[key])


def get_caption_preset(key: str) -> dict[str, Any]:
    if key == BRAND_CAPTION_KEY:
        return deepcopy(BRAND_CAPTION_BASE)
    if key not in CAPTION_PRESETS:
        raise KeyError(f"Unknown caption preset '{key}'")
    return deepcopy(CAPTION_PRESETS[key])


def caption_family(font: str) -> tuple[str, bool]:
    """(family name for libass, is_bundled) for a font key or a plain family name."""
    f = CAPTION_FONTS.get(font)
    return (f["family"], True) if f else (font or CAPTION_FONTS[DEFAULT_CAPTION_FONT]["family"], False)


def public_catalog() -> dict[str, Any]:
    """What the UI needs to render pickers."""
    from .musicgen import catalog as music_catalog
    return {
        "platforms": [{"key": k, **{f: v[f] for f in ("label", "group", "width", "height", "note", "recommended_max_s")}}
                      for k, v in PLATFORMS.items()],
        "styles": [{"key": k, "label": v["label"], "tagline": v["tagline"], "pacing": v["pacing"],
                    "zoom": v["zoom"], "broll": v["broll"], "caption": v["caption"],
                    "caption_preset": v["caption_preset"], "music": v["music"]}
                   for k, v in STYLES.items()],
        "caption_presets": [{"key": k, **v} for k, v in CAPTION_PRESETS.items()],
        "caption_fonts": list(CAPTION_FONTS.values()),
        "music_tracks": music_catalog(),
        "pacing": list(PACING.keys()),
        "broll": list(BROLL_DENSITY.keys()),
    }
