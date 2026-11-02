"""Reference output of Indra OCR for the parity test (parity.test.ts).

Runs the same steps as the TypeScript port: line detection (det.onnx) and line
recognition (rec.onnx), without the orientation, skew, script, and reading-order
models.

Run (Python 3.10+, `pip install indra-ocr`):

    INDRA_OCR_MODEL_DIR=/path/to/indra-ocr python -I scripts/indra-parity/reference.py

The model folder must contain det.onnx, rec.onnx, and meta.json (revision v1.1.0).
"""

import json
import os
from pathlib import Path

import cv2
from indra_ocr.pipeline import OrtOCR

HERE = Path(__file__).parent
ocr = OrtOCR(os.environ["INDRA_OCR_MODEL_DIR"], threads=1)

expected = {}
for png in sorted(HERE.glob("*.png")):
    # Decode to RGB, then convert, so that the TypeScript test can do the same.
    gray = cv2.cvtColor(cv2.imread(str(png), cv2.IMREAD_COLOR), cv2.COLOR_BGR2GRAY)
    boxes = ocr.detect(gray)
    lines = ocr.recognize(gray, boxes) if len(boxes) else []
    expected[png.stem] = {
        "boxes": [[round(float(v), 2) for v in b[:4]] for b in boxes],
        "lines": [{"text": text, "conf": round(conf, 4)} for text, conf, _ in lines],
    }
    print(png.stem, [text for text, _, _ in lines])

(HERE / "expected.json").write_text(json.dumps(expected, indent=1, ensure_ascii=False) + "\n")
