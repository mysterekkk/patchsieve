import { describe, expect, it } from 'vitest';
import { analyze } from '../../src/core/analyzer.ts';
import { applyOverrides, defaultConfig } from '../../src/core/configuration.ts';
import { parseUnifiedDiff, unquote } from '../../src/core/diff.ts';
import { summarize } from '../../src/core/findings.ts';
import { main } from '../../src/cli/index.ts';
import { toConsole, toMarkdown } from '../../src/reporters/index.ts';
import { locateSectionKeys } from '../../src/parsers/json-locate.ts';
import { sanitize } from '../../src/utils/text.ts';
import { lines, run } from '../helpers.ts';
import { makeRepo } from '../repo.ts';

const EMPTY_CATCH = 'try {\n  go();\n} catch (e) {\n}\n';

describe('git path decoding', () => {
  it('decodes C-style escapes and octal UTF-8 bytes', () => {
    expect(unquote('"migrations/0002\\001.sql"')).toBe('migrations/0002\u0001.sql');
    expect(unquote('"a\\\\b.sql"')).toBe('a\\b.sql');
    expect(unquote('"x\\ty\\nz\\"q"')).toBe('x\ty\nz"q');
    expect(unquote('"za\\305\\274\\303\\263\\305\\202\\304\\207.ts"')).toBe('zażółć.ts');
    expect(unquote('plain/path.ts')).toBe('plain/path.ts');
  });
  it('keeps quoted paths with control characters and strips the a/ b/ prefixes after decoding', () => {
    const d = ['diff --git "a/m/\\001.sql" "b/m/\\001.sql"', 'new file mode 100644', '--- /dev/null', '+++ "b/m/\\001.sql"', '@@ -0,0 +1 @@', '+DROP TABLE x;'].join('\n');
    const r = parseUnifiedDiff(d);
    expect(r).toHaveLength(1);
    expect(r[0]!.path).toBe('m/\u0001.sql');
  });
  it('marks enormous hunks as whole-file instead of building huge sets', () => {
    const r = parseUnifiedDiff(['diff --git a/x.ts b/x.ts', '--- a/x.ts', '+++ b/x.ts', '@@ -1 +1,50000000 @@', '+x'].join('\n'));
    expect(r[0]!.whole).toBe(true);
    expect(r[0]!.addedLines.size).toBe(0);
  });
});

