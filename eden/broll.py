"""B-roll planning (no AI required) and optional stock-footage lookup.

How cutaways are chosen
-----------------------
1. **Keyword matches.** When a spoken word matches a tag on one of your B-roll
   clips (after simple stemming), the clip is placed on that word.
2. **Gap filling.** If the talking head runs longer than the density setting
   allows without a cutaway, the next clip in rotation is dropped in.
3. Cutaways never cover the opening hook or the final beat, never overlap, and
   snap to the nearest word start so they land on the speech rhythm.
"""
from __future__ import annotations

import json
import random
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from .keywords import stem
from .presets import BROLL_DENSITY
from .transcript import Word

CARDS_PER_MINUTE = {"low": 2.0, "medium": 4.0, "high": 6.0}
HOOK_GUARD = 2.0       # seconds at the start with no cutaway
TAIL_GUARD = 1.5       # seconds at the end with no cutaway
MIN_SPACING = 1.8      # minimum talking-head time between two cutaways
MIN_CLIP = 1.2


@dataclass
class Clip:
    path: str
    duration: float
    tags: list[str] = field(default_factory=list)
    name: str = ""
    kind: str = "footage"      # "footage" (a real clip) or "card" (an animated keyword card)


@dataclass
class Placement:
    start: float
    end: float
    clip: Clip
    clip_start: float
    reason: str

    def as_dict(self) -> dict:
        return {"start": round(self.start, 2), "end": round(self.end, 2),
                "clip": self.clip.name or Path(self.clip.path).name, "reason": self.reason}


def parse_tags(raw: str) -> list[str]:
    return [t.strip().lower() for t in raw.replace(";", ",").split(",") if t.strip()]


def plan_broll(words: list[Word], total: float, clips: list[Clip], density: str,
               seed: int = 7) -> list[Placement]:
    cfg = BROLL_DENSITY.get(density, BROLL_DENSITY["off"])
    usable = [c for c in clips if c.duration >= MIN_CLIP]
    if cfg["max_gap"] <= 0 or not usable or total < HOOK_GUARD + TAIL_GUARD + MIN_CLIP + 1:
        return []
    footage = [c for c in usable if c.kind != "card"]
    # Keyword cards only ever appear on their word, and never more often than the density allows.
    card_budget = max(1, int(round(CARDS_PER_MINUTE.get(density, 3) * total / 60.0)))
    rng = random.Random(seed)
    length = cfg["length"]
    last_ok = total - TAIL_GUARD
    starts = [w.start for w in words]

    def snap_start(t: float) -> float:
        if not starts:
            return t
        nearest = min(starts, key=lambda s: abs(s - t))
        return nearest if abs(nearest - t) <= 0.4 else t

    def make(clip: Clip, at: float, reason: str) -> Optional[Placement]:
        at = snap_start(at)
        dur = min(length, clip.duration, last_ok - at)
        if dur < MIN_CLIP or at < HOOK_GUARD:
            return None
        spare = clip.duration - dur
        offset = round(rng.uniform(0, max(0.0, spare - 0.3)), 2) if spare > 1.0 else 0.0
        return Placement(round(at, 2), round(at + dur, 2), clip, offset, reason)

    def free(p: Placement, placed: list[Placement]) -> bool:
        return all(p.start >= q.end + MIN_SPACING or p.end <= q.start - MIN_SPACING for q in placed)

    placed: list[Placement] = []
    use_count: dict[str, int] = {c.path: 0 for c in usable}

    # 1) keyword matches
    tag_index: dict[str, list[Clip]] = {}
    for c in usable:
        for tag in c.tags:
            for piece in tag.split():
                tag_index.setdefault(stem(piece), []).append(c)
    for w in words:
        s = stem(w.text)
        if s in tag_index and len(s) >= 3:
            pool = tag_index[s]
            if card_budget <= 0:
                pool = [c for c in pool if c.kind != "card"]
            if not pool:
                continue
            clip = min(pool, key=lambda c: (c.kind == "card", use_count[c.path]))
            if clip.kind == "card" and use_count[clip.path] >= 2:
                continue
            p = make(clip, w.start - 0.1, f"keyword: {w.text.strip('.,!?').lower()}")
            if p and free(p, placed):
                placed.append(p)
                use_count[clip.path] += 1
                if clip.kind == "card":
                    card_budget -= 1
    placed.sort(key=lambda p: p.start)

    # 2) fill long stretches
    gap = cfg["max_gap"]
    cursor = HOOK_GUARD
    guard = 0
    while footage and cursor + gap < last_ok and guard < 500:
        guard += 1
        nxt = next((p for p in placed if p.end > cursor and p.start <= cursor + gap), None)
        if nxt:
            cursor = nxt.end
            continue
        clip = min(footage, key=lambda c: (use_count[c.path], rng.random()))
        p = make(clip, cursor + gap * 0.65, "fill")
        if p and free(p, placed):
            placed.append(p)
            use_count[clip.path] += 1
            placed.sort(key=lambda q: q.start)
            cursor = p.end
        else:
            cursor += gap * 0.5
    return placed


