# Community and social drafts

These are drafts. Nothing here is posted automatically. Before posting, read each community's current rules on self-promotion (many subreddits restrict project posts, require a flair, or ask for a certain account age/participation).

## Reddit: r/opensource (ready to paste)

**Title:** I built PatchSieve: an MIT-licensed, no-LLM quality gate for pull requests

**Body:**

I built PatchSieve to catch the predictable mistakes that keep showing up in pull requests, especially large AI-assisted ones: tests that assert nothing, empty `catch` blocks, `throw new Error('Not implemented')` left behind, a dependency added to `package.json` but never installed, and risky SQL migrations.

How it works:

- It only looks at the lines a PR changes, so old debt doesn't block new work.
- It analyzes code statically (TypeScript compiler API for JS/TS, a small SQL tokenizer for migrations). Nothing from the PR is executed or installed.
- There is no LLM and no API key, so the same code gives the same result every time.
- Config and baseline are read from the base branch, so a PR can't switch off its own checks.
- Output: GitHub annotations, a job summary, JSON and SARIF.

It's a GitHub Action (on the Marketplace) and a CLI: `npx patchsieve scan --base main`.

It is pattern-based, so it will miss things and can flag legitimate code. The numbers in the repo come from a small hand-built corpus and shouldn't be read as general accuracy. It doesn't replace ESLint, Semgrep or CodeQL. I'd really like feedback, especially false-positive reports with a minimal code sample.

Repo: https://github.com/mysterekkk/patchsieve

## Reddit: r/github (ready to paste)

**Title:** A GitHub Action that checks only the changed lines of a PR for common mistakes (no LLM, no secrets)

**Body:**

I built a GitHub Action called PatchSieve and I'd like feedback on its security model, since it analyzes untrusted pull requests.

- It runs on `pull_request` (not `pull_request_target`) with `contents: read` and needs no secrets.
- It reads git blobs only and never runs `npm install`, scripts, tests or migrations from the PR. Symlinks are refused.
- Config and baseline come from the base branch, so a PR can't weaken its own checks.
- Event-payload values are validated, and workflow commands, terminal escapes and Markdown are escaped in all output.

What it checks: tests with no assertions, empty catch blocks, placeholder implementations, lockfile drift and risky migrations, only on lines the PR changed.

```yaml
- uses: actions/checkout@v7
  with: { fetch-depth: 0, persist-credentials: false }
- uses: mysterekkk/patchsieve@v0.1.1
```

Known limitation: a PR can still edit the workflow file that calls the action, so protect it with CODEOWNERS or required workflows. Repo: https://github.com/mysterekkk/patchsieve

## r/programming

Only if the subreddit's rules allow project posts. Prefer sharing the write-up ("Catching the predictable mistakes in AI-generated PRs without an LLM", the dev.to draft in this folder) rather than the repo link.

## LinkedIn EN (posted 2026-11-14 from the maintainer's account)

I built PatchSieve: a deterministic quality gate for pull requests. It catches predictable mistakes before you merge. No LLM, no API keys, nothing from the PR is executed. GitHub Action (Marketplace) and `npx patchsieve scan`. Pattern-based evidence, not proof of correctness. MIT. https://github.com/mysterekkk/patchsieve

## LinkedIn PL

Zbudowałem PatchSieve: deterministyczną bramkę jakości dla pull requestów. Wyłapuje przewidywalne błędy, zanim zrobisz merge. Bez LLM i bez kluczy API, nic z PR-a nie jest uruchamiane. GitHub Action (Marketplace) oraz `npx patchsieve scan`. To wzorce, nie dowód poprawności kodu. MIT. https://github.com/mysterekkk/patchsieve

## Blurb for the LuroWeb website

PatchSieve is LuroWeb's open-source pull request quality gate: deterministic, no LLM, no code execution from PRs. It reflects how we build secure development workflows and CI/CD pipelines for teams. Need help with automated development workflows? Get in touch with LuroWeb.

## GitHub Discussions

The welcome post is live: https://github.com/mysterekkk/patchsieve/discussions/4
