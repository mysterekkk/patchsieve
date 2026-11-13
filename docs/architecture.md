# Architecture

```
Pull Request → Diff → Parsing → Deterministic rules → Findings → Reporters / quality gate
```

| Module | Responsibility |
| --- | --- |
| `core/diff.ts` | `git merge-base` + `git diff --unified=0 -M`; a state-tracked unified-diff parser (headers only accepted before the first hunk) |
| `core/files.ts` | File sources: `gitSource` (blobs at a ref, one `git cat-file --batch` prefetch; symlinks/submodules refused) and `fsSource` (`--all`, symlinks skipped); test/production classification; language detection |
| `core/configuration.ts` | Zod schema, YAML-as-data parsing, overrides and precedence |
| `core/load-config.ts` | Trust boundary: policy read from the merge base |
| `core/analyzer.ts` | Orchestration: select files, parse once, run applicable rules, map to changed lines, suppress, baseline, de-duplicate, sort |
| `core/rule-registry.ts` | The rule list (unique stable IDs enforced at load) |
| `parsers/typescript.ts` | TypeScript Compiler API parsing (syntax only, no type checker, no `tsconfig` needed) |
| `parsers/sql.ts`, `parsers/prisma.ts` | SQL tokenizer/statement splitter; minimal Prisma schema reader |
| `rules/*` | Rule implementations grouped by category |
| `reporters/index.ts` | Console, JSON, SARIF 2.1.0, Markdown, GitHub annotations (all escape untrusted text) |
| `cli/`, `action/` | Entry points. The Action bundles everything with esbuild into `dist/action.js` |

Determinism: files are processed in sorted order, findings sorted by file/line/column/rule, fingerprints are content-derived, no timestamps or randomness in reports.

Performance: each file is parsed once and shared by all rules; blobs are loaded with one process; no type checking; bounded by `maxFiles`/`maxFileSize`.
