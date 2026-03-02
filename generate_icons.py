#!/usr/bin/env python3
"""
Generate Tibetan singing bowl PNG icons for Breathe & Stretch.
Renders at 4× then downscales with LANCZOS for clean antialiasing.
"""

from PIL import Image, ImageDraw
import math, os

SIZES   = [128, 48, 32, 16]
OUT_DIR = os.path.join(os.path.dirname(__file__), "images")
SCALE   = 4          # supersampling multiplier

# Gold / bronze palette
GOLD_RIM   = (212, 170,  60, 255)  # warm gold rim / body
GOLD_LIGHT = (245, 210, 100, 255)  # highlight on bowl
GOLD_DARK  = (150, 110,  30, 255)  # shadow / inner bowl
BRONZE     = (160, 120,  40, 255)  # stand / base
SHEEN      = (255, 240, 160, 180)  # specular sheen (semi-transparent)


def draw_bowl(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float) -> None:
    """Draw a simplified flat-vector singing bowl centred at (cx, cy) with radius r."""

    # ── Base / stand ─────────────────────────────────────────────────────────
    base_w  = r * 0.90
    base_h  = r * 0.16
    base_y  = cy + r * 0.58
    draw.ellipse(
        [cx - base_w, base_y - base_h, cx + base_w, base_y + base_h],
        fill=BRONZE,
    )

    # ── Outer bowl body (ellipse representing the opening) ──────────────────
    # The bowl's rim sits near the top; the bottom curves downward.
    rim_rx  = r * 0.95
    rim_ry  = r * 0.22
    rim_y   = cy - r * 0.18

    # Bowl silhouette: fill the region between rim and base stand
    bowl_top    = rim_y - rim_ry
    bowl_bottom = base_y
    draw.rectangle(
        [cx - rim_rx, bowl_top, cx + rim_rx, bowl_bottom],
        fill=GOLD_RIM,
    )

    # Round the bottom of the bowl with an ellipse cap
    cap_ry = r * 0.30
    draw.ellipse(
        [cx - rim_rx, bowl_bottom - cap_ry, cx + rim_rx, bowl_bottom + cap_ry],
        fill=GOLD_RIM,
    )

    # ── Inner bowl shadow (darker ellipse at the rim opening) ───────────────
    inner_rx = rim_rx * 0.85
    inner_ry = rim_ry * 0.75
    draw.ellipse(
        [cx - inner_rx, rim_y - inner_ry, cx + inner_rx, rim_y + inner_ry],
        fill=GOLD_DARK,
    )

    # ── Rim ring (bright ellipse outline) ───────────────────────────────────
    lw = max(2, int(r * 0.07))
    draw.ellipse(
        [cx - rim_rx, rim_y - rim_ry, cx + rim_rx, rim_y + rim_ry],
        outline=GOLD_LIGHT,
        width=lw,
    )

    # ── Specular highlight on bowl body (upper-left arc) ────────────────────
    hl_rx = rim_rx * 0.55
    hl_ry = r * 0.18
    hl_cx = cx - rim_rx * 0.28
    hl_cy = rim_y + rim_ry * 0.5
    draw.ellipse(
        [hl_cx - hl_rx, hl_cy - hl_ry, hl_cx + hl_rx, hl_cy + hl_ry],
        fill=SHEEN,
    )

    # ── Base highlight line ──────────────────────────────────────────────────
    draw.ellipse(
        [cx - base_w * 0.70, base_y - base_h * 0.55,
         cx + base_w * 0.70, base_y + base_h * 0.55],
        fill=GOLD_LIGHT,
    )


def make_icon(final_size: int) -> Image.Image:
    hi = final_size * SCALE
    img  = Image.new("RGBA", (hi, hi), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img, "RGBA")

    cx = hi / 2
    cy = hi / 2
    r  = hi * 0.44          # radius leaves a small margin

    draw_bowl(draw, cx, cy, r)

    # Downscale with high-quality resampling
    return img.resize((final_size, final_size), Image.LANCZOS)


os.makedirs(OUT_DIR, exist_ok=True)

for size in SIZES:
    icon = make_icon(size)
    path = os.path.join(OUT_DIR, f"bowl-{size}.png")
    icon.save(path, "PNG")
    print(f"  ✓  {path}  ({size}×{size})")

print("Done.")
