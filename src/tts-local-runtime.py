"""Qiaomu Reader's device-local TTS worker. No third-party source is bundled.

Fixed upstream packages/weights are installed separately in user application
data. Only authenticated loopback requests reach these model adapters.
"""
import contextlib
import hashlib
import http.server
import json
import os
from pathlib import Path
import secrets
import shutil
import sys
import subprocess
import tarfile
import tempfile
import threading
import time
import urllib.error
import urllib.request
import uuid


def emit(data):
    print("QBR_TTS " + json.dumps(data, ensure_ascii=False), flush=True)


def atomic_json(path, value):
    path = Path(path)
    temp = path.with_name(path.name + "." + uuid.uuid4().hex + ".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")
    os.chmod(temp, 0o600)
    os.replace(temp, path)


def within(root, name):
    root = Path(root).resolve()
    path = (root / name).resolve()
    if path == root or root not in path.parents:
        raise ValueError("path")
    return path


def file_matches(path, item):
    if not path.is_file() or path.stat().st_size != item["bytes"]:
        return False
    if item.get("sha256"):
        h = hashlib.sha256()
        with path.open("rb") as f:
            for chunk in iter(lambda: f.read(1024 * 1024), b""):
                h.update(chunk)
        return h.hexdigest() == item["sha256"]
    return True


def download_models(config):
    """Pinned HTTPS resources, bounded retries, .part resume, verified commit."""
    root = Path(config["modelDir"])
    root.mkdir(parents=True, exist_ok=True)
    total = sum(x["bytes"] for x in config["files"])
    completed = 0
    for item in config["files"]:
        dest = within(root, item["path"])
        dest.parent.mkdir(parents=True, exist_ok=True)
        if file_matches(dest, item):
            completed += item["bytes"]
            emit({"phase": "download", "bytes": completed, "total": total})
            continue
        part = dest.with_name(dest.name + ".part")
        url = item.get("url") or "https://huggingface.co/{repo}/resolve/{revision}/{remote}".format(**item)
        for attempt in range(3):
            offset = part.stat().st_size if part.exists() else 0
            if offset > item["bytes"]:
                part.unlink()
                offset = 0
            try:
                if offset < item["bytes"]:
                    headers = {"User-Agent": "QiaomuReader/4.7 local-model-install"}
                    if offset:
                        headers["Range"] = "bytes=" + str(offset) + "-"
                    request = urllib.request.Request(url, headers=headers)
                    with urllib.request.urlopen(request, timeout=60) as response:
                        if response.status != 206:
                            offset = 0
                        else:
                            if not response.headers.get("Content-Range", "").startswith("bytes " + str(offset) + "-"):
                                raise ValueError("range")
                        with part.open("ab" if offset else "wb") as output:
                            last = 0
                            while True:
                                data = response.read(1024 * 1024)
                                if not data:
                                    break
                                offset += len(data)
                                if offset > item["bytes"]:
                                    raise ValueError("size")
                                output.write(data)
                                if time.monotonic() - last > 0.4:
                                    emit({"phase": "download", "bytes": completed + offset, "total": total})
                                    last = time.monotonic()
                if not file_matches(part, item):
                    part.unlink(missing_ok=True)
                    raise ValueError("checksum")
                os.replace(part, dest)
                completed += item["bytes"]
                emit({"phase": "download", "bytes": completed, "total": total})
                break
            except Exception:
                if attempt == 2:
                    raise
                time.sleep(1 + attempt)
    emit({"phase": "downloaded"})


def unpack_model(config, archive):
    """Only manifest-listed regular files; reject links, escapes and bombs."""
    root = Path(config["modelDir"])
    expected = {x["path"]: x for x in config["files"]}
    seen = set()
    with tarfile.open(archive) as tar:
        for member in tar:
            parts = Path(member.name).parts
            if not parts or parts[0] != config["archiveRoot"] or ".." in parts or Path(member.name).is_absolute():
                raise ValueError("archive")
            if member.isdir():
                continue
            # Tar members are POSIX-pathed; str(Path(...)) uses backslashes on
            # Windows and never matches the manifest's "/" keys.
            name = "/".join(parts[1:])
            item = expected.get(name)
            if not member.isfile() or member.issym() or member.islnk() or not item or name in seen or member.size != item["bytes"]:
                raise ValueError("archive")
            seen.add(name)
            dest = within(root, name)
            dest.parent.mkdir(parents=True, exist_ok=True)
            if file_matches(dest, item):
                continue
            part = dest.with_name(dest.name + ".extractpart")
            try:
                with tar.extractfile(member) as src, part.open("wb") as output:
                    shutil.copyfileobj(src, output, 1024 * 1024)
                if not file_matches(part, item):
                    raise ValueError("checksum")
                os.replace(part, dest)
            finally:
                part.unlink(missing_ok=True)
    if seen != set(expected):
        raise ValueError("archive")


