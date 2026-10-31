"""Assemble the Library prototype as a self-contained, unsigned Tizen web app in dist/library-demo/.

The browser preview serves the prototype from demo/library/ with assets under /home/assets/. The TV loads files
from inside the widget, so this copies only the assets the prototype uses and rewrites those paths to be relative.
Sign the result with the official SDK, for example: tizen package -t wgt -s <profile> -- dist/library-demo
"""
import argparse
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEMO = ROOT / 'demo/library'
ASSETS = ROOT / 'app/assets'
OUT = ROOT / 'dist/library-demo'
MATERIALS = ('field-clear', 'field-blur', 'field-frost')


def wallpaper_ids():
    sources = json.loads((ASSETS / 'wallpapers/SOURCES.json').read_text())
    return [entry['id'] for entry in sources]


def copy(relative, out):
    target = out / 'assets' / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ASSETS / relative, target)


def build(out):
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    for name in ('index.html', 'library.css', 'library.js'):
        text = (DEMO / name).read_text()
        (out / name).write_text(text.replace('/home/assets/', 'assets/'))
    shutil.copy2(DEMO / 'config.xml', out / 'config.xml')
    shutil.copy2(ROOT / 'app/icon.png', out / 'icon.png')

    for relative in ('fonts.css', 'typefaces.css', 'manrope.woff2', 'manrope-OFL.txt', 'icons/metrics.js', 'wallpapers/catalog.js', 'wallpapers/SOURCES.json'):
        copy(relative, out)
    for font in ('geist', 'newsreader'):
        for path in (ASSETS / 'fonts' / font).iterdir():
            copy(path.relative_to(ASSETS), out)
    for path in (ASSETS / 'icons').glob('*.svg'):
        copy(path.relative_to(ASSETS), out)
    for wall in wallpaper_ids():
        copy(f'wallpapers/{wall}.jpg', out)
        copy(f'wallpapers/{wall}-thumb.jpg', out)
        for material in MATERIALS:
            copy(f'materials/{wall}-{material}.jpg', out)
    shutil.copy2(ROOT / 'THIRD_PARTY_NOTICES.md', out / 'THIRD_PARTY_NOTICES.md')

    leftover = [name for name in ('index.html', 'library.js') if '/home/assets/' in (out / name).read_text()]
    if leftover:
        raise SystemExit('Absolute asset paths remain in: ' + ', '.join(leftover))
    size = sum(path.stat().st_size for path in out.rglob('*') if path.is_file())
    count = sum(1 for path in out.rglob('*') if path.is_file())
    print(f'Built {out.relative_to(ROOT)}: {count} files, {size / 1e6:.1f} MB')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--out', type=Path, default=OUT, help='Output folder (default: dist/library-demo)')
    build(parser.parse_args().out.resolve())
