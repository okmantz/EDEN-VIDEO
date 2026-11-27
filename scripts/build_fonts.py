"""Build the caption fonts EDEN bundles (run once; the output is committed).

Reads the open-licence (OFL) woff2 files in docs/assets/fonts and writes, for each one:
  eden/static/fonts/<key>.woff2   used by the web interface (live caption previews)
  eden/static/fonts/<key>.ttf     used by FFmpeg/libass to burn captions into videos

Every TTF gets a clean, unique family name ("Eden Montserrat ExtraBold") so FFmpeg always picks
exactly the weight a caption preset asks for, on every operating system, whether or not the
same font is also installed on the computer.

    pip install fonttools brotli
    python scripts/build_fonts.py
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "docs" / "assets" / "fonts"
DST = ROOT / "eden" / "static" / "fonts"

# key -> (source file stem, display family, weight name)
FONTS = {
    "inter_regular": ("inter-latin-400-normal", "Inter", "Regular"),
    "inter_semibold": ("inter-latin-600-normal", "Inter", "SemiBold"),
    "inter_bold": ("inter-latin-700-normal", "Inter", "Bold"),
    "inter_extrabold": ("inter-latin-800-normal", "Inter", "ExtraBold"),
    "montserrat_semibold": ("montserrat-latin-600-normal", "Montserrat", "SemiBold"),
    "montserrat_extrabold": ("montserrat-latin-800-normal", "Montserrat", "ExtraBold"),
    "poppins_medium": ("poppins-latin-500-normal", "Poppins", "Medium"),
    "poppins_bold": ("poppins-latin-700-normal", "Poppins", "Bold"),
    "space_grotesk": ("space-grotesk-latin-600-normal", "Space Grotesk", "SemiBold"),
    "oswald_medium": ("oswald-latin-500-normal", "Oswald", "Medium"),
    "oswald_bold": ("oswald-latin-700-normal", "Oswald", "Bold"),
    "anton": ("anton-latin-400-normal", "Anton", "Regular"),
    "bebas_neue": ("bebas-neue-latin-400-normal", "Bebas Neue", "Regular"),
    "archivo_black": ("archivo-black-latin-400-normal", "Archivo Black", "Regular"),
    "righteous": ("righteous-latin-400-normal", "Righteous", "Regular"),
    "orbitron": ("orbitron-latin-700-normal", "Orbitron", "Bold"),
    "bangers": ("bangers-latin-400-normal", "Bangers", "Regular"),
    "permanent_marker": ("permanent-marker-latin-400-normal", "Permanent Marker", "Regular"),
    "pacifico": ("pacifico-latin-400-normal", "Pacifico", "Regular"),
    "lobster": ("lobster-latin-400-normal", "Lobster", "Regular"),
    "caveat": ("caveat-latin-700-normal", "Caveat", "Bold"),
    "playfair_bold": ("playfair-display-latin-700-normal", "Playfair Display", "Bold"),
    "dm_serif": ("dm-serif-display-latin-400-normal", "DM Serif Display", "Regular"),
    "cinzel": ("cinzel-latin-700-normal", "Cinzel", "Bold"),
}


def family_name(family: str, weight: str) -> str:
    return f"Eden {family}" + ("" if weight == "Regular" else f" {weight}")


def main() -> int:
    DST.mkdir(parents=True, exist_ok=True)
    for key, (stem, family, weight) in FONTS.items():
        src = SRC / f"{stem}.woff2"
        if not src.exists():
            print(f"missing {src}", file=sys.stderr)
            return 1
        shutil.copyfile(src, DST / f"{key}.woff2")
        font = TTFont(src)
        font.flavor = None
        fam = family_name(family, weight)
        ps = fam.replace(" ", "")
        name = font["name"]
        for rec in list(name.names):
            if rec.nameID in (16, 17, 21, 22):
                name.removeNames(nameID=rec.nameID)
        for nid, text in ((1, fam), (2, "Regular"), (3, f"{ps};eden"), (4, fam), (6, ps)):
            name.setName(text, nid, 3, 1, 0x409)
            name.setName(text, nid, 1, 0, 0)
        font["OS/2"].fsSelection = (font["OS/2"].fsSelection & ~0b100001) | 0b1000000  # regular, not bold/italic
        font["head"].macStyle = 0
        font.save(DST / f"{key}.ttf")
        print(f"{key:24} {fam}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
