# Competitive analysis (brief)

Data checked via the GitHub API on 2026-11-13 (license, stars). No code was copied from any project. PatchSieve is **not** the first deterministic PR review tool, and AST-based linting is not new.

| Tool | What it is | License | Relation to PatchSieve |
| --- | --- | --- | --- |
| ESLint | General JS/TS linter, huge rule ecosystem | MIT | Complementary. PatchSieve does not replace it; it adds diff-scoped checks for agent-typical defects and non-JS inputs (lockfiles, migrations). Several ideas (empty catch, `.only`) exist as ESLint rules, usually without changed-lines-first gating. |
| typescript-eslint | Type-aware TS lint rules | MIT | Complementary. Offers type-aware rules (e.g. floating promises) that PatchSieve deliberately approximates without type information. |
| Semgrep | Pattern-based static analysis engine, many languages | LGPL-2.1 (engine; rule packs have their own licenses) | Closest in spirit for custom rules. Broader and more powerful; requires writing rules and scoping to diffs yourself. |
| CodeQL | Semantic code analysis, security focus | queries MIT; engine under GitHub's terms | Deep dataflow security analysis. Different goal and much heavier runtime. |
| reviewdog | Pipes linter output into PR annotations | MIT | Integration layer, not an analyzer. Could be used with PatchSieve's SARIF/JSON. |
| Danger JS | Programmable PR rules in JS | MIT | Runs repo-supplied JS rules (flexible, but executes code); PatchSieve is declarative and never executes repo code. |
| Codex Guard (Akimiya-z) | Quality gate for AI-generated PRs (TODO leftovers, secrets, commits, CI) | MIT | Same audience; focused on repo hygiene rather than AST-level test/error-handling defects. |
| AgentGuard (several projects) | Runtime/security guardrails for agents | MIT / GPL-3.0 depending on project | Different problem (runtime agent safety). |
| agent-pr-reviewer-lite | Deterministic CLI flagging files needing human review, no LLM | MIT | Overlapping philosophy; prioritises *which files* to review, not AST findings. |
| AI PR Proof Gate | Deterministic evidence-contract gate for PRs | other | Checks PR evidence/contract rather than code defects. |

## Where PatchSieve fits

Specialisation in mistakes coding agents make repeatedly: tests that assert nothing, swallowed errors, placeholder implementations, manifest edits without lockfile updates, risky migrations. Findings are scoped to the **changed lines** of a PR, run from a **trusted base-branch policy**, require **no LLM, API key or code execution**, and install with one workflow file.

## What it is not

Not a general linter, not a security scanner, not a semantic reviewer. If you already run Semgrep or typescript-eslint with equivalent rules, you may not need PatchSieve for those rules; the lockfile, test-quality and migration checks and the diff-first gating are the added value.
