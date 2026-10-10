"""Word-level transcripts: local Whisper (optional), SRT/VTT import, caching."""
from __future__ import annotations

import importlib.util
import json
import re
import threading
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Callable, Optional

from .media import Cancelled, ProcHandle


@dataclass
class Word:
    start: float
    end: float
    text: str

    @property
    def norm(self) -> str:
        return normalize(self.text)


_NORM_RE = re.compile(r"[^\w'\-]+", re.UNICODE)


def normalize(text: str) -> str:
    return _NORM_RE.sub("", text.lower()).strip("'-")


# --------------------------------------------------------------------------- #
# SRT / VTT import (lets Eden caption videos with no speech engine installed)
# --------------------------------------------------------------------------- #
_TS = r"(?:(\d+):)?(\d{1,2}):(\d{2})[,.](\d{1,3})"
_CUE_RE = re.compile(rf"{_TS}\s*-->\s*{_TS}")
_TAG_RE = re.compile(r"<[^>]+>|\{[^}]*\}")


def _ts(h: Optional[str], m: str, s: str, ms: str) -> float:
    return int(h or 0) * 3600 + int(m) * 60 + int(s) + int(ms.ljust(3, "0")[:3]) / 1000


def parse_subtitles(text: str) -> list[Word]:
    """Parse SRT or WebVTT. Words are timed proportionally to their length
    inside each cue, which is accurate enough for caption highlighting."""
    text = text.replace("\r\n", "\n").replace("\r", "\n").lstrip("﻿")
    words: list[Word] = []
    for block in re.split(r"\n{2,}", text):
        lines = [l for l in block.split("\n") if l.strip()]
        idx = next((i for i, l in enumerate(lines) if _CUE_RE.search(l)), None)
        if idx is None:
            continue
        m = _CUE_RE.search(lines[idx])
        assert m
        start = _ts(*m.group(1, 2, 3, 4))
        end = _ts(*m.group(5, 6, 7, 8))
        body = _TAG_RE.sub("", " ".join(lines[idx + 1:])).strip()
        toks = body.split()
        if not toks or end <= start:
            continue
        total = sum(len(t) + 1 for t in toks)
        t0 = start
        for tok in toks:
            dur = (end - start) * (len(tok) + 1) / total
            words.append(Word(round(t0, 3), round(t0 + dur, 3), tok))
            t0 += dur
    if not words:
        raise ValueError("No captions were found in that file. Upload a standard .srt or .vtt file.")
    return words


# --------------------------------------------------------------------------- #
# Whisper (faster-whisper) - fully local, optional
# --------------------------------------------------------------------------- #
def whisper_available() -> bool:
    return importlib.util.find_spec("faster_whisper") is not None


_models: dict[tuple[str, str], object] = {}
_model_lock = threading.Lock()

DISFLUENCY_PROMPT = "Umm, uh, so, like, you know, I mean, hmm. Well, uh... let me think. Right, okay."


def model_cached(model_size: str, device: str) -> bool:
    """True once the model is loaded in this process (a download may happen otherwise)."""
    return (model_size, device) in _models


def transcribe_whisper(wav: Path, model_size: str, device: str, language: Optional[str],
                       duration: float, on_progress: Optional[Callable[[float], None]] = None,
                       handle: Optional[ProcHandle] = None) -> tuple[list[Word], str]:
    if not whisper_available():
        raise RuntimeError("The speech engine (faster-whisper) is not installed.")
    from faster_whisper import WhisperModel  # type: ignore

    with _model_lock:
        key = (model_size, device)
        if key not in _models:
            _models[key] = WhisperModel(model_size, device=device, compute_type="int8")
        model = _models[key]
    segments, info = model.transcribe(  # type: ignore[attr-defined]
        str(wav), language=None if not language or language == "auto" else language,
        word_timestamps=True, vad_filter=False, condition_on_previous_text=False,
        initial_prompt=DISFLUENCY_PROMPT,
    )
    words: list[Word] = []
    for seg in segments:
        if handle and handle.cancel.is_set():
            raise Cancelled()
        for w in (seg.words or []):
            t = (w.word or "").strip()
            if t:
                words.append(Word(round(float(w.start), 3), round(float(w.end), 3), t))
        if on_progress and duration:
            on_progress(min(1.0, float(seg.end) / duration))
    return words, getattr(info, "language", "") or ""


# --------------------------------------------------------------------------- #
# Cache
# --------------------------------------------------------------------------- #
def save_words(path: Path, words: list[Word], source: str, language: str = "", model: str = "") -> None:
    path.write_text(json.dumps({"source": source, "language": language, "model": model,
                                "words": [asdict(w) for w in words]}), encoding="utf-8")


def load_words(path: Path) -> tuple[list[Word], dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return [Word(**w) for w in data["words"]], {k: v for k, v in data.items() if k != "words"}
