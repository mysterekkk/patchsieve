# CLI

```bash
npx patchsieve scan                       # diff against origin/main (or main/master)
patchsieve scan --base main --head HEAD
patchsieve scan --all                     # whole working tree
patchsieve scan --format json
patchsieve scan --format sarif --output report.sarif
patchsieve baseline --all > .patchsieve-baseline.json
patchsieve rules [--json]
patchsieve doctor
```

> Published on npm as [`patchsieve`](https://www.npmjs.com/package/patchsieve) (Node.js 24 required). To run from source instead: `npm ci && npm run build && node dist/cli.js scan`.

| Option | Meaning |
| --- | --- |
| `--base <ref>` / `--head <ref>` | Range to analyze (merge-base aware). Refs are validated; option-like values are rejected |
| `--all` | Scan every file in the working tree (symlinks skipped) |
| `--format` | `console` (default), `json`, `sarif`, `markdown` |
| `--output <file>` | Write the report to a file |
| `--config <file>` | Config path (default `.patchsieve.yml`) |
| `--fail-on` | `error` \| `warning` \| `none` |
| `--rule ID=level` | Repeatable rule override (`error`, `warning`, `note`, `off`) |
| `--ignore <glob>` | Repeatable extra ignore |
| `--max-files`, `--max-file-size` | Limits |
| `--registry-check` | Opt in to npm lookups for PS104 |
| `--trust-head-config` | Read policy from the working tree (local use only) |

## Exit codes
| Code | Meaning |
| --- | --- |
| 0 | Passed |
| 1 | Findings reached the `failOn` threshold |
| 2 | Configuration or analysis failure (bad flags/config, missing git history, invalid baseline, …) |

Files that could not be analyzed (syntax errors, binaries, size limits, rule crashes) are always listed under "skipped" in the report; they never turn into a silent pass.

Colors are used only on a TTY without `NO_COLOR`; JSON/SARIF/Markdown never contain terminal control characters (untrusted text is escaped).
