"""Caption generation: word groups -> styled ASS subtitles (burned in) and SRT."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable, Optional

from .keywords import stem
from .transcript import Word


@dataclass
class Chunk:
    words: list[Word]

    @property
    def start(self) -> float:
        return self.words[0].start

    @property
    def end(self) -> float:
        return self.words[-1].end

    @property
    def text(self) -> str:
        return " ".join(w.text for w in self.words)


_SENTENCE_END = (".", "!", "?", "…")
_CLAUSE_END = (",", ";", ":", "—", "-")


def group_words(words: list[Word], max_words: int, max_chars: int, gap_break: float = 0.6) -> list[Chunk]:
    """Split a word stream into caption chunks, preferring natural breaks."""
    chunks: list[Chunk] = []
    cur: list[Word] = []

    def flush() -> None:
        nonlocal cur
        if cur:
            chunks.append(Chunk(cur))
            cur = []

    for i, w in enumerate(words):
        if cur:
            gap = w.start - cur[-1].end
            chars = sum(len(x.text) + 1 for x in cur) + len(w.text)
            if gap > gap_break or len(cur) >= max_words or chars > max_chars * 2:
                flush()
        cur.append(w)
        t = w.text.rstrip()
        if t.endswith(_SENTENCE_END) or (t.endswith(_CLAUSE_END) and len(cur) >= max(2, max_words - 1)):
            flush()
    flush()
    return chunks


# --------------------------------------------------------------------------- #
# ASS
# --------------------------------------------------------------------------- #
def ass_color(hex_color: str, alpha: int = 0) -> str:
    """#RRGGBB -> &HAABBGGRR (ASS is BGR with inverted alpha)."""
    h = hex_color.lstrip("#")
    if len(h) != 6:
        h = "FFFFFF"
    r, g, b = h[0:2], h[2:4], h[4:6]
    return f"&H{alpha:02X}{b}{g}{r}".upper()


