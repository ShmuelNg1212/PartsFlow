"""Worker HTTP tests (plan P3). A fake pipeline stands in for Paddle; the real model runs in the evaluation runner."""

import http.client
import json
import threading

import pytest

import reader
import worker

TOKEN = "t" * 40


class FakeResult:
    def __init__(self, index, texts):
        self.json = {"res": {"page_index": index, "rec_texts": texts, "rec_scores": [0.99] * len(texts), "rec_boxes": [[0, 0, 10, 10]] * len(texts)}}


class FakePipeline:
    def __init__(self, pages=1, gate=None):
        self.pages = pages
        self.gate = gate

    def predict(self, path):
        if self.gate:
            self.gate.wait(5)
        return [FakeResult(i, [f"page {i}"]) for i in range(self.pages)]


@pytest.fixture
def serve(monkeypatch):
    servers = []

    def start(pipeline, limits=worker.Limits(max_bytes=1000, max_pages=5)):
        monkeypatch.setattr(reader, "page_count", lambda data, mime: 1)
        server = worker.make_server("127.0.0.1", 0, TOKEN, lambda: pipeline, limits)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        servers.append(server)
        return server.server_address[1]

    yield start
    for s in servers:
        s.shutdown()


def call(port, method="POST", path="/read", body=b"%PDF-1.4", headers=None):
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
    h = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/pdf"}
    h.update(headers or {})
    h = {k: v for k, v in h.items() if v is not None}
    conn.request(method, path, body=body, headers=h)
    res = conn.getresponse()
    data = res.read()
    return res.status, json.loads(data) if data else None


def test_reads_a_document(serve):
    port = serve(FakePipeline())
    status, body = call(port)
    assert status == 200
    assert body["page_count"] == 1
    assert body["pages"][0]["lines"][0]["text"] == "page 0"


def test_requires_the_internal_token(serve):
    port = serve(FakePipeline())
    assert call(port, headers={"Authorization": None})[0] == 401
    assert call(port, headers={"Authorization": "Bearer wrong"})[0] == 401


def test_refuses_to_start_without_a_strong_token():
    with pytest.raises(ValueError):
        worker.make_server("127.0.0.1", 0, "short", lambda: FakePipeline(), worker.Limits())


def test_refuses_a_non_loopback_address():
    with pytest.raises(ValueError):
        worker.make_server("0.0.0.0", 0, TOKEN, lambda: FakePipeline(), worker.Limits())


def test_rejects_large_bodies_before_reading_them(serve):
    port = serve(FakePipeline())
    status, body = call(port, body=b"x" * 1001)
    assert status == 413


def test_rejects_unsupported_types(serve):
    port = serve(FakePipeline())
    status, body = call(port, headers={"Content-Type": "text/html"})
    assert status == 422
    assert "PDF" in body["error"]


def test_reports_an_incomplete_read_as_rejected(serve, monkeypatch):
    port = serve(FakePipeline(pages=1))
    monkeypatch.setattr(reader, "page_count", lambda data, mime: 3)
    status, body = call(port)
    assert status == 422
    assert "1 of 3" in body["error"]


def test_reads_one_document_at_a_time(serve):
    gate = threading.Event()
    port = serve(FakePipeline(gate=gate))
    first = {}
    t = threading.Thread(target=lambda: first.setdefault("r", call(port)))
    t.start()
    for _ in range(50):
        if worker.BUSY.locked():
            break
        threading.Event().wait(0.02)
    assert call(port)[0] == 503
    gate.set()
    t.join()
    assert first["r"][0] == 200


def test_health_needs_no_document_and_reports_readiness(serve):
    port = serve(FakePipeline())
    status, body = call(port, method="GET", path="/health", body=None)
    assert status == 200
    assert body == {"ready": True}


def test_unknown_paths_are_not_found(serve):
    port = serve(FakePipeline())
    assert call(port, path="/other")[0] == 404
