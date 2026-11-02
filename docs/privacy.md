# Privacy

This document gives the data that the extension uses, where the data goes, and what the extension stores.

## Summary

- The extension does not send the content of posts to a server.
- The extension does not collect analytics or telemetry.
- The extension does not need an account.

## Data that the extension reads

| Data | Purpose | Where it goes |
|---|---|---|
| Text, author handle, and image descriptions of posts on x.com | Check the post against your filters | Stays in your browser. The on-device model reads it. |
| Your settings and filters | Apply your filters | `chrome.storage.sync`. Chrome syncs it to your other computers if Chrome sync is on. |

## Network requests

The extension makes one type of network request: it downloads the model weights from Hugging Face (`huggingface.co`) on first use. The request does not contain your data. The extension keeps the weights in the browser Cache Storage.

## Data that the extension stores

| Data | Location | How to delete it |
|---|---|---|
| Settings and filters | `chrome.storage.sync` | Remove the extension. |
| Model weights | Cache Storage of the extension | Remove the extension. |
| Verdicts | Memory only | Close Chrome. |

## Chrome Web Store disclosure

The extension handles "website content" only on x.com and twitter.com. It uses this data only for its single purpose: to filter posts. It does not sell or transfer the data. It does not use the data for credit checks or for advertising.
