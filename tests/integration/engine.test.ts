import { execFileSync } from 'node:child_process';
import { symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyze } from '../../src/core/analyzer.ts';
import { serializeBaseline, parseBaseline } from '../../src/core/baseline.ts';
import { applyOverrides, defaultConfig, parseConfig } from '../../src/core/configuration.ts';
import { loadConfig } from '../../src/core/load-config.ts';
import { git, makeRepo } from '../repo.ts';

const EMPTY_CATCH = 'try {\n  go();\n} catch (e) {\n}\n';

async function scan(base: Record<string, string>, head: Record<string, string>, cfg = defaultConfig(), baseline?: Set<string>) {
  const repo = makeRepo(base, head);
  try {
    return await analyze({ cwd: repo.dir, config: cfg, base: repo.base, head: repo.head, baseline });
  } finally {
    repo.cleanup();
  }
}

describe('diff-first behaviour', () => {
  it('ignores pre-existing problems and reports only new ones', async () => {
    const r = await scan({ 'src/a.ts': EMPTY_CATCH }, { 'src/a.ts': EMPTY_CATCH + 'export const x = 1;\n' + EMPTY_CATCH });
    expect(r.findings.map((f) => [f.ruleId, f.line])).toEqual([['PS201', 8]]);
  });
  it('does not report anything for an untouched old finding even when the file is modified elsewhere', async () => {
    const r = await scan({ 'src/a.ts': EMPTY_CATCH }, { 'src/a.ts': EMPTY_CATCH + 'export const x = 1;\n' });
    expect(r.findings).toEqual([]);
  });
  it('analyzes new files fully', async () => {
    const r = await scan({ 'README.md': 'x' }, { 'README.md': 'x', 'src/new.ts': EMPTY_CATCH });
    expect(r.findings).toHaveLength(1);
  });
  it('handles renames (unchanged content: nothing; deleted files: ignored)', async () => {
    const r = await scan({ 'src/old.ts': EMPTY_CATCH, 'src/gone.ts': EMPTY_CATCH }, { 'src/renamed.ts': EMPTY_CATCH });
    expect(r.findings).toEqual([]);
  });
  it('maps lines correctly with CRLF line endings', async () => {
    const r = await scan({ 'a.txt': 'x' }, { 'a.txt': 'x', 'src/a.ts': EMPTY_CATCH.replace(/\n/g, '\r\n') });
    expect(r.findings.map((f) => f.line)).toEqual([3]);
  });
  it('handles paths with spaces and unicode', async () => {
    const r = await scan({ 'a.txt': 'x' }, { 'a.txt': 'x', 'src/zażółć ćma/plik testowy.ts': EMPTY_CATCH });
    expect(r.findings.map((f) => f.file)).toEqual(['src/zażółć ćma/plik testowy.ts']);
  });
  it('supports monorepo layouts', async () => {
    const r = await scan({ 'a.txt': 'x' }, { 'a.txt': 'x', 'packages/api/src/a.ts': EMPTY_CATCH, 'packages/web/src/b.ts': 'export const ok = 1;\n' });
    expect(r.findings.map((f) => f.file)).toEqual(['packages/api/src/a.ts']);
  });
  it('reports files with syntax errors as skipped instead of guessing', async () => {
    const r = await scan({ 'a.txt': 'x' }, { 'a.txt': 'x', 'src/broken.ts': 'function ( {{{ try catch' });
    expect(r.findings).toEqual([]);
    expect(r.skipped).toEqual([{ path: 'src/broken.ts', reason: 'syntax errors; file not analyzed' }]);
  });
  it('skips ignored paths (generated/, dist/) and enforces max-files', async () => {
    const head = { 'a.txt': 'x', 'generated/gen.ts': EMPTY_CATCH, 'dist/out.js': EMPTY_CATCH, 'src/one.ts': EMPTY_CATCH, 'src/two.ts': EMPTY_CATCH };
    const r = await scan({ 'a.txt': 'x' }, head, applyOverrides(defaultConfig(), { maxFiles: 1 }));
    expect(r.findings.map((f) => f.file)).toEqual(['src/one.ts']);
    expect(r.skipped).toEqual(expect.arrayContaining([{ path: 'src/two.ts', reason: 'exceeds max-files (1)' }]));
  });
  it('production-only rules do not fire in test files and vice versa', async () => {
    const r = await scan({ 'a.txt': 'x' }, { 'a.txt': 'x', 'src/impl.ts': "it.only('x', () => {});\n", 'tests/impl.test.ts': "throw new Error('Not implemented');\n" });
    expect(r.findings).toEqual([]);
  });
});

