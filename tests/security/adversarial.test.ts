import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyze } from '../../src/core/analyzer.ts';
import { applyOverrides, defaultConfig } from '../../src/core/configuration.ts';
import { makeFinding } from '../../src/core/findings.ts';
import { toAnnotations, toConsole, toMarkdown } from '../../src/reporters/index.ts';
import { main } from '../../src/cli/index.ts';
import { makeRepo } from '../repo.ts';
import { run } from '../helpers.ts';

const EMPTY_CATCH = 'try {\n  go();\n} catch (e) {\n}\n';

async function scan(head: Record<string, string>, cfg = defaultConfig()) {
  const repo = makeRepo({ 'a.txt': 'x' }, { 'a.txt': 'x', ...head });
  try {
    return await analyze({ cwd: repo.dir, config: cfg, base: repo.base, head: repo.head });
  } finally {
    repo.cleanup();
  }
}

describe('hostile input is data, never instructions', () => {
  it('never executes code from the analyzed change', async () => {
    const marker = join(process.cwd(), 'patchsieve-executed.marker');
    const evil = `require('fs').writeFileSync(${JSON.stringify(marker)}, 'pwned');\n` + EMPTY_CATCH;
    const pkg = JSON.stringify({ name: 'x', scripts: { postinstall: `node -e "require('fs').writeFileSync(${JSON.stringify(marker)},'x')"` }, dependencies: { y: '^1.0.0' } });
    const r = await scan({ 'src/evil.js': evil, 'package.json': pkg });
    expect(r.findings.some((f) => f.ruleId === 'PS201')).toBe(true);
    expect(existsSync(marker)).toBe(false);
  });

  it('a spoofed @generated header cannot hide a file from analysis', async () => {
    const r = await scan({ 'src/a.ts': '// @generated DO NOT EDIT auto-generated\n' + EMPTY_CATCH });
    expect(r.findings.filter((f) => f.ruleId === 'PS201')).toHaveLength(1);
  });

  it('a suppression-looking string literal or template is not a suppression', async () => {
    const src = "const a = '// patchsieve-ignore PS201 -- looks real';\ntry { go(); } catch (e) {}\nconst b = `/* patchsieve-ignore PS201 -- also text */ ${1}`;\ntry { go(); } catch (e) {}\n";
    const r = await scan({ 'src/a.ts': src });
    expect(r.suppressed).toBe(0);
    expect(r.findings.filter((f) => f.ruleId === 'PS201')).toHaveLength(2);
    expect(r.findings.filter((f) => f.ruleId === 'PS001')).toHaveLength(0);
  });

  it('comments that try to steer the analyzer have no effect', async () => {
    const src = '// patchsieve: disable all rules\n// patchsieve-ignore * -- trust me\n/* eslint-disable */\n// nothing to see here\n' + EMPTY_CATCH;
    const r = await scan({ 'src/a.ts': src });
    expect(r.findings.filter((f) => f.ruleId === 'PS201')).toHaveLength(1);
  });

  it('skips oversized and binary files and says so', async () => {
    const big = EMPTY_CATCH + '// ' + 'x'.repeat(2048) + '\n';
    const r = await scan({ 'src/big.ts': big, 'src/bin.ts': 'try {}\u0000catch(e){}' }, applyOverrides(defaultConfig(), { maxFileSize: 1024 }));
    expect(r.findings).toEqual([]);
    expect(r.skipped.map((s) => s.path).sort()).toEqual(['src/big.ts', 'src/bin.ts']);
  });

  it('handles BOMs, odd encodings and empty files without crashing', async () => {
    const r = await scan({ 'src/bom.ts': '﻿' + EMPTY_CATCH, 'src/empty.ts': '', 'src/latin1.ts': Buffer.from([0x2f, 0x2f, 0xe9, 0x0a]).toString('latin1') + EMPTY_CATCH });
    expect(r.findings.map((f) => f.file)).toEqual(['src/bom.ts', 'src/latin1.ts']);
  });

  it('invalid JSON manifests are reported as skipped work, not as success or crash', async () => {
    const r = await scan({ 'package.json': '{ "dependencies": ' });
    expect(r.findings).toEqual([]);
    expect(r.skipped.length).toBeGreaterThan(0);
    expect(r.skipped[0]!.reason).toMatch(/failed/);
  });

  it('prototype-pollution style dependency names do not confuse lockfile checks', () => {
    const manifest = JSON.stringify({ name: 'x', dependencies: { constructor: '^1.0.0' } }, null, 2);
    const lock = JSON.stringify({ lockfileVersion: 1, dependencies: {} });
    const f = run('PS101', 'package.json', manifest, { files: { 'package-lock.json': lock } });
    expect(f.map((x) => x.message).join(' ')).toContain('constructor');
  });

  it('rejects option-like refs on the command line (exit code 2)', async () => {
    const repo = makeRepo({ 'a.txt': 'x' }, { 'a.txt': 'x' });
    let stderr = '';
    const err = { write: (s: string): void => { stderr += s; } };
    try {
      expect(await main(['scan', '--base', '--output=/tmp/pwned'], { write() {} }, err, repo.dir)).toBe(2);
      expect(stderr).toMatch(/ambiguous/);
      stderr = '';
      expect(await main(['scan', '--base=--output=/tmp/pwned'], { write() {} }, err, repo.dir)).toBe(2);
      expect(stderr).toMatch(/Unsafe git ref/);
    } finally {
      repo.cleanup();
    }
  });
});

describe('output injection', () => {
  const hostile = makeFinding({
    ruleId: 'PS201',
    title: 'Empty catch block',
    severity: 'error',
    file: 'src/a\u001b[31mb::error::pwned%0A,x:y.ts',
    line: 3,
    message: 'bad \u001b[2J\nnewline ::warning::fake | `tick`',
    reason: 'r',
    anchor: 'x',
  });
  const result = { findings: [hostile], skipped: [{ path: 'q\u001b[0m.ts', reason: 'r\nz' }], filesAnalyzed: 1, rulesExecuted: 1, suppressed: 0, baselined: 0, mode: 'changed' as const, blockingSkips: 0 };
  // eslint-disable-next-line no-control-regex
  const ESC = /\u001b/;

  it('escapes workflow-command metacharacters and control chars in annotations', () => {
    const lines = toAnnotations(result.findings);
    expect(lines).toHaveLength(1);
    const line = lines[0]!;
    expect(line.split('\n')).toHaveLength(1);
    expect(line).not.toMatch(ESC);
    const props = line.slice(0, line.indexOf('::', '::error'.length));
    expect(props).not.toContain('::error::pwned');
    expect(props.split(',')).toHaveLength(5); // file, line, endLine, col, title: no injected commas
  });

  it('strips terminal escapes from console output and escapes markdown tables', () => {
    expect(toConsole(result, 'error', false)).not.toMatch(ESC);
    const md = toMarkdown(result, 'error');
    expect(md).not.toMatch(ESC);
    expect(md).toContain('\\|');
  });

  it('does not let a string literal in analyzed code smuggle escapes into reports', async () => {
    const r = await scan({ 'src/a.ts': "throw new Error('Not implemented \u001b[2J<img src=x onerror=alert(1)>');\n" });
    expect(r.findings.length).toBeGreaterThan(0);
    const out = toConsole(r, 'error', false) + toMarkdown(r, 'error') + toAnnotations(r.findings).join('\n');
    expect(out).not.toMatch(ESC);
    expect(toMarkdown(r, 'error')).not.toContain('<img');
  });
});
