"""Check that Home's manifest and the files it loads are present."""
from pathlib import Path
import json
import xml.etree.ElementTree as XML
import re

root = Path(__file__).resolve().parents[1]
app = root / 'app'
manifest = XML.parse(app / 'config.xml').getroot()
ns = {'w': 'http://www.w3.org/ns/widgets', 't': 'http://tizen.org/ns/widgets'}
identity = manifest.find('t:application', ns)
assert identity is not None, 'Missing application identity'
assert identity.get('package') == 'Zm209bQNEk', 'Keep the installed package identity stable'
assert identity.get('id') == 'Zm209bQNEk.Home', 'Keep the installed application ID stable'
assert manifest.get('version') == json.loads((root / 'package.json').read_text())['version'], 'Manifest/package versions differ'
for tag in ['content', 'icon']:
    node = manifest.find('w:' + tag, ns)
    assert node is not None and (app / node.get('src', '')).is_file(), 'Missing ' + tag + ' file'
assert all((app / name).is_file() for name in ['app.js', 'app.css', 'logic.js', 'device.js'])


def bundled(reference):
    """The preview serves app/ under /home/; the build makes those paths relative."""
    return app / (reference[len('/home/'):] if reference.startswith('/home/') else reference)


for reference in re.findall(r'(?:src|href)=[\"\']([^\"\']+)', (app / 'index.html').read_text()):
    if ':' in reference or reference.startswith('$'):
        continue
    assert bundled(reference).is_file(), 'Missing bundled resource: ' + reference
for css in app.rglob('*.css'):
    source = re.sub(r'/\*.*?\*/', '', css.read_text(), flags=re.S)
    assert not re.search(r'(?:^|[;{}])\s*inset\s*:', source, re.I), 'Use explicit edges for Chromium 85: ' + str(css.relative_to(app))
    assert not re.search(r'(?:^|[;{}])\s*(?:row-|column-)?gap\s*:', source, re.I), 'Use child margins for older flex engines: ' + str(css.relative_to(app))
    for reference in re.findall(r'url\([\"\']?([^\)\"\']+)', source):
        if ':' not in reference and not reference.startswith(('#', 'var(')):
            target = bundled(reference) if reference.startswith('/') else css.parent / reference.split('?')[0]
            assert target.is_file(), 'Missing CSS resource: ' + reference
# These resource names are constructed at runtime, so HTML/CSS reference checks cannot find them.
walls = json.loads((app / 'assets/wallpapers/SOURCES.json').read_text())
for wall in walls:
    for field in ['src', 'thumb']:
        assert (app / wall[field]).is_file(), 'Missing wallpaper: ' + wall[field]
    for suffix in ['field-blur', 'field-frost', 'field-clear']:
        assert (app / ('assets/materials/' + wall['id'] + '-' + suffix + '.jpg')).is_file(), 'Missing registered material: ' + wall['id'] + '/' + suffix
for mark in set(re.findall(r"mark: '([a-z0-9-]+)'", (app / 'app.js').read_text())):
    assert (app / ('assets/icons/' + mark + '.svg')).is_file(), 'Missing icon: ' + mark
print('Widget identity, version and bundled resources are valid.')