describe('suppressions', () => {
  it('applies a valid scoped suppression (previous line and trailing)', async () => {
    const src = '// patchsieve-ignore PS201 -- cache is best effort\ntry { go(); } catch (e) {}\ntry { go(); } catch (e) {} // patchsieve-ignore PS201 -- optional telemetry\n';
    const r = await scan({ 'a.txt': 'x' }, { 'a.txt': 'x', 'src/a.ts': src });
    expect(r.findings).toEqual([]);
    expect(r.suppressed).toBe(2);
  });
  it('rejects malformed suppressions: no reason, wildcard, wrong id', async () => {
    const src = '// patchsieve-ignore PS201\ntry { go(); } catch (e) {}\n// patchsieve-ignore * -- because\ntry { go(); } catch (e) {}\n// patchsieve-ignore PS999 -- other rule\ntry { go(); } catch (e) {}\n';
    const r = await scan({ 'a.txt': 'x' }, { 'a.txt': 'x', 'src/a.ts': src });
    expect(r.findings.filter((f) => f.ruleId === 'PS201')).toHaveLength(3);
    expect(r.findings.filter((f) => f.ruleId === 'PS001')).toHaveLength(2);
  });
  it('does not treat arbitrary text or string literals as suppression', async () => {
    const src = "const s = 'patchsieve-ignore PS201 -- nope';\ntry { go(); } catch (e) {}\n";
    const r = await scan({ 'a.txt': 'x' }, { 'a.txt': 'x', 'src/a.ts': src });
    expect(r.findings.map((f) => f.ruleId)).toEqual(['PS201']);
  });
  it('a suppression only covers its own rule and line', async () => {
    const src = '// patchsieve-ignore PS202 -- wrong rule\ntry { go(); } catch (e) {}\n';
    expect((await scan({ 'a.txt': 'x' }, { 'a.txt': 'x', 'src/a.ts': src })).findings.map((f) => f.ruleId)).toEqual(['PS201']);
  });
});

describe('configuration and trust boundary', () => {
  it('validates the schema strictly', () => {
    expect(() => parseConfig('version: 2')).toThrow();
    expect(() => parseConfig('version: 1\nrules:\n  PS201: loud')).toThrow();
    expect(() => parseConfig('version: 1\nunknownKey: true')).toThrow();
    expect(() => parseConfig('version: 1\nrules:\n  nope: error')).toThrow();
    expect(parseConfig('version: 1\nfailOn: warning').failOn).toBe('warning');
  });
  it('treats YAML as data only (no custom tags, bounded aliases)', () => {
    expect(() => parseConfig('version: 1\nignore: !!js/function "function(){}"')).toThrow();
  });
  it('disabling and re-leveling rules works', async () => {
    const files = { 'a.txt': 'x', 'src/a.ts': EMPTY_CATCH };
    expect((await scan({ 'a.txt': 'x' }, files, parseConfig('version: 1\nrules:\n  PS201: off'))).findings).toEqual([]);
    expect((await scan({ 'a.txt': 'x' }, files, parseConfig('version: 1\nrules:\n  PS201: note'))).findings[0]!.severity).toBe('note');
  });
  it('enforces the base-branch config: a PR cannot disable its own findings', async () => {
    const repo = makeRepo({ '.patchsieve.yml': 'version: 1\nrules:\n  PS201: error\n', 'a.txt': 'x' }, { '.patchsieve.yml': 'version: 1\nrules:\n  PS201: off\nignore:\n  - "**"\n', 'a.txt': 'x', 'src/a.ts': EMPTY_CATCH });
    try {
      const loaded = loadConfig({ cwd: repo.dir, mode: 'changed', base: repo.base, head: repo.head });
      expect(loaded.notes[0]).toContain('differs');
      const r = await analyze({ cwd: repo.dir, config: loaded.config, base: repo.base, head: repo.head, baseline: loaded.baseline });
      expect(r.findings.map((f) => f.ruleId)).toEqual(['PS201']);
    } finally {
      repo.cleanup();
    }
  });
  it('a PR cannot add itself to the baseline', async () => {
    const first = await scan({ 'a.txt': 'x' }, { 'a.txt': 'x', 'src/a.ts': EMPTY_CATCH });
    const baselineText = serializeBaseline(first.findings.map((f) => f.fingerprint));
    const repo = makeRepo({ 'a.txt': 'x' }, { 'a.txt': 'x', 'src/a.ts': EMPTY_CATCH, '.patchsieve-baseline.json': baselineText });
    try {
      const loaded = loadConfig({ cwd: repo.dir, mode: 'changed', base: repo.base, head: repo.head });
      expect(loaded.baseline.size).toBe(0);
    } finally {
      repo.cleanup();
    }
  });
  it('accepts findings recorded in the trusted baseline', async () => {
    const first = await scan({ 'a.txt': 'x' }, { 'a.txt': 'x', 'src/a.ts': EMPTY_CATCH });
    const fp = new Set(first.findings.map((f) => f.fingerprint));
    const r = await scan({ 'a.txt': 'x' }, { 'a.txt': 'x', 'src/a.ts': EMPTY_CATCH }, defaultConfig(), fp);
    expect(r.findings).toEqual([]);
    expect(r.baselined).toBe(1);
  });
  it('fingerprints are stable across line moves', async () => {
    const a = await scan({ 'a.txt': 'x' }, { 'a.txt': 'x', 'src/a.ts': EMPTY_CATCH });
    const b = await scan({ 'a.txt': 'x' }, { 'a.txt': 'x', 'src/a.ts': '// header\n// header\n' + EMPTY_CATCH });
    expect(a.findings[0]!.fingerprint).toBe(b.findings[0]!.fingerprint);
    expect(b.findings[0]!.line).toBe(a.findings[0]!.line + 2);
  });
  it('validates baseline files', () => {
    expect(() => parseBaseline('{"version":1,"fingerprints":["zz"]}')).toThrow();
    expect(parseBaseline('{"version":1,"fingerprints":["0123456789abcdef"]}').size).toBe(1);
  });
  it('rejects baseline paths that escape the repository', () => {
    const repo = makeRepo({ '.patchsieve.yml': 'version: 1\nbaseline: ../../etc/passwd\n' }, { '.patchsieve.yml': 'version: 1\nbaseline: ../../etc/passwd\n', 'x': '1' });
    try {
      expect(() => loadConfig({ cwd: repo.dir, mode: 'changed', base: repo.base, head: repo.head })).toThrow(/relative path/);
    } finally {
      repo.cleanup();
    }
  });
});

