---
title: "Catching the predictable mistakes in AI-generated pull requests, without an LLM"
published: false
tags: opensource, github, typescript, testing
---

Coding agents write pull requests fast. The review is where time goes, and the same defects keep showing up. Four examples I see most:

```ts
it('creates an invoice', async () => {
  await createInvoice();          // no assertion
});

try { await saveOrder(); } catch (error) {
}                                 // swallowed

async function syncOrders() {
  throw new Error('Not implemented');
}
```

and a dependency added to `package.json` while the lockfile never changed.

## Why deterministic?
An LLM reviewer is useful, but it is non-reproducible, needs keys and infrastructure, and may be asked to read untrusted code. For *recurring, syntactically recognisable* mistakes, a deterministic checker is cheaper and gives the same answer every run.

## What PatchSieve does
- Computes the PR's changed lines from the merge base and reports only findings that touch them.
- Parses JS/TS with the TypeScript compiler API, SQL with a small tokenizer, lockfiles as data.
- Never executes code or scripts from the PR; config and baseline come from the base branch.
- Emits annotations, a Job Summary, JSON and SARIF.

```yaml
- uses: actions/checkout@v7
  with: { fetch-depth: 0, persist-credentials: false }
- uses: mysterekkk/patchsieve@v0.1.0
```

## What it is not
Not a replacement for ESLint, typescript-eslint, Semgrep or CodeQL, not a semantic reviewer, and not proof of correctness. It reports evidence, and heuristics have false positives; each rule documents what it deliberately ignores.

Repo and docs: https://github.com/mysterekkk/patchsieve
