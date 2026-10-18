# Headless Chromium shows PDFs as a blank frame

The document viewer shows PDFs in an `iframe`. Playwright's headless Chromium has no PDF viewer, so the frame is blank in tests and screenshots. Real browsers show the PDF. iOS Safari shows only the first page in a frame.

- Do not treat a blank PDF frame in a headless screenshot as a bug.
- The viewer has an "open it in a new tab" link for PDFs. Keep it.
- Supabase Storage signed URLs send no `X-Frame-Options` or CSP header (checked 2026-10-18), so framing is allowed.