# --------------------------------------------------------------------------- #
# Optional: Pexels stock footage (needs a free API key and internet access)
# --------------------------------------------------------------------------- #
def _pexels_search(query: str, api_key: str, orientation: Optional[str], timeout: float) -> list[dict]:
    q = {"query": query, "per_page": 10, "size": "medium"}
    if orientation:
        q["orientation"] = orientation
    req = urllib.request.Request(f"https://api.pexels.com/videos/search?{urllib.parse.urlencode(q)}",
                                 headers={"Authorization": api_key, "User-Agent": "EdenVideo/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return list(json.loads(r.read().decode("utf-8")).get("videos", []))
    except (urllib.error.URLError, TimeoutError, ValueError, OSError):
        return []


def fetch_pexels(query: str, api_key: str, cache_dir: Path, portrait: bool,
                 max_bytes: int = 60 * 1024 * 1024, timeout: float = 20.0,
                 used_ids: Optional[set] = None) -> Optional[Clip]:
    """Download one short stock clip for ``query``. Returns None on any failure.

    Prefers the right orientation but falls back to any, skips clips already used for another
    word (``used_ids``) and favours clips of a useful length."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    videos = _pexels_search(query, api_key, "portrait" if portrait else "landscape", timeout)
    if len(videos) < 3:
        seen = {v.get("id") for v in videos}
        videos += [v for v in _pexels_search(query, api_key, None, timeout) if v.get("id") not in seen]
    used = used_ids if used_ids is not None else set()
    videos.sort(key=lambda v: abs(float(v.get("duration") or 0) - 12.0))
    for vid in videos:
        if vid.get("id") in used:
            continue
        dur = float(vid.get("duration") or 0)
        if dur < 3 or dur > 40:
            continue
        files = [f for f in vid.get("video_files", []) if f.get("file_type") == "video/mp4" and f.get("width")]
        files = [f for f in files if 540 <= int(f["width"]) <= 1920] or files
        if not files:
            continue
        pick = min(files, key=lambda f: abs(int(f["width"]) - 1080))
        dest = cache_dir / f"pexels_{vid['id']}.mp4"
        if not dest.exists():
            try:
                with urllib.request.urlopen(urllib.request.Request(pick["link"], headers={"User-Agent": "EdenVideo/1.0"}),
                                            timeout=timeout) as r, open(dest, "wb") as out:
                    total = 0
                    while chunk := r.read(1 << 16):
                        total += len(chunk)
                        if total > max_bytes:
                            raise OSError("too large")
                        out.write(chunk)
            except (urllib.error.URLError, TimeoutError, OSError):
                dest.unlink(missing_ok=True)
                continue
        used.add(vid.get("id"))
        return Clip(path=str(dest), duration=dur, tags=[query.lower()], name=f"Pexels: {query}")
    return None
