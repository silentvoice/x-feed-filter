# Architecture

This document gives the components of the extension and the data flow between them.

## Components

```mermaid
flowchart TB
  subgraph tab[x.com tab]
    CS[Content script<br>src/entrypoints/content]
  end
  subgraph ext[Extension]
    BG[Background service worker<br>src/entrypoints/background.ts]
    OD[Offscreen document<br>src/entrypoints/offscreen]
    UI[Popup and settings page<br>src/entrypoints/popup, options]
    ST[(chrome.storage.sync<br>settings)]
  end
  HF[(Hugging Face<br>model weights, first use only)]

  CS <-->|ClassifyRequest / verdicts| BG
  BG <-->|OffscreenClassifyRequest / scores| OD
  UI <--> ST
  BG --> ST
  CS --> ST
  OD -.->|download once| HF
```

| Component | Responsibility |
|---|---|
| Content script | Finds posts on x.com. Reads the text. Blurs or hides posts. |
| Background service worker | Applies rules and the cache. Sends the other posts to the model. Converts scores to verdicts. |
| Offscreen document | Runs the model with ONNX Runtime Web on WebGPU. Manifest V3 service workers cannot use WebGPU. Thus, the model runs in an offscreen document. |
| Popup and settings page | Show and change the settings. |
| `chrome.storage.sync` | Keeps the settings. Chrome syncs them between the user's computers. |

## Data flow for one post

1. X adds a post to the page. A `MutationObserver` in the content script sees the change.
2. The content script reads the post with `extractPost()` (`src/lib/x-dom/extract.ts`).
3. If "pending blur" is on, the content script blurs the post.
4. The content script collects up to 8 posts. Then it sends them to the background in one `ClassifyRequest`.
5. The background applies `applyRules()`: the allowlist, promoted posts, and muted words.
6. The background looks for each remaining post in the verdict cache.
7. The background sends the remaining posts and the active filters to the offscreen document.
8. If **Check images** is on, the offscreen document reads the text in the post images with Indra OCR (`src/lib/classifier/indra/`) and adds it to the post. See [Text in images](#text-in-images).
9. The model gives one probability for each (post, filter) pair.
10. `verdictFromScores()` compares each probability with the threshold. The threshold comes from the strictness setting.
10. The content script removes the pending blur. Then it shows, blurs, or hides the post.

## Design decisions

### Fail open

If an error occurs, the extension shows the post. A broken filter must not hide the feed.

### One module for X selectors

X changes its HTML often. All selectors are in `src/lib/x-dom/selectors.ts`. When X changes its HTML, update that file only. Use `data-testid` attributes. They change less often than class names.

### Virtualized timeline

X removes posts from the page when they go out of view. X also uses the same `<article>` element again for a different post. Thus, the content script keeps the post ID in `data-xff-id`. It compares the ID each time. It does not use a "seen" flag.

### Pluggable models

All models use the `ClassifierBackend` interface (`src/lib/classifier/backend.ts`). The background selects a backend from the settings. To add a model, add a class that implements the interface.

### Model rows

The d1 model answers one question about one text in each row. Thus, the backend makes one row for each (post, filter) pair. The rows go to the model in batches of up to 8192 tokens. Rows of similar length go together, to reduce padding.

Each row is about 75 tokens: the post text, the filter question, and two answer options. A row is limited to 512 tokens. This limit truncates only very long posts.

### Model selection

The "Automatic" setting selects the model in the offscreen document:

1. If WebGPU is available, the offscreen document loads d1-omni-600M (4-bit).
2. If WebGPU is not available, or if d1 does not load, it loads ModernBERT zero-shot (8-bit) on the CPU.

The offscreen document sends the model status (loading, download progress, ready, or error) to the background. The background keeps it in `chrome.storage.session`. The popup shows it. When the popup opens, it asks the background to start the model.

### Text in images

Many posts on X are screenshots of text. The offscreen document reads the text of up to two images for each post with Indra OCR on the CPU (`ImageTextReader`, `src/lib/classifier/image-text.ts`):

- It downloads each image from `pbs.twimg.com` and decodes it with `createImageBitmap()`.
- It finds the text lines (`det.onnx`) and reads each line (`rec.onnx`).
- It keeps text only if the mean confidence is 0.6 or more and the text has 3 or more words. Photos without text give no text.
- It keeps the text of the last 500 images in memory. One image in different sizes uses one entry.
- If an image takes more than 5 seconds or fails, the post goes to the model without image text.

The model reads the text as `Text in images: …` after the post text.

### Posts near the viewport first

The content script blurs each new post at once. It sends a post to the model only when the post comes within one screen of the viewport (`IntersectionObserver`). Thus, the posts that the user can see come first.

### Threshold

One strictness value (0 to 1) sets the base threshold for all filters:

```
threshold = 0.85 − 0.6 × strictness
```

Strictness 0 filters a post only when the probability is 0.85 or more. The default strictness (0.5) filters a post when the probability is 0.55 or more. Strictness 1 filters a post when the probability is 0.25 or more.

Then two values change the threshold of each filter:

- **Calibration.** Each built-in filter has a calibration value for each model, from the evaluation set. For example, d1 is cautious about crypto posts, so the crypto filter has a calibration of −0.30 with d1. See [evaluation](evaluation.md).
- **Feedback.** Each "Not a match" click raises the threshold of the filters that matched that post by 0.05, up to 0.30. The settings page shows these changes and can reset them.

The final threshold stays between 0.05 and 0.97.

### Custom filters

The model works better with questions than with short descriptions. Thus, the extension changes a description such as "posts about layoffs" to "Does this post match this description: posts about layoffs?". A filter that ends with "?" does not change.

### Cache

The cache key contains the post ID and a hash of the active filters and the strictness. When the settings change, the extension does not use old verdicts.

## Permissions

| Permission | Reason |
|---|---|
| `storage` | Keep the settings. |
| `offscreen` | Run the model in an offscreen document with WebGPU. |
| `wasm-unsafe-eval` (content security policy) | Compile the ONNX Runtime WebAssembly file, which is in the extension package. |
| `x.com`, `twitter.com` hosts | Run the content script on X. |

The extension does not request other permissions. Each new permission needs a reason in this table.
