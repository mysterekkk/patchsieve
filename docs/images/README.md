# Screenshots

Real screenshots (not mock-ups) of the PatchSieve quality gate running in GitHub Actions on a throwaway demo pull request (#1, closed without merging) in this repository.

- `gate-failed.jpg`: the Job Summary and annotations for a commit with an empty `catch`, a `throw new Error('Not implemented')` and an `expect(...)` without a matcher.
- `gate-passed.jpg`: the same pull request after the three problems were fixed.
