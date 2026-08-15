#!/usr/bin/env python3
"""
Generates a Retina macOS DMG background image (1080x760 px for 540x380 window).
"""
import os
import math
from PIL import Image, ImageDraw, ImageFont

def create_dmg_background(output_path):
    width = 1080
    height = 760
    
    # Create dark image
    img = Image.new("RGBA", (width, height), (12, 12, 14, 255))
    draw = ImageDraw.Draw(img)
    
    # Radial ambient gold glow in the center
    center_x, center_y = width // 2, height // 2
    for r in range(350, 0, -5):
        alpha = int(25 * (1.0 - (r / 350.0))**1.5)
        color = (250, 204, 21, alpha)
        draw.ellipse([center_x - r, center_y - r, center_x + r, center_y + r], fill=color)

    # Ambient subtle grid or gradient
    for y in range(0, height, 40):
        draw.line([(0, y), (width, y)], fill=(255, 255, 255, 4), width=1)
    for x in range(0, width, 40):
        draw.line([(x, 0), (x, height)], fill=(255, 255, 255, 4), width=1)

    # Top Header Title: "UNWEAVE STUDIO"
    # Left zone: x=260, y=400 (icon is at x=130, y=200 in 1x scale)
    # Right zone: x=820, y=400 (icon is at x=410, y=200 in 1x scale)

    # Center Directional Arrow (from x=420 to x=660, y=400)
    arrow_y = 400
    arrow_start_x = 440
    arrow_end_x = 640

    # Draw glowing arrow line
    for w, alpha in [(12, 40), (8, 90), (4, 240)]:
        draw.line([(arrow_start_x, arrow_y), (arrow_end_x, arrow_y)], fill=(250, 204, 21, alpha), width=w)
        # Arrowhead
        head_len = 24
        draw.line([(arrow_end_x - head_len, arrow_y - head_len), (arrow_end_x, arrow_y)], fill=(250, 204, 21, alpha), width=w)
        draw.line([(arrow_end_x - head_len, arrow_y + head_len), (arrow_end_x, arrow_y)], fill=(250, 204, 21, alpha), width=w)

    # Chevrons
    for cx in [500, 560]:
        for w, alpha in [(6, 50), (3, 180)]:
            draw.line([(cx - 14, arrow_y - 14), (cx, arrow_y)], fill=(250, 204, 21, alpha), width=w)
            draw.line([(cx - 14, arrow_y + 14), (cx, arrow_y)], fill=(250, 204, 21, alpha), width=w)

    # Try loading a system font
    font_large = None
    font_sub = None
    font_label = None
    
    font_paths = [
        "/System/Library/Fonts/SFPro-Bold.otf",
        "/System/Library/Fonts/SFProDisplay-Bold.otf",
        "/System/Library/Fonts/HelveticaNeue.ttc",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    
    for fp in font_paths:
        if os.path.exists(fp):
            try:
                font_large = ImageFont.truetype(fp, 44)
                font_sub = ImageFont.truetype(fp, 24)
                font_label = ImageFont.truetype(fp, 22)
                break
            except Exception:
                continue

    if not font_large:
        font_large = ImageFont.load_default()
        font_sub = ImageFont.load_default()
        font_label = ImageFont.load_default()

    # Draw Text
    draw.text((center_x, 100), "Unweave Studio", fill=(255, 255, 255, 240), font=font_large, anchor="mm")
    draw.text((center_x, 150), "Drag Unweave into Applications to install", fill=(161, 161, 170, 220), font=font_sub, anchor="mm")
    draw.text((center_x, 460), "DRAG & DROP", fill=(250, 204, 21, 200), font=font_label, anchor="mm")

    # Left & Right target labels
    draw.text((260, 580), "Unweave", fill=(220, 220, 220, 200), font=font_label, anchor="mm")
    draw.text((820, 580), "Applications", fill=(220, 220, 220, 200), font=font_label, anchor="mm")

    # Save
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    img.save(output_path, "PNG")
    print(f"✅ Generated DMG background at {output_path}")

if __name__ == "__main__":
    out = os.path.join(os.path.dirname(__file__), "..", "desktop", "assets", "dmg-background.png")
    create_dmg_background(out)
