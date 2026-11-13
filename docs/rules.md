# Rule reference

IDs are stable. Severities shown are defaults; override them in `.patchsieve.yml`. "Confidence" is attached to each finding; heuristic rules are `medium`/`low` and default to `warning`, which never fails CI unless you set `failOn: warning`.

| ID | Name | Default | Scope |
| --- | --- | --- | --- |
| [PS001](#ps001) | Invalid suppression comment | warning | all analyzed files |
| [PS101](#ps101) | Dependency missing from lockfile | error | package.json |
| [PS102](#ps102) | Manifest/lockfile version mismatch | error | package.json |
| [PS103](#ps103) | Suspicious dependency reference | warning | package.json |
| [PS104](#ps104) | Unverified new package (opt-in) | warning | package.json |
| [PS201](#ps201) | Empty catch block | error | JS/TS |
| [PS202](#ps202) | Silently swallowed promise rejection | warning | JS/TS |
| [PS203](#ps203) | Error swallowed without handling | warning | JS/TS |
| [PS301](#ps301) | Test without meaningful assertion | warning | test files |
| [PS302](#ps302) | Assertion with no effective check | error | test files |
| [PS303](#ps303) | Unconditional assertion | warning | test files |
| [PS304](#ps304) | Skipped test (`.todo` = note) | warning | test files |
| [PS305](#ps305) | Focused test committed | error | test files |
| [PS401](#ps401) | Unimplemented production code | error | production JS/TS |
| [PS402](#ps402) | Suspicious placeholder return | warning | production JS/TS |
| [PS403](#ps403) | New TODO in critical implementation | warning | production JS/TS |
| [PS404](#ps404) | Fake success response | warning | production JS/TS |
| [PS501](#ps501) | Ignored fetch response | warning | production JS/TS |
| [PS502](#ps502) | Fire-and-forget promise | warning | production JS/TS |
| [PS503](#ps503) | Unsafe success assumption | warning | production JS/TS |
| [PS601](#ps601) | Schema/migration mismatch | warning | Prisma migration SQL |
| [PS602](#ps602) | Destructive migration | warning | SQL |
| [PS603](#ps603) | Non-null field without data strategy | error | SQL |
| [PS604](#ps604) | Missing schema update | warning | schema.prisma |

"Test files" = `*.test.*`, `*.spec.*`, and anything under `test/`, `tests/`, `__tests__/`, `e2e/`, `cypress/`, `playwright/`. Everything else is production code.

<a id="ps001"></a>
## PS001 — Invalid suppression comment
A `patchsieve-ignore` comment that does not match `patchsieve-ignore PS123 -- reason` (explicit IDs, mandatory reason) is **not applied** and is reported. See [false-positives.md](false-positives.md#suppressions).

<a id="ps101"></a>
## PS101 — Dependency missing from lockfile
A dependency added to `package.json` has no entry for this package in the nearest `package-lock.json` (v1/v2/v3, importer-aware), `pnpm-lock.yaml` (importers) or `yarn.lock` (classic and berry). Often an agent edits the manifest but never installs.
- Only newly added/changed dependencies are checked. `workspace:`/non-registry specs are skipped.
- No lockfile anywhere → no finding (the project may not use one).

```jsonc
// package.json (added)   "invoice-totalizer-pro": "^2.1.0"
// package-lock.json      (no entry)   → PS101
```

<a id="ps102"></a>
## PS102 — Manifest/lockfile version mismatch
The requested range in the manifest differs from the range the lockfile recorded for the same dependency. Only confirmed from the lockfile's recorded specifier; resolved-version satisfaction is not computed.

<a id="ps103"></a>
## PS103 — Suspicious dependency reference
`*`/`latest`/empty ranges, `http://`/`git://` URLs (error), git dependencies without a commit/tag, absolute `file:` paths, and `workspace:` use without any workspace configuration. Registry ranges, aliases (`npm:`), relative `file:`/`link:` and pinned git refs are accepted.

<a id="ps104"></a>
## PS104 — Unverified new package (opt-in)
Enabled with `registry.enabled: true` / `registry-check: true`. New **unscoped** package names get one request to the public npm registry. Only HTTP **404** yields a finding (`warning`, medium confidence). Timeouts, 429, 403 and 5xx are inconclusive and never reported. Scoped packages and repos with a custom registry in `.npmrc` are never looked up. A 404 can be a private package or a typo; it is not proof of a hallucinated name.

<a id="ps201"></a>
## PS201 — Empty catch block
```ts
try { await saveOrder(); } catch (error) {
}
```
Not flagged: a catch containing any statement or any comment (e.g. `// best effort: cache is optional`).

<a id="ps202"></a>
## PS202 — Silently swallowed promise rejection
`p.catch(() => {})`, `.catch(function () {})`, `.then(ok, () => undefined)`. A comment inside the handler counts as an explanation.

<a id="ps203"></a>
## PS203 — Error swallowed without handling
A catch whose only statements are no-ops (bare identifiers/literals, `void 0`). Logging, rethrowing, returning a value or calling anything is treated as handling.

<a id="ps301"></a>
## PS301 — Test without meaningful assertion
```ts
it('creates an invoice', async () => { await createInvoice(); });
```
Recognized assertions: `expect`, `assert`/`assert.*`, `should`, `.rejects/.resolves`, `t.assert.*`/`t.ok`-style, `expectTypeOf`, snapshots, and calls to helpers named `assert*/expect*/verify*/check*/…` or file-local helpers that contain an assertion. Callback-style tests (`done`), `.skip` and `.todo` are not checked. Empty bodies are `high` confidence, others `medium`.

<a id="ps302"></a>
## PS302 — Assertion with no effective check
`expect(result);`, `expect(result).not;`, `expect(result).toBe;` — never completed with a matcher call.

<a id="ps303"></a>
## PS303 — Unconditional assertion
`expect(true).toBe(true)`, `expect(1).toEqual(1)`, `expect(true).toBeTruthy()`, `assert(true)`, `assert.equal('a','a')`. Only literal-vs-identical-literal cases.

<a id="ps304"></a>
## PS304 — Skipped test
`it.skip`, `test.skip`, `describe.skip`, `xit`, `xtest`, `xdescribe`. `.todo` is reported as a `note`. Playwright conditional skips (`test.skip(cond, 'why')` inside a test) are ignored.

<a id="ps305"></a>
## PS305 — Focused test committed
`it.only`, `test.only`, `describe.only`, `test.describe.only`, `fit`, `fdescribe`.

<a id="ps401"></a>
## PS401 — Unimplemented production code
`throw new Error('Not implemented')` (also "unimplemented", "todo", "not supported yet") in non-test code.

<a id="ps402"></a>
## PS402 — Suspicious placeholder return
A function named like real work (`calculate*`, `process*`, `sync*`, `validate*`, `send*`, `save*`, …) whose entire body is `return 0|[]|{}|''|null|true|false`. `low` confidence, `medium` with a TODO/mock comment. `getX() { return 0 }` is not flagged.

<a id="ps403"></a>
## PS403 — New TODO in critical implementation
A `TODO`/`FIXME` comment inside a function with at most two statements. Reported at the comment line, so it only fires when that comment is new.

<a id="ps404"></a>
## PS404 — Fake success response
A function whose whole body is `return { success: true }` / `{ ok: true }` / `{ status: 'success' }` **and** whose name suggests real work or which has a mock/stub/TODO comment.

<a id="ps501"></a>
## PS501 — Ignored fetch response
`await fetch(...)` as a bare statement: the status is never looked at.

<a id="ps502"></a>
## PS502 — Fire-and-forget promise
An expression statement that drops `fetch(...)`, `Promise.all/allSettled/race/any(...)`, a call to an `async` function declared in the same file, or a `.then()` chain without a rejection handler. Explicit `void p`, `await`, `return` and `.catch()` are fine.

<a id="ps503"></a>
## PS503 — Unsafe success assumption
`const res = await fetch(...)` followed by `res.json()` (or `.text()`, `.blob()`, …) in the same scope with no `res.ok` / `res.status` access and without passing `res` to another function or returning it. No type information is used.

<a id="ps601"></a>
## PS601 — Schema/migration mismatch
Prisma Migrate layout only (`<dir>/migrations/<name>/migration.sql` next to `<dir>/schema.prisma`). A migration that adds a column the model does not declare, or drops a column the model still declares. Honors `@map`/`@@map`; relation fields are not columns. See [limitations](limitations.md).

<a id="ps602"></a>
## PS602 — Destructive migration
`DROP TABLE`, `DROP SCHEMA`, `TRUNCATE`, `ALTER TABLE … DROP COLUMN`, and `ALTER COLUMN … TYPE` (low confidence). Statements are located with a real SQL tokenizer (comments, strings, dollar-quoting), not a regex over raw text. It is a review prompt, not a verdict.

<a id="ps603"></a>
## PS603 — Non-null field without data strategy
`ADD COLUMN … NOT NULL` without `DEFAULT` (and not serial/identity/generated) on a table that is not created in the same file; and `SET NOT NULL` with no earlier `UPDATE` of that table in the same migration (medium).

<a id="ps604"></a>
## PS604 — Missing schema update
`schema.prisma` gained/lost/changed a model or field in this PR, but no `.sql` file under the sibling `migrations/` directory was changed. Only meaningful in diff mode. Teams that use `prisma db push` should disable this rule.
