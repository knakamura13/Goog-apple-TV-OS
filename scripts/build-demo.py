"""Assemble Home, the launcher, as a self-contained, unsigned Tizen web app in dist/library-demo/.

The browser preview serves Home from demo/library/ with assets under /home/assets/. The TV loads files
from inside the widget, so this copies only the assets Home uses and rewrites those paths to be relative.
Sign the result with the official SDK, for example: tizen package -t wgt -s <profile> -- dist/library-demo
"""
import argparse
import json
import re
import shutil
import subprocess
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEMO = ROOT / 'demo/library'
ASSETS = ROOT / 'app/assets'
OUT = ROOT / 'dist/library-demo'
MATERIALS = ('field-clear', 'field-blur', 'field-frost')
# Code between preview markers serves only the browser preview: key hints, keyboard shortcuts, mouse clicks.
PREVIEW = re.compile(r'<!-- preview -->.*?<!-- /preview -->|/\* preview \*/.*?/\* /preview \*/', re.S)


def wallpaper_ids():
    sources = json.loads((ASSETS / 'wallpapers/SOURCES.json').read_text())
    return [entry['id'] for entry in sources]


def copy(relative, out):
    target = out / 'assets' / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ASSETS / relative, target)


def build(out):
    out = out.resolve()
    # The output folder is replaced, so refuse anything that is not a previous build.
    if out == ROOT or out in ROOT.parents:
        raise SystemExit(f'Refusing to build into {out}: it would replace the repository.')
    if out.exists():
        if any(out.iterdir()) and not (out / 'build-info.js').exists():
            raise SystemExit(f'Refusing to replace {out}: it is not empty and is not a previous build.')
        shutil.rmtree(out)
    out.mkdir(parents=True)
    for name in ('index.html', 'library.css', 'logic.js', 'library.js'):
        text = PREVIEW.sub('', (DEMO / name).read_text()).replace('/home/assets/', 'assets/').replace('/home/device.js', 'device.js')
        if 'preview -->' in text or 'preview */' in text:
            raise SystemExit(f'Unmatched preview marker in {name}')
        if name == 'index.html':
            # Settings › About shows the build details; the browser preview has none.
            text = text.replace('<script src="library.js">', '<script src="build-info.js"></script>\n<script src="library.js">')
            if 'build-info.js' not in text:
                raise SystemExit('index.html no longer loads library.js; update the build-info script tag.')
        (out / name).write_text(text)
    shutil.copy2(DEMO / 'config.xml', out / 'config.xml')
    shutil.copy2(ROOT / 'app/icon.png', out / 'icon.png')
    shutil.copy2(ROOT / 'app/device.js', out / 'device.js')  # CleanFrame's installed-app list and launching

    for relative in ('fonts.css', 'typefaces.css', 'manrope.woff2', 'manrope-OFL.txt', 'icons/metrics.js', 'wallpapers/catalog.js', 'wallpapers/SOURCES.json'):
        copy(relative, out)
    for font in ('geist', 'newsreader'):
        for path in (ASSETS / 'fonts' / font).iterdir():
            copy(path.relative_to(ASSETS), out)
    for mark in sorted(set(re.findall(r"mark: '([a-z0-9-]+)'", (DEMO / 'library.js').read_text()))):
        copy(f'icons/{mark}.svg', out)
    for wall in wallpaper_ids():
        copy(f'wallpapers/{wall}.jpg', out)
        copy(f'wallpapers/{wall}-thumb.jpg', out)
        for material in MATERIALS:
            copy(f'materials/{wall}-{material}.jpg', out)
    shutil.copy2(ROOT / 'THIRD_PARTY_NOTICES.md', out / 'THIRD_PARTY_NOTICES.md')

    leftover = [name for name in ('index.html', 'logic.js', 'library.js') if '/home/' in (out / name).read_text()]
    if leftover:
        raise SystemExit('Preview-server paths remain in: ' + ', '.join(leftover))
    size = sum(path.stat().st_size for path in out.rglob('*') if path.is_file())
    commit = subprocess.run(['git', 'describe', '--always', '--dirty'], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()
    info = {'commit': commit, 'date': datetime.now().strftime('%b %-d, %-I:%M %p'), 'size': f'{size / 1e6:.1f} MB'}
    (out / 'build-info.js').write_text('window.LibraryBuild = ' + json.dumps(info) + ';\n')
    count = sum(1 for path in out.rglob('*') if path.is_file())
    rel = out.relative_to(ROOT) if ROOT in out.parents else out
    print(f'Built {rel}: {count} files, {size / 1e6:.1f} MB')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--out', type=Path, default=OUT, help='Output folder (default: dist/library-demo)')
    build(parser.parse_args().out.resolve())
