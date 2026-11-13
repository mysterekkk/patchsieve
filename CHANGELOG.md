# Changelog

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/) and the project uses [Semantic Versioning](https://semver.org/). Rule IDs are stable: changing what an ID means is a breaking change and will be called out here.

## [0.1.0] - 2026-11-13

First public release.

### Added
- Diff-first engine: merge-base aware, handles new/renamed/deleted files, CRLF, Unicode paths, monorepos, binaries, size and file-count limits.
- 22 rules + 1 opt-in rule: PS101-PS103, PS104 (opt-in), PS201-PS203, PS301-PS305, PS401-PS404, PS501-PS503, PS601-PS604.
- Reporters: console, JSON, SARIF 2.1.0, Markdown (Job Summary), GitHub annotations.
- CLI: `scan`, `baseline`, `rules`, `doctor`.
- GitHub Action (`node24`) with bundled `dist/`.
- `.patchsieve.yml` (declarative, schema-validated), trusted base-branch policy, baselines, scoped suppressions with mandatory reasons.
- Fixture corpus with expected results, adversarial and security tests, benchmarks.

### Not yet available
Laravel migrations, Python/PHP/Go/Rust support, PR comments. See the roadmap in the README.
