# Evaluation

This document gives the procedure and the results of the filter evaluation. We use the results to select the wording and the calibration of each built-in filter.

Evaluation date: 2026-11-02.

> [!WARNING]
> The evaluation set is synthetic. We wrote the posts for this test. They are not real posts from X. Real posts are more varied, so the real accuracy can be lower. An evaluation with real posts is on the [roadmap](roadmap.md).

## Evaluation set

The file `eval/posts.json` contains 250 short posts in the style of X. Each post has a label (yes or no) for each filter.

| Filter | Posts that match |
|---|---|
| `negativity` | 27 |
| `doomposting` | 20 |
| `engagement-bait` | 23 |
| `politics` | 20 |
| `crypto-scams` | 19 |
| `ai-hype` | 19 |
| `dunking` | 20 |
| `layoffs` (custom filter) | 21 |
| `ai-topic` (custom filter) | 40 |

The set also contains "hard negatives". These are posts that are near a filter but do not match it. For example:

- A calm news report about an election (matches `politics`, but not `negativity`).
- A serious post about a real risk (does not match `doomposting`).
- A post that asks a real question (does not match `engagement-bait`).

`layoffs` and `ai-topic` are examples of filters that a user types. They are not built-in filters. We use them to measure the wrapper for custom filters (see [Custom filters](#custom-filters)).

The file `eval/variants.json` contains two or more wordings (variants) for each filter.

## Procedure

1. Get the model files (see [Development](development.md#measure-the-filters)).
2. Run the evaluation for one model:

   ```bash
   npm run eval -- d1
   ```

   ```bash
   npm run eval -- zero-shot
   ```

3. Add `--shipped` to measure only the wording that the extension uses. This is faster.

The script runs the model in Chrome, with the same code as the extension. It writes the full results to `eval/results/<model>.json`. Git ignores this folder.

For each filter and each variant, the script gives:

- **AUC.** The area under the ROC curve. This value does not use a threshold. It shows how well the model puts matching posts above other posts. 1.0 is perfect. 0.5 is random.
- **Precision.** Of the posts that the extension filters, the percentage that match.
- **Recall.** Of the posts that match, the percentage that the extension filters.
- **F1.** The harmonic mean of precision and recall.
- **Best threshold.** The threshold that gives the highest F1.

## Results: shipped configuration

These tables show the wording and the calibration that the extension uses, at the default strictness (0.5). At this strictness, the base threshold is 0.55. The calibration of each filter changes this threshold.

### d1-omni-600M (default model, WebGPU)

| Filter | Threshold | AUC | Precision | Recall | F1 |
|---|---|---|---|---|---|
| `negativity` | 0.70 | 0.95 | 90% | 67% | 77% |
| `doomposting` | 0.55 | 0.99 | 77% | 100% | 87% |
| `engagement-bait` | 0.40 | 0.95 | 80% | 70% | 74% |
| `politics` | 0.65 | 1.00 | 95% | 100% | 98% |
| `crypto-scams` | 0.25 | 0.97 | 67% | 84% | 74% |
| `ai-hype` | 0.35 | 0.98 | 68% | 79% | 73% |
| `dunking` | 0.50 | 0.98 | 78% | 90% | 84% |
| `layoffs` | 0.55 | 1.00 | 80% | 95% | 87% |
| `ai-topic` | 0.55 | 0.98 | 94% | 85% | 89% |
| **Mean** | | | | | **83%** |

d1 is the more accurate model (mean F1 83% compared to 79%). It is better at `negativity` and `dunking`. For speed measurements, see [Model selection](model-selection.md).

### ModernBERT zero-shot (fallback model, CPU)

| Filter | Threshold | AUC | Precision | Recall | F1 |
|---|---|---|---|---|---|
| `negativity` | 0.55 | 0.92 | 70% | 52% | 60% |
| `doomposting` | 0.20 | 0.99 | 86% | 95% | 90% |
| `engagement-bait` | 0.20 | 0.95 | 71% | 65% | 68% |
| `politics` | 0.35 | 1.00 | 95% | 100% | 98% |
| `crypto-scams` | 0.10 | 0.95 | 93% | 68% | 79% |
| `ai-hype` | 0.15 | 0.97 | 92% | 58% | 71% |
| `dunking` | 0.30 | 0.97 | 72% | 65% | 68% |
| `layoffs` | 0.15 | 1.00 | 95% | 90% | 93% |
| `ai-topic` | 0.15 | 0.98 | 86% | 80% | 83% |
| **Mean** | | | | | **79%** |

The zero-shot model ranks posts well (high AUC), but it gives low probabilities. Thus, most filters have a large negative calibration for this model. Before the calibration, the mean F1 was 61%.

## Findings

### Wording

- **Use the words that people use on X.** The first `engagement-bait` question was abstract ("Does this post try to get engagement…"). d1 had an AUC of 0.75 for it. The new question gives examples ("RT if", "tag someone", "reply below"). The AUC is now 0.95.
- **Each model has its own best wording.** d1 reads a question. The zero-shot model reads a statement ("This post is…"). For this reason, each built-in filter has a `question` and a `statement`.
- **Long lists of conditions can decrease recall.** Keep each filter on one topic.

### Calibration

A model can rank posts correctly but give probabilities that are too high or too low. The calibration of a filter moves its threshold for one model. For example:

- d1 is cautious about crypto posts. The `crypto-scams` calibration for d1 is −0.30.
- d1 is quick to call a post hostile. The `negativity` calibration for d1 is +0.15.
- The zero-shot model gives low probabilities for most filters. Its calibrations are −0.20 to −0.45.

The calibration values are in `src/lib/filters/presets.ts`.

### Custom filters

Users often type a topic, not a question (for example "posts about layoffs"). The extension puts the text in a wrapper:

- d1: `Does this post match this description: posts about layoffs?`
- Zero-shot model: `This post matches this description: posts about layoffs.`

If the text ends with a question mark, the extension does not change it.

With d1, the wrapper improves the F1 score of `layoffs` from 76% to 87%, and of `ai-topic` from 83% to 89%. Custom filters use a calibration of −0.40 for the zero-shot model, because there is no evaluation data for the text that a user types.

## Limits

- The posts are synthetic and short. Real posts have links, images, slang, and sarcasm.
- Each filter has approximately 20 matching posts. Thus, one post changes recall by approximately 5 points.
- We selected the wording and the calibration with this set. The results on the same set are thus optimistic.

## Change a built-in filter

1. Add the new wording to `eval/variants.json`.
2. Run the evaluation for both models.
3. Change `src/lib/filters/presets.ts` only if the results are better.
4. Update this document.
