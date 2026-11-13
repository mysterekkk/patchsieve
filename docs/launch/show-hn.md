# Show HN draft (do not post automatically)

**Title:** Show HN: PatchSieve – deterministic PR checks for the mistakes coding agents repeat

**Body:**

I kept seeing the same defects in agent-written pull requests: tests that call code but assert nothing, empty `catch` blocks, `throw new Error('Not implemented')` left behind, a dependency added to package.json but never installed.

PatchSieve is a GitHub Action / CLI that looks for exactly those shapes. It uses the TypeScript compiler API (not regexes) for JS/TS, a small SQL tokenizer for migrations, and only reports findings on lines the PR changed, so old debt doesn't block you.

Design choices: no LLM and no API keys, so results are reproducible; it never executes or installs anything from the PR; config and baseline come from the base branch so a PR can't switch off its own checks.

It is not the first deterministic PR checker and it does not replace ESLint, Semgrep or CodeQL; the angle is specialisation in agent-typical mistakes plus diff-first, one-file setup. It is pattern-based, so it will miss things and can flag legitimate code. The fixture-corpus numbers in the repo are from a small hand-built set and shouldn't be read as general accuracy.

Repo: https://github.com/mysterekkk/patchsieve – I'd especially like false-positive reports with a minimal sample.
