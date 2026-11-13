# False-positive control

People stop using a quality gate that cries wolf, so PatchSieve is conservative by design.

## Built-in controls
- **Changed lines first.** A finding is reported only if its line range overlaps lines added/modified by the PR. Old debt is invisible unless you scan with `--all`.
- **Conservative defaults.** Only unambiguous patterns are `error`. Heuristic rules are `warning`/`note` and carry a `confidence` of `medium` or `low`.
- **Supported syntax only.** Rules look for specific, documented shapes. When analysis cannot decide (e.g. an assertion hidden in an imported helper whose name does not look like an assertion), prefer lower confidence or silence.
- **Test/production classification.** Test-quality rules run only on test files; stub/reliability rules only on production code.
- **No duplicates.** Findings are de-duplicated by a stable fingerprint (rule + file + code anchor + occurrence; line numbers are not part of it, so moving code does not create "new" findings).
- **Skipped, never guessed.** Files with syntax errors, binaries, symlinks and oversized files are skipped *and listed* in the report.

## Suppressions
```ts
// patchsieve-ignore PS201 -- the cache is optional; failures are expected on cold start
try { await warmCache(); } catch {}

try { await ping(); } catch {} // patchsieve-ignore PS201 -- telemetry must never break requests
```
Rules:
- Syntax: `patchsieve-ignore <ID>[, <ID>...] -- <reason>`; the reason is mandatory (at least 3 characters).
- Inside a comment only (`//`, `/* */`, `#`, `--`). Text in string literals is ignored.
- Scope: the same line (trailing comment) or the next non-blank line (standalone comment). No file-wide or wildcard ignores.
- Malformed comments are **not applied** and produce a `PS001` warning.

## Baseline
Adopt PatchSieve on an existing codebase without blocking anyone:

```bash
patchsieve scan --all --trust-head-config   # see what exists today
patchsieve baseline --all > .patchsieve-baseline.json
```
Findings whose fingerprint is in the baseline are excluded. In PR mode the baseline is read from the **base branch**, so a PR cannot add its own findings to it.

## Trust boundary
In diff mode `.patchsieve.yml` and the baseline come from the merge base. If a PR edits them, PatchSieve prints a note and still enforces the base-branch version; the change takes effect after merge, through normal review. Use `--trust-head-config` only for local experimentation.

## Reporting a false positive
Open an issue with the smallest code sample that triggers it, the rule ID and what you expected. Every fix lands with a regression test.
