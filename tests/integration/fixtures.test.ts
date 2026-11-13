import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyze } from '../../src/core/analyzer.ts';
import { defaultConfig } from '../../src/core/configuration.ts';
import { repoFromDirs } from '../repo.ts';

const ROOT = join(import.meta.dirname, '..', '..', 'fixtures', 'pull-requests');
const cases = readdirSync(ROOT, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);

async function scan(name: string) {
  const repo = repoFromDirs(join(ROOT, name, 'base'), join(ROOT, name, 'head'));
  try {
    const r = await analyze({ cwd: repo.dir, config: defaultConfig(), base: repo.base, head: repo.head });
    return r;
  } finally {
    repo.cleanup();
  }
}

describe('fixture pull requests', () => {
  for (const name of cases) {
    it(`${name}: findings match expected.json exactly`, async () => {
      const expected = JSON.parse(readFileSync(join(ROOT, name, 'expected.json'), 'utf8')) as { findings: { ruleId: string; file: string; line: number }[] };
      const r = await scan(name);
      const got = r.findings.map((f) => ({ ruleId: f.ruleId, file: f.file, line: f.line }));
      const key = (x: { ruleId: string; file: string; line: number }): string => `${x.file}:${String(x.line).padStart(6, '0')}:${x.ruleId}`;
      expect(got.map(key).sort()).toEqual(expected.findings.map(key).sort());
      expect(r.skipped).toEqual([]);
    });
  }

  it('is deterministic: two runs give byte-identical results', async () => {
    const a = JSON.stringify((await scan('fake-test')).findings);
    const b = JSON.stringify((await scan('fake-test')).findings);
    expect(a).toBe(b);
  });
});
