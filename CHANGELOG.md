# Changelog

All important changes to this project are in this file.

The format uses [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

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

[Unreleased]: https://github.com/silentvoice/x-feed-filter/commits/main
