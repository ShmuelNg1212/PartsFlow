"""Reader input limits (plan P3, security review). No Paddle model loads here."""

import io

import pytest
from PIL import Image

import reader


def png(width, height):
    buf = io.BytesIO()
    Image.new("L", (width, height)).save(buf, format="PNG")
    return buf.getvalue()


class NoPipeline:
    def predict(self, path):
        raise AssertionError("inference must not run")


def test_rejects_an_image_with_too_many_pixels_before_inference():
    with pytest.raises(reader.UnsupportedInput, match="too large"):
        reader.read_document(NoPipeline(), png(5000, 5000), "image/png", reader.Limits(max_pixels=20_000_000))


def test_rejects_a_pdf_page_with_an_oversized_media_box():
    import pypdfium2

    pdf = pypdfium2.PdfDocument.new()
    pdf.new_page(20_000, 20_000)
    buf = io.BytesIO()
    pdf.save(buf)
    with pytest.raises(reader.UnsupportedInput, match="too large"):
        reader.read_document(NoPipeline(), buf.getvalue(), "application/pdf")


def test_accepts_a_normal_image():
    class One:
        def predict(self, path):
            return [{"page_index": None, "rec_texts": ["x"], "rec_scores": [0.9], "rec_boxes": [[0, 0, 1, 1]]}]

    assert reader.read_document(One(), png(800, 1100), "image/png")["page_count"] == 1
