import ts from 'typescript';
import type { RawFinding, Rule } from '../../core/types.ts';
import { walk, unwrapExpr } from '../../parsers/typescript.ts';
import { at } from '../helpers.ts';

const SUITE_ROOTS = new Set(['it', 'test', 'describe', 'suite', 'context', 'specify', 'xit', 'xtest', 'xdescribe', 'fit', 'fdescribe', 'fcontext']);
const TEST_ROOTS = new Set(['it', 'test', 'specify', 'xit', 'xtest', 'fit']);
const HELPER_NAME = /^(assert|expect|verify|check|should|ensure|must|validate|compare|match)/i;

/** Flatten `a.b.c(...)` callee into ['a','b','c']; undefined if not a plain chain. */
export function chain(e: ts.Expression): string[] | undefined {
  const x = unwrapExpr(e);
  if (ts.isIdentifier(x)) return [x.text];
  if (ts.isPropertyAccessExpression(x)) {
    const inner = chain(x.expression);
    return inner ? [...inner, x.name.text] : undefined;
  }
  // it.each([...])('name', fn): the callee is itself a call
  if (ts.isCallExpression(x)) return chain(x.expression);
  return undefined;
}

interface TestCall {
  call: ts.CallExpression;
  names: string[];
  fn?: ts.ArrowFunction | ts.FunctionExpression;
  title?: ts.Expression;
}

function testCalls(sf: ts.SourceFile): TestCall[] {
  const res: TestCall[] = [];
  walk(sf, (n) => {
    if (!ts.isCallExpression(n)) return;
    const names = chain(n.expression);
    if (!names || !SUITE_ROOTS.has(names[0]!)) return;
    const fn = n.arguments.find((a): a is ts.ArrowFunction | ts.FunctionExpression => ts.isArrowFunction(a) || ts.isFunctionExpression(a));
    res.push({ call: n, names, fn, title: n.arguments[0] });
  });
  return res;
}

function isLeafTest(t: TestCall): boolean {
  return TEST_ROOTS.has(t.names[0]!) && !t.names.includes('describe');
}

function hasAssertion(body: ts.Node, helpers: Set<string>): boolean {
  let found = false;
  walk(body, (n) => {
    if (found) return;
    if (ts.isCallExpression(n)) {
      const c = chain(n.expression);
      if (c) {
        const root = c[0]!;
        const rest = c.slice(1);
        if (['expect', 'expectTypeOf', 'assertType', 'assert', 'chai', 'should', 'fail'].includes(root)) found = true;
        else if (helpers.has(root) || HELPER_NAME.test(root)) found = true;
        else if (rest.some((r) => r === 'should' || r.startsWith('assert') || r === 'toMatchSnapshot' || r === 'toThrow' || /^(expect|verify)/.test(r))) found = true;
        else if (root === 't' && rest[0] && /^(assert|ok|equal|deepEqual|is|not|same|throws|rejects|snapshot|match|plan)/i.test(rest[0])) found = true;
      }
    }
    if (ts.isPropertyAccessExpression(n) && ['should', 'rejects', 'resolves'].includes(n.name.text)) found = true;
  });
  return found;
}

/** File-local functions that contain an assertion (one level of helper resolution). */
function assertingHelpers(sf: ts.SourceFile): Set<string> {
  const set = new Set<string>();
  const check = (name: string, body: ts.Node): void => {
    if (hasAssertion(body, new Set())) set.add(name);
  };
  walk(sf, (n) => {
    if (ts.isFunctionDeclaration(n) && n.name && n.body) check(n.name.text, n.body);
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))) check(n.name.text, n.initializer.body);
  });
  return set;
}

