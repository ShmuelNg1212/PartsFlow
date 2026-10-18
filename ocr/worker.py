"""Local PaddleOCR worker for PartsFlow development (plan P3, ADR 0005).

Binds to loopback only. Every /read request needs the internal bearer token
shared with the local bridge. The worker holds no Supabase credentials.
It reads one document at a time and answers 503 while busy.

Start: cd ocr && OCR_WORKER_TOKEN=... uv run python worker.py
"""

from __future__ import annotations

import hmac
import ipaddress
import json
import logging
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Callable

import reader
from reader import IncompleteRead, Limits, UnsupportedInput

log = logging.getLogger("partsflow-ocr")
BUSY = threading.Lock()


def make_server(host: str, port: int, token: str, load: Callable[[], Any], limits: Limits, background: bool = False) -> ThreadingHTTPServer:
    if not ipaddress.ip_address(host).is_loopback:
        raise ValueError("The OCR worker binds to a loopback address only.")
    if len(token) < 32:
        raise ValueError("OCR_WORKER_TOKEN must have at least 32 characters.")

    state: dict[str, Any] = {"pipeline": None, "error": None}

    def load_now() -> None:
        try:
            state["pipeline"] = load()
        except Exception as err:  # reported through /health; details stay in this log
            state["error"] = err
            log.exception("OCR model failed to load")

    if background:
        threading.Thread(target=load_now, daemon=True).start()
    else:
        load_now()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt: str, *args: Any) -> None:  # no request bodies or headers in logs
            log.info("%s %s", self.command, self.path.split("?")[0])

        def reply(self, status: int, body: dict[str, Any]) -> None:
            data = json.dumps(body).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self) -> None:
            if self.path != "/health":
                return self.reply(404, {"error": "Not found."})
            self.reply(200, {"ready": state["pipeline"] is not None})

        def do_POST(self) -> None:
            if self.path != "/read":
                return self.reply(404, {"error": "Not found."})
            sent = self.headers.get("Authorization", "")
            if not hmac.compare_digest(sent.encode(), f"Bearer {token}".encode()):
                return self.reply(401, {"error": "Not authorized."})
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                length = -1
            if length < 1 or length > limits.max_bytes:
                self.close_connection = True
                return self.reply(413, {"error": "The file is empty or too large."})
            mime = self.headers.get("Content-Type", "").split(";")[0].strip().lower()
            if mime not in reader.SUFFIX:
                return self.reply(422, {"error": "Use a PDF, JPEG, PNG or WebP file."})
            if state["pipeline"] is None:
                return self.reply(503, {"error": "The scanner is still starting." if state["error"] is None else "The scanner failed to start."})
            data = self.rfile.read(length)
            if not BUSY.acquire(blocking=False):
                return self.reply(503, {"error": "The scanner is busy. Try again shortly."})
            try:
                return self.reply(200, reader.read_document(state["pipeline"], data, mime, limits))
            except (UnsupportedInput, IncompleteRead) as err:
                return self.reply(422, {"error": str(err)})
            except Exception:
                log.exception("OCR read failed")
                return self.reply(500, {"error": "The document could not be read."})
            finally:
                BUSY.release()

    server = ThreadingHTTPServer((host, port), Handler)
    server.daemon_threads = True
    return server


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")
    token = os.environ.get("OCR_WORKER_TOKEN", "")
    port = int(os.environ.get("OCR_WORKER_PORT", "8765"))
    limits = Limits(
        max_bytes=int(os.environ.get("OCR_MAX_BYTES", str(Limits.max_bytes))),
        max_pages=int(os.environ.get("OCR_MAX_PAGES", str(Limits.max_pages))),
    )
    server = make_server("127.0.0.1", port, token, reader.make_pipeline, limits, background=True)
    log.info("OCR worker listening on http://127.0.0.1:%d (max %d bytes, %d pages)", port, limits.max_bytes, limits.max_pages)
    server.serve_forever()


if __name__ == "__main__":
    main()
