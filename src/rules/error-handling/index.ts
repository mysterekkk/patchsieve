import ts from 'typescript';
import type { RawFinding, Rule } from '../../core/types.ts';
import { blockHasComment, pos, walk, unwrapExpr } from '../../parsers/typescript.ts';
import { at } from '../helpers.ts';

const DOCS = 'docs/rules.md';
void DOCS;

/**
 * Only a literally empty block body counts (`() => {}`, `function () {}`).
 * `() => undefined` / `() => null` are an explicit, deliberate "ignore" idiom and are not reported.
 */
function isEmptyBody(fn: ts.Node): boolean {
  if (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) return ts.isBlock(fn.body) && fn.body.statements.length === 0;
  return false;
}

/** Statements that count as "doing something" with an error. */
function usesError(block: ts.Block, name: string | undefined): boolean {
  if (block.statements.length === 0) return false;
  let doing = false;
  for (const st of block.statements) {
    if (ts.isThrowStatement(st) || ts.isReturnStatement(st)) { doing = true; break; }
    if (ts.isExpressionStatement(st)) {
      const e = unwrapExpr(st.expression);
      // bare literal / identifier / void-0 expression statements do nothing
      if (ts.isStringLiteral(e) || ts.isNumericLiteral(e) || ts.isIdentifier(e) || ts.isVoidExpression(e)) {
        if (ts.isIdentifier(e) && e.text !== name) doing = true; // e.g. `cleanup;` is weird but not our concern
        continue;
      }
      doing = true; break;
    } else { doing = true; break; }
  }
  return doing;
}

export const errorHandlingRules: Rule[] = [
  {
    id: 'PS201', name: 'Empty catch block', category: 'error-handling', defaultSeverity: 'error',
    description: 'A catch block with no statements and no explanatory comment silently discards the error.',
    languages: ['ts', 'js'],
    check(ctx) {
      const sf = ctx.ts; if (!sf) return [];
      const out: RawFinding[] = [];
      walk(sf, (n) => {
        if (ts.isCatchClause(n) && n.block.statements.length === 0 && !blockHasComment(sf, n.block)) {
          const p = pos(sf, n);
          out.push({ ...p, message: 'This catch block is empty and swallows the error.', reason: 'catch clause contains no statements and no comment explaining why ignoring is intended', anchor: 'catch{}' });
        }
      });
      return out;
    },
  },
  {
    id: 'PS202', name: 'Silently swallowed promise rejection', category: 'error-handling', defaultSeverity: 'warning',
    description: 'A promise .catch() handler (or .then second argument) that does nothing hides failures.',
    languages: ['ts', 'js'],
    check(ctx) {
      const sf = ctx.ts; if (!sf) return [];
      const out: RawFinding[] = [];
      walk(sf, (n) => {
        if (!ts.isCallExpression(n) || !ts.isPropertyAccessExpression(n.expression)) return;
        const name = n.expression.name.text;
        const handler = name === 'catch' ? n.arguments[0] : name === 'then' ? n.arguments[1] : undefined;
        if (!handler || !(ts.isArrowFunction(handler) || ts.isFunctionExpression(handler))) return;
        if (!isEmptyBody(handler)) return;
        if (ts.isBlock(handler.body) && blockHasComment(sf, handler.body)) return;
        out.push(at(sf, handler, 'This promise rejection handler is empty, so failures are silently ignored.', `.${name}() receives a function with an empty body and no comment`, { anchor: `${name}(empty)`, ...(ctx.file.kind === 'test' ? { severity: 'note' as const, confidence: 'medium' as const } : {}) }));
      });
      return out;
    },
  },
  {
    id: 'PS203', name: 'Error swallowed without handling', category: 'error-handling', defaultSeverity: 'warning',
    description: 'A catch block that only contains no-op statements (literals, bare identifiers, `void 0`) captures the error but does nothing with it.',
    languages: ['ts', 'js'],
    check(ctx) {
      const sf = ctx.ts; if (!sf) return [];
      const out: RawFinding[] = [];
      walk(sf, (n) => {
        if (!ts.isCatchClause(n) || n.block.statements.length === 0) return;
        const name = n.variableDeclaration && ts.isIdentifier(n.variableDeclaration.name) ? n.variableDeclaration.name.text : undefined;
        if (usesError(n.block, name)) return;
        if (blockHasComment(sf, n.block)) return;
        const p = pos(sf, n);
        out.push({ ...p, message: 'This catch block only contains no-op statements; the error is captured but not handled.', reason: 'every statement in the catch block is a bare literal, identifier or `void` expression', anchor: 'catch{noop}' });
      });
      return out;
    },
  },
];
