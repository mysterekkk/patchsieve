# Development

Requirements: Node.js 24, git.

```bash
npm ci
npm run check        # lint + typecheck + tests + build
npm test             # vitest (some tests create temporary git repositories)
npm run build        # bundles dist/action.js and dist/cli.js (commit the result)
node scripts/benchmark.mjs
```

`dist/` is committed because a JavaScript action must ship its bundle; CI fails if it does not match the sources.

## Adding a rule
1. Pick the next free ID in the category range (PS1xx deps, PS2xx errors, PS3xx tests, PS4xx stubs, PS5xx reliability, PS6xx migrations). **Never reuse or change the meaning of an existing ID** without a breaking-change note in `CHANGELOG.md`.
2. Implement `Rule` in `src/rules/<category>/` (`id`, `name`, `description`, `category`, `defaultSeverity`, `languages`, `appliesTo`, `check(ctx)`) and register it in `src/core/rule-registry.ts`. Use the AST (`ctx.ts`); never use a regex over source text as the main parser.
3. Return an `anchor` that identifies the code shape (not the line number) so the fingerprint is stable.
4. Add tests: a positive case with the exact line, negative cases (correct code that looks similar) and, if relevant, a fixture PR under `fixtures/pull-requests/<name>/{base,head,expected.json}`.
5. Document the rule (what it detects, what it deliberately does not, false-positive cases, correct and incorrect examples) in `docs/rules.md` with an `<a id="psNNN"></a>` anchor, and add a suggestion in `src/core/findings.ts`.
6. Prefer `warning` + `medium`/`low` confidence for heuristics.
