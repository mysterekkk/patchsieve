# Community and social drafts (do not post automatically; check each community's self-promotion rules first)

## r/opensource
**PatchSieve: an MIT-licensed, no-LLM quality gate for pull requests written by coding agents**
Looking for feedback. It flags tests with no assertions, empty catch blocks, placeholder implementations, lockfile drift and risky migrations, only on the lines a PR changes. No API keys, no code execution from the PR. Pattern-based, so false positives happen; I'd like reports with minimal samples. https://github.com/mysterekkk/patchsieve

## r/github
**A GitHub Action that checks only the changed lines of a PR for agent-typical mistakes (no LLM, no secrets)**
Uses the `pull_request` trigger and a read-only token, reads git blobs only, and takes its config from the base branch so a PR can't disable its own checks. Feedback on the security model welcome. https://github.com/mysterekkk/patchsieve

## r/programming (only if the sub's rules allow project posts)
Prefer sharing the write-up instead of the repo: "Catching the predictable mistakes in AI-generated PRs without an LLM" (dev.to draft in this folder).

## LinkedIn EN
Your coding agent wrote the PR. PatchSieve catches the predictable mistakes before you merge. It is an open-source, deterministic quality gate: no LLM, no AI API key, no code execution from the PR, findings with exact locations, works in CI. It finds specific patterns (tests without assertions, swallowed errors, placeholder code, lockfile drift, risky migrations); it does not find all bugs. MIT, built by LuroWeb: https://github.com/mysterekkk/patchsieve

## LinkedIn PL
Agent kodujący napisał PR. PatchSieve wyłapie przewidywalne błędy, zanim zrobisz merge. To open-source'owa, deterministyczna bramka jakości: bez LLM, bez kluczy API, bez wykonywania kodu z PR, z dokładnymi lokalizacjami, działa w CI. Wykrywa konkretne wzorce (testy bez asercji, połknięte błędy, niedokończony kod, rozjazd lockfile, ryzykowne migracje), ale nie znajdzie wszystkich błędów. MIT, autor: LuroWeb: https://github.com/mysterekkk/patchsieve

## Blurb for the LuroWeb website
PatchSieve is LuroWeb's open-source pull request quality gate: deterministic, no LLM, no code execution from PRs. It reflects how we build secure development workflows and CI/CD pipelines for teams. Need help with automated development workflows? Get in touch with LuroWeb.

## GitHub Discussions (welcome post)
Welcome to PatchSieve. Use Discussions for ideas (new rules, frameworks), questions about configuration, and sharing false positives with a minimal sample. Please include the rule ID, a short code snippet and what you expected. Security issues: use private vulnerability reporting, not Discussions.
