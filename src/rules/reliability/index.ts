import ts from 'typescript';
import type { RawFinding, Rule } from '../../core/types.ts';
import { walk, unwrapExpr } from '../../parsers/typescript.ts';
import { at } from '../helpers.ts';
import { chain } from '../tests/index.ts';

function isFetchCall(e: ts.Expression): e is ts.CallExpression {
  const x = unwrapExpr(e);
  if (!ts.isCallExpression(x)) return false;
  const c = chain(x.expression)?.join('.');
  return c === 'fetch' || c === 'globalThis.fetch' || c === 'window.fetch';
}

const isAsync = (n: { modifiers?: ts.NodeArray<ts.ModifierLike> }): boolean => !!n.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);

export const reliabilityRules: Rule[] = [
  {
    id: 'PS501',
    name: 'Ignored fetch response',
    category: 'reliability',
    defaultSeverity: 'warning',
    appliesTo: 'production',
    description: 'The result of `await fetch(...)` is discarded, so HTTP failures (4xx/5xx) are never noticed.',
    languages: ['ts', 'js'],
    check(ctx) {
      const sf = ctx.ts;
      if (!sf) return [];
      const out: RawFinding[] = [];
      walk(sf, (n) => {
        if (!ts.isExpressionStatement(n)) return;
        const e = unwrapExpr(n.expression);
        if (ts.isAwaitExpression(e) && isFetchCall(e.expression)) {
          out.push(at(sf, n, 'The fetch response is awaited but never inspected; HTTP error statuses go unnoticed.', '`await fetch(...)` used as a bare statement', { confidence: 'high' }));
        }
      });
      return out;
    },
  },
  {
    id: 'PS502',
    name: 'Fire-and-forget promise',
    category: 'reliability',
    defaultSeverity: 'warning',
    appliesTo: 'production',
    description: 'A promise-returning call is neither awaited, returned, caught, nor marked `void`, so its rejection is unhandled.',
    languages: ['ts', 'js'],
    check(ctx) {
      const sf = ctx.ts;
      if (!sf) return [];
      const asyncFns = new Set<string>();
      walk(sf, (n) => {
        if (ts.isFunctionDeclaration(n) && n.name && isAsync(n)) asyncFns.add(n.name.text);
        if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer)) && isAsync(n.initializer)) asyncFns.add(n.name.text);
      });
      const out: RawFinding[] = [];
      walk(sf, (n) => {
        if (!ts.isExpressionStatement(n)) return;
        const e = unwrapExpr(n.expression);
        if (!ts.isCallExpression(e)) return; // await / void / assignment are explicit
        const c = chain(e.expression);
        if (!c) return;
        const last = c[c.length - 1];
        if (last === 'catch' || last === 'finally') return;
        let reason: string | undefined;
        if (isFetchCall(e)) reason = '`fetch(...)` returns a promise that is dropped';
        else if (c.length === 2 && c[0] === 'Promise' && ['all', 'allSettled', 'race', 'any'].includes(c[1]!)) reason = `\`${c.join('.')}(...)\` result is dropped`;
        else if (c.length === 1 && asyncFns.has(c[0]!)) reason = `\`${c[0]}\` is an async function declared in this file and its promise is dropped`;
        else if (last === 'then' && (e as ts.CallExpression).arguments.length < 2) reason = '`.then()` chain with no rejection handler is not awaited';
        if (reason) out.push(at(sf, n, 'This promise is not awaited or handled; a rejection becomes an unhandled rejection.', reason, { confidence: 'medium' }));
      });
      return out;
    },
  },
  {
    id: 'PS503',
    name: 'Unsafe success assumption',
    category: 'reliability',
    defaultSeverity: 'warning',
    appliesTo: 'production',
    description: 'A fetch response body is parsed without the response status ever being checked or the response being passed to a checker.',
    languages: ['ts', 'js'],
    check(ctx) {
      const sf = ctx.ts;
      if (!sf) return [];
      const out: RawFinding[] = [];
      walk(sf, (n) => {
        if (!ts.isVariableDeclaration(n) || !ts.isIdentifier(n.name) || !n.initializer) return;
        const init = unwrapExpr(n.initializer);
        if (!ts.isAwaitExpression(init) || !isFetchCall(init.expression)) return;
        const name = n.name.text;
        const scope = n.parent?.parent?.parent; // declaration list -> statement -> enclosing block
        if (!scope) return;
        let parsed = false;
        let checked = false;
        walk(scope, (m) => {
          if (ts.isPropertyAccessExpression(m) && ts.isIdentifier(m.expression) && m.expression.text === name) {
            if (['ok', 'status', 'statusText', 'redirected'].includes(m.name.text)) checked = true;
            if (['json', 'text', 'blob', 'arrayBuffer', 'formData'].includes(m.name.text)) parsed = true;
          }
          // Response handed to another function or returned: unknown, stay quiet.
          if (ts.isIdentifier(m) && m.text === name && m.parent && ((ts.isCallExpression(m.parent) && m.parent.arguments.includes(m)) || ts.isReturnStatement(m.parent) || ts.isShorthandPropertyAssignment(m.parent))) checked = true;
        });
        if (parsed && !checked) {
          out.push(at(sf, n, `\`${name}\` body is parsed without checking \`${name}.ok\` or \`${name}.status\`.`, 'fetch response is read but its status is never inspected in this scope', { confidence: 'medium', anchor: `unsafe:${name}` }));
        }
      });
      return out;
    },
  },
];
