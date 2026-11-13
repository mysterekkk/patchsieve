import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseInputs } from '../../src/action/inputs.ts';
import { main } from '../../src/cli/index.ts';
import { VERSION } from '../../src/version.ts';
import { makeRepo, type TempRepo } from '../repo.ts';

const EMPTY_CATCH = 'try {\n  go();\n} catch (e) {\n}\n';

async function cli(repo: TempRepo, args: string[]): Promise<{ code: number; out: string; err: string }> {
  let out = '';
  let err = '';
  const code = await main(args, { write: (s) => { out += s; } }, { write: (s) => { err += s; } }, repo.dir);
  return { code, out, err };
}

describe('CLI', () => {
  const dirty = makeRepo({ 'a.txt': 'x' }, { 'a.txt': 'x', 'src/a.ts': EMPTY_CATCH, 'tests/a.test.ts': "it('x', () => {});\n" });
  const clean = makeRepo({ 'a.txt': 'x' }, { 'a.txt': 'x', 'src/a.ts': 'export const a = 1;\n' });

  it('exit code 1 when findings reach the threshold, 0 otherwise', async () => {
    expect((await cli(dirty, ['scan', '--base', dirty.base])).code).toBe(1);
    expect((await cli(clean, ['scan', '--base', clean.base])).code).toBe(0);
  });
  it('warnings alone do not fail by default but fail with --fail-on warning', async () => {
    const warnOnly = makeRepo({ 'a.txt': 'x' }, { 'a.txt': 'x', 'tests/a.test.ts': "it('x', () => {});\n" });
    try {
      expect((await cli(warnOnly, ['scan', '--base', warnOnly.base])).code).toBe(0);
      expect((await cli(warnOnly, ['scan', '--base', warnOnly.base, '--fail-on', 'warning'])).code).toBe(1);
      expect((await cli(warnOnly, ['scan', '--base', warnOnly.base, '--rule', 'PS301=error'])).code).toBe(1);
    } finally {
      warnOnly.cleanup();
    }
  });
  it('exit code 2 for configuration problems', async () => {
    expect((await cli(clean, ['scan', '--base', clean.base, '--fail-on', 'loud'])).code).toBe(2);
    expect((await cli(clean, ['scan', '--base', clean.base, '--rule', 'nonsense'])).code).toBe(2);
    expect((await cli(clean, ['scan', '--base', clean.base, '--format', 'xml'])).code).toBe(2);
    expect((await cli(clean, ['scan', '--base', 'does-not-exist'])).code).toBe(2);
    expect((await cli(clean, ['bogus'])).code).toBe(2);
  });
  it('json output is valid, has a stable shape and no control characters', async () => {
    const { out } = await cli(dirty, ['scan', '--base', dirty.base, '--format', 'json']);
    const j = JSON.parse(out) as { tool: { name: string; version: string }; summary: Record<string, unknown>; findings: { ruleId: string }[] };
    expect(j.tool).toEqual({ name: 'patchsieve', version: VERSION });
    expect(j.summary).toMatchObject({ errors: 1, warnings: 1, result: 'failed', filesAnalyzed: 2 });
    expect(j.findings.map((f) => f.ruleId)).toEqual(['PS201', 'PS301']);
    // eslint-disable-next-line no-control-regex
    expect(out).not.toMatch(/[\u0000-\u0008\u000b-\u001f]/);
  });
  it('sarif output is structurally valid SARIF 2.1.0', async () => {
    const { out } = await cli(dirty, ['scan', '--base', dirty.base, '--format', 'sarif']);
    const s = JSON.parse(out);
    expect(s.version).toBe('2.1.0');
    expect(s.$schema).toContain('sarif-2.1.0');
    const run = s.runs[0];
    const ids = run.tool.driver.rules.map((r: { id: string }) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(run.results).toHaveLength(2);
    for (const r of run.results) {
      expect(ids[r.ruleIndex]).toBe(r.ruleId);
      expect(['error', 'warning', 'note']).toContain(r.level);
      const loc = r.locations[0].physicalLocation;
      expect(loc.artifactLocation.uri).not.toContain('\\');
      expect(loc.region.startLine).toBeGreaterThanOrEqual(1);
      expect(r.partialFingerprints['patchsieve/v1']).toMatch(/^[0-9a-f]{16}$/);
    }
  });
  it('markdown report has the expected sections and verdict', async () => {
    const { out } = await cli(dirty, ['scan', '--base', dirty.base, '--format', 'markdown']);
    expect(out).toContain('## PatchSieve — PR Quality Gate');
    expect(out).toContain('### Errors');
    expect(out).toContain('### Warnings');
    expect(out).toContain('**Result: FAILED**');
  });
  it('writes to --output and baseline output feeds back into a passing scan', async () => {
    const outFile = join(dirty.dir, 'report.sarif');
    const r = await cli(dirty, ['scan', '--base', dirty.base, '--format', 'sarif', '--output', 'report.sarif']);
    expect(r.out).toBe('');
    expect(JSON.parse(readFileSync(outFile, 'utf8')).version).toBe('2.1.0');
    const b = await cli(dirty, ['baseline', '--base', dirty.base]);
    expect(JSON.parse(b.out).fingerprints).toHaveLength(2);
  });
  it('rules and doctor work, help/version exit 0', async () => {
    expect((await cli(clean, ['rules', '--json'])).out).toContain('PS201');
    const d = await cli(clean, ['doctor']);
    expect(d.code).toBe(0);
    expect(d.out).toContain('node');
    expect((await cli(clean, ['--version'])).out.trim()).toBe(VERSION);
    expect((await cli(clean, ['--help'])).code).toBe(0);
  });
  it('same input gives byte-identical reports', async () => {
    const a = (await cli(dirty, ['scan', '--base', dirty.base, '--format', 'json'])).out;
    const b = (await cli(dirty, ['scan', '--base', dirty.base, '--format', 'json'])).out;
    expect(a).toBe(b);
    dirty.cleanup();
    clean.cleanup();
  });
});

describe('Action inputs', () => {
  const get = (m: Record<string, string>) => (n: string): string => m[n] ?? '';
  it('maps inputs and applies defaults', () => {
    const i = parseInputs(get({ 'fail-on': 'warning', rules: 'PS201=off, PS301=error', ignore: '**/x/**\n**/y/**', 'max-files': '50', 'scan-mode': 'all', annotations: 'false' }));
    expect(i.overrides).toMatchObject({ failOn: 'warning', mode: 'all', maxFiles: 50, rules: { PS201: 'off', PS301: 'error' }, ignore: ['**/x/**', '**/y/**'], annotations: false });
    expect(parseInputs(get({})).format).toBe('console');
  });
  it('rejects invalid values', () => {
    expect(() => parseInputs(get({ 'fail-on': 'x' }))).toThrow();
    expect(() => parseInputs(get({ rules: 'PS201' }))).toThrow();
    expect(() => parseInputs(get({ 'max-files': '-1' }))).toThrow();
    expect(() => parseInputs(get({ annotations: 'maybe' }))).toThrow();
  });
});
