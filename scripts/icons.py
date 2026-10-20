"""Cut docs/brand/gecko-icons.png (a 6x6 dark-mode icon sheet) into transparent PNGs in ui/public/icons/.

The background is near-black, but so are the geckos' eyes. Opacity therefore comes from the
filled silhouette: everything the background can't reach from the edge stays opaque.
Run: python3 scripts/icons.py   (needs Pillow and numpy)
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SHEET = ROOT / "docs/brand/gecko-icons.png"
OUT = ROOT / "ui/public/icons"
SIZE = 128

# (row, col) -> name, read left to right, top to bottom.
NAMES = {
    (0, 0): "face", (0, 1): "happy", (0, 2): "wink", (0, 3): "sparkle", (0, 4): "badge", (0, 5): "cool",
    (1, 0): "crawl", (1, 1): "peek", (1, 2): "sleep", (1, 3): "climb", (1, 4): "idea", (1, 5): "love",
    (2, 0): "run", (2, 1): "laptop", (2, 2): "terminal", (2, 3): "server", (2, 4): "globe", (2, 5): "cloud",
    (3, 0): "done", (3, 1): "failed", (3, 2): "search", (3, 3): "settings", (3, 4): "shield", (3, 5): "refresh",
    (4, 0): "mail", (4, 1): "new", (4, 2): "link", (4, 3): "location", (4, 4): "calendar", (4, 5): "bell",
    (5, 0): "nap", (5, 1): "hide", (5, 2): "dizzy", (5, 3): "king", (5, 4): "code", (5, 5): "stand",
}


# Luminance -> green ramp: black eyes stay dark, grey spikes go deep green, white bodies go mint.
RAMP = [(0, (5, 12, 9)), (90, (8, 62, 40)), (150, (12, 128, 80)), (205, (40, 196, 128)), (255, (110, 245, 185))]


def tint(rgb: np.ndarray) -> np.ndarray:
    """Recolour neutral pixels along RAMP; already-coloured pixels (the green badges) are kept."""
    lum = rgb.mean(axis=2)
    stops = np.array([s for s, _ in RAMP], dtype=float)
    cols = np.array([c for _, c in RAMP], dtype=float)
    green = np.stack([np.interp(lum, stops, cols[:, i]) for i in range(3)], axis=2)
    # A soft top-left highlight so flat bodies read like the bot geckos' gradient.
    h, w = lum.shape
    yy, xx = np.mgrid[0:h, 0:w]
    light = 1.06 - 0.14 * ((xx / w + yy / h) / 2)
    green = np.clip(green * light[..., None], 0, 255)
    saturation = rgb.max(axis=2) - rgb.min(axis=2)
    keep = saturation > 40
    return np.where(keep[..., None], rgb, green)


def cutout(cell: Image.Image) -> Image.Image:
    rgb = np.array(cell.convert("RGB")).astype(int)
    lum = rgb.mean(axis=2)
    bg = rgb[:6, :6].reshape(-1, 3).mean(axis=0)
    # Foreground: anything clearly brighter or more colourful than the background.
    fg = (np.abs(rgb - bg).sum(axis=2) > 45) | (lum > 70)
    mask = Image.fromarray((fg * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))
    padded = Image.new("L", (mask.width + 2, mask.height + 2), 0)
    padded.paste(mask, (1, 1))
    ImageDraw.floodfill(padded, (0, 0), 128)
    filled = np.array(padded)[1:-1, 1:-1] != 128  # foreground plus enclosed holes (the eyes)
    alpha = Image.fromarray((filled * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    out = Image.fromarray(tint(rgb).astype(np.uint8)).convert("RGBA")
    out.putalpha(alpha)
    box = out.getbbox()
    if box:
        out = out.crop(box)
    side = max(out.size)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.paste(out, ((side - out.width) // 2, (side - out.height) // 2))
    return square.resize((SIZE, SIZE), Image.LANCZOS)


def gaps(fg: np.ndarray, axis: int, count: int = 6) -> list:
    """Cut lines between icons: the emptiest spot near each even split (the sheet isn't evenly spaced)."""
    profile = np.convolve(fg.sum(axis=axis).astype(float), np.ones(15) / 15, "same")
    n = len(profile)
    cuts = [0]
    for i in range(1, count):
        guess = n * i // count
        cuts.append(guess - 70 + int(np.argmin(profile[guess - 70 : guess + 70])))
    return [*cuts, n]


def main() -> None:
    sheet = Image.open(SHEET)
    rgb = np.array(sheet.convert("RGB")).astype(int)
    fg = np.abs(rgb - rgb[:8, :8].reshape(-1, 3).mean(axis=0)).sum(axis=2) > 45
    xs, ys = gaps(fg, 0), gaps(fg, 1)
    OUT.mkdir(parents=True, exist_ok=True)
    for (r, c), name in NAMES.items():
        crop = sheet.crop((xs[c], ys[r], xs[c + 1], ys[r + 1]))
        cutout(crop).save(OUT / f"{name}.png", optimize=True)
    total = sum(p.stat().st_size for p in OUT.glob("*.png"))
    print(f"wrote {len(NAMES)} icons to {OUT.relative_to(ROOT)} ({total // 1024} KB)")


if __name__ == "__main__":
    main()
