# Contributing

Thank you for your help. This document tells you how to contribute to Lull.

## Before you start

1. Read the [code of conduct](CODE_OF_CONDUCT.md).
2. Look for an existing [issue](https://github.com/silentvoice/x-feed-filter/issues) about your change.
3. For a large change, open an issue first. Describe the change and wait for a reply from a maintainer.

## Types of contribution

- **Report a bug.** Use the bug report form.
- **Report a wrong filter result.** Use the wrong filter result form. These reports help us tune the filters.
- **Suggest a feature.** Use the feature request form.
- **Improve the documentation.** Obey the [documentation style guide](docs/style-guide.md).
- **Change the code.** Use the procedure that follows.

## Make a code change

1. Fork the repository.
2. Set up the project. Use the procedure in [docs/development.md](docs/development.md).
3. Make a branch from `main`:

   ```bash
   git switch -c feat/short-description
   ```

4. Make your change.
5. Add or update the tests.
6. Run all checks:

   ```bash
   npm run check
   ```

7. Make a commit. Use the [commit message format](#commit-messages).
8. Push the branch to your fork.
9. Open a pull request to `main`. Complete the pull request template.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<optional scope>): <summary>
```

| Type | Use for |
|---|---|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation only |
| `test` | Tests only |
| `refactor` | A code change that does not change behavior |
| `perf` | A performance improvement |
| `chore` | Build, CI, and dependency changes |

Examples:

- `feat(filters): add sports spoiler preset`
- `fix(content): keep blur when X reuses an article element`

## Code rules

- Use TypeScript in strict mode.
- Biome checks formatting and lint rules. Run `npm run lint:fix` before you make a commit.
- Keep all X selectors in `src/lib/x-dom/selectors.ts`.
- Do not send post content to a remote server. All models must run on the device.
- Do not add a permission to the manifest without a reason in [docs/architecture.md](docs/architecture.md#permissions).
- If an error occurs, show the post. Do not hide it.

## Review

A maintainer reviews each pull request. All CI checks must pass. The maintainer can ask for changes. After approval, the maintainer merges the pull request with "Squash and merge".

## License

By contributing, you agree that your contribution uses the [Apache License 2.0](LICENSE).
