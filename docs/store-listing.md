# Chrome Web Store listing

This document gives the text and the answers for the Chrome Web Store listing. Copy them into the [developer dashboard](https://chrome.google.com/webstore/devconsole) when you publish a release.

**Live listing:** [Lull: a calmer feed for X](https://chromewebstore.google.com/detail/lull-a-calmer-feed-for-x/mahdkdhhaigknglhcdghagjgchcmmjdb)

## Package

1. Build the package:

   ```bash
   npm run zip
   ```

2. Upload `.output/x-feed-filter-<version>-chrome.zip` (about 7 MB).

## Store listing

**Name:** Lull: a calmer feed for X

**Summary** (132 characters or less):

> Describe the posts you do not want to see on X. A small AI model on your device filters them out. No servers, no account.

**Category:** Social Networking

**Language:** English

**Description:**

> Lull makes your X feed calmer. Describe the posts that you do not want to see, in plain language. A small AI model on your computer checks each post and blurs the posts that match.
>
> FILTERS
> • Built-in filters: negativity and rage bait, engagement bait, doomposting, politics, crypto shilling, low-effort AI hype, and dunking.
> • Your own filters: type a description, for example "posts about layoffs".
> • Muted words, an allowlist of accounts, and promoted posts.
> • Text in images: Lull also reads the text in screenshots.
>
> YOU STAY IN CONTROL
> • Blur or hide filtered posts. A blurred post shows the reason and a Show button.
> • "Not a match" makes a filter less strict.
> • A strictness slider and a daily summary.
>
> PRIVATE BY DESIGN
> • The AI model runs on your device (WebGPU, or the processor). Posts do not leave your computer.
> • No server, no account, no analytics.
> • Lull downloads the model one time from Hugging Face (about 250 MB on most Macs).
>
> Lull is free and open source: https://github.com/silentvoice/x-feed-filter
>
> Lull is not affiliated with, endorsed by, or sponsored by X Corp.

**Images:**

| Field | File |
|---|---|
| Icon (128 × 128) | `public/icon/128.png` |
| Screenshots (1280 × 800) | `store/screenshots/1-feed.png` to `4-welcome.png` |
| Small promotional tile (440 × 280) | `store/promo-small.png` |
| Marquee promotional tile (1400 × 560) | `store/promo-marquee.png` |

To make the images again, run `npm run build && npm run store:assets`. The feed in the screenshots (`store/demo-feed.html`) has only fictional posts.

**Website:** https://silentvoice.github.io/x-feed-filter/

**Support:** https://github.com/silentvoice/x-feed-filter/issues

## Privacy practices

**Single purpose:**

> Lull filters posts on x.com. It checks each post against the filters that the user sets, with an AI model that runs on the user's device, and blurs or hides the posts that match.

**Permission justifications:**

| Permission | Justification |
|---|---|
| `storage` | Store filters, custom rules, muted words, and the account allowlist in Chrome sync storage. Keep model status and daily counts locally. Also keep the last 30 filtered-post snippets and up to 1,000 evaluation posts locally. Evaluation storage is off by default. |
| `offscreen` | Run the bundled on-device AI and OCR runtimes in an offscreen document with WebGPU and browser image decoding. The service worker handles messages and settings. |
| Host permission `*://x.com/*`, `*://twitter.com/*` | Read the posts on the page and blur or hide the posts that match the user's filters. |

**Remote code:** No. All code, including the WebAssembly runtime (ONNX Runtime Web), is in the package. The extension downloads model weights (data files) from Hugging Face. The weights are not code.

**Data usage.** Select **Website content** and **Personally identifiable information**. The extension reads post text, images, and author handles on the device. Its allowlist also stores account handles. It does not upload post content.

Select all three certifications:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** https://silentvoice.github.io/x-feed-filter/privacy.html

## Test instructions

The reviewer needs an X account. Lull requires no separate account. Leave the username and password fields empty.

**Additional instructions** (500 characters or fewer):

> Lull requires no account. On the welcome page, click "Download and start" (~251 MB from Hugging Face; WebGPU recommended). Open https://x.com/home signed into a reviewer-owned X account, then refresh it. Defaults blur matching posts and show a reason; "Show" reveals a post and "Not a match" adjusts the filter. The toolbar popup shows counts; "Add your own filter" opens settings for custom rules, muted words, an allowlist, and Blur/Hide. Processing is on-device.

## Before you submit

1. Increase the version in `package.json`. Add the changes to `CHANGELOG.md`.
2. Run `npm run check` and `npm run e2e`.
3. Load the package from `npm run zip` in Chrome. Test it on x.com.
4. Make sure that `docs/privacy.md` and `site/privacy.html` agree with the code.
