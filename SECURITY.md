# Security Policy

## Threat model

PatchSieve analyzes **untrusted pull requests**. Everything in the analyzed change (file contents, file names, JSON/YAML, comments, the GitHub event payload) is treated as data.

What PatchSieve does **not** do:

- execute code, scripts, binaries, migrations or tests from the analyzed repository;
- run `npm install` or any package-manager lifecycle script;
- read files through symlinks (diff mode reads git blobs; `--all` mode skips symlinks);
- send source code anywhere. The only optional network feature is `registry-check`, which sends **public, unscoped package names** to `registry.npmjs.org` (disabled by default, skipped when `.npmrc` configures another registry);
- use secrets. The action needs no token beyond the default read-only `GITHUB_TOKEN`, and does not use it for analysis.

Controls in place: strict git ref validation, SHA validation of event-payload values, size/file-count limits, binary detection, escaping of workflow commands / terminal escapes / Markdown, schema-validated YAML parsed as plain data, and a **trust boundary for policy**: config and baseline are read from the merge base, so a PR cannot weaken its own checks.

Known limitation: a PR can still edit the *workflow file* that invokes the action (GitHub runs the PR's version on `pull_request`). Protect workflow files with CODEOWNERS / branch protection / required workflows. See [docs/limitations.md](docs/limitations.md).

## Supported versions

Only the latest `0.x` release receives fixes.

## Reporting a vulnerability

Please use GitHub's **private vulnerability reporting** on this repository (Security → Report a vulnerability). Do not open a public issue for security problems. You can expect an initial response within a few days.
