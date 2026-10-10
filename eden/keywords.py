"""Dependency-free keyword extraction. Powers caption emphasis, b-roll matching
and hashtags when no language model is available."""
from __future__ import annotations

import re
from collections import Counter
from typing import Iterable

from .transcript import Word, normalize

STOPWORDS = set("""
a about above after again against all also am an and any are aren't as at be because been before being below
between both but by can can't cannot could couldn't did didn't do does doesn't doing don't down during each few
for from further get got had hadn't has hasn't have haven't having he he'd he'll he's her here here's hers
herself him himself his how how's i i'd i'll i'm i've if in into is isn't it it's its itself just let's like
me more most mustn't my myself no nor not of off on once only or other ought our ours ourselves out over own
really same shan't she she'd she'll she's should shouldn't so some such than that that's the their theirs them
themselves then there there's these they they'd they'll they're they've this those through to too under until
up very was wasn't we we'd we'll we're we've were weren't what what's when when's where where's which while who
who's whom why why's will with won't would wouldn't you you'd you'll you're you've your yours yourself
yourselves yeah okay ok gonna wanna kind sort thing things lot lots actually basically literally know mean
going go goes went make makes made one two way even still much many well say said says right now back
""".split())

_SUFFIXES = ("ingly", "ing", "edly", "ed", "es", "s")


def stem(word: str) -> str:
    w = normalize(word)
    for suf in _SUFFIXES:
        if len(w) > len(suf) + 3 and w.endswith(suf):
            return w[: -len(suf)]
    return w


def extract_keywords(words: Iterable[Word] | str, n: int = 8) -> list[str]:
    if isinstance(words, str):
        toks = re.findall(r"[A-Za-z][A-Za-z'\-]+", words)
    else:
        toks = [w.text for w in words]
    counts: Counter[str] = Counter()
    first_form: dict[str, str] = {}
    for t in toks:
        nt = normalize(t)
        if len(nt) < 4 or nt in STOPWORDS or nt.isdigit():
            continue
        s = stem(nt)
        counts[s] += 1
        first_form.setdefault(s, nt)
    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], -len(kv[0])))
    return [first_form[s] for s, _ in ranked[:n]]


def hashtags(keywords: list[str], limit: int = 6) -> list[str]:
    out: list[str] = []
    for k in keywords:
        tag = re.sub(r"[^A-Za-z0-9]", "", k)
        if tag and len(tag) <= 24:
            out.append("#" + tag.lower())
        if len(out) >= limit:
            break
    return out
