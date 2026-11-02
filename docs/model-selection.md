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
| Default (text) | [`onnx-community/d1-omni-600M-ONNX`](https://huggingface.co/onnx-community/d1-omni-600M-ONNX), 8-bit text graph | about 406 MB | LFM Open License v1.0 |
| Fallback (text) | [`MoritzLaurer/ModernBERT-base-zeroshot-v2.0`](https://huggingface.co/MoritzLaurer/ModernBERT-base-zeroshot-v2.0), q4f16 | about 140 MB | Apache-2.0 |
| Images (optional, later) | [`onnx-community/Qwen3.5-0.8B-ONNX`](https://huggingface.co/onnx-community/Qwen3.5-0.8B-ONNX) with vision | about 650 MB | Apache-2.0 |

### Why d1-omni-600M

The Liquid AI d1 models are decision models. They are not chat models. They do not generate text. They read a post and a set of named questions. Then they give a calibrated probability for each answer in one forward pass. This is exactly the task of this extension: each filter is a yes/no question about a post.

- **Size.** The 8-bit text graph is about 406 MB. The 4-bit graph is about 244 MB, but it is less accurate.
- **Accuracy.** Liquid AI reports 95.8 on Civil Comments (moderation) and 86.1 on MASSIVE intent. These numbers are from the vendor. We must confirm them on our own data.
- **Speed.** It does not decode tokens. We can put many (post, filter) pairs into one batch.
- **Calibration.** The model applies a temperature for each question type to the text answers. Thus, one strictness slider can work for all filters.

### Why not d1-2B

The d1-2B model is more accurate, but the WebGPU download is about 1.95 GB. That is too large for a browser extension. We can add it later as an optional "high accuracy" setting.

### Why a fallback

Some computers do not have WebGPU. Some users do not want a 400 MB download. Also, the d1 license does not permit commercial use by organizations with an annual revenue of USD 10 million or more. ModernBERT zero-shot is small, uses Apache-2.0, and has a standard Transformers.js pipeline (`zero-shot-classification` with `multi_label`).

### Images

The vision part of d1-omni-600M is weak (ImajevBench 21.7) and is not calibrated. Thus, we do not use it for images. The plan for images is:

1. **First release:** add the image alt text to the text that the model reads.
2. **Next:** read the text in screenshots with on-device text recognition. Add that text to the model input.
3. **Optional:** use Qwen3.5-0.8B with vision for posts that have images. Read the probabilities of the "Yes" and "No" tokens. Cache the result for each image URL.

## Candidates

| Model | Download (approx.) | Images | Notes |
|---|---|---|---|
| Liquid AI d1-omni-600M | 406 MB (q8 text) | Weak | Decision model, calibrated yes/no. **Selected.** |
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

1. Use the Transformers.js tokenizer for the model.
2. Build the prompt with the d1 special tokens and `<|mask|>` markers. This is a port of `prompt.py` from the model repository.
3. Run the ONNX graph with `onnxruntime-web/webgpu`. Bundle the WebAssembly files in the extension, because Manifest V3 does not permit remote code.
4. Read the logits at the marker positions. Apply softmax and the calibration temperature from `config.json`.

Download the weights from Hugging Face on first use. Store them in Cache Storage. Do not bundle the weights in the extension package.

## Licenses

| Model | License | Effect on this project |
|---|---|---|
| d1-omni-600M | [LFM Open License v1.0](https://huggingface.co/LiquidAI/d1-2B/blob/main/LICENSE) | Free use, including commercial use, for organizations with less than USD 10 million annual revenue. We must show the license and the attribution notices. We do not redistribute the weights. The extension downloads them from Hugging Face. |
| ModernBERT zero-shot | Apache-2.0 | No restrictions for this project. |
| Qwen3.5-0.8B | Apache-2.0 | No restrictions for this project. |

> [!CAUTION]
> If an organization with an annual revenue of USD 10 million or more uses or distributes this extension commercially, the d1 license does not apply to it. That organization must use the fallback model or get a license from Liquid AI.

## Open questions

These items need measurements in milestone M0:

- The real latency of d1-omni-600M on Apple M1 to M4 with WebGPU, for a batch of 8 posts and 5 filters.
- The accuracy difference between the 8-bit and the 4-bit text graphs on posts from X.
- The best default threshold for each built-in filter.
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
