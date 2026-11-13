# Benchmarks and quality metrics

## Performance (measured)

`node scripts/benchmark.mjs` builds synthetic repositories (each module ~60 lines of TypeScript, one test file per five modules, 10% defective) and times `node dist/cli.js scan --base <sha> --format json` as a **cold process** (includes Node start-up, loading the ~4 MB bundle, `git diff`, blob reads, parsing, all rules, JSON output).

Environment: Windows 11, Node.js v24.13.0, x64, local SSD, 3 runs per size, git for Windows (process spawning is comparatively slow here; Linux runners are usually faster).

| Changed files in PR | Findings | Median | Min | Max |
| ---: | ---: | ---: | ---: | ---: |
| 12 | 3 | 1359 ms | 1202 ms | 1937 ms |
| 120 | 30 | 2794 ms | 1292 ms | 4132 ms |
| 1200 | 300 | 2943 ms | 2819 ms | 3187 ms |

The 120-file row shows run-to-run noise on this machine (min 1.3 s, max 4.1 s). A fixed start-up cost of roughly 1.2 s dominates small PRs. These numbers describe this synthetic workload on one machine; they are not a promise for your repository.

## Detection quality on the fixture corpus

The corpus in `fixtures/pull-requests/` has 8 PRs (bad dependency, silent catch, fake test, incomplete implementation, destructive migration, promise handling, clean, mixed) with hand-written expected results (rule, file, line). The test suite requires an **exact** match.

| Metric | Result |
| --- | --- |
| True positives | 21 |
| False positives | 0 |
| False negatives | 0 |
| Precision / recall | 1.00 / 1.00 |

**Read this carefully:** the corpus is small, was written by the rule authors, and the rules were tuned against it, so perfect scores here say the rules do what they were designed to do on those cases. They say **nothing** about precision or recall on arbitrary real-world repositories, where false positives and misses are expected. Additional adversarial cases (hostile file names, escapes, oversized/binary files, spoofed headers, invalid JSON) live in `tests/security/`. Reports of false positives with reproducible samples are welcome.