export const testRules: Rule[] = [
  {
    id: 'PS301',
    name: 'Test without meaningful assertion',
    category: 'tests',
    defaultSeverity: 'warning',
    appliesTo: 'test',
    description: 'A test body contains no recognizable assertion. It can only fail by throwing, so it does not verify a result.',
    languages: ['ts', 'js'],
    check(ctx) {
      const sf = ctx.ts;
      if (!sf) return [];
      const helpers = assertingHelpers(sf);
      const out: RawFinding[] = [];
      for (const t of testCalls(sf)) {
        if (!isLeafTest(t) || !t.fn) continue;
        if (t.names.some((x) => x === 'skip' || x === 'todo') || ['xit', 'xtest'].includes(t.names[0]!)) continue;
        if (t.fn.parameters.some((p) => ts.isIdentifier(p.name) && /^done/.test(p.name.text))) continue; // callback style
        if (hasAssertion(t.fn.body, helpers)) continue;
        const empty = ts.isBlock(t.fn.body) && t.fn.body.statements.length === 0;
        out.push(
          at(
            sf,
            t.call,
            empty ? 'This test body is empty.' : 'This test has no explicit assertion on a result.',
            empty ? 'test callback has no statements' : 'no expect/assert/should-style call was found in the test body or in the file-local helpers it calls',
            { confidence: empty ? 'high' : 'medium', anchor: `test:${t.title?.getText(sf) ?? ''}` },
          ),
        );
      }
      return out;
    },
  },
  {
    id: 'PS302',
    name: 'Assertion with no effective check',
    category: 'tests',
    defaultSeverity: 'error',
    appliesTo: 'test',
    description: '`expect(value)` that is never completed with a matcher call checks nothing.',
    languages: ['ts', 'js'],
    check(ctx) {
      const sf = ctx.ts;
      if (!sf) return [];
      const out: RawFinding[] = [];
      walk(sf, (n) => {
        if (!ts.isExpressionStatement(n)) return;
        let node = unwrapExpr(n.expression);
        if (ts.isAwaitExpression(node)) node = unwrapExpr(node.expression);
        // Walk down property accesses (expect(x).not.toBe;). A trailing *call* means a matcher was invoked.
        while (ts.isPropertyAccessExpression(node)) {
          const name = node.name.text;
          if (!(['not', 'resolves', 'rejects'].includes(name) || /^to[A-Z]/.test(name))) return;
          node = unwrapExpr(node.expression);
        }
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'expect') {
          out.push(at(sf, n, 'This expect(...) is never completed with a matcher, so nothing is asserted.', 'statement ends in expect(...) or an uncalled modifier/matcher property', { anchor: n.getText(sf).slice(0, 80), confidence: 'high' }));
        }
      });
      return out;
    },
  },
  {
    id: 'PS303',
    name: 'Unconditional assertion',
    category: 'tests',
    defaultSeverity: 'warning',
    appliesTo: 'test',
    description: 'An assertion that compares a constant with itself, such as `expect(true).toBe(true)`, can never fail.',
    languages: ['ts', 'js'],
    check(ctx) {
      const sf = ctx.ts;
      if (!sf) return [];
      const out: RawFinding[] = [];
      const constKey = (e: ts.Expression): string | undefined => {
        const x = unwrapExpr(e);
        if (x.kind === ts.SyntaxKind.TrueKeyword) return 'true';
        if (x.kind === ts.SyntaxKind.FalseKeyword) return 'false';
        if (x.kind === ts.SyntaxKind.NullKeyword) return 'null';
        if (ts.isNumericLiteral(x)) return `n:${Number(x.text)}`;
        if (ts.isStringLiteralLike(x)) return `s:${x.text}`;
        return undefined;
      };
      walk(sf, (n) => {
        if (!ts.isCallExpression(n)) return;
        const c = chain(n.expression);
        if (!c) return;
        // expect(CONST).matcher(CONST)
        if (ts.isPropertyAccessExpression(n.expression)) {
          const inner = unwrapExpr(n.expression.expression);
          if (ts.isCallExpression(inner) && ts.isIdentifier(inner.expression) && inner.expression.text === 'expect' && inner.arguments[0]) {
            const m = n.expression.name.text;
            const subject = constKey(inner.arguments[0]);
            if (subject === undefined) return;
            if (['toBe', 'toEqual', 'toStrictEqual'].includes(m) && n.arguments[0] && constKey(n.arguments[0]) === subject) {
              out.push(at(sf, n, 'This assertion compares a constant to itself and can never fail.', `expect(${inner.arguments[0].getText(sf)}).${m}(...) with identical constants`, { confidence: 'high' }));
            } else if ((m === 'toBeTruthy' && subject === 'true') || (m === 'toBeFalsy' && subject === 'false')) {
              out.push(at(sf, n, 'This assertion checks a constant and can never fail.', `${m}() applied to the literal ${inner.arguments[0].getText(sf)}`, { confidence: 'high' }));
            }
            return;
          }
        }
        if (c[0] === 'assert') {
          const m = c[1];
          const a0 = n.arguments[0];
          const a1 = n.arguments[1];
          if ((c.length === 1 || m === 'ok') && a0 && constKey(a0) === 'true') {
            out.push(at(sf, n, 'assert(true) can never fail.', 'assert called with the literal true', { confidence: 'high' }));
          } else if (m && ['equal', 'strictEqual', 'deepEqual', 'deepStrictEqual'].includes(m) && a0 && a1) {
            const s = constKey(a0);
            if (s !== undefined && s === constKey(a1)) out.push(at(sf, n, 'This assertion compares a constant to itself and can never fail.', `assert.${m} with identical constants`, { confidence: 'high' }));
          }
        }
      });
      return out;
    },
  },
  {
    id: 'PS304',
    name: 'Skipped test',
    category: 'tests',
    defaultSeverity: 'warning',
    appliesTo: 'test',
    description: 'A newly added skipped test (`it.skip`, `xit`, `describe.skip`, …) does not run. `.todo` placeholders are reported as notes.',
    languages: ['ts', 'js'],
    check(ctx) {
      const sf = ctx.ts;
      if (!sf) return [];
      const out: RawFinding[] = [];
      for (const t of testCalls(sf)) {
        const name = t.names.join('.');
        const prefixed = ['xit', 'xtest', 'xdescribe'].includes(t.names[0]!);
        if (t.names.includes('todo')) {
          out.push(at(sf, t.call, 'This test is a .todo placeholder.', `${name} marks a test that is not implemented yet`, { severity: 'note', confidence: 'high', anchor: `todo:${t.title?.getText(sf)}` }));
        } else if (t.names.includes('skip') || prefixed) {
          // `test.skip(condition, reason)` / `test.skip()` are conditional skips (Playwright), not disabled tests.
          const a0 = t.call.arguments[0];
          if (!prefixed && !(a0 && ts.isStringLiteralLike(a0))) continue;
          out.push(at(sf, t.call, 'This test is skipped and will not run.', `${name} disables the test`, { confidence: 'high', anchor: `skip:${t.title?.getText(sf)}` }));
        }
      }
      return out;
    },
  },
  {
    id: 'PS305',
    name: 'Focused test committed',
    category: 'tests',
    defaultSeverity: 'error',
    appliesTo: 'test',
    description: '`.only` / `fit` / `fdescribe` makes the runner skip every other test in scope.',
    languages: ['ts', 'js'],
    check(ctx) {
      const sf = ctx.ts;
      if (!sf) return [];
      const out: RawFinding[] = [];
      for (const t of testCalls(sf)) {
        const name = t.names.join('.');
        if (t.names.includes('only') || ['fit', 'fdescribe', 'fcontext'].includes(t.names[0]!)) {
          out.push(at(sf, t.call, 'A focused test was committed; other tests in scope will not run.', `${name} restricts the run to this test`, { confidence: 'high', anchor: `only:${t.title?.getText(sf)}` }));
        }
      }
      return out;
    },
  },
];
