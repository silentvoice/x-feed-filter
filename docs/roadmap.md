# Roadmap

This document gives the milestones of the project and their status.

| Status | Meaning |
|---|---|
| ✅ | Complete |
| 🚧 | In progress |
| ⬜ | Not started |

## M0: Prove d1 in the browser 🚧

This milestone has the highest risk. Do it first.

- ⬜ Load `d1-omni-600M-ONNX` (8-bit text graph) with `onnxruntime-web/webgpu` on a test page.
- ⬜ Port the d1 prompt encoding and the answer decoding from Python to TypeScript.
- ⬜ Compare the TypeScript output with the Python output on 20 examples. The difference must be less than 0.01.
- ⬜ Measure the latency on Apple M1 to M4 for 8 posts and 5 filters.
- ⬜ Compare the 8-bit and the 4-bit text graphs.
- ⬜ Decide: d1-omni-600M is the default, or ModernBERT zero-shot is the default.

## M1: Extension skeleton ✅

- ✅ WXT, TypeScript, React, and Tailwind project
- ✅ Content script that finds posts and handles the virtualized timeline
- ✅ Blur with reason and **Show** button, or hide
- ✅ Pending blur until the verdict arrives
- ✅ Muted words, allowlist, and promoted posts
- ✅ Popup and settings page
- ✅ Unit tests, CI, and documentation

## M2: On-device model ⬜

- ⬜ d1 backend in the offscreen document
- ⬜ Model download with progress in the popup
- ⬜ Weights in Cache Storage
- ⬜ Batches of (post, filter) pairs
- ⬜ Posts near the viewport first (`IntersectionObserver`)
- ⬜ Automatic backend selection: d1 with WebGPU, else the zero-shot fallback

## M3: Quality ⬜

- ⬜ Evaluation set of about 200 labeled posts
- ⬜ Tuned descriptions and default thresholds for the built-in filters
- ⬜ "Wrong result" buttons on posts that adjust the threshold of each filter
- ⬜ "Recently filtered" list with reasons, and daily statistics

## M4: Images ⬜

- ⬜ Image alt text in the model input
- ⬜ On-device text recognition for screenshots
- ⬜ Optional image model (Qwen3.5-0.8B) for posts with images

## M5: Chrome Web Store ⬜

- ⬜ First-run screen that explains the download size
- ⬜ Store listing, screenshots, and privacy disclosures
- ⬜ Performance pass and error states
- ⬜ First public release
