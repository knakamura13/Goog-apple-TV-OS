"""Local signing settings. Importing this module reads no local configuration."""
import json
from pathlib import Path
import re
import xml.etree.ElementTree as XML

ROOT = Path(__file__).resolve().parents[1]
APPLICATION = '{http://tizen.org/ns/widgets}application'


def manifest_identity(data):
    try:
        items = XML.fromstring(data).findall(APPLICATION)
    except XML.ParseError:
        raise ValueError('Widget manifest is not valid XML.') from None
    if len(items) != 1:
        raise ValueError('Manifest must contain exactly one application identity.')
    item = items[0]
    identity = {'package_id': item.get('package'), 'app_id': item.get('id')}
    validate_identity(identity)
    return identity


def validate_identity(identity):
    package = identity.get('package_id')
    app = identity.get('app_id')
    if not isinstance(package, str) or not re.fullmatch(r'[A-Za-z0-9]{10}', package):
        raise ValueError('package_id must be the ten-character SDK-generated package ID.')
    if not isinstance(app, str) or not re.fullmatch(re.escape(package) + r'\.[A-Za-z0-9_-]{1,52}', app):
        raise ValueError('app_id must use package_id followed by a valid application name.')


def local_path(value, root):
    if not isinstance(value, str) or not value.strip() or '\x00' in value:
        raise ValueError('Local paths must be non-empty strings.')
    path = Path(value).expanduser()
    return (path if path.is_absolute() else root / path).absolute()


def load_settings(root=ROOT):
    """Use the existing SDK profile; never edit certificates, profiles or SDK files."""
    path = root / '.local/signing.json'
    config = {}
    if path.exists():
        try:
            config = json.loads(path.read_text())
        except (ValueError, OSError):
            raise ValueError('Cannot read .local/signing.json as JSON.') from None
    allowed = {'sdk_path', 'profile', 'password_file', 'package_id', 'app_id'}
    if not isinstance(config, dict) or set(config) - allowed:
        raise ValueError('Unknown signing setting. See signing.example.json; do not put passwords in JSON.')
    if path.exists() and 'profile' not in config:
        raise ValueError('Set profile in .local/signing.json to your existing SDK certificate profile.')
    profile = config.get('profile', 'FrameHome')
    if not isinstance(profile, str) or not profile.strip() or any(ord(char) < 32 for char in profile):
        raise ValueError('profile must be a non-empty certificate profile name.')
    identity = manifest_identity((root / 'app/config.xml').read_bytes())
    if ('package_id' in config) != ('app_id' in config):
        raise ValueError('Set both package_id and app_id, or neither.')
    if 'package_id' in config:
        identity = {key: config[key] for key in ['package_id', 'app_id']}
        validate_identity(identity)
    legacy_password = root / '.local/certificates/private/certificate-password.txt'
    # Only an absent config enables the original maintainer password-file default.
    password = config.get('password_file') if path.exists() else (str(legacy_password) if legacy_password.exists() else None)
    return {'sdk_path': local_path(config.get('sdk_path', '.local/tizen-sdk'), root).resolve(),
            'profile': profile, 'identity': identity,
            'password_file': local_path(password, root) if password is not None else None}

