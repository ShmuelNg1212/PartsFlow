"""PaddleOCR reading core for the local PartsFlow worker (plan P1, ADR 0005).

Returns text lines with their page geometry. Invoice-field mapping happens in
TypeScript (supabase/functions/_shared/extraction/paddle.ts). Document text is
data, never instructions.
"""

from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass
from typing import Any

SUFFIX = {"application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}


class UnsupportedInput(Exception):
    pass


class IncompleteRead(Exception):
    pass


@dataclass(frozen=True)
class Limits:
    max_bytes: int = 10 * 1024 * 1024
    max_pages: int = 5


def make_pipeline() -> Any:
    # Imported here so tests of the HTTP layer do not load Paddle.
    from paddleocr import PaddleOCR

    return PaddleOCR(
        use_doc_orientation_classify=True,
        use_doc_unwarping=False,
        use_textline_orientation=True,
        # Pinned so a library default change cannot swap models silently.
        doc_orientation_classify_model_name="PP-LCNet_x1_0_doc_ori",
        textline_orientation_model_name="PP-LCNet_x1_0_textline_ori",
        text_detection_model_name="PP-OCRv6_medium_det",
        text_recognition_model_name="PP-OCRv6_medium_rec",
        device="cpu",
    )


def page_count(data: bytes, mime: str) -> int:
    if mime != "application/pdf":
        return 1
    import pypdfium2

    pdf = pypdfium2.PdfDocument(data)
    try:
        return len(pdf)
    finally:
        pdf.close()


def read_document(pipeline: Any, data: bytes, mime: str, limits: Limits = Limits()) -> dict[str, Any]:
    if mime not in SUFFIX:
        raise UnsupportedInput("Use a PDF, JPEG, PNG or WebP file.")
    if not data or len(data) > limits.max_bytes:
        raise UnsupportedInput("The file is empty or too large.")
    try:
        expected = page_count(data, mime)
    except Exception as err:
        raise UnsupportedInput("The file could not be opened.") from err
    if expected < 1 or expected > limits.max_pages:
        raise UnsupportedInput(f"Use a document with 1 to {limits.max_pages} pages.")

    fd, path = tempfile.mkstemp(suffix=SUFFIX[mime])
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        results = list(pipeline.predict(path))
    finally:
        os.unlink(path)

    pages = [to_page(r) for r in results]
    # A partial document is never reported as fully read.
    if len(pages) != expected:
        raise IncompleteRead(f"Read {len(pages)} of {expected} pages.")
    return {"page_count": expected, "pages": pages}


def to_page(result: Any) -> dict[str, Any]:
    r = result.json["res"] if hasattr(result, "json") else result
    texts = r.get("rec_texts", [])
    scores = r.get("rec_scores", [])
    boxes = r.get("rec_boxes", [])
    lines = [
        {"text": str(t), "score": round(float(s), 4), "box": [int(v) for v in b]}
        for t, s, b in zip(texts, scores, boxes)
        if str(t).strip()
    ]
    return {"index": int(r.get("page_index") or 0), "lines": lines}
