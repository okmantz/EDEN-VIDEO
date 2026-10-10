"""Request / option models shared by the API and the pipeline."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

from .presets import PLATFORMS, STYLES


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

    @field_validator("style")
    @classmethod
    def _style(cls, v: str) -> str:
        if v not in STYLES:
            raise ValueError(f"Unknown style '{v}'")
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
    brand_color: Optional[str] = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    use_brand_color: Optional[bool] = None
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
