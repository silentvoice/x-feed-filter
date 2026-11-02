# Changelog

All important changes to this project are in this file.

The format uses [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- New name and icon: Lull.
- GitHub Pages website (`site/`).
- Model status and download progress in the popup. The popup starts the model when it opens.
- Zero-shot fallback model (ModernBERT, CPU) for computers without WebGPU. "Automatic" selects it.
- Posts near the viewport go to the model first.
- Evaluation set of 250 labeled posts and `npm run eval`.
- Tuned wording and a calibration for each built-in filter.
- "Not a match" button on filtered posts. It makes the matched filters less strict.
- Daily counts and a list of recently filtered posts in the popup.
- Content script that finds posts on x.com and handles the virtualized timeline.
- Blur with a reason and a **Show** button, or hide, for filtered posts.
- Pending blur until the extension checks a post.
- Built-in filters, custom filters, a strictness slider, muted words, and an allowlist.
- Popup and settings page.
- `ClassifierBackend` interface and offscreen document for on-device models.
- Documentation in ASD-STE100 Simplified Technical English.
- Liquid AI d1-omni-600M backend: a TypeScript port of the d1 prompt format and ONNX Runtime Web on WebGPU (4-bit, about 49 ms for each post with 5 filters on Apple M5 Max).
- Model download with Cache Storage.
- d1 parity test against the Python reference, and a benchmark page.
- End-to-end tests in Chromium with Playwright (`npm run e2e`).

### Fixed

- A model download that stops on a bad connection now continues from the last byte (up to four attempts).
- The d1 model no longer stops during load on a cross-origin isolated page. d1 now always uses one WebAssembly thread.
- Two model requests at the same time no longer hang. Model runs now go through a queue.
- A quote post without its own text no longer uses the quoted text as its text.

### Changed

- Strictness now maps to thresholds from 0.85 to 0.25 (0.55 by default). On real posts, on-topic scores are often 0.25 to 0.98.

[Unreleased]: https://github.com/silentvoice/x-feed-filter/commits/main
