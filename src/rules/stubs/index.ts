import ts from 'typescript';
import type { RawFinding, Rule } from '../../core/types.ts';
import { walk, unwrapExpr } from '../../parsers/typescript.ts';
import { at } from '../helpers.ts';

type FnNode = ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction | ts.FunctionExpression;

export function fnName(n: FnNode, sf: ts.SourceFile): string {
  if ((ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)) && n.name) return n.name.getText(sf);
  const p = n.parent;
  if (p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
  if (p && ts.isPropertyAssignment(p) && ts.isIdentifier(p.name)) return p.name.text;
  return '';
}

function functions(sf: ts.SourceFile): FnNode[] {
  const out: FnNode[] = [];
  walk(sf, (n) => {
    if (ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n)) out.push(n);
  });
  return out;
}

const ACTION_NAME = /^(calculate|compute|process|sync|validate|verify|authenticate|authorize|charge|send|save|submit|handle|execute|perform|create|update|delete|refund|pay|import|export)/i;
const MOCK_HINT = /\b(mock|fake|stub|dummy|placeholder|hard-?coded|temporary|temp|for now|simulate[sd]?)\b/i;
const TODO_HINT = /\b(todo|fixme)\b/i;

function commentsIn(sf: ts.SourceFile, node: ts.Node): { text: string; line: number }[] {
  const res: { text: string; line: number }[] = [];
  const start = node.getStart(sf);
  const end = node.getEnd();
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, sf.languageVariant, sf.text.slice(start, end));
  let tok = scanner.scan();
  while (tok !== ts.SyntaxKind.EndOfFileToken) {
    if (tok === ts.SyntaxKind.SingleLineCommentTrivia || tok === ts.SyntaxKind.MultiLineCommentTrivia) {
      res.push({ text: scanner.getTokenText(), line: sf.getLineAndCharacterOfPosition(start + scanner.getTokenStart()).line + 1 });
    }
    tok = scanner.scan();
  }
  return res;
}

function singleReturn(fn: FnNode): ts.Expression | undefined {
  if (!fn.body) return undefined;
  if (!ts.isBlock(fn.body)) return unwrapExpr(fn.body);
  const stmts = fn.body.statements;
  const only = stmts[0];
  if (stmts.length === 1 && only && ts.isReturnStatement(only) && only.expression) return unwrapExpr(only.expression);
  return undefined;
}

