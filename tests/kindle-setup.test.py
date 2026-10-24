import hashlib
import importlib.util
import io
import json
from pathlib import Path
import struct
import os
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch

ENTRY = Path(__file__).resolve().parents[1] / 'kindle-receiver/prepare.py'
spec = importlib.util.spec_from_file_location('kindle_setup', ENTRY)
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)

def archive(files, mode):
    stream = io.BytesIO()
    with tarfile.open(fileobj=stream, mode=mode) as tar:
        for name, data in files.items():
            item = tarfile.TarInfo(name)
            item.size = len(data)
            tar.addfile(item, io.BytesIO(data))
    return stream.getvalue()

def fixture_package():
    elf = b'\x7fELF\x01' + b'fixture' * 20
    inner = archive({'usbnetlite/bin/dropbearmulti': elf, 'usbnetlite/bin/sftp-server': elf}, 'w:xz')
    payload = archive({'usbnetlite.tar.xz': inner}, 'w:gz')
    garble = lambda b: bytes((((x & 15) << 4) | (x >> 4)) ^ 0x7a for x in b)
    header = b'\0\0' + garble(hashlib.md5(payload).hexdigest().encode()) + b'\0\0'
    data = b'SP01' + bytes(188) + b'FD04' + bytes(18) + header + garble(payload)
    return data, hashlib.sha256(data).hexdigest()

class SetupTests(unittest.TestCase):
    def test_scan_request_persists_until_the_real_service_accepts_it(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pending = root / 'scan.pending'
            script = root / 'scan.sh'
            script.write_text((ENTRY.parent / 'scan.sh').read_text().replace('/var/local/qiaomu-kindle/scan.pending', str(pending)))
            lipc = root / 'lipc-set-prop'
            lipc.write_text('#!/bin/sh\nexit 1\n')
            lipc.chmod(0o755)
            env = {**os.environ, 'PATH': str(root) + os.pathsep + os.environ['PATH']}
            pending.touch()
            queued = subprocess.run(['sh', str(script)], env=env, capture_output=True, text=True, check=True)
            self.assertEqual(queued.stdout.strip(), 'scan-pending')
            self.assertTrue(pending.exists())
            lipc.write_text('#!/bin/sh\n[ "$1 $2 $3" = "com.lab126.scanner doFullScan 1" ]\n')
            accepted = subprocess.run(['sh', str(script)], env=env, capture_output=True, text=True, check=True)
            self.assertEqual(accepted.stdout.strip(), 'scan-requested')
            self.assertFalse(pending.exists())

    def test_partial_scriptlet_write_is_rolled_back(self):
        data, digest = fixture_package()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'system').mkdir()
            (root / 'system/version.txt').write_text('Kindle 5.18.1.1.1')
            (root / 'documents').mkdir()
            packages = root / 'downloads'
            packages.mkdir()
            (packages / 'fixture.bin').write_bytes(data)
            original_open = Path.open
            def fail_second_script(path, *args, **kwargs):
                if path.name == 'Remove Qiaomu Kindle.sh' and args and args[0] == 'xb':
                    raise OSError('simulated full disk')
                return original_open(path, *args, **kwargs)
            with patch.object(setup, 'PACKAGES', {'standard': ('fixture.bin', digest)}), patch.object(Path, 'open', fail_second_script):
                with self.assertRaises(OSError):
                    setup.prepare(root, packages)
            self.assertFalse((root / 'qiaomu-kindle').exists())
            self.assertEqual(list((root / 'documents').iterdir()), [])

    def test_fixed_package_is_parsed_without_executing_its_installer(self):
        data, digest = fixture_package()
        self.assertEqual(set(setup.binaries(data, digest)), {'dropbearmulti', 'sftp-server'})
        with self.assertRaises(ValueError):
            setup.binaries(data + b'changed', digest)

    def test_preparation_preserves_existing_keys_and_koreader(self):
        data, digest = fixture_package()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'system').mkdir()
            (root / 'system/version.txt').write_text('Kindle 5.18.1.1.1')
            (root / 'documents').mkdir()
            (root / 'koreader').mkdir()
            (root / 'koreader/settings.reader.lua').write_text('original reading settings')
            keys = root / 'usbnetlite/etc/dropbear/authorized_keys'
            keys.parent.mkdir(parents=True)
            keys.write_text('another device public key')
            packages = root / 'downloads'
            packages.mkdir()
            (packages / 'fixture.bin').write_bytes(data)
            with patch.object(setup, 'PACKAGES', {'standard': ('fixture.bin', digest), 'recent': ('fixture.bin', digest)}):
                setup.prepare(root, packages)
            self.assertEqual(keys.read_text(), 'another device public key')
            self.assertEqual((root / 'koreader/settings.reader.lua').read_text(), 'original reading settings')
            self.assertFalse(json.loads((root / 'qiaomu-kindle/receiver.json').read_text())['installed'])
            self.assertTrue((root / 'documents/Install Qiaomu Kindle.sh').is_file())
            with self.assertRaises(ValueError):
                setup.prepare(root, packages)

    def test_external_documents_symlink_is_rejected_before_writes(self):
        with tempfile.TemporaryDirectory() as directory, tempfile.TemporaryDirectory() as external:
            root = Path(directory)
            (root / 'system').mkdir()
            (root / 'system/version.txt').write_text('Kindle 5.18.1.1.1')
            (root / 'documents').symlink_to(external, target_is_directory=True)
            with self.assertRaises(ValueError):
                setup.prepare(root)
            self.assertEqual(list(Path(external).iterdir()), [])

if __name__ == '__main__':
    unittest.main()
