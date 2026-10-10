"""Optional Ollama integration.

Eden never *needs* this. Without Ollama (or if it errors) every feature falls
back to deterministic logic. With it, Eden can write a better title and
description and choose smarter emphasis keywords.
"""
from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from typing import Any, Optional


class Ollama:
    def __init__(self, url: str, model: str, timeout: float = 90.0):
        self.url = (url or "").rstrip("/")
        self.model = model
        self.timeout = timeout

    def _request(self, path: str, payload: Optional[dict] = None, timeout: Optional[float] = None) -> Any:
        data = json.dumps(payload).encode() if payload is not None else None
        req = urllib.request.Request(self.url + path, data=data,
                                     headers={"Content-Type": "application/json"} if data else {})
        with urllib.request.urlopen(req, timeout=timeout or self.timeout) as r:
            return json.loads(r.read().decode("utf-8"))

    def models(self) -> list[str]:
        try:
            data = self._request("/api/tags", timeout=3)
            return [m.get("name", "") for m in data.get("models", [])]
        except (urllib.error.URLError, TimeoutError, ValueError, OSError):
            return []

    def available(self) -> bool:
        if not self.url:
            return False
        try:
            self._request("/api/tags", timeout=3)
            return True
        except (urllib.error.URLError, TimeoutError, ValueError, OSError):
            return False

    def generate_json(self, system: str, prompt: str) -> Optional[dict]:
        try:
            data = self._request("/api/generate", {
                "model": self.model, "system": system, "prompt": prompt, "stream": False,
                "format": "json", "options": {"temperature": 0.4, "num_predict": 600},
            })
            raw = data.get("response", "")
            m = re.search(r"\{.*\}", raw, re.DOTALL)
            return json.loads(m.group(0)) if m else None
        except (urllib.error.URLError, TimeoutError, ValueError, OSError):
            return None


SYSTEM = ("You are a social video editor. Reply with a single JSON object only, no commentary. "
          "Never invent facts that are not in the transcript.")


def _clip_text(text: str, limit: int = 6000) -> str:
    if len(text) <= limit:
        return text
    half = limit // 2
    return text[:half] + " ... " + text[-half:]


def enhance(ollama: Ollama, transcript: str, platform_label: str, style_label: str) -> Optional[dict]:
    """Ask the model for a title, description, hashtags and emphasis keywords."""
    if not transcript.strip():
        return None
    prompt = (
        f"Transcript of a video that will be posted on {platform_label} in a '{style_label}' style:\n\n"
        f"{_clip_text(transcript)}\n\n"
        'Return JSON with exactly these keys: "title" (max 70 chars, no clickbait lies), '
        '"description" (1-2 sentences), "hashtags" (array of up to 6 lowercase tags starting with #), '
        '"keywords" (array of up to 8 single words from the transcript worth emphasising on screen).'
    )
    raw = ollama.generate_json(SYSTEM, prompt)
    if not isinstance(raw, dict):
        return None
    out: dict[str, Any] = {}
    title = raw.get("title")
    if isinstance(title, str) and title.strip():
        out["title"] = title.strip()[:90]
    desc = raw.get("description")
    if isinstance(desc, str) and desc.strip():
        out["description"] = desc.strip()[:400]
    tags = raw.get("hashtags")
    if isinstance(tags, list):
        clean = []
        for t in tags:
            if isinstance(t, str):
                t = "#" + re.sub(r"[^A-Za-z0-9]", "", t).lower()
                if len(t) > 1:
                    clean.append(t)
        if clean:
            out["hashtags"] = clean[:6]
    kws = raw.get("keywords")
    if isinstance(kws, list):
        words = [re.sub(r"[^A-Za-z0-9'\-]", "", k).lower() for k in kws if isinstance(k, str)]
        words = [w for w in words if w]
        if words:
            out["keywords"] = words[:8]
    return out or None
