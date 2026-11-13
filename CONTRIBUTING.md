# Contributing

Thanks for helping. Please read [docs/development.md](docs/development.md) first; it covers setup and how to add a rule.

- Open an issue before large changes. For a false positive, include the smallest sample, the rule ID and the expected result.
- Every behavior change needs tests. Every new rule needs positive, negative and location tests plus documentation.
- Keep rule IDs stable. Keep the tool deterministic and free of code execution, network access (unless opt-in) and LLM calls.
- Run `npm run check` and commit the rebuilt `dist/` if sources changed.
- Be kind: see the [Code of Conduct](CODE_OF_CONDUCT.md). Security issues: see [SECURITY.md](SECURITY.md).
