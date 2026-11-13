# Limitations

PatchSieve reports **evidence of likely problems**, not proofs of bugs. A clean run does not mean the code is correct.

- **No semantic or LLM-level understanding.** It cannot tell whether a function does what its name promises, or whether an assertion is *meaningful*. It finds specific, syntactically recognizable shapes.
- **No type information.** Rules never run the TypeScript type checker. PS502/PS503 recognise only syntactic patterns (e.g. `fetch`, same-file `async` functions), so they miss promise-returning calls from other modules. Type-aware tools such as typescript-eslint (`no-floating-promises`) are stronger there.
- **Heuristics.** PS301 may miss weak assertions and may flag tests whose assertions live in helpers with unrecognised names (use a name starting with `assert`/`expect`/`verify`/`check`, or suppress with a reason). PS402/PS404 rely on function names and comments.
- **Languages.** JavaScript and TypeScript (including JSX/TSX/MJS/CJS) for code rules; `package.json` + lockfiles for dependency rules; SQL (PostgreSQL-oriented) and Prisma for migrations. Python, PHP, Go, Rust, Java and others are not analyzed.
- **Test frameworks.** Vitest, Jest and the Node.js test runner are the supported targets. Mocha, Playwright Test and Cypress share most syntax and mostly work (`.only`/`.skip`, `expect`, `assert`, `.should`) but are not covered by dedicated tests.
- **Dependencies.** Lockfile checks use the *recorded specifier*; PatchSieve does not run semver resolution. No lockfile → no dependency findings. Offline, PatchSieve cannot know whether a public package exists; PS104 is opt-in and a 404 is not proof (private packages look identical). Scoped packages are never looked up.
- **Migrations.** Statement location uses a SQL tokenizer, but rules interpret only a small set of `ALTER TABLE`/`DROP`/`TRUNCATE`/`UPDATE`/`CREATE TABLE` shapes. PS601/PS604 support only the Prisma Migrate directory layout. Other ORMs/formats (including **Laravel migrations**) are not supported yet.
- **Diff mode requires history.** Use `fetch-depth: 0` (or enough depth) so the merge base exists. Shallow clones fail with a clear error rather than analyzing the wrong range.
- **Policy trust.** Config/baseline come from the base branch. The workflow file itself still comes from the PR, as GitHub designs for `pull_request`; protect it with CODEOWNERS / required workflows. Path-based ignores (`dist/`, `generated/`) are policy and can be abused by the PR author by moving code there; review changes that add generated-looking paths.
- **Generated code.** Files are not skipped based on `@generated` headers (a PR could spoof them). Exclude generated code via `ignore` in the trusted config.
- **Corpus metrics are not general quality claims.** See [benchmarks.md](benchmarks.md).
