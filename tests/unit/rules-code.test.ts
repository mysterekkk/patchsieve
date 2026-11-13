import { describe, expect, it } from 'vitest';
import { lines, run } from '../helpers.ts';

describe('PS201 empty catch', () => {
  it('flags an empty catch block at the right line', () => {
    const f = run('PS201', 'src/a.ts', 'try {\n  go();\n} catch (e) {\n}\n');
    expect(lines(f)).toEqual([3]);
  });
  it('ignores catch with a comment, logging, rethrow or fallback', () => {
    const src = [
      'try { a(); } catch { /* best effort: cache is optional */ }',
      'try { a(); } catch (e) { console.error(e); }',
      'try { a(); } catch (e) { throw e; }',
      'try { a(); } catch { return null; }',
      'try { a(); } catch (e) {\n  // intentionally ignored\n}',
    ].join('\n');
    expect(run('PS201', 'src/a.ts', src)).toEqual([]);
  });
});

describe('PS202 swallowed rejection', () => {
  it('flags empty .catch handlers', () => {
    const f = run('PS202', 'src/a.ts', 'save().catch(() => {});\nsave().catch(function () {});\nsave().then(ok, () => undefined);');
    expect(lines(f)).toEqual([1, 2, 3]);
  });
  it('does not flag handlers that do something', () => {
    expect(run('PS202', 'src/a.ts', 'save().catch((e) => log(e));\nsave().catch(() => { /* ignore: optional */ });')).toEqual([]);
  });
});

describe('PS203 no-op catch', () => {
  it('flags catch that only references the error', () => {
    expect(lines(run('PS203', 'src/a.ts', 'try { a(); } catch (e) {\n  e;\n}'))).toEqual([1]);
  });
  it('does not flag real handling', () => {
    expect(run('PS203', 'src/a.ts', 'try { a(); } catch (e) { report(e); }')).toEqual([]);
  });
});

describe('PS301 test without assertion', () => {
  it('flags a test that only calls code', () => {
    const f = run('PS301', 'tests/a.test.ts', "it('creates an invoice', async () => {\n  await createInvoice();\n});");
    expect(lines(f)).toEqual([1]);
    expect(f[0]!.confidence).toBe('medium');
  });
  it('accepts expect, assert, rejects, and local asserting helpers', () => {
    const src = [
      "function checkOk(x: number) { expect(x).toBe(1); }",
      "it('a', () => { expect(1).toBe(1); });",
      "it('b', () => { assert.equal(1, 1); });",
      "it('c', async () => { await expect(p()).rejects.toThrow(); });",
      "it('d', () => { checkOk(1); });",
      "it('e', () => { assertValid(x); });",
      "it('f', (done) => { cb(done); });",
      "it.todo('later');",
      "it.skip('skipped', () => {});",
    ].join('\n');
    expect(run('PS301', 'tests/a.test.ts', src)).toEqual([]);
  });
  it('is not applied to production files', () => {
    expect(run('PS301', 'src/a.ts', "it('x', () => {});").length).toBe(1); // helper bypasses kind; engine filters by appliesTo
  });
});

describe('PS302 expect without matcher', () => {
  it('flags bare expect and dangling modifiers', () => {
    const f = run('PS302', 'tests/a.test.ts', "it('x', () => {\n  expect(result);\n  expect(result).not;\n  expect(result).toBe;\n});");
    expect(lines(f)).toEqual([2, 3, 4]);
  });
  it('accepts completed assertions', () => {
    expect(run('PS302', 'tests/a.test.ts', "it('x', async () => { expect(a).toBe(1); await expect(p).resolves.toBe(2); expect(a).not.toBeNull(); });")).toEqual([]);
  });
});

describe('PS303 tautology', () => {
  it('flags constant self-comparisons', () => {
    const f = run('PS303', 'tests/a.test.ts', "expect(true).toBe(true);\nexpect(1).toEqual(1);\nassert(true);\nassert.equal('a', 'a');\nexpect(true).toBeTruthy();");
    expect(lines(f)).toEqual([1, 2, 3, 4, 5]);
  });
  it('does not flag meaningful constants', () => {
    expect(run('PS303', 'tests/a.test.ts', "expect(compute()).toBe(true);\nexpect(1).toBe(2);\nexpect(x).toBe(x2);")).toEqual([]);
  });
});