describe('--all mode and symlinks', () => {
  it('scans the working tree and never follows symlinks', async () => {
    const repo = makeRepo({ 'a.txt': 'x' }, { 'a.txt': 'x', 'src/a.ts': EMPTY_CATCH });
    try {
      let linked = false;
      try {
        symlinkSync('/etc/hostname', join(repo.dir, 'src', 'link.ts'));
        linked = true;
      } catch {
        /* symlinks may need privileges on Windows */
      }
      const r = await analyze({ cwd: repo.dir, config: applyOverrides(defaultConfig(), { mode: 'all' }) });
      expect(r.findings.map((f) => f.file)).toEqual(['src/a.ts']);
      expect(r.mode).toBe('all');
      void linked;
    } finally {
      repo.cleanup();
    }
  });
  it('git symlink blobs (mode 120000) are skipped in diff mode', async () => {
    const repo = makeRepo({ 'a.txt': 'x' }, { 'a.txt': 'x' });
    try {
      const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: repo.dir, input: '/etc/passwd', encoding: 'utf8' }).trim();
      git(repo.dir, 'update-index', '--add', '--cacheinfo', `120000,${blob},src/link.ts`);
      git(repo.dir, 'commit', '-q', '-m', 'add symlink');
      const head = git(repo.dir, 'rev-parse', 'HEAD');
      const r = await analyze({ cwd: repo.dir, config: defaultConfig(), base: repo.base, head });
      expect(r.findings).toEqual([]);
      expect(r.skipped).toEqual([{ path: 'src/link.ts', reason: 'symlink' }]);
    } finally {
      repo.cleanup();
    }
  });
});

describe('registry verification (PS104)', () => {
  const head = { 'package.json': JSON.stringify({ name: 'a', dependencies: { 'real-pkg': '^1.0.0', 'ghost-pkg': '^1.0.0', 'flaky-pkg': '^1.0.0', '@priv/pkg': '^1.0.0' } }, null, 2) + '\n' };
  const base = { 'package.json': JSON.stringify({ name: 'a', dependencies: {} }, null, 2) + '\n' };
  const lookup = async (n: string): Promise<'exists' | 'missing' | 'unknown'> => (n === 'ghost-pkg' ? 'missing' : n === 'flaky-pkg' ? 'unknown' : 'exists');
  it('reports only definitive 404s; unknown responses and scoped packages are not reported', async () => {
    const repo = makeRepo(base, head);
    try {
      const r = await analyze({ cwd: repo.dir, config: applyOverrides(defaultConfig(), { registryEnabled: true }), base: repo.base, head: repo.head, registryLookup: lookup });
      expect(r.findings.filter((f) => f.ruleId === 'PS104').map((f) => f.message)).toEqual(['`ghost-pkg` was not found on the public npm registry.']);
    } finally {
      repo.cleanup();
    }
  });
  it('makes no lookups when disabled (default) or when .npmrc points at a private registry', async () => {
    let calls = 0;
    const counting = async (): Promise<'exists'> => { calls++; return 'exists'; };
    const repo = makeRepo(base, head);
    try {
      await analyze({ cwd: repo.dir, config: defaultConfig(), base: repo.base, head: repo.head, registryLookup: counting });
    } finally {
      repo.cleanup();
    }
    const repo2 = makeRepo(base, { ...head, '.npmrc': 'registry=https://npm.internal.example/\n' });
    try {
      await analyze({ cwd: repo2.dir, config: applyOverrides(defaultConfig(), { registryEnabled: true }), base: repo2.base, head: repo2.head, registryLookup: counting });
    } finally {
      repo2.cleanup();
    }
    expect(calls).toBe(0);
  });
});
