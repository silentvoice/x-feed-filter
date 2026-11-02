# Writing good filters

The model reads your filter as a yes/no question about each post. A clear question gives better results.

## Rules

1. **Describe the content, not your feeling.** Write "posts that insult a person", not "posts that annoy me".
2. **Be specific.** Write "posts about the 2026 World Cup", not "sports".
3. **Use one topic for each filter.** Make two filters for two topics.
4. **Give examples if the topic is unusual.** Write "posts that promote a token or coin, for example a new memecoin launch".
5. **Do not use negatives.** Write "posts about cooking", not "posts that are not about tech". The model is less accurate with negatives.

## Examples

| Do not write | Write |
|---|---|
| Bad stuff | Posts that insult or threaten a person |
| Crypto | Posts that promote a cryptocurrency, token, or NFT |
| Spoilers | Posts that tell what happens in the new season of Severance |
| Elon | Posts about Elon Musk |
| Negative posts | Posts written mainly to make readers angry |

## If a filter does not work well

- **Too many posts are filtered:** move the **Strictness** slider to the left, or make the description more specific.
- **Too few posts are filtered:** move the **Strictness** slider to the right, or add examples to the description.
- **The result is wrong for a specific post:** open a [wrong filter result](https://github.com/silentvoice/x-feed-filter/issues/new?template=wrong_filter_result.yml) issue. Do not include private information.
