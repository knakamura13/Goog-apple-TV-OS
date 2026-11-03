"""Development only. Renders the screensaver's paper matte textures: one full-screen 1920 x 1080 JPEG per matte
colour, written to app/assets/materials/matte-<name>.jpg, so no pattern ever repeats. The TV only shows these images;
it never generates texture.

The paper is three layers: a soft, slightly horizontal grain like laid paper, a faint mottling like the uneven
density of real mat board, and sparse short fibres. On dark mattes the fibres are lighter than the board, as raised
fibres catch the light. Needs numpy and Pillow (development dependencies only).

    python3 scripts/build-matte.py            # every colour
    python3 scripts/build-matte.py white navy # some
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'app/assets/materials'
W, H = 1920, 1080
# Base colours, chosen against the photos' own tones: a warm off-white, a neutral grey, a deep navy and a soft black.
MATTES = {'white': (239, 237, 232), 'gray': (142, 144, 144), 'navy': (29, 39, 56), 'black': (14, 14, 15)}


def blur(a, sx, sy=None):
    """Gaussian blur through the Fourier transform; sx and sy may differ for a directional grain."""
    sy = sx if sy is None else sy
    fy, fx = np.fft.fftfreq(H)[:, None], np.fft.fftfreq(W)[None, :]
    kernel = np.exp(-2 * np.pi ** 2 * ((sx * fx) ** 2 + (sy * fy) ** 2))
    return np.real(np.fft.ifft2(np.fft.fft2(a) * kernel))


def noise(rng, sx, sy=None):
    """Gaussian noise, blurred and scaled to unit spread."""
    n = blur(rng.standard_normal((H, W)), sx, sy)
    return n / n.std()


def fibres(rng, count, light_only):
    """Short, slightly curved strokes, softened to sub-pixel width; on dark paper they are all lighter than the board."""
    f = np.zeros((H, W))
    for _ in range(count):
        x, y, a = rng.uniform(0, W), rng.uniform(0, H), rng.uniform(0, np.pi)
        sign = 1.0 if light_only else rng.choice((-1.0, 1.0))
        length, bend, shade = rng.uniform(5, 24), rng.uniform(-0.06, 0.06), sign * rng.uniform(0.5, 1.0)
        for _ in np.arange(0, length, 0.5):
            a += bend
            x, y = x + 0.5 * np.cos(a), y + 0.5 * np.sin(a)
            f[int(y) % H, int(x) % W] += shade
    return blur(f, 0.55)


def render(name, rgb, seed):
    rng = np.random.default_rng(seed)
    base = np.array(rgb, dtype=float)
    light = base.mean() / 255 > 0.4
    grain = noise(rng, 1.0, 0.7)  # Soft and a little longer across: laid paper, not per-pixel static.
    mottle = noise(rng, 60)
    fibre = fibres(rng, 1000 if light else 700, not light)
    # Relative shading on light paper, lighter flecks added on dark paper.
    if light:
        img = base[None, None, :] * (1 + (0.018 * grain + 0.011 * mottle + 0.05 * fibre)[..., None])
    else:
        img = base[None, None, :] + 255 * (0.008 * grain + 0.005 * mottle + 0.035 * fibre)[..., None]
    img = np.clip(np.round(img), 0, 255).astype(np.uint8)
    path = OUT / ('matte-' + name + '.jpg')
    Image.fromarray(img, 'RGB').save(path, 'JPEG', quality=84, optimize=True, progressive=True)
    return path


def main():
    names = sys.argv[1:] or list(MATTES)
    for i, name in enumerate(MATTES):
        if name in names:
            path = render(name, MATTES[name], seed=1000 + i)
            print(path.relative_to(ROOT), path.stat().st_size // 1024, 'KB')


if __name__ == '__main__':
    main()