def install(config):
    """Private CPU-only Sherpa environment; never touch global Python."""
    emit({"phase": "environment"})
    quiet = subprocess.DEVNULL
    if not Path(config["python"]).is_file():
        subprocess.run([config["uv"], "venv", "--python", sys.executable, config["venvDir"]], check=True, stdout=quiet)
    marker = Path(config["venvDir"]) / ".qbr-packages"
    identity = "\n".join(config["packages"])
    if not marker.exists() or marker.read_text() != identity:
        subprocess.run([config["uv"], "pip", "install", "--python", config["python"], *config["packages"]], check=True, stdout=quiet)
        marker.write_text(identity)
    root = Path(config["modelDir"])
    root.mkdir(parents=True, exist_ok=True)
    if not all(file_matches(within(root, f["path"]), f) for f in config["files"]):
        item = config["archive"]
        download_models({"modelDir": config["cacheDir"], "files": [dict(item, path=item["name"])]})
        emit({"phase": "extract"})
        unpack_model(config, Path(config["cacheDir"]) / item["name"])
    emit({"phase": "installed"})


def load_engine(config):
    import sherpa_onnx as sherpa
    root = Path(config["modelDir"])
    if config["id"] == "kokoro":
        model = sherpa.OfflineTtsModelConfig(kokoro=sherpa.OfflineTtsKokoroModelConfig(
            model=str(root / "model.onnx"), voices=str(root / "voices.bin"),
            tokens=str(root / "tokens.txt"), data_dir=str(root / "espeak-ng-data"),
            lexicon=",".join(str(root / x) for x in ["lexicon-us-en.txt", "lexicon-zh.txt"])),
            num_threads=min(4, os.cpu_count() or 1), provider="cpu")
        rules = ["date-zh.fst", "number-zh.fst"]
    elif config["id"] == "melo":
        model = sherpa.OfflineTtsModelConfig(vits=sherpa.OfflineTtsVitsModelConfig(
            model=str(root / "model.onnx"), tokens=str(root / "tokens.txt"),
            lexicon=str(root / "lexicon.txt")), num_threads=min(4, os.cpu_count() or 1), provider="cpu")
        rules = ["date.fst", "number.fst"]
    else:
        raise ValueError("model")
    cfg = sherpa.OfflineTtsConfig(model=model, rule_fsts=",".join(str(root / x) for x in rules), max_num_sentences=1)
    if not cfg.validate():
        raise ValueError("model")
    return sherpa.OfflineTts(cfg), "cpu"


def synthesize(engine, config, voice, text, output, is_cancelled=lambda: False):
    import soundfile as sf
    import numpy as np
    info = next((v for v in config["voices"] if v["id"] == voice), None)
    if info is None:
        raise ValueError("voice")
    # The official callback contract is 1 to continue, 0 to stop.
    audio = engine.generate(text=text, sid=info["sid"], speed=1.0,
                            callback=lambda *_: 0 if is_cancelled() else 1)
    if is_cancelled():
        raise ValueError("cancelled")
    samples, rate = np.asarray(audio.samples), audio.sample_rate
    if rate not in (22050, 24000, 44100, 48000) or samples.size == 0 or not np.isfinite(samples).all() or np.abs(samples).max() < .001 or len(samples) / rate > 300:
        raise ValueError("audio")
    sf.write(output, samples, rate, subtype="PCM_16")
    return Path(output).read_bytes()


