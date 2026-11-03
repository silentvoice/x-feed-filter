# Roadmap

This document gives the milestones of the project and their status.

| Status | Meaning |
|---|---|
| ✅ | Complete |
| 🚧 | In progress |
| ⬜ | Not started |

## M0: Prove d1 in the browser ✅

- ✅ Load `d1-omni-600M-ONNX` with `onnxruntime-web/webgpu` on a benchmark page (`npm run bench`).
- ✅ Port the d1 prompt encoding and the answer decoding from Python to TypeScript.
- ✅ Compare the TypeScript output with the Python output. Token IDs are the same. The largest probability difference is 0.00001.
- ✅ Measure the latency on Apple M5 Max: 49 ms for each post with 5 filters (4-bit, WebGPU).
- ✅ Compare the 8-bit and the 4-bit text graphs. The 4-bit graph is 12 times faster.
- ✅ Decide: d1-omni-600M (4-bit) is the default. See [model selection](model-selection.md#measurements-milestone-m0).
- ⬜ Measure the latency on Apple M1 to M4.

## M1: Extension skeleton ✅

- ✅ WXT, TypeScript, React, and Tailwind project
- ✅ Content script that finds posts and handles the virtualized timeline
- ✅ Blur with reason and **Show** button, or hide
- ✅ Pending blur until the verdict arrives
- ✅ Muted words, allowlist, and promoted posts
- ✅ Popup and settings page
- ✅ Unit tests, CI, and documentation

## M2: On-device model ✅

- ✅ d1 backend in the offscreen document
- ✅ Weights in Cache Storage
- ✅ Test the full extension on x.com (logged in, real timeline)
- ✅ End-to-end tests in Chromium
- ✅ Model download with progress in the popup
- ✅ Batches of (post, filter) pairs
- ✅ Posts near the viewport first (`IntersectionObserver`)
- ✅ Automatic backend selection: d1 with WebGPU, else the zero-shot fallback

## M3: Quality ✅

- ✅ Evaluation set of 250 labeled posts (`eval/posts.json`) and `npm run eval`
- ✅ Tuned descriptions and a calibration for each built-in filter. See [evaluation](evaluation.md).
- ✅ "Not a match" button on filtered posts that adjusts the threshold of each filter
- ✅ "Recently filtered" list with reasons, and daily statistics
- ✅ Evaluate with your own posts: opt-in saving, a label page, and `npm run eval -- --posts` (local only, not in the repository). See [evaluation](evaluation.md#evaluate-with-your-own-posts).

## M4: Images ✅

- ✅ Image alt text in the model input
- ✅ On-device text recognition for screenshots ([Indra OCR](model-selection.md#text-recognition-indra-ocr), CPU, about 6 MB)
- ⬜ Image model for photos without text (research: Qwen3.5-0.8B vision has no verified browser export yet)

## M5: Chrome Web Store ✅

- ✅ First-run page that explains the download size and starts the download
- ✅ Posts stay visible while the model downloads. They do not wait for it.
- ✅ Error states: "Try again" for a model that does not start, and automatic retries every 30 seconds
- ✅ Store listing, screenshots, promotional tiles, and privacy disclosures. See [store listing](store-listing.md).
- ✅ Privacy policy page on the website
- ✅ [First public release in the Chrome Web Store](https://chromewebstore.google.com/detail/lull-a-calmer-feed-for-x/mahdkdhhaigknglhcdghagjgchcmmjdb)
