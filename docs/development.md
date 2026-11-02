# Development

This document tells you how to set up, build, test, and debug the extension.

## Requirements

- Node.js 22 or later. The repository has an `.nvmrc` file.
- npm 10 or later
- Google Chrome 124 or later

## Set up the project

1. Clone the repository:

   ```bash
   git clone https://github.com/silentvoice/x-feed-filter.git
   ```

2. Go to the project folder:

   ```bash
   cd x-feed-filter
   ```

3. Install the dependencies:

   ```bash
   npm install
   ```

## Run the extension in development mode

1. Start the development server:

   ```bash
   npm run dev
   ```

2. WXT opens a new Chrome window with the extension installed.
3. Go to [x.com](https://x.com) in that window.
4. Change a file. WXT reloads the extension automatically.

> [!NOTE]
> The development Chrome window uses a new profile. You must log in to X in that window.

## Commands

| Command | Action |
|---|---|
| `npm run dev` | Start the development server with automatic reload |
| `npm run build` | Build the production extension into `.output/chrome-mv3` |
| `npm run zip` | Build a `.zip` file for the Chrome Web Store |
| `npm run lint` | Check formatting and lint rules with Biome |
| `npm run lint:fix` | Correct formatting and lint problems automatically |
| `npm run typecheck` | Check the TypeScript types |
| `npm test` | Run the unit tests once |
| `npm run test:watch` | Run the unit tests when a file changes |
| `npm run check` | Run lint, the type check, and the tests. CI runs this command. |
| `npm run bench` | Start the d1 benchmark page on `http://localhost:5199` |
| `npm run parity` | Compare the d1 TypeScript port with the Python reference |
| `npm run e2e` | Run the end-to-end tests in Chromium. Run `npm run build` first. |

## Project structure

```
src/
  entrypoints/
    background.ts       Service worker: rules, cache, model routing
    content/            Content script for x.com: find, blur, and hide posts
    offscreen/          Offscreen document: runs the model with WebGPU
    popup/              Toolbar popup (React)
    options/            Settings page (React)
  components/           Shared React components
  lib/
    classifier/         ClassifierBackend interface and backends
      d1/               Liquid AI d1 prompt port and ONNX Runtime backend
    filters/            Built-in filters and the verdict logic
    x-dom/              X selectors and post extraction
    settings.ts         Settings schema and defaults
    storage.ts          Read and write settings
    messaging.ts        Message types between components
    verdict-cache.ts    Verdict cache
bench/                  d1 benchmark page (Vite)
scripts/d1-parity/      d1 parity cases, Python reference, and parity test
docs/                   Documentation (ASD-STE100)
```

## Debug the extension

### Content script

1. Open x.com.
2. Open Chrome DevTools.
3. Open the **Console** tab. Messages from the extension start with `[x-feed-filter]`.

### Background service worker

1. Open `chrome://extensions`.
2. Find **X Feed Filter**.
3. Click **service worker**.

### Offscreen document

1. Open `chrome://inspect/#other`.
2. Find `offscreen.html`.
3. Click **inspect**.

## Test the d1 model

The d1 tests need the model files on your computer. They are not in the repository.

### Download the model files

1. Make a folder for the model, for example `models/d1`. Git ignores the `models/` folder.
2. Download these files from [onnx-community/d1-omni-600M-ONNX](https://huggingface.co/onnx-community/d1-omni-600M-ONNX) into the folder. Keep the `onnx/` subfolder.
   - `tokenizer.json`, `tokenizer_config.json`, `config.json`
   - `onnx/model_q4.onnx`, `onnx/model_q4.onnx_data`
   - `onnx/model_quantized.onnx`, `onnx/model_quantized.onnx_data`

### Run the parity test

The parity test compares the TypeScript port with `scripts/d1-parity/expected-q8.json` and `expected-q4.json`.

1. Run the test:

   ```bash
   D1_MODEL_DIR=models/d1 npm run parity
   ```

2. Make sure that all tests pass. The largest difference must be less than 0.01.

### Make new reference values

Do this procedure if you change `scripts/d1-parity/cases.json`.

1. Download `prompt.py` from [LiquidAI/d1-omni-600M](https://huggingface.co/LiquidAI/d1-omni-600M/blob/main/prompt.py).
2. Install the Python packages `onnxruntime`, `numpy`, and `tokenizers`.
3. Go to the `scripts/d1-parity` folder.
4. Make the 8-bit reference:

   ```bash
   python -I reference.py <path to prompt.py> <model folder> cases.json expected-q8.json
   ```

5. Make the 4-bit reference:

   ```bash
   python -I reference.py <path to prompt.py> <model folder> cases.json expected-q4.json model_q4
   ```

### Run the benchmark

1. Start the benchmark server:

   ```bash
   D1_MODEL_DIR=models/d1 npm run bench
   ```

2. Open `http://localhost:5199` in Chrome.
3. Click a **Run** button.
4. Keep the page in view while the benchmark runs. Chrome slows down pages that are not in view.

## Run the end-to-end tests

The end-to-end tests load the built extension into Chromium. They use a copy of the X timeline markup (`e2e/fixtures/x-home.html`) at `https://x.com/home`. They check the full pipeline: post detection, the d1 model on WebGPU, blur, **Show**, and hide.

> [!NOTE]
> CI does not run these tests, because CI computers do not have WebGPU.

1. Install the Playwright browser one time:

   ```bash
   npx playwright install chromium
   ```

2. Build the extension:

   ```bash
   npm run build
   ```

3. Run the tests. Set `XFF_PROFILE_DIR` to keep the downloaded model between runs:

   ```bash
   XFF_PROFILE_DIR=.cache/e2e-profile npm run e2e
   ```

The first run downloads the model (about 245 MB). A Chromium window opens during the test.

## Change X selectors

X changes its HTML often. If the extension stops finding posts, do these steps:

1. Open x.com and inspect a post with DevTools.
2. Find the new `data-testid` value or structure.
3. Update `src/lib/x-dom/selectors.ts`.
4. Update the test HTML in `src/lib/x-dom/extract.test.ts`.
5. Run `npm test`.

## Release

1. Update the version in `package.json`.
2. Add the changes to `CHANGELOG.md`.
3. Make a commit with the message `chore: release vX.Y.Z`.
4. Make a tag `vX.Y.Z` and push it.
5. The release workflow builds the `.zip` file and attaches it to a GitHub release.
6. Upload the `.zip` file in the Chrome Web Store developer dashboard.
