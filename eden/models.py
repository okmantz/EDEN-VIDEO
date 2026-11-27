"""Request / option models shared by the API and the pipeline."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

from .brand import LOGO_POSITIONS, LOGO_SIZES
from .presets import CAPTION_FONTS, CAPTION_PRESETS, PLATFORMS, STYLES


class BrollAdd(BaseModel):
    """A manual cutaway the user placed in the fine-tune editor."""
    start: float = Field(ge=0.0)
    clip_id: str = Field(min_length=1, max_length=32)
    length: float = Field(default=2.5, gt=0.4, le=15.0)


class RemixPlan(BaseModel):
    """User edits from the fine-tune editor, applied on top of the automatic edit."""
    segments: Optional[list[tuple[float, float]]] = None   # source-time spans to keep; None = automatic
    caption_edits: dict[int, str] = Field(default_factory=dict)  # source-word index -> new text
    drop_broll: list[int] = Field(default_factory=list)    # placement indices to remove
    add_broll: list[BrollAdd] = Field(default_factory=list)


class RenderOptions(BaseModel):
    style: str = "viral_pop"
    title: Optional[str] = Field(default=None, max_length=140)
    remove_silence: bool = True
    remove_fillers: bool = True
    remove_filler_phrases: bool = False
    captions: bool = True
    broll: Literal["off", "low", "medium", "high"] = "medium"
    stock_footage: bool = True
    zoom: Optional[bool] = None            # None = follow the style
    pacing: Optional[Literal["relaxed", "balanced", "tight"]] = None   # None = follow the style
    framing: Literal["fill", "fit"] = "fill"
    focus: float = Field(default=0.5, ge=0.0, le=1.0)
    clean_audio: bool = True
    language: Optional[str] = Field(default=None, max_length=12)
    use_ai: bool = False
    logo: Optional[bool] = None            # None = follow Settings
    music_id: Optional[str] = Field(default=None, max_length=32)
    music_volume: float = Field(default=0.35, ge=0.0, le=1.0)
    whoosh_sfx_id: Optional[str] = Field(default=None, max_length=32)
    pop_sfx_id: Optional[str] = Field(default=None, max_length=32)
    remix: Optional[RemixPlan] = None
    # Caption look (None = the style's own). "brand" uses the brand kit's colours and font.
    caption_preset: Optional[str] = Field(default=None, max_length=32)
    caption_position: Optional[Literal["top", "center", "bottom"]] = None
    caption_scale: float = Field(default=1.0, ge=0.6, le=1.6)
    brand: Optional[bool] = None            # None = follow "Apply my brand" in the brand kit
    remove_repeats: Optional[bool] = None   # None = follow remove_fillers
    broll_cards: bool = True                # animated keyword cards when there is no footage

    @field_validator("style")
    @classmethod
    def _style(cls, v: str) -> str:
        if v not in STYLES:
            raise ValueError(f"Unknown style '{v}'")
        return v

    @field_validator("caption_preset")
    @classmethod
    def _caption_preset(cls, v: Optional[str]) -> Optional[str]:
        if v in (None, "", "style"):
            return None
        if v != "brand" and v not in CAPTION_PRESETS:
            raise ValueError(f"Unknown caption look '{v}'")
        return v


class RenderRequest(BaseModel):
    platforms: list[str] = Field(min_length=1, max_length=len(PLATFORMS))
    options: RenderOptions = Field(default_factory=RenderOptions)

    @field_validator("platforms")
    @classmethod
    def _platforms(cls, v: list[str]) -> list[str]:
        bad = [p for p in v if p not in PLATFORMS]
        if bad:
            raise ValueError(f"Unknown platform(s): {', '.join(bad)}")
        seen: list[str] = []
        for p in v:
            if p not in seen:
                seen.append(p)
        return seen


class SettingsUpdate(BaseModel):
    display_name: Optional[str] = Field(default=None, max_length=80)
    # Brand kit
    brand_name: Optional[str] = Field(default=None, max_length=60)
    brand_handle: Optional[str] = Field(default=None, max_length=40)
    brand_color: Optional[str] = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")        # primary
    brand_secondary: Optional[str] = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    brand_text: Optional[str] = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    brand_font: Optional[str] = Field(default=None, max_length=40)
    logo_position: Optional[str] = Field(default=None, max_length=20)
    logo_size: Optional[str] = Field(default=None, max_length=10)
    show_handle: Optional[bool] = None
    apply_brand: Optional[bool] = None
    brand_theme: Optional[bool] = None       # tint the app itself with the brand colour
    use_brand_color: Optional[bool] = None   # legacy, kept so older clients keep working
    default_style: Optional[str] = None
    default_platforms: Optional[list[str]] = None
    caption_font: Optional[str] = Field(default=None, max_length=60)
    whisper_model: Optional[Literal["tiny", "base", "small", "medium", "large-v3"]] = None
    language: Optional[str] = Field(default=None, max_length=12)
    ollama_enabled: Optional[bool] = None
    ollama_url: Optional[str] = Field(default=None, max_length=200)
    ollama_model: Optional[str] = Field(default=None, max_length=80)
    pexels_key: Optional[str] = Field(default=None, max_length=200)
    logo_enabled: Optional[bool] = None
    loudness: Optional[float] = Field(default=None, ge=-24, le=-9)

    @field_validator("default_style")
    @classmethod
    def _ds(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in STYLES:
            raise ValueError("Unknown style")
        return v

    @field_validator("brand_font")
    @classmethod
    def _bf(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in CAPTION_FONTS:
            raise ValueError("Unknown font")
        return v

    @field_validator("logo_position")
    @classmethod
    def _lp(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in LOGO_POSITIONS:
            raise ValueError("Unknown logo position")
        return v

    @field_validator("logo_size")
    @classmethod
    def _ls(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in LOGO_SIZES:
            raise ValueError("Unknown logo size")
        return v

    @field_validator("default_platforms")
    @classmethod
    def _dp(cls, v: Optional[list[str]]) -> Optional[list[str]]:
        if v is not None and any(p not in PLATFORMS for p in v):
            raise ValueError("Unknown platform")
        return v


class VideoPatch(BaseModel):
    title: str = Field(min_length=1, max_length=140)


class BrollPatch(BaseModel):
    name: Optional[str] = Field(default=None, max_length=120)
    tags: Optional[str] = Field(default=None, max_length=300)


class AudioPatch(BaseModel):
    name: Optional[str] = Field(default=None, max_length=120)
