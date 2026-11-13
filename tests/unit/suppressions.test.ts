import { describe, expect, it } from 'vitest';
import { parseSuppressions } from '../../src/core/suppressions.ts';
import { parseSource } from '../../src/parsers/typescript.ts';

const parse = (src: string) => parseSuppressions(src, parseSource('a.ts', src));

describe('parseSuppressions', () => {
  it('accepts explicit IDs with a reason, standalone and trailing', () => {
    const r = parse('// patchsieve-ignore PS201, PS202 -- cache is optional\ntry {} catch {}\nfoo(); /* patchsieve-ignore PS301 -- legacy */\n');
    expect(r.invalid).toEqual([]);
    expect(r.valid.map((v) => v.line)).toEqual([2, 3]);
    expect([...r.valid[0]!.ids]).toEqual(['PS201', 'PS202']);
  });
  it('rejects missing reason, short reason, wildcard and unknown shapes', () => {
    const r = parse('// patchsieve-ignore PS201\n// patchsieve-ignore PS201 -- x\n// patchsieve-ignore *  -- why\n// patchsieve-ignore all -- why\n');
    expect(r.valid).toEqual([]);
    expect(r.invalid).toHaveLength(4);
  });
  it('does bounded work on hostile comments', () => {
    const evil = '// patchsieve-ignore PS201 -- ' + ' '.repeat(200000) + 'x\n// patchsieve-ignore PS201' + ' '.repeat(200000) + '!\n';
    const t0 = Date.now();
    parse(evil);
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});
