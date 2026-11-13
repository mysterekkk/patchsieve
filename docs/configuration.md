# Configuration

`.patchsieve.yml` is declarative YAML validated against a strict schema (unknown keys are errors). It is parsed as plain data with the YAML core schema; nothing in it is ever executed.

```yaml
version: 1                    # required

scan:
  mode: changed               # changed | all
  maxFiles: 2000              # files beyond this are skipped and reported
  maxFileSize: 1048576        # bytes per file

rules:                        # ID: error | warning | note | off
  PS201: error
  PS301: warning
  PS602:
    severity: warning
    options: {}               # reserved for per-rule options

ignore:                       # globs: ** * ?  (forward slashes)
  - "**/dist/**"
  - "**/coverage/**"
  - "**/generated/**"

reporting:
  annotations: true
  sarif: false                # reserved: SARIF comes from --format sarif or the Action report files

failOn: error                 # error | warning | none
baseline: .patchsieve-baseline.json   # relative path inside the repo

registry:
  enabled: false              # opt in to npm lookups (PS104)
  timeoutMs: 5000
```

Built-in ignores: `node_modules`, `dist`, `build`, `coverage`, `generated`, `.next`.

## Precedence (low → high)
1. Built-in defaults
2. `.patchsieve.yml` — **from the merge base** in diff mode, from the working tree for `--all`
3. CLI flags / Action inputs (`--fail-on`, `--rule PS201=off`, `--ignore`, `rules:` input, …)

CLI flags and Action inputs come from the invoking command or workflow, which is the repository's trusted CI definition. Keep the workflow file under CODEOWNERS.

## Severity semantics
`error` and `warning` count toward `failOn`; `note` never fails. `failOn: error` (default) fails on any error; `warning` fails on errors and warnings; `none` never fails.
