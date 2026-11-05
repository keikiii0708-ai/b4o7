#!/usr/bin/env python3
"""Build the B4O7 icons from the supplied ring, with B4 as outlined paths.

The site does not run this script and does not load a font. Arc geometry is
copied from the master SVG. The monogram is Inter Tight, weight 800, converted
to paths so the SVG renders the same without the font installed.

Re-run requires network once, to fetch Inter Tight:

    python3 scripts/generate-icons.py
"""

from __future__ import annotations

import re
import urllib.request
from io import BytesIO
from pathlib import Path

import cairosvg
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ICON_DIR = ROOT / "icons"
FONT_URL = "https://github.com/google/fonts/raw/main/ofl/intertight/InterTight%5Bwght%5D.ttf"
FONT_CACHE = Path("/tmp/b4o7-InterTight-var.ttf")

# Master arcs: radius 330, stroke 58, centered on 512,512.
# Each sweep is 33.43° with an 18° gap; the gap at the top is centered.
ARCS = """
<path d="M563.6,186.1 A330,330 0 0 1 734.6,268.4" fill="none" stroke="#8DBF8F" stroke-width="58" stroke-linecap="round"/>
<path d="M799.0,349.1 A330,330 0 0 1 841.3,534.2" fill="none" stroke="#8DBF8F" stroke-width="58" stroke-linecap="round"/>
<path d="M818.3,634.9 A330,330 0 0 1 699.9,783.3" fill="none" stroke="#8DBF8F" stroke-width="58" stroke-linecap="round"/>
<path d="M606.9,828.1 A330,330 0 0 1 417.1,828.1" fill="none" stroke="#8DBF8F" stroke-width="58" stroke-linecap="round"/>
<path d="M324.1,783.3 A330,330 0 0 1 205.7,634.9" fill="none" stroke="#34363A" stroke-width="58" stroke-linecap="round"/>
<path d="M182.7,534.2 A330,330 0 0 1 225.0,349.1" fill="none" stroke="#34363A" stroke-width="58" stroke-linecap="round"/>
<path d="M289.4,268.4 A330,330 0 0 1 460.4,186.1" fill="none" stroke="#34363A" stroke-width="58" stroke-linecap="round"/>
""".strip()

# Outer edge of the stroke. Maskable safe zone is a circle at 80% of the canvas.
OUTER_RADIUS = 330 + 58 / 2
CANVAS = 1024
SAFE_RADIUS = CANVAS * 0.40
# Sit just inside the safe zone (~78.5% of the canvas), so masks do not clip the ring.
MASK_SCALE = (SAFE_RADIUS - 8) / OUTER_RADIUS


def round_path(commands: str) -> str:
    def repl(match: re.Match[str]) -> str:
        value = float(match.group())
        text = f"{value:.2f}".rstrip("0").rstrip(".")
        if text == "-0":
            return "0"
        return text

    return re.sub(r"-?\d+\.\d+(?:e[+-]?\d+)?", repl, commands, flags=re.I)


def monogram_path() -> str:
    if not FONT_CACHE.exists():
        urllib.request.urlretrieve(FONT_URL, FONT_CACHE)
    font = TTFont(FONT_CACHE)
    instantiateVariableFont(font, {"wght": 800}, inplace=True)
    glyph_set = font.getGlyphSet()
    cmap = font.getBestCmap()
    scale = 250 / font["head"].unitsPerEm
    tracking = -6
    names = [cmap[ord(char)] for char in "B4"]
    advances = [glyph_set[name].width for name in names]
    total = sum(advances) * scale + tracking * (len(names) - 1)
    cursor = 512 - total / 2
    pen = SVGPathPen(glyph_set)
    for index, name in enumerate(names):
        glyph_set[name].draw(TransformPen(pen, (scale, 0, 0, -scale, cursor, 602)))
        cursor += advances[index] * scale + tracking
    return round_path(pen.getCommands())


def svg_document(markup: str) -> str:
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">'
        '<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">'
        '<stop offset="0" stop-color="#1A1B1D"/>'
        '<stop offset="1" stop-color="#050506"/>'
        "</linearGradient></defs>"
        '<rect width="1024" height="1024" fill="url(#bg)"/>'
        f"{markup}</svg>"
    )


def rasterize(svg: str, size: int, filename: str) -> None:
    png = cairosvg.svg2png(bytestring=svg.encode(), output_width=size, output_height=size)
    image = Image.open(BytesIO(png)).convert("RGB")
    image.save(ICON_DIR / filename, "PNG", optimize=True)


def main() -> None:
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    mark = f'{ARCS}<path d="{monogram_path()}" fill="#F2F2F0"/>'
    master = svg_document(mark)
    (ICON_DIR / "favicon.svg").write_text(master, encoding="utf-8")
    mask = svg_document(
        f'<g transform="translate(512 512) scale({MASK_SCALE:.6f}) translate(-512 -512)">{mark}</g>'
    )
    rasterize(master, 180, "apple-touch-icon.png")
    rasterize(master, 192, "icon-192.png")
    rasterize(master, 512, "icon-512.png")
    rasterize(mask, 512, "icon-512-maskable.png")
    rasterize(master, 32, "favicon-32.png")
    outer_ratio = (OUTER_RADIUS * MASK_SCALE * 2) / CANVAS
    print(f"maskable ring diameter {outer_ratio:.1%} of canvas (safe zone 80%)")


if __name__ == "__main__":
    main()
