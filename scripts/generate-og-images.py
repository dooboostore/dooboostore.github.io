#!/usr/bin/env python3
"""
Generate per-page OG images by overlaying a Twemoji on the base tofu PNG.

- Base: assets/dooboostore.png (460x460 RGBA, transparent background) 1:1 copy
- Output: assets/images/<page>-og.png (460x460 RGBA, PNG transparency preserved)
- Emoji: Twemoji 72x72 PNGs, resized to 76x76, overlaid on right side close to face
  at (460-76-48, 148) = (336, 148) — mirrors the left position (48,148)
  with subtle drop shadow (offset 3px, blur 4, opacity 90) for contrast

Usage:
  python3 scripts/generate-og-images.py                 # generate all 6 (right + shadow)
  python3 scripts/generate-og-images.py --check         # just verify existing
  python3 scripts/generate-og-images.py --position left # left overlay
  python3 scripts/generate-og-images.py --position top  # top floating (335,18)
  python3 scripts/generate-og-images.py --no-shadow     # without shadow

Page → emoji mapping:
  english                  📚 1f4da
  coordinate-simulation    📐 1f4d0
  buyback                  📈 1f4c8
  lotto                    🎰 1f3b0
  stock-brain-checker      🧠 1f9e0
  stock-flight             ✈️  2708
  stock-npti               🧬 1f9ec
"""
import argparse
import os
import sys
from pathlib import Path

try:
    from PIL import Image, ImageFilter
except ImportError:
    print("Pillow required: pip install Pillow")
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
BASE_PATH = ROOT / "assets" / "dooboostore.png"
OUT_DIR = ROOT / "assets" / "images"
CACHE_DIR = Path("/tmp")  # twemoji cache

MAPPING = [
    ("english-og.png", "1f4da", "📚"),
    ("coordinate-simulation-og.png", "1f4d0", "📐"),
    ("buyback-og.png", "1f4c8", "📈"),
    ("lotto-og.png", "1f3b0", "🎰"),
    ("stock-brain-checker-og.png", "1f9e0", "🧠"),
    ("stock-flight-og.png", "2708", "✈️"),
    ("stock-npti-og.png", "1f9ec", "🧬"),
]

TWEMOJI_BASE = "https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/{code}.png"

def fetch_emoji(code: str) -> Path:
    cached = CACHE_DIR / f"emoji_{code}.png"
    if cached.exists() and cached.stat().st_size > 0:
        return cached
    url = TWEMOJI_BASE.format(code=code)
    # use curl (available on macOS) for reliable fetch
    rc = os.system(f"curl -sL {url} -o {cached} >/dev/null 2>&1")
    if rc != 0 or not cached.exists():
        raise RuntimeError(f"failed to fetch emoji {code} from {url}")
    return cached

def gen(position: str = "left", size: int = 76, shadow: bool = True, shadow_offset: int = 3, shadow_blur: int = 4, shadow_opacity: int = 90):
    if not BASE_PATH.exists():
        raise FileNotFoundError(f"base not found: {BASE_PATH}")
    if not OUT_DIR.exists():
        OUT_DIR.mkdir(parents=True, exist_ok=True)

    base = Image.open(BASE_PATH).convert("RGBA")
    print(f"base {BASE_PATH} {base.size} corner={base.getpixel((0,0))}")

    for out_name, code, emoji_char in MAPPING:
        variant = base.copy()
        emoji_path = fetch_emoji(code)
        emoji = Image.open(emoji_path).convert("RGBA")
        emoji_up = emoji.resize((size, size), Image.LANCZOS)

        if position == "right":
            px, py = 460 - size - 48, 148
        elif position == "left":
            px, py = 48, 148
        elif position == "top":
            px, py = 335, 18
            # top uses larger size
            if size == 76:
                # upscale a bit for top floating
                emoji_up = emoji.resize((92, 92), Image.LANCZOS)
                px, py = 335, 18
                size = 92
        else:
            px, py = 336, 148

        if shadow:
            # create drop shadow from emoji alpha
            alpha = emoji_up.split()[3]
            shadow_img = Image.new("RGBA", emoji_up.size, (0, 0, 0, 0))
            # black with desired opacity, masked by emoji shape
            shadow_fill = Image.new("RGBA", emoji_up.size, (0, 0, 0, shadow_opacity))
            shadow_img.paste(shadow_fill, (0, 0), mask=alpha)
            shadow_img = shadow_img.filter(ImageFilter.GaussianBlur(radius=shadow_blur))
            # also add subtle white stroke for contrast on dark/light backgrounds
            # paste shadow slightly offset behind emoji
            variant.paste(shadow_img, (px + shadow_offset, py + shadow_offset), shadow_img)
        variant.paste(emoji_up, (px, py), emoji_up)
        out = OUT_DIR / out_name
        variant.save(out, "PNG")
        print(f"saved {out_name} {emoji_char} ({code}) at {px},{py} {emoji_up.size} -> {os.path.getsize(out)} bytes")

def check():
    print(f"ROOT={ROOT}")
    print(f"BASE={BASE_PATH} exists={BASE_PATH.exists()}")
    for out_name, code, ch in MAPPING:
        p = OUT_DIR / out_name
        exists = p.exists()
        size = p.stat().st_size if exists else 0
        print(f"{'OK' if exists else 'MISSING'} {out_name} {ch} {code} {size} bytes")

if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Generate tofu-based OG images")
    ap.add_argument("--check", action="store_true", help="verify existing images")
    ap.add_argument("--position", choices=["right", "left", "top"], default="left", help="emoji overlay position")
    ap.add_argument("--size", type=int, default=76, help="emoji size (px)")
    ap.add_argument("--no-shadow", action="store_true", help="disable drop shadow")
    ap.add_argument("--shadow-blur", type=int, default=4, help="shadow blur radius")
    ap.add_argument("--shadow-opacity", type=int, default=90, help="shadow opacity 0-255")
    args = ap.parse_args()
    if args.check:
        check()
    else:
        gen(position=args.position, size=args.size, shadow=not args.no_shadow, shadow_blur=args.shadow_blur, shadow_opacity=args.shadow_opacity)