def serve(config):
    """One shared worker per model/user. Sessions cancel only their own jobs."""
    token = secrets.token_urlsafe(32)
    state = {"engine": None, "device": "", "active": 0, "last": time.monotonic()}
    generation = threading.Lock()
    state_lock = threading.Lock()
    cancelled = {}
    jobs = set()
    output_dir = Path(config["audioDir"])
    output_dir.mkdir(parents=True, exist_ok=True)
    # Text emitted by upstream progress/diagnostics must not enter persistent logs.
    quiet = open(os.devnull, "w")

    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def send(self, code, data, content_type="application/json"):
            body = json.dumps(data).encode() if content_type == "application/json" else data
            self.send_response(code)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass

        def allowed(self):
            return not self.headers.get("Origin") and secrets.compare_digest(self.headers.get("Authorization", ""), "Bearer " + token)

        def do_GET(self):
            if not self.allowed():
                self.send(403, {"error": "auth"})
            elif self.path == "/status":
                state["last"] = time.monotonic()
                self.send(200, {"version": config["version"], "model": config["id"], "loaded": state["engine"] is not None, "device": state["device"]})
            else:
                self.send(404, {"error": "route"})

        def do_POST(self):
            if not self.allowed():
                self.send(403, {"error": "auth"})
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if length <= 0 or length > 32 * 1024:
                    raise ValueError("request")
                request = json.loads(self.rfile.read(length))
                if self.path == "/cancel":
                    with state_lock:
                        job = request.get("job")
                        if isinstance(job, str) and len(job) <= 80:
                            # The cancellation may reach us before the speech request.
                            now = time.monotonic()
                            for old in [x for x, t in cancelled.items() if now - t > 600]:
                                del cancelled[old]
                            if len(cancelled) < 256:
                                cancelled[job] = now
                    self.send(200, {"cancelled": True})
                    return
                if self.path != "/speech":
                    self.send(404, {"error": "route"})
                    return
                text, job = request.get("text"), request.get("job")
                if not isinstance(text, str) or not text.strip() or len(text) > 2000 or not isinstance(job, str) or len(job) > 80:
                    raise ValueError("request")
                with state_lock:
                    if job in jobs:
                        raise ValueError("request")
                    jobs.add(job)
                    state["active"] += 1
                try:
                    while not generation.acquire(timeout=0.1):
                        if job in cancelled:
                            self.send(409, {"error": "cancelled"})
                            return
                    try:
                        if job in cancelled:
                            self.send(409, {"error": "cancelled"})
                            return
                        with contextlib.redirect_stdout(quiet), contextlib.redirect_stderr(quiet):
                            if state["engine"] is None:
                                state["engine"], state["device"] = load_engine(config)
                            with tempfile.TemporaryDirectory(prefix="speech-", dir=output_dir) as directory:
                                data = synthesize(state["engine"], config, request.get("voice"), text, Path(directory) / "audio.wav", lambda: job in cancelled)
                        self.send(409, {"error": "cancelled"}) if job in cancelled else self.send(200, data, "audio/wav")
                    finally:
                        generation.release()
                finally:
                    with state_lock:
                        cancelled.pop(job, None)
                        jobs.discard(job)
                        state["active"] -= 1
                        state["last"] = time.monotonic()
            except Exception as error:
                code = str(error) if isinstance(error, ValueError) and str(error) in {"voice", "audio", "request", "path", "cancelled"} else "inference"
                # Class name only, never reading text, raw paths or a traceback.
                self.send(409 if code == "cancelled" else 500, {"error": code, "kind": type(error).__name__})

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    endpoint = Path(config["endpoint"])
    atomic_json(endpoint, {"pid": os.getpid(), "port": server.server_port, "token": token, "version": config["version"], "model": config["id"]})
    emit({"phase": "server", "port": server.server_port})

    def idle_exit():
        while True:
            time.sleep(5)
            if not state["active"] and time.monotonic() - state["last"] > 120:
                server.shutdown()
                return
    threading.Thread(target=idle_exit, daemon=True).start()
    try:
        server.serve_forever(poll_interval=0.2)
    finally:
        server.server_close()
        try:
            if json.loads(endpoint.read_text()).get("token") == token:
                endpoint.unlink()
        except (OSError, ValueError):
            pass
        quiet.close()


def main():
    operation, filename = sys.argv[1:]
    config = json.loads(Path(filename).read_text(encoding="utf-8"))
    if operation == "download":
        download_models(config)
    elif operation == "install":
        install(config)
    elif operation == "serve":
        serve(config)
    else:
        raise ValueError("operation")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        emit({"error": type(error).__name__})
        sys.exit(1)
