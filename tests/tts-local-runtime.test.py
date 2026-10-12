"""Meaningful downloader/path regression checks; no models or network needed."""
import hashlib
import importlib.util
import io
import tempfile
import tarfile
import unittest
import sys
from pathlib import Path
from unittest.mock import patch

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("worker", Path(__file__).parent.parent / "src/tts-local-runtime.py")
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

class Response(io.BytesIO):
    def __init__(self, data, status=200, headers=None):
        super().__init__(data)
        self.status, self.headers = status, headers or {}

class Downloads(unittest.TestCase):
    def test_archive_only_installs_manifest_files(self):
        data = b"pinned weight"
        item = {"path": "model.onnx", "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
        with tempfile.TemporaryDirectory() as root:
            archive = Path(root, "model.tar")
            config = {"modelDir": str(Path(root, "installed")), "archiveRoot": "official", "files": [item]}
            def pack(name, content=data, kind=tarfile.REGTYPE):
                with tarfile.open(archive, "w") as tar:
                    member = tarfile.TarInfo(name)
                    member.type = kind
                    member.size = len(content) if kind == tarfile.REGTYPE else 0
                    member.linkname = "../escape"
                    tar.addfile(member, io.BytesIO(content) if member.size else None)
            for name, kind in [("official/../escape", tarfile.REGTYPE), ("official/unlisted", tarfile.REGTYPE), ("official/model.onnx", tarfile.SYMTYPE)]:
                pack(name, kind=kind)
                with self.assertRaisesRegex(ValueError, "archive"):
                    worker.unpack_model(config, archive)
            pack("official/model.onnx", b"broken bytes!")
            with self.assertRaisesRegex(ValueError, "checksum"):
                worker.unpack_model(config, archive)
            self.assertFalse(Path(root, "installed/model.onnx").exists())
            pack("official/model.onnx")
            worker.unpack_model(config, archive)
            self.assertEqual(Path(root, "installed/model.onnx").read_bytes(), data)

    def test_resume_and_verify(self):
        data = b"verified model fixture"
        with tempfile.TemporaryDirectory() as root:
            Path(root, "weight.part").write_bytes(data[:5])
            cfg = {"modelDir": root, "files": [{"repo": "official/model", "revision": "fixed", "remote": "weight", "path": "weight", "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}]}
            def response(request, **kwargs):
                self.assertEqual(request.get_header("Range"), "bytes=5-")
                return Response(data[5:], 206, {"Content-Range": f"bytes 5-{len(data)-1}/{len(data)}"})
            with patch.object(worker.urllib.request, "urlopen", response), patch.object(worker, "emit"):
                worker.download_models(cfg)
            self.assertEqual(Path(root, "weight").read_bytes(), data)
            self.assertFalse(Path(root, "weight.part").exists())

    def test_bad_digest_never_becomes_installed(self):
        with tempfile.TemporaryDirectory() as root:
            cfg = {"modelDir": root, "files": [{"url": "https://official.example/weight", "path": "weight", "bytes": 3, "sha256": "0" * 64}]}
            with patch.object(worker.urllib.request, "urlopen", side_effect=lambda *_a, **_k: Response(b"bad")), patch.object(worker.time, "sleep"), patch.object(worker, "emit"):
                with self.assertRaisesRegex(ValueError, "checksum"):
                    worker.download_models(cfg)
            self.assertFalse(Path(root, "weight").exists())

    def test_path_escape_and_symlink_are_rejected(self):
        with tempfile.TemporaryDirectory() as root, tempfile.TemporaryDirectory() as outside:
            Path(root, "link").symlink_to(outside, target_is_directory=True)
            for name in ("../escape", outside + "/escape", "link/escape"):
                with self.assertRaisesRegex(ValueError, "path"):
                    worker.within(root, name)

if __name__ == "__main__":
    unittest.main()
