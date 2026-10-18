# Local PaddleOCR evaluation

Date: 2026-10-18. Mode: technical.
Skills: research, codebase-design, grilling, and mem-search.

## Human direction

The human selected PaddleOCR for document scanning and field extraction. Keep the earlier development-only scope and synthetic test data. No cloud OCR account is required for this path.

## Current foundation

The feature branch is `feat/real-invoice-extraction`, based on the deployed application at `fec03c3`.
It contains complete evaluation reporting and six new synthetic cases. It contained input guards for the retired hosted provider. Those were later removed at the human's request. No feature changes were deployed or pushed.
The last checks passed: 96 unit tests, 133 local database tests, and 10 browser regressions. Two layout-specific browser checks were skipped. These checks did not run actual OCR.

The existing Extractor interface accepts bytes and a MIME type. It returns raw draft fields.
The extraction handler checks the user, shop membership, draft status, and file path. It calls the privileged `apply_extraction` RPC.
Authenticated clients cannot call that RPC directly. Preserve this rule.
The frontend currently calls the hosted extraction function. A hosted function cannot reach a loopback process on the Mac.

## Runtime evidence

This Mac uses ARM64. Python 3.11.17 is installed. The default Python is 3.14.8. Use an isolated Python 3.11 environment for the trial.
The study did not install packages or download models. Available memory was not measured because the sandbox denied the system query.

PaddleOCR 3.7.0 is an official release. PaddlePaddle 3.3.1 has macOS ARM64 wheels for Python 3.9 through 3.13. A wheel does not prove that the complete pipeline works on this machine.
Candidate pins are `paddlepaddle==3.3.1` and `paddleocr[doc-parser]==3.7.0`. Resolve and lock compatible transitive dependencies during execution.
Sources: [release](https://github.com/PaddlePaddle/PaddleOCR/releases/tag/v3.7.0), [installation](https://github.com/PaddlePaddle/PaddleOCR/blob/v3.7.0/docs/version3.x/installation.en.md), [wheels](https://pypi.org/project/paddlepaddle/3.3.1/).

## OCR and field extraction

PP-StructureV3 accepts images and PDFs. Its output includes recognized text, boxes, recognition scores, table HTML, and structured page results.
It does not provide a documented ready-made invoice schema matching PartsFlow.
Model component storage sizes range from tens to hundreds of MB. Optional table models are larger. The complete selected download and memory use need measurement.
Disable unused formula, seal, and chart modules for the trial.
Source: [StructureV3](https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/pipeline_usage/PP-StructureV3.en.md).

PaddleOCR-VL has an official Apple Silicon CPU path. The guide reports M4 validation. Other Apple chips and the full memory requirement are not established here. It is a later option if the first trial fails.
Source: [Apple Silicon guide](https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/pipeline_usage/PaddleOCR-VL-Apple-Silicon.en.md).

PP-ChatOCRv4 adds key-information extraction through an LLM and embedding endpoint. Installing PaddleOCR does not supply that complete stack.
Do not add a cloud LLM or a second local model in this trial.
Source: [ChatOCRv4](https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/pipeline_usage/PP-ChatOCRv4.en.md).

## Proposed architecture

Use one local OCR worker behind the existing Extractor interface. Keep invoice-field mapping inside that worker.
The worker has no database credentials. It returns raw fields and evidence only.
Use explicit labels and table headers to map the supported synthetic layouts. Leave uncertain or unsupported values unresolved. OCR recognition scores do not prove business-field correctness.

A local authenticated bridge reuses the extraction handler and its access checks. It reads originals from the development project's private Storage. It sends bytes to the local worker. It applies results through the existing privileged RPC.
Bind both local processes to loopback. Keep privileged credentials server-side. Refuse the production project in local startup configuration.
Use a development-only Vite proxy to route the existing upload flow to that bridge. Production builds keep the existing hosted path.
This avoids exposing a public tunnel or changing production extraction.

Official serving supports CPU and loopback HTTP. The exact wrapper will be selected after the local smoke test:
[serving](https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/inference_deployment/serving/serving.en.md).

## Evaluation and scope

First prove installation and actual inference on one new synthetic document. Stop and report evidence if that fails.
Then measure all six synthetic documents. Preserve page coverage, failed reads, missing or extra lines, exact codes, and decimal values in the report.
Use a provider-neutral report. Its provider label must reflect the actual reader before reporting PaddleOCR results.
Synthetic templates establish a narrow supported layout set. They do not establish real-shop accuracy or general document understanding.
Stock changes still require correction, product selection, and owner confirmation. No accounting or external dashboard integration is added.

## Intent conflict for approval

The human selected PaddleOCR in place of the former hosted provider. A later removal request authorizes removal of that provider's implementation and references. ADR 0005 records this choice. The local integration plan still needs approval.
Future public hosting, paid compute, real invoices, and additional language models need separate decisions.
