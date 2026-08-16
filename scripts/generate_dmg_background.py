#!/usr/bin/env python3
"""
Generates a clean, professional macOS DMG background (1080x760 Retina = 540x380 window).
"""
import os
from PIL import Image, ImageDraw, ImageFont

def create_dmg_background(output_path):
    width = 1080
    height = 760

    img = Image.new("RGB", (width, height), (15, 15, 18))
    draw = ImageDraw.Draw(img)

    # Smooth dark gradient
    for y in range(height):
        f = y / height
        r = int(20 * (1 - f) + 12 * f)
        g = int(20 * (1 - f) + 12 * f)
        b = int(24 * (1 - f) + 15 * f)
        draw.line([(0, y), (width, y)], fill=(r, g, b))

    # Center arrow between icons (x: 430 to 650 in 2x coords, y=390)
    y_center = 390
    x_start = 430
    x_end = 650

    # Sleek amber/gold accent arrow
    accent_color = (234, 179, 8, 220)
    draw.line([(x_start, y_center), (x_end, y_center)], fill=accent_color, width=5)

    # Arrowhead
    head_len = 24
    draw.polygon([
        (x_end, y_center),
        (x_end - head_len, y_center - 14),
        (x_end - head_len, y_center + 14)
    ], fill=accent_color)

    # Header font
    font = None
    for fp in [
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/SFPro-Bold.otf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
    ]:
        if os.path.exists(fp):
            try:
                font = ImageFont.truetype(fp, 36)
                break
            except Exception:
                pass
    if not font:
        font = ImageFont.load_default()

    draw.text((width // 2, 90), "Drag to Applications to Install", fill=(220, 220, 225), font=font, anchor="mm")

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    img.save(output_path, "PNG")
    print(f"✅ Generated clean DMG background at {output_path}")

if __name__ == "__main__":
    out = os.path.join(os.path.dirname(__file__), "..", "desktop", "assets", "dmg-background.png")
    create_dmg_background(out)
