"""Offline regression checks. All credentials and SDK responses are synthetic."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import zipfile

from local_config import ROOT, load_settings
from private_files import check_signed_widget, check_widget, private_path, secret_content


class ToolTests(unittest.TestCase):
    def setUp(self):
        # Retain isolated fixtures rather than permanently delete files on an owner's Mac.
        self.root = Path(tempfile.mkdtemp(prefix='cleanframe-tools-')).resolve()
        (self.root / 'app').mkdir()
        (self.root / '.local').mkdir()
        (self.root / 'app/config.xml').write_bytes((ROOT / 'app/config.xml').read_bytes())
        (self.root / 'app/index.html').write_text('<html>Offline test fixture</html>')

    def config(self, **values):
        (self.root / '.local/signing.json').write_text(json.dumps(values))
        return load_settings(self.root)

    def password(self, name='.local/password.txt', value=b'synthetic password\n', mode=0o600):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(value)
        path.chmod(mode)
        return path

    def test_existing_identity_and_sdk_defaults(self):
        settings = load_settings(self.root)
        self.assertEqual(settings['profile'], 'FrameHome')
        self.assertEqual(settings['sdk_path'], self.root / '.local/tizen-sdk')
        self.assertEqual(settings['identity']['app_id'], 'nClrkHome1.FrameHome')
        self.assertIsNone(settings['password_file'])
        password = self.password('.local/certificates/private/certificate-password.txt')
        self.assertEqual(load_settings(self.root)['password_file'], password)
        self.assertIsNone(self.config(profile='Other profile')['password_file'])

    def test_sdk_symlink_resolution(self):
        sdk = self.root / '.local/real-sdk'
        sdk.mkdir()
        alias = self.root / '.local/SDK path with spaces'
        alias.symlink_to(sdk, target_is_directory=True)
        password = self.password()
        link = self.root / '.local/password-link.txt'
        link.symlink_to(password)
        settings = self.config(profile='Synthetic profile', sdk_path=str(alias), password_file=str(link))
        self.assertEqual(settings['sdk_path'], sdk.resolve())
        self.assertEqual(settings['password_file'], link)

    def test_config_identity_validation_and_no_secret_errors(self):
        with self.assertRaisesRegex(ValueError, 'Set profile'):
            self.config(sdk_path='/opt/my sdk')
        selected = self.config(sdk_path='/opt/my sdk', profile='My profile',
                               package_id='AbCdEf1234', app_id='AbCdEf1234.MyHome')
        self.assertEqual(selected['sdk_path'], Path('/opt/my sdk'))
        for values in [dict(package_id='AbCdEf1234'), dict(package_id='../unsafe', app_id='../unsafe.Home'),
                       dict(package_id='AbCdEf1234', app_id='Other12345.Home'),
                       dict(password='synthetic secret'), dict(profile='bad\nprofile')]:
            with self.subTest(values=tuple(values)):
                with self.assertRaises(ValueError) as result:
                    self.config(**{'profile': 'Synthetic profile', **values})
                self.assertNotIn('synthetic secret', str(result.exception))
        (self.root / '.local/signing.json').write_text('{invalid synthetic secret')
        with self.assertRaises(ValueError) as result:
            load_settings(self.root)
        self.assertNotIn('synthetic secret', str(result.exception))
        (self.root / '.local/signing.json').write_bytes((ROOT / 'signing.example.json').read_bytes())
        with self.assertRaisesRegex(ValueError, 'ten-character'):
            load_settings(self.root)

    def test_signed_widget_allows_public_certificates(self):
        output = self.root / 'signed.wgt'
        with zipfile.ZipFile(output, 'w') as archive:
            archive.writestr('author-signature.xml', '<Signature>Public certificate metadata</Signature>')
            archive.writestr('signature1.xml', '<Signature/>')
            archive.writestr('author.cer', 'Public certificate')
        check_widget(output, require_signed=True)
        with zipfile.ZipFile(output, 'a') as archive:
            archive.writestr('author.pkcs12', 'synthetic private store')
        with self.assertRaises(ValueError):
            check_widget(output, require_signed=True)

    def test_signed_widget_rejects_invalid_manifest(self):
        output = self.root / 'invalid.wgt'
        selected = {'package_id': 'AbCdEf1234', 'app_id': 'AbCdEf1234.MyHome'}
        cases = [(None, 'missing config.xml'), (b'<invalid', 'not valid XML'),
                 ((self.root / 'app/config.xml').read_bytes(), 'identity differs')]
        for content, message in cases:
            with zipfile.ZipFile(output, 'w') as archive:
                archive.writestr('author-signature.xml', '<Signature/>')
                archive.writestr('signature1.xml', '<Signature/>')
                if content is not None:
                    archive.writestr('config.xml', content)
            with self.subTest(message=message), self.assertRaisesRegex(ValueError, message):
                check_signed_widget(output, selected)

    def test_public_check_reads_index_and_history(self):
        for name in ['scripts/check-public.py', 'scripts/local_config.py', 'scripts/private_files.py',
                     'app/assets/fonts/SOURCES.json', 'app/assets/manrope.woff2', 'app/assets/manrope-OFL.txt',
                     'app/assets/fonts/geist/OFL.txt', 'app/assets/fonts/newsreader/OFL.txt']:
            target = self.root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(b'[]' if name.endswith('SOURCES.json') else (ROOT / name).read_bytes())
        git_env = {name: value for name, value in os.environ.items() if not name.startswith('GIT_')}
        git_env.update(GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_NOSYSTEM='1')
        def git(*args):
            return subprocess.run(['git', '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgSign=false', *args],
                                  cwd=self.root, check=True, capture_output=True, env=git_env)
        def check():
            return subprocess.run([sys.executable, '-B', 'scripts/check-public.py'], cwd=self.root, capture_output=True, text=True, env=git_env)
        git('init', '-q', '--template=')
        git('-c', 'user.name=Offline Test', '-c', 'user.email=offline@example.invalid', 'commit', '--allow-empty', '-qm', 'Fixture')
        (self.root / '.gitignore').write_text('*.pfx\n.local/\n')
        self.password('.local/forced.pfx')
        git('add', '-f', '.local/forced.pfx')
        self.assertIn('Git index: .local/forced.pfx', check().stderr)
        # A harmless working copy must not conceal the key stored in the index.
        notes = self.root / 'notes.txt'
        marker = b'-----BEGIN ' + b'PRIVATE KEY-----'
        notes.write_bytes(marker)
        git('add', 'notes.txt')
        git('update-index', '--add', '--cacheinfo', '160000,' + '1' * 40 + ',vendor/synthetic-submodule')
        notes.write_text('Harmless working copy')
        result = check()
        self.assertIn('Credential pattern in Git index: notes.txt', result.stderr)
        self.assertNotIn('Traceback', result.stderr)
        self.assertNotIn(marker.decode(), result.stderr)
        git('-c', 'user.name=Offline Test', '-c', 'user.email=offline@example.invalid', 'commit', '-qm', 'Synthetic fixture')
        git('add', 'notes.txt')
        git('-c', 'user.name=Offline Test', '-c', 'user.email=offline@example.invalid', 'commit', '-qm', 'Replace fixture')
        self.assertIn('Credential pattern in reachable Git history: notes.txt', check().stderr)
        # Compiled helper output and build metadata must not enter public history.
        generated = self.root / 'scripts/native-home/obj/build.json'
        generated.parent.mkdir(parents=True)
        generated.write_text('{"synthetic": "local build path"}')
        binary = self.root / 'scripts/native-home/Control.dll'
        binary.write_bytes(b'Synthetic compiled helper')
        git('add', str(generated.relative_to(self.root)), str(binary.relative_to(self.root)))
        result = check()
        self.assertIn('Git index: scripts/native-home/obj/build.json', result.stderr)
        self.assertIn('Git index: scripts/native-home/Control.dll', result.stderr)
        git('-c', 'user.name=Offline Test', '-c', 'user.email=offline@example.invalid', 'commit', '-qm', 'Generated fixtures')
        self.assertIn('reachable Git history: scripts/native-home/obj/build.json', check().stderr)
        # A rename must not hide a private historical filename for an existing blob.
        (self.root / 'old-store.pfx').write_bytes(b'Synthetic opaque certificate store')
        git('add', '-f', 'old-store.pfx')
        git('-c', 'user.name=Offline Test', '-c', 'user.email=offline@example.invalid', 'commit', '-qm', 'Historical private path')
        git('mv', 'old-store.pfx', 'renamed-store.txt')
        git('-c', 'user.name=Offline Test', '-c', 'user.email=offline@example.invalid', 'commit', '-qm', 'Rename fixture')
        self.assertIn('reachable Git history: old-store.pfx', check().stderr)

    def test_install_rejects_artifact_before_fake_sdb(self):
        for name in ['scripts/tv.py', 'scripts/local_config.py', 'scripts/private_files.py']:
            target = self.root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes((ROOT / name).read_bytes())
        sdb = self.root / '.local/sdk/tools/sdb'
        sdb.parent.mkdir(parents=True)
        marker = self.root / 'sdb-called'
        sdb.write_text('#!' + sys.executable + '\nfrom pathlib import Path\nPath(' + repr(str(marker)) + ').touch()\n')
        sdb.chmod(0o700)
        self.config(sdk_path=str(sdb.parents[1]), profile='Synthetic profile', package_id='AbCdEf1234', app_id='AbCdEf1234.MyHome')
        (self.root / '.local/device.json').write_text(json.dumps({'host': '127.0.0.1'}))
        widget = self.root / 'dist/Home.wgt'
        widget.parent.mkdir()
        for contaminated in [False, True]:
            with zipfile.ZipFile(widget, 'w') as archive:
                archive.writestr('config.xml', (self.root / 'app/config.xml').read_bytes())
                archive.writestr('author-signature.xml', '<Signature/>')
                archive.writestr('signature1.xml', '<Signature/>')
                if contaminated:
                    archive.writestr('private.pfx', 'Synthetic credential')
            result = subprocess.run([sys.executable, '-B', 'scripts/tv.py', 'install'], cwd=self.root, capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            expected = b'Private material in widget' if contaminated else b'Widget identity differs'
            self.assertIn(expected, result.stderr)
            self.assertNotIn(b'Traceback', result.stderr)
            self.assertFalse(marker.exists(), 'Artifact rejection must precede even a fake SDB call')

    def test_shared_policy_covers_reported_names(self):
        for name in ['config.local.json', 'signing.local.json', 'author.pfx', 'author.pkcs12',
                     'author.jks', 'author.keystore', 'profiles.xml', '.local/signing.json']:
            with self.subTest(name=name):
                self.assertTrue(private_path(name))
        self.assertFalse(private_path('signing.example.json'))
        self.assertTrue(secret_content(b'-----BEGIN ' + b'PRIVATE KEY-----'))
        self.assertTrue(secret_content(b'<pro' + b'files><profile' + b'item pass' + b'word="synthetic"/></profiles>'))


if __name__ == '__main__':
    unittest.main()