export const stubRules: Rule[] = [
  {
    id: 'PS401',
    name: 'Unimplemented production code',
    category: 'stubs',
    defaultSeverity: 'error',
    appliesTo: 'production',
    description: "`throw new Error('Not implemented')` left in production code.",
    languages: ['ts', 'js'],
    check(ctx) {
      const sf = ctx.ts;
      if (!sf) return [];
      const out: RawFinding[] = [];
      walk(sf, (n) => {
        if (!ts.isThrowStatement(n) || !n.expression) return;
        const e = unwrapExpr(n.expression);
        if (!ts.isNewExpression(e) || !e.arguments?.[0]) return;
        const a = e.arguments[0];
        if (ts.isStringLiteralLike(a) && /\b(not\s+(yet\s+)?implemented|unimplemented|todo|not\s+supported\s+yet)\b/i.test(a.text)) {
          out.push(at(sf, n, 'This code path throws "not implemented" and is unfinished.', `throws ${e.expression.getText(sf)} with the message ${JSON.stringify(a.text)}`, { confidence: 'high' }));
        }
      });
      return out;
    },
  },
  {
    id: 'PS402',
    name: 'Suspicious placeholder return',
    category: 'stubs',
    defaultSeverity: 'warning',
    appliesTo: 'production',
    description: 'A function whose name promises real work but whose entire body returns a trivial constant.',
    languages: ['ts', 'js'],
    check(ctx) {
      const sf = ctx.ts;
      if (!sf) return [];
      const out: RawFinding[] = [];
      for (const fn of functions(sf)) {
        const name = fnName(fn, sf);
        if (!name || !ACTION_NAME.test(name)) continue;
        const r = singleReturn(fn);
        if (!r) continue;
        const trivial =
          (ts.isNumericLiteral(r) && Number(r.text) === 0) ||
          (ts.isArrayLiteralExpression(r) && r.elements.length === 0) ||
          (ts.isObjectLiteralExpression(r) && r.properties.length === 0) ||
          (ts.isStringLiteralLike(r) && r.text === '') ||
          r.kind === ts.SyntaxKind.NullKeyword ||
          r.kind === ts.SyntaxKind.TrueKeyword ||
          r.kind === ts.SyntaxKind.FalseKeyword;
        if (!trivial) continue;
        const hint = commentsIn(sf, fn).some((c) => TODO_HINT.test(c.text) || MOCK_HINT.test(c.text));
        out.push(at(sf, fn, `\`${name}\` returns a constant (${r.getText(sf)}) without doing any work.`, `function name suggests behavior, but its whole body is \`return ${r.getText(sf)}\``, { confidence: hint ? 'medium' : 'low', anchor: `placeholder:${name}` }));
      }
      return out;
    },
  },
  {
    id: 'PS403',
    name: 'New TODO in critical implementation',
    category: 'stubs',
    defaultSeverity: 'warning',
    appliesTo: 'production',
    description: 'A TODO/FIXME comment inside a function that has almost no code, suggesting the implementation was never written.',
    languages: ['ts', 'js'],
    check(ctx) {
      const sf = ctx.ts;
      if (!sf) return [];
      const out: RawFinding[] = [];
      const seen = new Set<number>();
      for (const fn of functions(sf)) {
        if (!fn.body || !ts.isBlock(fn.body) || fn.body.statements.length > 2) continue;
        const name = fnName(fn, sf) || '(anonymous)';
        for (const c of commentsIn(sf, fn.body)) {
          if (!TODO_HINT.test(c.text) || seen.has(c.line)) continue;
          seen.add(c.line);
          out.push({
            line: c.line,
            column: 1,
            endLine: c.line,
            message: `\`${name}\` still contains a TODO and almost no implementation.`,
            reason: `TODO/FIXME comment inside a function with ${fn.body.statements.length} statement(s)`,
            confidence: fn.body.statements.length === 0 ? 'high' : 'medium',
            anchor: `todo:${name}:${c.text.trim().slice(0, 60)}`,
          });
        }
      }
      return out;
    },
  },
  {
    id: 'PS404',
    name: 'Fake success response',
    category: 'stubs',
    defaultSeverity: 'warning',
    appliesTo: 'production',
    description: 'A function that only returns a hard-coded success object, with a name or comment indicating real work was intended.',
    languages: ['ts', 'js'],
    check(ctx) {
      const sf = ctx.ts;
      if (!sf) return [];
      const out: RawFinding[] = [];
      for (const fn of functions(sf)) {
        const r = singleReturn(fn);
        if (!r || !ts.isObjectLiteralExpression(r)) continue;
        const isSuccess = r.properties.some((p) => {
          if (!ts.isPropertyAssignment(p) || !ts.isIdentifier(p.name)) return false;
          const k = p.name.text;
          const v = unwrapExpr(p.initializer);
          return ((k === 'success' || k === 'ok') && v.kind === ts.SyntaxKind.TrueKeyword) || (k === 'status' && ts.isStringLiteralLike(v) && /^(success|ok|succeeded|completed)$/i.test(v.text));
        });
        if (!isSuccess) continue;
        const name = fnName(fn, sf);
        const hint = commentsIn(sf, fn).some((c) => MOCK_HINT.test(c.text) || TODO_HINT.test(c.text));
        if (!hint && !(name && ACTION_NAME.test(name))) continue;
        out.push(at(sf, fn, `\`${name || 'This function'}\` returns a hard-coded success result.`, 'whole body is `return { success: true ... }` and the name or a comment indicates real work was intended', { confidence: hint ? 'high' : 'medium', anchor: `fakesuccess:${name}` }));
      }
      return out;
    },
  },
];
