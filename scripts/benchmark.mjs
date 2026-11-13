// Benchmarks the bundled CLI on synthetic pull requests of 10, 100 and 1000 changed files.
// Usage: node scripts/benchmark.mjs   (run `npm run build` first)
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const cli = resolve('dist/cli.js');
const sizes = [10, 100, 1000];
const RUNS = 3;

const git = (cwd, ...args) =>
  execFileSync('git', ['-c', 'user.name=b', '-c', 'user.email=b@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function source(i, defective) {
  const lines = [`// module ${i}`, `export interface Item${i} { id: number; name: string }`];
  for (let f = 0; f < 6; f++) {
    lines.push(`export async function load${i}_${f}(read: () => Promise<string>): Promise<Item${i}> {`, '  try {', '    const raw = await read();', `    return { id: ${f}, name: raw };`, '  } catch (error) {', defective && f === 0 ? '' : '    console.error(error);', defective && f === 0 ? '' : '    throw error;', '  }', '}', '');
  }
  return lines.join('\n');
}

function testSource(i, defective) {
  return [`import { expect, it } from 'vitest';`, `it('case ${i}', () => {`, defective ? '  expect(1);' : '  expect(1).toBe(1);', '});', ''].join('\n');
}

const rows = [];
for (const n of sizes) {
  const dir = mkdtempSync(join(tmpdir(), 'ps-bench-'));
  try {
    git(dir, 'init', '-q', '-b', 'main');
    writeFileSync(join(dir, 'README.md'), 'bench\n');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'base');
    const base = git(dir, 'rev-parse', 'HEAD');
    for (let i = 0; i < n; i++) {
      const p = join(dir, 'src', `pkg${i % 20}`, `m${i}.ts`);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, source(i, i % 10 === 0));
      if (i % 5 === 0) {
        const t = join(dir, 'tests', `t${i}.test.ts`);
        mkdirSync(dirname(t), { recursive: true });
        writeFileSync(t, testSource(i, i % 10 === 0));
      }
    }
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'head');
    const times = [];
    let findings = 0;
    for (let r = 0; r < RUNS; r++) {
      const t0 = process.hrtime.bigint();
      const res = spawnSync(process.execPath, [cli, 'scan', '--base', base, '--format', 'json'], { cwd: dir, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
      times.push(Number(process.hrtime.bigint() - t0) / 1e6);
      if (res.status !== 1) throw new Error(`unexpected exit ${res.status}: ${res.stderr}`);
      findings = JSON.parse(res.stdout).summary.findings;
    }
    times.sort((a, b) => a - b);
    const files = n + Math.ceil(n / 5);
    rows.push({ prFiles: files, findings, medianMs: Math.round(times[1]), minMs: Math.round(times[0]), maxMs: Math.round(times[2]) });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
console.log(JSON.stringify({ node: process.version, platform: `${process.platform}-${process.arch}`, runs: RUNS, results: rows }, null, 2));
