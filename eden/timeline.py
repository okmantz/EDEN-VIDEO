"""Cut planning: turn silences + filler words into the list of segments to keep."""
from __future__ import annotations

import bisect
from dataclasses import dataclass
from typing import Optional

from .presets import FILLER_PHRASES, FILLER_SINGLE_EXTENDED, FILLER_WORDS
from .transcript import Word

Span = tuple[float, float]
MIN_SEGMENT = 0.12


def speech_segments(silences: list[Span], duration: float, pad: float) -> list[Span]:
    """Complement of ``silences``, with each speech span extended by ``pad`` on
    both sides. Pauses shorter than ``2*pad`` therefore survive intact, and
    longer pauses are shortened to ``2*pad``."""
    cleaned: list[Span] = []
    for s, e in sorted(silences):
        s = max(0.0, s)
        e = min(duration, e)
        if e > s:
            cleaned.append((s, e))
    speech: list[Span] = []
    cursor = 0.0
    for s, e in cleaned:
        if s - cursor > 0.0:
            speech.append((cursor, s))
        cursor = max(cursor, e)
    if duration - cursor > 0.0:
        speech.append((cursor, duration))
    extended = [(max(0.0, a - pad), min(duration, b + pad)) for a, b in speech]
    return merge(extended)


def merge(spans: list[Span], gap: float = 0.0) -> list[Span]:
    out: list[Span] = []
    for s, e in sorted(spans):
        if out and s <= out[-1][1] + gap:
            out[-1] = (out[-1][0], max(out[-1][1], e))
        else:
            out.append((s, e))
    return out


def subtract(segments: list[Span], cuts: list[Span], min_len: float = MIN_SEGMENT) -> list[Span]:
    cuts = merge(cuts)
    result: list[Span] = []
    for s, e in segments:
        cur = s
        for cs, ce in cuts:
            if ce <= cur or cs >= e:
                continue
            if cs > cur:
                result.append((cur, cs))
            cur = max(cur, ce)
            if cur >= e:
                break
        if cur < e:
            result.append((cur, e))
    return [(s, e) for s, e in result if e - s >= min_len]


def snap(segments: list[Span], fps: float, duration: float) -> list[Span]:
    """Align cut points to the frame grid so audio and video lengths match."""
    if fps <= 0:
        return segments
    step = 1.0 / fps
    out: list[Span] = []
    for s, e in segments:
        s2 = round(s / step) * step
        e2 = round(e / step) * step
        e2 = min(e2, duration)
        if e2 - s2 >= MIN_SEGMENT:
            out.append((round(s2, 4), round(e2, 4)))
    return merge(out, gap=1e-6)


def find_filler_cuts(words: list[Word], phrases: bool = False) -> list[tuple[Span, str]]:
    """Return [((start, end), text)] spans to remove for filler words.

    Each cut also swallows most of the pause that precedes the filler so that
    removing "so... um... anyway" does not leave two pauses stacked up."""
    cuts: list[tuple[Span, str]] = []
    n = len(words)
    i = 0
    while i < n:
        w = words[i]
        span_words = 0
        label = ""
        if w.norm in FILLER_WORDS or (phrases and w.norm in FILLER_SINGLE_EXTENDED):
            span_words, label = 1, w.norm
        elif phrases:
            for ph in FILLER_PHRASES:
                k = len(ph)
                if i + k <= n and tuple(x.norm for x in words[i:i + k]) == ph:
                    span_words, label = k, " ".join(ph)
                    break
        if span_words:
            first, last = words[i], words[i + span_words - 1]
            prev_end = words[i - 1].end if i > 0 else 0.0
            next_start = words[i + span_words].start if i + span_words < n else last.end + 0.05
            start = max(prev_end, min(first.start - 0.02, prev_end + 0.05))
            end = min(next_start, last.end + 0.04)
            if end > start:
                cuts.append(((max(0.0, start), end), label))
            i += span_words
        else:
            i += 1
    return cuts


@dataclass
class Timeline:
    """Maps source time to output time for a list of kept segments."""
    segments: list[Span]

    def __post_init__(self) -> None:
        self._starts = [s for s, _ in self.segments]
        self.offsets: list[float] = []
        acc = 0.0
        for s, e in self.segments:
            self.offsets.append(acc)
            acc += e - s
        self.total = acc

    def map(self, t: float) -> Optional[float]:
        i = bisect.bisect_right(self._starts, t) - 1
        if i < 0:
            return None
        s, e = self.segments[i]
        if t > e:
            return None
        return self.offsets[i] + (t - s)

    def map_words(self, words: list[Word]) -> list[Word]:
        """Words that fall (even partly) in kept footage, re-timed to the output."""
        out: list[Word] = []
        for w in words:
            mid = (w.start + w.end) / 2
            i = bisect.bisect_right(self._starts, mid) - 1
            if i < 0:
                continue
            s, e = self.segments[i]
            if mid > e:
                continue
            a = self.offsets[i] + (max(w.start, s) - s)
            b = self.offsets[i] + (min(w.end, e) - s)
            if b - a < 0.04:
                b = a + 0.04
            out.append(Word(round(a, 3), round(b, 3), w.text))
        return out
