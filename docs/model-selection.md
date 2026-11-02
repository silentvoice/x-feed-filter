# Model selection

This document gives the models that we compared, the model that we selected, and the reasons.

Research date: 2026-11-01.

## Requirements

The model must:

- Give a probability (0 to 1) that a post matches a filter description.
- Accept filter descriptions that the user writes in plain language.
- Run in Chrome on the user's device, with WebGPU or WebAssembly.
- Be small. The target is a download of less than 500 MB.
- Be fast. The target is less than 100 ms for each post on an Apple M1 or later.
- Have a license that permits a free, open-source extension in the Chrome Web Store.

The language is English only for the first release.

## Decision

| Role | Model | Download | License |
|---|---|---|---|
| Default (text) | [`onnx-community/d1-omni-600M-ONNX`](https://huggingface.co/onnx-community/d1-omni-600M-ONNX), 4-bit text graph (`model_q4`) | about 245 MB | LFM Open License v1.0 |
| Fallback (text) | [`MoritzLaurer/ModernBERT-base-zeroshot-v2.0`](https://huggingface.co/MoritzLaurer/ModernBERT-base-zeroshot-v2.0), q4f16 | about 140 MB | Apache-2.0 |
| Images (optional, later) | [`onnx-community/Qwen3.5-0.8B-ONNX`](https://huggingface.co/onnx-community/Qwen3.5-0.8B-ONNX) with vision | about 650 MB | Apache-2.0 |

### Why d1-omni-600M

The Liquid AI d1 models are decision models. They are not chat models. They do not generate text. They read a post and a set of named questions. Then they give a calibrated probability for each answer in one forward pass. This is exactly the task of this extension: each filter is a yes/no question about a post.

- **Size.** The 4-bit text graph is about 245 MB. The 8-bit graph is about 406 MB.
- **Accuracy.** Liquid AI reports 95.8 on Civil Comments (moderation) and 86.1 on MASSIVE intent. These numbers are from the vendor. We must confirm them on our own data.
- **Speed.** It does not decode tokens. We can put many (post, filter) pairs into one batch.
- **Calibration.** The model applies a temperature for each question type to the text answers. Thus, one strictness slider can work for all filters.

### Why not d1-2B

The d1-2B model is more accurate, but the WebGPU download is about 1.95 GB. That is too large for a browser extension. We can add it later as an optional "high accuracy" setting.

### Why a fallback

Some computers do not have WebGPU. Some users do not want a 400 MB download. Also, the d1 license does not permit commercial use by organizations with an annual revenue of USD 10 million or more. ModernBERT zero-shot is small, uses Apache-2.0, and has a standard Transformers.js pipeline (`zero-shot-classification` with `multi_label`).

### Images

The vision part of d1-omni-600M is weak (ImajevBench 21.7) and is not calibrated. Thus, we do not use it for images. Many images on X are screenshots of text, so the extension reads the text in images instead:

1. The model input contains the image alt text (`Images: …`).
2. [Indra OCR](https://huggingface.co/datalab-to/indra-ocr) reads the text in the images on the CPU. The model input contains it (`Text in images: …`).
3. **Later (research):** an image model for photos without text. Qwen3.5-0.8B with vision has only community browser exports today, and they are not verified.

#### Text recognition: Indra OCR

Date: 2026-11-02. We compared Tesseract (tesseract.js 7) and Indra OCR v1.1.0 by Datalab.

| | Tesseract (tesseract.js 7) | Indra OCR (2 of its models) |
|---|---|---|
| Size | 12 MB of WebAssembly in the package, and 3 MB of language data | 5.6 MB of ONNX models (downloaded). It uses the ONNX Runtime that the extension already has. |
| Speed | 5.5 s for each page (Datalab benchmark, 4 vCPUs) | 0.21 s for each page (same benchmark). 100 ms for a post screenshot in Node, one thread, Apple M5 Max. |
| Text accuracy (OmniParseBench) | 19.3 | 46.7 |
| License | Apache-2.0 | Code: Apache-2.0. Weights: modified OpenRAIL-M (see [licenses](#licenses)). |

We use two Indra models: `det.onnx` (line detection, 0.4 MB) and `rec.onnx` (Latin-script recognition, 5 MB). `src/lib/classifier/indra/` is a TypeScript port of the Python steps: grayscale, resize, line decode, line crop, and greedy CTC decode. We do not use the orientation, script, reading-order, and language models: posts on X are upright, and the extension reads English. The parity test (`scripts/indra-parity/`) compares the port with the Python package on five synthetic images: the same line boxes (±1.5 pixels), the same text, and the same confidence (±0.02).

## Measurements (milestone M0)

Date: 2026-11-01. Computer: Apple M5 Max (40 GPU cores), Chrome 152, ONNX Runtime Web 1.31.1. The benchmark runs in a Web Worker. Each row is one (post, filter) pair of about 75 tokens.

### Correctness

The TypeScript port gives the same result as the Python original (`prompt.py`) and ONNX Runtime for Python on the same graph.

| Check | 8-bit | 4-bit |
|---|---|---|
| Token IDs and marker positions (12 cases) | Same | Same |
| Probabilities, WebAssembly vs Python CPU (max difference) | 0.00000 | 0.00000 |
| Probabilities, WebGPU vs Python CPU (max difference) | 0.00001 | 0.00001 |

### Speed

| Batch | 8-bit, WebGPU | 4-bit, WebGPU | 8-bit, WebAssembly (1 thread) |
|---|---|---|---|
| 1 post × 1 filter | 167 ms | 20 ms | 1102 ms |
| 1 post × 5 filters | 616 ms | 55 ms | 4749 ms |
| 8 posts × 5 filters | 4641 ms | 392 ms | not measured |
| Time for each post (5 filters) | 580 ms | **49 ms** | about 4750 ms |

The 4-bit graph is about 12 times faster on WebGPU. ONNX Runtime has fast WebGPU kernels for 4-bit `MatMulNBits`, but not for 8-bit. The model loads in less than 1 second from the cache.

### 4-bit compared with 8-bit

| Case type | Largest difference |
|---|---|
| Filter questions on typical posts (7 cases) | 0.050 |
| All 12 cases, including edge cases | 0.561 |

The large differences occur only on two edge cases: a post that contains special token syntax, and a question about a post with mixed languages. On these cases, the 8-bit answer was also uncertain.

**Decision:** use the 4-bit graph as the default. The milestone M3 evaluation set must confirm that the accuracy is sufficient on real posts.

### Sample scores (4-bit, WebGPU)

| Post | Negativity | Engagement bait | Politics | Crypto |
|---|---|---|---|---|
| "Anyone who still uses tabs is a clown and should be fired." | **0.89** | 0.17 | 0.11 | 0.01 |
| "Like and repost if you agree! Follow me for more tips." | 0.01 | **0.99** | 0.01 | 0.03 |
| "$PEPE2 airdrop is LIVE. Connect your wallet now." | 0.03 | 0.22 | 0.02 | **0.94** |
| "The Senate passed the infrastructure bill 68-32." | 0.02 | 0.15 | 0.42 | 0.00 |
| "My tomatoes finally came in this week." | 0.00 | 0.17 | 0.00 | 0.01 |

The politics filter gives only 0.42 for a clear political post. Milestone M3 must tune the description of this filter.

> [!NOTE]
> A base Apple M1 GPU is about 5 to 8 times slower than an M5 Max. We expect about 250 to 400 ms for each post with 5 filters. This must be measured.

## Candidates

| Model | Download (approx.) | Images | Notes |
|---|---|---|---|
| Liquid AI d1-omni-600M | 245 MB (q4 text) | Weak | Decision model, calibrated yes/no. **Selected.** |
| Liquid AI d1-2B | 1.95 GB | Yes | More accurate. Too large. |
| ModernBERT-base zero-shot v2.0 | 140 MB | No | NLI pipeline in Transformers.js. **Fallback.** |
| ModernBERT-large zero-shot v2.0 | 297 MB | No | More accurate than base. |
| DeBERTa-v3-large zero-shot v2.0 | 487 MB | No | Accurate, but slow on WebGPU. |
| Qwen3-0.6B | 570 MB | No | Generative. Yes/no token probabilities are not calibrated. |
| Qwen3.5-0.8B | 650 MB | Yes | Generative, multimodal. **Optional image model.** |
| LFM2.5-VL-450M | 675 MB | Yes | Generative. LFM license. |
| Gemma 3 270M | 273 MB | No | Too weak for zero-shot judgments. |
| Gemma 3n / Gemma 4 E2B | about 3 GB | Yes | Too large. |
| SmolVLM 256M / 500M | 190 / 360 MB | Yes | Good for captions. Weak for judgments. |
| EmbeddingGemma 2 | 157 MB text, 98 MB vision | Yes | Similarity only. Possible fast pre-filter. |
| Chrome Prompt API (Gemini Nano) | 0 MB for us | Yes | Needs 22 GB free disk and a strong GPU. Slower. |

## How to run d1 in the browser

There is no Transformers.js pipeline for d1 models. The integration is:

1. Load the tokenizer with `@huggingface/tokenizers`.
2. Build the prompt with the d1 special tokens and `<|mask|>` markers (`src/lib/classifier/d1/prompt.ts`). This is a port of `prompt.py` from the model repository.
3. Run the ONNX graph with `onnxruntime-web/webgpu` (`src/lib/classifier/d1/d1-backend.ts`). The WebAssembly file is in the extension package, because Manifest V3 does not permit remote code.
4. Read the logits at the marker positions. Divide them by the calibration temperature from `config.json`. Then apply softmax.

Download the weights from Hugging Face on first use. Store them in Cache Storage. Do not bundle the weights in the extension package.

## Licenses

| Model | License | Effect on this project |
|---|---|---|
| d1-omni-600M | [LFM Open License v1.0](https://huggingface.co/LiquidAI/d1-2B/blob/main/LICENSE) | Free use, including commercial use, for organizations with less than USD 10 million annual revenue. We must show the license and the attribution notices. We do not redistribute the weights. The extension downloads them from Hugging Face. |
| ModernBERT zero-shot | Apache-2.0 | No restrictions for this project. |
| Indra OCR | Code: Apache-2.0. Weights: [modified OpenRAIL-M](https://huggingface.co/datalab-to/indra-ocr/blob/v1.1.0/LICENSE) | Free for personal use and research. Organizations with more than USD 20 million in revenue or funding, or that compete with Datalab, can use it only for personal use or research. The use restrictions in Attachment A apply to all users. We must give attribution and a copy of the license (see [NOTICE](../NOTICE)). We do not redistribute the weights. The extension downloads them from Hugging Face. |
| Qwen3.5-0.8B | Apache-2.0 | No restrictions for this project. |

> [!CAUTION]
> If an organization with an annual revenue of USD 10 million or more uses or distributes this extension commercially, the d1 license does not apply to it. That organization must use the fallback model or get a license from Liquid AI.

## Open questions

- The latency on Apple M1 to M4.
- The accuracy of the 4-bit graph on a labeled set of real posts (milestone M3).
- The best default threshold for each built-in filter (milestone M3).
- The accuracy of `kev-0.6b` from [open-jev](https://github.com/nico-martin/open-jev) (MIT) on the same evaluation set.

## Sources

- [LiquidAI/d1-omni-600M](https://huggingface.co/LiquidAI/d1-omni-600M)
- [onnx-community/d1-omni-600M-ONNX](https://huggingface.co/onnx-community/d1-omni-600M-ONNX)
- [LiquidAI/d1-2B](https://huggingface.co/LiquidAI/d1-2B) and [d1-2B-ONNX](https://huggingface.co/LiquidAI/d1-2B-ONNX)
- [MoritzLaurer/ModernBERT-large-zeroshot-v2.0](https://huggingface.co/MoritzLaurer/ModernBERT-large-zeroshot-v2.0)
- [onnx-community/Qwen3.5-0.8B-ONNX](https://huggingface.co/onnx-community/Qwen3.5-0.8B-ONNX)
- [google/embeddinggemma-2](https://huggingface.co/google/embeddinggemma-2)
- [Chrome Prompt API](https://developer.chrome.com/docs/ai/prompt-api)
- [Transformers.js v4](https://huggingface.co/blog/transformersjs-v4)
