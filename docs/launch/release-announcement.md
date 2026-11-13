# PatchSieve v0.1.0

**Your coding agent wrote the PR. PatchSieve catches the predictable mistakes before you merge.**

PatchSieve is a deterministic quality gate for pull requests: no LLM, no AI API key, no code execution from the PR. It analyzes only the lines a PR changes and reports findings with exact locations and suggested fixes.

## What is in 0.1.0
- 22 rules (+1 opt-in): lockfile drift, swallowed errors, tests without assertions, placeholder implementations, ignored fetch responses and promises, destructive/risky SQL and Prisma migrations.
- GitHub Action (Node 24) with annotations, Job Summary, JSON and SARIF reports; a local CLI with the same engine.
- Config and baseline read from the base branch, so a PR cannot weaken its own checks.

## Try it
```yaml
- uses: actions/checkout@v7
  with: { fetch-depth: 0, persist-credentials: false }
- uses: mysterekkk/patchsieve@v0.1.1
```

## Honest limits
Pattern-based evidence, not proof. JS/TS code rules; Prisma/PostgreSQL-style SQL migrations. No type information. Not published to npm or the Marketplace yet. See [docs/limitations.md](../limitations.md).

Feedback and false-positive reports: GitHub Issues.