def _ts(t: float) -> str:
    t = max(0.0, t)
    cs = int(round(t * 100))
    h, rem = divmod(cs, 360000)
    m, rem = divmod(rem, 6000)
    s, cs = divmod(rem, 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def _escape(text: str) -> str:
    return text.replace("\\", "").replace("{", "(").replace("}", ")").replace("\n", " ")


def _wrap(tokens: list[str], max_chars: int) -> list[list[str]]:
    """Split tokens into at most two balanced lines."""
    total = sum(len(t) + 1 for t in tokens) - 1
    if total <= max_chars or len(tokens) < 2:
        return [tokens]
    best, best_diff = 1, 10 ** 9
    for i in range(1, len(tokens)):
        a = sum(len(t) + 1 for t in tokens[:i]) - 1
        b = sum(len(t) + 1 for t in tokens[i:]) - 1
        if abs(a - b) < best_diff:
            best, best_diff = i, abs(a - b)
    return [tokens[:best], tokens[best:]]


def build_ass(chunks: list[Chunk], style: dict[str, Any], width: int, height: int,
              safe_bottom: float = 0.2, safe_top: float = 0.08,
              emphasis: Optional[Iterable[str]] = None, font_override: str = "",
              brand_color: str = "") -> str:
    """Render chunks to an ASS document sized to the output frame.

    Word-highlight styles emit one event per spoken word so the active word can
    be coloured; other styles emit one event per chunk."""
    font = font_override or style.get("font", "Inter")
    size = max(18, int(round(style["size"] * height)))
    # outline widths are authored for a 1080 px wide frame
    scale = width / 1080
    outline = style.get("outline", 0) * scale
    shadow = style.get("shadow", 0) * scale
    primary = ass_color(style["color"])
    highlight_hex = brand_color if (brand_color and style.get("word_highlight")) else style.get("highlight", style["color"])
    highlight = ass_color(highlight_hex)
    box = bool(style.get("box"))
    border_style = 3 if box else 1
    back = ass_color(style.get("box_color", "#000000"), alpha=0x40) if box else ass_color("#000000", alpha=0x80)
    outline_col = ass_color(style.get("outline_color", "#000000")) if not box else back
    position = style.get("position", "bottom")
    if position == "center":
        alignment, margin_v = 5, 0
    elif position == "top":
        alignment, margin_v = 8, int(safe_top * height)
    else:
        alignment, margin_v = 2, int(safe_bottom * height)
    margin_lr = int(0.07 * width)
    bold = -1 if style.get("bold", True) else 0
    emph = {stem(e) for e in (emphasis or [])}

    header = (
        "[Script Info]\nScriptType: v4.00+\n"
        f"PlayResX: {width}\nPlayResY: {height}\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n"
        "[V4+ Styles]\n"
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, "
        "Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
        "Alignment, MarginL, MarginR, MarginV, Encoding\n"
        f"Style: Eden,{font},{size},{primary},{primary},{outline_col},{back},{bold},0,0,0,100,100,0,0,"
        f"{border_style},{(max(outline, 6 * scale) if box else outline):.1f},{shadow:.1f},{alignment},{margin_lr},{margin_lr},{margin_v},1\n\n"
        "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    )

    upper = bool(style.get("uppercase"))
    max_chars = int(style.get("max_chars_line", 28))
    pop = bool(style.get("pop"))
    word_hl = bool(style.get("word_highlight"))
    events: list[str] = []

    def disp(w: Word) -> str:
        t = _escape(w.text)
        return t.upper() if upper else t

    for ci, ch in enumerate(chunks):
        next_start = chunks[ci + 1].start if ci + 1 < len(chunks) else ch.end + 1.0
        chunk_end = min(ch.end + 0.18, max(next_start - 0.01, ch.end))
        toks = [disp(w) for w in ch.words]
        line_split = _wrap(toks, max_chars)
        breaks: set[int] = set()
        if len(line_split) == 2:
            breaks.add(len(line_split[0]))

        if not word_hl:
            body = r"\N".join(" ".join(line) for line in line_split)
            anim = r"{\fscx92\fscy92\t(0,110,\fscx100\fscy100)}" if pop else ""
            events.append(f"Dialogue: 0,{_ts(ch.start)},{_ts(chunk_end)},Eden,,0,0,0,,{anim}{body}")
            continue

        for wi, w in enumerate(ch.words):
            start = w.start if wi > 0 else ch.start
            end = ch.words[wi + 1].start if wi + 1 < len(ch.words) else chunk_end
            if end - start < 0.03:
                continue
            parts: list[str] = []
            for k, tok in enumerate(toks):
                if k in breaks:
                    parts.append(r"\N")
                elif k > 0:
                    parts.append(" ")
                is_active = k == wi
                is_emph = stem(ch.words[k].text) in emph
                if is_active:
                    parts.append(f"{{\\c{highlight}}}{tok}{{\\c{primary}}}")
                elif is_emph:
                    parts.append(f"{{\\c{highlight}}}{tok}{{\\c{primary}}}")
                else:
                    parts.append(tok)
            anim = r"{\fscx90\fscy90\t(0,120,\fscx100\fscy100)}" if (pop and wi == 0) else ""
            events.append(f"Dialogue: 0,{_ts(start)},{_ts(end)},Eden,,0,0,0,,{anim}{''.join(parts)}")
    return header + "\n".join(events) + "\n"


# --------------------------------------------------------------------------- #
# SRT
# --------------------------------------------------------------------------- #
def _srt_ts(t: float) -> str:
    ms = int(round(max(0.0, t) * 1000))
    h, rem = divmod(ms, 3_600_000)
    m, rem = divmod(rem, 60_000)
    s, ms = divmod(rem, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def build_srt(words: list[Word], max_words: int = 8, max_chars: int = 42) -> str:
    """Standard readable subtitles (separate from the burned-in style)."""
    chunks = group_words(words, max_words=max_words, max_chars=max_chars, gap_break=0.8)
    out: list[str] = []
    for i, ch in enumerate(chunks, 1):
        lines = _wrap([w.text for w in ch.words], max_chars)
        out.append(f"{i}\n{_srt_ts(ch.start)} --> {_srt_ts(ch.end)}\n" + "\n".join(" ".join(l) for l in lines) + "\n")
    return "\n".join(out)
