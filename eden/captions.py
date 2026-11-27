"""Caption generation: word groups -> styled ASS subtitles (burned in) and SRT."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable, Optional

from .keywords import stem
from .presets import caption_family
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


def group_words_indexed(words: list[Word], max_words: int, max_chars: int,
                        gap_break: float = 0.6) -> list[tuple[Chunk, int, int]]:
    """Like :func:`group_words` but also returns each chunk's [start, end) word indices,
    so the fine-tune editor can map a caption-line edit back to its words."""
    chunks = group_words(words, max_words, max_chars, gap_break)
    out: list[tuple[Chunk, int, int]] = []
    i = 0
    for ch in chunks:
        n = len(ch.words)
        out.append((ch, i, i + n))
        i += n
    return out


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
              brand_color: str = "", watermark: Optional[dict[str, Any]] = None,
              total: float = 0.0) -> str:
    """Render chunks to an ASS document sized to the output frame.

    Word-highlight styles emit one event per spoken word so the active word can be coloured; other
    styles emit one event per chunk. A ``watermark`` ({"text", "align" 7|9|1|3, "color"}) adds a
    small handle that stays on screen for the whole video (``total`` seconds)."""
    family, bundled = caption_family(font_override or style.get("font", ""))
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
    box_alpha = int(style.get("box_alpha", 0x40))
    back = ass_color(style.get("box_color", "#000000"), alpha=box_alpha) if box else ass_color("#000000", alpha=0x80)
    outline_col = ass_color(style.get("outline_color", "#000000")) if not box else back
    position = style.get("position", "bottom")
    if position == "center":
        alignment, margin_v = 5, 0
    elif position == "top":
        alignment, margin_v = 8, int(safe_top * height)
    else:
        alignment, margin_v = 2, int(safe_bottom * height)
    margin_lr = int(0.07 * width)
    bold = 0 if bundled else (-1 if style.get("bold", True) else 0)
    spacing = float(style.get("spacing", 0)) * scale
    emph = {stem(e) for e in (emphasis or [])}
    glow = style.get("glow")
    anim = style.get("anim") or ("pop" if style.get("pop") else "none")

    styles = (
        f"Style: Eden,{family},{size},{primary},{primary},{outline_col},{back},{bold},0,0,0,100,100,{spacing:.1f},0,"
        f"{border_style},{(max(outline, 6 * scale) if box else outline):.1f},{shadow:.1f},{alignment},"
        f"{margin_lr},{margin_lr},{margin_v},1\n")
    if watermark and watermark.get("text"):
        wfam, _ = caption_family("inter_semibold")
        wsize = max(16, int(round(0.021 * height)))
        wmargin_v = int((safe_top + 0.018) * height)
        styles += (f"Style: EdenMark,{wfam},{wsize},{ass_color(watermark.get('color', '#FFFFFF'), 0x33)},"
                   f"&H000000FF,&H66000000,&H80000000,0,0,0,0,100,100,0.5,0,1,{2 * scale:.1f},{1 * scale:.1f},7,"
                   f"{int(0.05 * width)},{int(0.05 * width)},{wmargin_v},1\n")

    header = (
        "[Script Info]\nScriptType: v4.00+\n"
        f"PlayResX: {width}\nPlayResY: {height}\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n"
        "[V4+ Styles]\n"
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, "
        "Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
        "Alignment, MarginL, MarginR, MarginV, Encoding\n"
        f"{styles}\n"
        "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    )

    upper = bool(style.get("uppercase"))
    max_chars = int(style.get("max_chars_line", 28))
    word_hl = bool(style.get("word_highlight"))
    events: list[str] = []

    def disp(w: Word) -> str:
        t = _escape(w.text)
        return t.upper() if upper else t

    # Final on-screen anchor, used by the slide-in animation.
    anchor_x = width // 2
    anchor_y = {5: height // 2, 8: margin_v}.get(alignment, height - margin_v)

    def entrance(first: bool, last: bool) -> str:
        """Override tags for the line's first/last event (arrival and exit animation)."""
        tags = ""
        if first:
            if anim == "pop":
                tags += r"\fscx90\fscy90\t(0,120,\fscx100\fscy100)"
            elif anim == "slide":
                tags += f"\\move({anchor_x},{anchor_y + int(0.022 * height)},{anchor_x},{anchor_y},0,170)\\fad(120,0)"
        if anim in ("fade", "slide") or (anim == "pop" and last):
            fin = 140 if (first and anim == "fade") else 0
            fout = 110 if last and anim in ("fade",) else 0
            if anim == "fade" and (fin or fout):
                tags += f"\\fad({fin},{fout})"
        return "{" + tags + "}" if tags else ""

    def emit(start: float, end: float, body: str, first: bool, last: bool) -> None:
        tags = entrance(first, last)
        if glow:
            gb = max(4.0, 0.006 * height)
            events.append(f"Dialogue: 0,{_ts(start)},{_ts(end)},Eden,,0,0,0,,"
                          f"{{\\bord{gb:.1f}\\3c{ass_color(glow)}\\1a&HFF&\\blur{gb * 1.4:.1f}\\shad0}}{body}")
        events.append(f"Dialogue: 1,{_ts(start)},{_ts(end)},Eden,,0,0,0,,{tags}{body}")

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
            emit(ch.start, chunk_end, body, True, True)
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
                if is_active or is_emph:
                    parts.append(f"{{\\c{highlight}}}{tok}{{\\c{primary}}}")
                else:
                    parts.append(tok)
            emit(start, end, "".join(parts), wi == 0, wi + 1 == len(ch.words))

    if watermark and watermark.get("text") and total > 0:
        an = int(watermark.get("align", 7))
        mark = _escape(str(watermark["text"]))
        events.append(f"Dialogue: 2,{_ts(0)},{_ts(total)},EdenMark,,0,0,0,,{{\\an{an}\\fad(700,0)}}{mark}")
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