describe('PS304 skipped tests', () => {
  it('flags skip variants and reports todo as a note', () => {
    const f = run('PS304', 'tests/a.test.ts', "it.skip('a', () => {});\nxit('b', () => {});\ndescribe.skip('c', () => {});\ntest.todo('d');");
    expect(lines(f)).toEqual([1, 2, 3, 4]);
    expect(f[3]!.severity).toBe('note');
  });
  it('ignores Playwright conditional skips', () => {
    expect(run('PS304', 'tests/a.test.ts', "test('a', async ({ browserName }) => { test.skip(browserName === 'webkit', 'flaky'); });")).toEqual([]);
  });
});

describe('PS305 focused tests', () => {
  it('flags .only, fit and fdescribe', () => {
    const f = run('PS305', 'tests/a.test.ts', "it.only('a', () => {});\ndescribe.only('b', () => {});\nfit('c', () => {});\ntest.describe.only('d', () => {});");
    expect(lines(f)).toEqual([1, 2, 3, 4]);
  });
  it('ignores normal tests and unrelated .only', () => {
    expect(run('PS305', 'tests/a.test.ts', "it('a', () => {});\nconst only = list.only();")).toEqual([]);
  });
});

describe('PS401 not implemented', () => {
  it('flags throw new Error(Not implemented)', () => {
    const f = run('PS401', 'src/a.ts', "async function syncOrders() {\n  throw new Error('Not implemented');\n}");
    expect(lines(f)).toEqual([2]);
  });
  it('ignores other throws', () => {
    expect(run('PS401', 'src/a.ts', "throw new Error('Invalid order');")).toEqual([]);
  });
});

describe('PS402 placeholder return', () => {
  it('flags action-named functions returning constants', () => {
    const f = run('PS402', 'src/a.ts', 'function calculateTotal() {\n  return 0;\n}');
    expect(lines(f)).toEqual([1]);
  });
  it('does not flag getters or real logic', () => {
    expect(run('PS402', 'src/a.ts', 'function getDefault() { return 0; }\nfunction calculateTotal(a: number) { return a * 2; }')).toEqual([]);
  });
});

describe('PS403 TODO in empty implementation', () => {
  it('flags TODO in a nearly empty function, at the comment line', () => {
    const f = run('PS403', 'src/a.ts', 'function processPayment() {\n  // TODO: implement later\n}');
    expect(lines(f)).toEqual([2]);
  });
  it('ignores TODO in a substantial function', () => {
    expect(run('PS403', 'src/a.ts', 'function f() {\n  a();\n  b();\n  c();\n  // TODO: tune\n}')).toEqual([]);
  });
});

describe('PS404 fake success', () => {
  it('flags hard-coded success with mock hint', () => {
    expect(lines(run('PS404', 'src/a.ts', 'function chargeCard() {\n  // mock for now\n  return { success: true };\n}'))).toEqual([1]);
  });
  it('ignores unrelated success objects', () => {
    expect(run('PS404', 'src/a.ts', 'function describeState() { return { success: true }; }')).toEqual([]);
  });
});

describe('PS501 ignored fetch response', () => {
  it('flags bare awaited fetch', () => {
    expect(lines(run('PS501', 'src/a.ts', "async function f() {\n  await fetch('/x', { method: 'POST' });\n}"))).toEqual([2]);
  });
  it('accepts a kept response', () => {
    expect(run('PS501', 'src/a.ts', "async function f() { const r = await fetch('/x'); return r; }")).toEqual([]);
  });
});

describe('PS502 fire-and-forget', () => {
  it('flags dropped promises', () => {
    const f = run('PS502', 'src/a.ts', "async function save() {}\nfunction f() {\n  save();\n  fetch('/x');\n  Promise.all([a, b]);\n  p.then(x);\n}");
    expect(lines(f)).toEqual([3, 4, 5, 6]);
  });
  it('accepts explicit handling', () => {
    expect(run('PS502', 'src/a.ts', "async function save() {}\nasync function f() {\n  await save();\n  void save();\n  save().catch(log);\n  return save();\n}")).toEqual([]);
  });
});

describe('PS503 unsafe success assumption', () => {
  it('flags json() without a status check', () => {
    const f = run('PS503', 'src/a.ts', "async function f() {\n  const res = await fetch('/x');\n  return res.json();\n}");
    expect(lines(f)).toEqual([2]);
  });
  it('accepts ok check or delegation', () => {
    expect(run('PS503', 'src/a.ts', "async function f() {\n  const res = await fetch('/x');\n  if (!res.ok) throw new Error('bad');\n  return res.json();\n}")).toEqual([]);
    expect(run('PS503', 'src/a.ts', "async function f() {\n  const res = await fetch('/x');\n  assertOk(res);\n  return res.json();\n}")).toEqual([]);
  });
});
