#!/usr/bin/env python3
"""
Generates a clean, professional macOS DMG background (1080x760 Retina = 540x380 window).
"""
import os
from PIL import Image, ImageDraw, ImageFont

def create_dmg_background(output_path):
    width = 1080
    height = 760

    # Clean dark slate background
    img = Image.new("RGBA", (width, height), (18, 18, 22, 255))
    draw = ImageDraw.Draw(img)

    # Subtle vertical gradient overlay
    for y in range(height):
        factor = y / height
        r = int(22 * (1 - factor) + 12 * factor)
        g = int(22 * (1 - factor) + 12 * factor)
        b = int(26 * (1 - factor) + 14 * factor)
        draw.line([(0, y), (width, y)], fill=(r, g, b, 255))

    # Subtle divider line in the center
    center_x = width // 2
    draw.line([(center_x, 80), (center_x, height - 80)], fill=(255, 255, 255, 18), width=1)

    # Arrow pointing right — clean, simple, centered
    arrow_y = height // 2
    arrow_x1 = center_x - 60
    arrow_x2 = center_x + 60
    # Line
    draw.line([(arrow_x1, arrow_y), (arrow_x2, arrow_y)], fill=(250, 204, 21, 200), width=4)
    # Arrowhead
    head = 18
    draw.polygon([
        (arrow_x2, arrow_y),
        (arrow_x2 - head, arrow_y - head),
        (arrow_x2 - head, arrow_y + head),
    ], fill=(250, 204, 21, 200))

    # Try to load a system font
    font_title = None
    font_sub = None
    for fp in [
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/SFPro-Bold.otf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    ]:
        if os.path.exists(fp):
            try:
                font_title = ImageFont.truetype(fp, 34)
                font_sub = ImageFont.truetype(fp, 18)
                break
            except Exception:
                continue
    if not font_title:
        font_title = ImageFont.load_default()
        font_sub = ImageFont.load_default()

    # Top title
    draw.text((width // 2, 60), "Unweave Studio", fill=(255, 255, 255, 220), font=font_title, anchor="mm")
    draw.text((width // 2, 100), "Drag Unweave into Applications to install", fill=(150, 150, 160, 200), font=font_sub, anchor="mm")

    # Left label — App
    draw.text((270, height - 100), "Unweave", fill=(200, 200, 210, 180), font=font_sub, anchor="mm")
    # Right label — Applications
    draw.text((810, height - 100), "Applications", fill=(200, 200, 210, 180), font=font_sub, anchor="mm")

    # Thin top border
    draw.line([(0, 0), (width, 0)], fill=(255, 255, 255, 30), width=2)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    img.convert("RGB").save(output_path, "PNG")
    print(f"✅ Generated clean DMG background at {output_path}")

if __name__ == "__main__":
    out = os.path.join(os.path.dirname(__file__), "..", "desktop", "assets", "dmg-background.png")
    create_dmg_background(out)