describe('output sanitising', () => {
  it('escapes newlines, tabs and zero-width characters', () => {
    expect(sanitize('a\n::error::x\tb​c d')).toBe('a\\u000a::error::x\\u0009b\\u200bc\\u2028d');
  });
  it('console and markdown output stay on one line per item', () => {
    const r = {
      findings: [],
      skipped: [{ path: 'x\n::error::injected', reason: 'r', blocking: true }],
      filesAnalyzed: 0, rulesExecuted: 1, suppressed: 0, baselined: 0, mode: 'changed' as const, blockingSkips: 1,
    };
    expect(toConsole(r, 'error', false).split('\n').some((l) => l.startsWith('::'))).toBe(false);
    expect(toMarkdown(r, 'error').split('\n').some((l) => l.startsWith('::'))).toBe(false);
  });
  it('markdown cannot be broken out of with backticks or link syntax', () => {
    const r = {
      findings: [], skipped: [{ path: 'x`[link](https://evil.example)`.ts', reason: 'r' }],
      filesAnalyzed: 0, rulesExecuted: 1, suppressed: 0, baselined: 0, mode: 'changed' as const, blockingSkips: 0,
    };
    const md = toMarkdown(r, 'error');
    expect(md).toContain('``');
    expect(md).not.toMatch(/(^|[^`\\])\[link\]\(https/);
  });
});

describe('skipped files fail the gate', () => {
  it('summarize counts blocking skips unless failOn is none', () => {
    expect(summarize([], 'error', 1).failed).toBe(true);
    expect(summarize([], 'warning', 2).failed).toBe(true);
    expect(summarize([], 'none', 2).failed).toBe(false);
    expect(summarize([], 'error', 0).failed).toBe(false);
  });
  it('an oversized or unparsable changed file makes the CLI fail (exit 1), unless disabled', async () => {
    const repo = makeRepo({ 'a.txt': 'x' }, { 'a.txt': 'x', 'src/huge.ts': '// ' + 'x'.repeat(5000) + '\n', 'src/broken.ts': 'function ( {{{' });
    try {
      const run1 = async (extra: string[]): Promise<number> => main(['scan', '--base', repo.base, '--max-file-size', '1024', ...extra], { write() {} }, { write() {} }, repo.dir);
      expect(await run1([])).toBe(1);
      const cfg = applyOverrides(defaultConfig(), { maxFileSize: 1024 });
      cfg.failOnSkipped = false;
      const r = await analyze({ cwd: repo.dir, config: cfg, base: repo.base, head: repo.head });
      expect(r.blockingSkips).toBe(0);
      expect(r.skipped.length).toBe(2);
    } finally {
      repo.cleanup();
    }
  });
  it('a source file made binary with NUL bytes is a blocking skip (cannot be used to hide code)', async () => {
    const repo = makeRepo({ 'a.txt': 'x' }, { 'a.txt': 'x', 'src/bin.ts': 'a\u0000b', '.gitattributes': '*.ts binary\n' });
    try {
      const r = await analyze({ cwd: repo.dir, config: defaultConfig(), base: repo.base, head: repo.head });
      expect(r.skipped).toEqual([{ path: 'src/bin.ts', reason: 'binary', blocking: true }]);
      expect(r.blockingSkips).toBe(1);
    } finally {
      repo.cleanup();
    }
  });
  it('junk files cannot crowd real files out of max-files', async () => {
    const head: Record<string, string> = { 'a.txt': 'x', 'zzz/real.ts': EMPTY_CATCH };
    for (let i = 0; i < 30; i++) head[`0/junk${i}.json`] = '{}';
    const repo = makeRepo({ 'a.txt': 'x' }, head);
    try {
      const r = await analyze({ cwd: repo.dir, config: applyOverrides(defaultConfig(), { maxFiles: 3 }), base: repo.base, head: repo.head });
      expect(r.findings.map((f) => f.file)).toEqual(['zzz/real.ts']);
      expect(r.blockingSkips).toBe(0);
    } finally {
      repo.cleanup();
    }
  });
  it('when the cap is genuinely exceeded the overflow is blocking, not silent', async () => {
    const head: Record<string, string> = { 'a.txt': 'x' };
    for (let i = 0; i < 5; i++) head[`src/f${i}.ts`] = 'export const x = 1;\n';
    const repo = makeRepo({ 'a.txt': 'x' }, head);
    try {
      const r = await analyze({ cwd: repo.dir, config: applyOverrides(defaultConfig(), { maxFiles: 2 }), base: repo.base, head: repo.head });
      expect(r.blockingSkips).toBe(3);
    } finally {
      repo.cleanup();
    }
  });
});

describe('json key locator', () => {
  const sections = ['dependencies'];
  it('handles braces/colons/quotes inside strings and compact objects', () => {
    const text = '{"name":"a}b","scripts":{"x":"echo \\"}\\" : y"},\n"dependencies":{"p":"1",\n"q":"{x}",\n"r":"2"}}';
    const m = locateSectionKeys(text, sections).get('dependencies')!;
    expect([...m.entries()]).toEqual([['p', 2], ['q', 3], ['r', 4]]);
  });
  it('uses the last occurrence of a duplicate key, like JSON.parse', () => {
    const text = '{\n"dependencies": {\n"a": "1",\n"a": "*"\n}\n}';
    expect(locateSectionKeys(text, sections).get('dependencies')!.get('a')).toBe(4);
    expect(lines(run('PS103', 'package.json', text))).toEqual([4]);
  });
  it('a nested key named like a dependency elsewhere is not mistaken for one', () => {
    const text = '{\n"config": {"dependencies": {"zzz": "*"}},\n"dependencies": {"a": "*"}\n}';
    expect(lines(run('PS103', 'package.json', text))).toEqual([3]);
  });
});

describe('dependency line mapping', () => {
  it('finds inline dependency entries instead of falling back to line 1', () => {
    const text = '{\n  "name": "x",\n  "dependencies": {"a":"1","evil":"*"}\n}\n';
    expect(lines(run('PS103', 'package.json', text))).toEqual([3]);
  });
  it('finds several compact entries on one line inside a multi-line section', () => {
    const text = '{\n  "dependencies": {\n    "a": "1", "evil": "latest"\n  }\n}\n';
    expect(lines(run('PS103', 'package.json', text))).toEqual([3]);
  });
});
