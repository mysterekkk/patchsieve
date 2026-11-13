# GitHub Actions

```yaml
name: PatchSieve
on:
  pull_request:
permissions:
  contents: read
jobs:
  patchsieve:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
          persist-credentials: false
      - uses: mysterekkk/patchsieve@v0.1.0
```

Why `fetch-depth: 0`: diff mode needs the merge base of the PR base and head.

## Inputs
`config`, `fail-on`, `format`, `rules`, `ignore`, `scan-mode`, `max-files`, `max-file-size`, `registry-check`, `annotations`, `sarif-output`, plus a reserved `github-token`. Defaults: changed files only, `error` fails the check, warnings do not, annotations on, registry lookups off, no PR comments, no secrets. Full descriptions are in [`action.yml`](../action.yml).

## Outputs
`findings`, `errors`, `warnings`, `passed`, `json-path`, `sarif-path`, `markdown-path`.

## Reports
- **Annotations** on the exact file/line (GitHub caps annotations per step; the first 10 errors and 10 warnings are annotated, the rest are in the summary).
- **Job Summary** with all findings.
- **Files** (JSON, SARIF, Markdown) in `RUNNER_TEMP` (SARIF path overridable with `sarif-output`).

## Optional: upload SARIF to code scanning
Not part of the default flow: it needs `security-events: write`, code scanning availability for the repository, and is unavailable for PRs from forks. Reporting works without it.

```yaml
permissions:
  contents: read
  security-events: write
steps:
  - uses: actions/checkout@v7
    with: { fetch-depth: 0, persist-credentials: false }
  - uses: mysterekkk/patchsieve@v0.1.0
    id: ps
    continue-on-error: true
  - uses: github/codeql-action/upload-sarif@v4
    if: github.event.pull_request.head.repo.full_name == github.repository
    with:
      sarif_file: ${{ steps.ps.outputs.sarif-path }}
```
(Check the current `upload-sarif` major version in its documentation.)

## Security notes
- Use `pull_request`, **not** `pull_request_target`. PatchSieve never needs secrets.
- The action reads git blobs only; it does not install dependencies or run any script from the PR.
- Protect the workflow file with CODEOWNERS or required workflows, since a PR can edit it.
- Fork PRs work: no token permissions beyond read are needed.
