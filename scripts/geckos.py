"""Vectorise docs/brand/geckos.png (a 3x3 sheet of gecko faces) into ui/src/assets/geckos.ts.

Each gecko becomes three layers so the UI can colour and animate them:
  body  - the white silhouette
  shade - the grey spikes and nose
  eyes  - the dark marks enclosed by the body (each face's expression)
All nine are cropped to the same box around the body, so moods swap in place.
Run: python3 scripts/geckos.py   (needs Pillow, numpy and the potrace CLI)
"""
import json
import re
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SHEET = ROOT / "docs/brand/geckos.png"
OUT = ROOT / "ui/src/assets/geckos.ts"
MOODS = ["look", "grumpy", "happy", "alert", "sleepy", "dizzy", "love", "dead", "sparkle"]
SCALE = 3  # upsample before tracing for smoother curves
PAD = 6


def trace(mask: np.ndarray) -> str:
    """potrace a boolean mask; returns path data in mask pixel coordinates."""
    img = Image.fromarray((~mask * 255).astype(np.uint8)).convert("1")
    with tempfile.TemporaryDirectory() as tmp:
        pbm, svg = Path(tmp, "m.pbm"), Path(tmp, "m.svg")
        img.save(pbm)
        subprocess.run(["potrace", str(pbm), "-s", "-o", str(svg), "--flat", "-a", "1.1", "-O", "0.4", "-t", "6"], check=True)
        text = svg.read_text()
    paths = " ".join(re.findall(r'<path d="([^"]+)"', text))
    # potrace draws in a flipped 10x space: translate(0,H) scale(0.1,-0.1). Keep that transform alongside.
    return paths


def holes(fg: np.ndarray) -> np.ndarray:
    """Pixels not in fg that the outside can't reach: the eyes."""
    canvas = Image.fromarray(np.where(fg, 255, 0).astype(np.uint8))
    padded = Image.new("L", (canvas.width + 2, canvas.height + 2), 0)
    padded.paste(canvas, (1, 1))
    ImageDraw.floodfill(padded, (0, 0), 128)
    arr = np.array(padded)[1:-1, 1:-1]
    return arr == 0


def align(cells: list) -> list:
    """Re-anchor every face so its body overlaps the first face's body as well as possible.
    Bounding boxes alone drift (claws and tail differ by a few pixels), which moved the eyes."""
    ref_solid, _, _, (rx0, ry0, _, _) = cells[0]
    small = 4  # search on a 4x-downsampled grid, then refine at full scale
    ref = ref_solid[ry0:, rx0:]

    def score(solid: np.ndarray, x0: int, y0: int, step: int) -> int:
        part = solid[y0:, x0:]
        hh, ww = min(ref.shape[0], part.shape[0]), min(ref.shape[1], part.shape[1])
        return int((ref[:hh:step, :ww:step] & part[:hh:step, :ww:step]).sum())

    out = [cells[0]]
    for solid, shade, eyes, (x0, y0, x1, y1) in cells[1:]:
        best = (score(solid, x0, y0, small), x0, y0)
        for dy in range(-30 * SCALE, 30 * SCALE + 1, small):
            for dx in range(-30 * SCALE, 30 * SCALE + 1, small):
                nx, ny = x0 + dx, y0 + dy
                if nx < 0 or ny < 0:
                    continue
                v = score(solid, nx, ny, small)
                if v > best[0]:
                    best = (v, nx, ny)
        _, bx, by = best
        fine = max(((score(solid, bx + dx, by + dy, 1), bx + dx, by + dy) for dy in range(-small, small + 1) for dx in range(-small, small + 1)), key=lambda t: t[0])
        out.append((solid, shade, eyes, (fine[1], fine[2], x1, y1)))
    return out


def main() -> None:
    sheet = Image.open(SHEET).convert("L")
    cell = sheet.width // 3
    cells = []
    for i in range(9):
        r, c = divmod(i, 3)
        crop = sheet.crop((c * cell, r * cell, (c + 1) * cell, (r + 1) * cell))
        big = crop.resize((cell * SCALE, cell * SCALE), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.6))
        lum = np.array(big).astype(float)
        body = lum >= 197
        # Anti-aliased edges between black and white also read as grey: an opening drops those thin rings.
        raw_shade = Image.fromarray(((lum >= 110) & (lum < 197)).astype(np.uint8) * 255)
        shade = np.array(raw_shade.filter(ImageFilter.MinFilter(9)).filter(ImageFilter.MaxFilter(9))) > 127
        fg = body | shade
        ys, xs = np.nonzero(fg)
        eyes = holes(fg)
        # A solid body (eye holes filled) is shared by every mood; each mood draws its eyes on top.
        solid = (fg | eyes) & ~shade
        cells.append((solid, shade, eyes, (xs.min(), ys.min(), xs.max(), ys.max())))

    cells = align(cells)
    w = max(b[3][2] - b[3][0] for b in cells) + 2 * PAD * SCALE
    h = max(b[3][3] - b[3][1] for b in cells) + 2 * PAD * SCALE
    out: dict = {"width": int(w), "height": int(h), "moods": {}}
    margin = PAD * SCALE
    for mood, (body, shade, eyes, (x0, y0, _, _)) in zip(MOODS, cells):
        def crop(m: np.ndarray) -> np.ndarray:
            # Pad so the fixed-size box never runs off the cell, then cut it out around this body.
            padded = np.pad(m, ((margin, h), (margin, w)))
            return padded[y0 : y0 + h, x0 : x0 + w]

        if mood == MOODS[0]:
            # The silhouette is identical on every face: keep it once, plus each face's eyes.
            out["body"], out["shade"] = trace(crop(body)), trace(crop(shade))
        out["moods"][mood] = trace(crop(eyes))

    OUT.write_text(
        "// Generated by scripts/geckos.py from docs/brand/geckos.png. Do not edit by hand.\n"
        "// Paths are in potrace space: apply transform `translate(0, height) scale(0.1, -0.1)`.\n"
        f"export const GECKO = {json.dumps(out, separators=(',', ':'))} as const\n"
    )
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB), viewBox 0 0 {w} {h}")


if __name__ == "__main__":
    main()
