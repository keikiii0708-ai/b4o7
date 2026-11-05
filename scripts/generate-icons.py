#!/usr/bin/env python3
"""Draw the B4O7 home-screen icons. Run once; the PNGs are part of the static site."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1] / "icons"
FONT = "/usr/share/fonts/truetype/macos/Inter-Medium.ttf"
ROOT.mkdir(parents=True, exist_ok=True)


def render(size: int, inset_ratio: float, filename: str) -> None:
    image = Image.new("RGB", (size, size), "#000000")
    draw = ImageDraw.Draw(image)
    dot_r = max(2, round(size * 0.016))
    gap = round(size * 0.022)
    total = 7 * dot_r * 2 + 6 * gap
    center = size / 2
    y = size * (0.36 + inset_ratio * 0.15)
    x = center - total / 2 + dot_r
    for index in range(7):
        color = "#7DBE8A" if index < 4 else "#2C2C31"
        draw.ellipse((x - dot_r, y - dot_r, x + dot_r, y + dot_r), fill=color)
        x += dot_r * 2 + gap

    big = ImageFont.truetype(FONT, round(size * 0.30))
    small = ImageFont.truetype(FONT, round(size * 0.105))
    four = draw.textbbox((0, 0), "4", font=big)
    rest = draw.textbbox((0, 0), "/7", font=small)
    four_w = four[2] - four[0]
    rest_w = rest[2] - rest[0]
    gap_text = round(size * 0.012)
    block = four_w + gap_text + rest_w
    left = center - block / 2 - four[0]
    top = size * (0.42 + inset_ratio * 0.08)
    draw.text((left, top), "4", font=big, fill="#E7E7E6")
    baseline = top + four[3]
    small_top = baseline - rest[3] - size * 0.012
    draw.text((left + four_w + gap_text, small_top), "/7", font=small, fill="#8A8A90")
    image.save(ROOT / filename, "PNG")


def main() -> None:
    render(180, 0.02, "apple-touch-icon.png")
    render(192, 0.02, "icon-192.png")
    render(512, 0.02, "icon-512.png")
    render(512, 0.10, "icon-512-maskable.png")


if __name__ == "__main__":
    main()
