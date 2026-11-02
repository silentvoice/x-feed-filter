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
    filters/            Built-in filters and the verdict logic
    x-dom/              X selectors and post extraction
    settings.ts         Settings schema and defaults
    storage.ts          Read and write settings
    messaging.ts        Message types between components
    verdict-cache.ts    Verdict cache
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
