# 0005. Local PaddleOCR provider choice

Date: 2026-10-18. Status: accepted.

The human selected local PaddleOCR for the next document-reading trial. The human also requested removal of the former hosted OCR provider and its setup. R-EXT-2 now follows that choice. The removal includes provider references in current project files, including the earlier brief and records, as explicitly requested. Git history retains the original versions.

Keep the replaceable extraction interface and all draft-only rules in ADR 0002. Keep the labelled demo provider until actual local inference is connected and verified. The local worker and authenticated bridge still need approval of the revised implementation plan. No production deployment or paid service is authorized by this decision.
