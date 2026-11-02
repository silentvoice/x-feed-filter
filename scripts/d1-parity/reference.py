"""Reference token IDs and probabilities for the d1 TypeScript port.

Uses the original `prompt.py` from LiquidAI/d1-omni-600M and ONNX Runtime (CPU)
on the same ONNX graph that the extension uses.

Usage:
    python -I reference.py <prompt.py> <model dir> <cases.json> <out.json> [graph]

<model dir> must contain tokenizer.json, config.json, and onnx/<graph>.onnx(_data).
<graph> is model_quantized (8-bit, the default) or model_q4 (4-bit).
"""
import importlib.util
import json
import sys

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

prompt_path, model_dir, cases_path, out_path = sys.argv[1:5]
graph = sys.argv[5] if len(sys.argv) > 5 else "model_quantized"
spec = importlib.util.spec_from_file_location("d1_prompt", prompt_path)
P = importlib.util.module_from_spec(spec)
sys.modules["d1_prompt"] = P  # dataclasses look up the module by name
spec.loader.exec_module(P)

config = json.load(open(f"{model_dir}/config.json"))
temps = config["temperatures"]
raw = Tokenizer.from_file(f"{model_dir}/tokenizer.json")


class Tok:
    """The parts of a transformers tokenizer that prompt.encode() uses."""

    bos_token_id = config["bos_token_id"]

    def __call__(self, text, add_special_tokens=False):
        return {"input_ids": raw.encode(text, add_special_tokens=add_special_tokens).ids}

    def convert_tokens_to_ids(self, token):
        return raw.token_to_id(token)


tok = Tok()
so = ort.SessionOptions()
so.log_severity_level = 3
session = ort.InferenceSession(f"{model_dir}/onnx/{graph}.onnx", so, providers=["CPUExecutionProvider"])
MAX_LEN = 512  # The extension uses 512 for each row.

out = []
for case in json.load(open(cases_path)):
    q = P.as_question(case["question"])
    ids, markers = P.encode(tok, case["state"], q, MAX_LEN, None, False)
    logits = session.run(None, {
        "input_ids": np.array([ids], np.int64),
        "attention_mask": np.ones((1, len(ids)), np.int64),
        "prefix_len": np.zeros(1, np.int64),
        "marker_pos": np.array([markers], np.int64),
        "marker_mask": np.ones((1, len(markers)), np.int64),
        "qtype": np.array([P.QTYPES[q.type]], np.int64),
    })[0][0][: q.options].astype(np.float64)
    z = logits / temps.get(P.temperature_key(q), temps.get(q.type, 1.0))
    p = np.exp(z - z.max())
    p = (p / p.sum()).tolist()
    if q.type == "noul":
        p = p[::-1]
    out.append({**case, "ids": ids, "markers": markers, "probabilities": p})
    print(f"{q.type:6} {[round(x, 4) for x in p]}  {case['state'][:60]!r}")

json.dump(out, open(out_path, "w"), ensure_ascii=False, indent=1)
print("wrote", out_path)
