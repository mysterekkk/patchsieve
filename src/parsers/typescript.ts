import ts from 'typescript';

export function parseSource(path: string, text: string): ts.SourceFile {
  const kind = /\.tsx$/i.test(path) ? ts.ScriptKind.TSX : /\.jsx$/i.test(path) ? ts.ScriptKind.JSX : /\.[cm]?js$/i.test(path) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  return ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);
}

/** Syntax errors reported by the parser for this file (empty when clean). */
export function syntaxErrors(sf: ts.SourceFile): number {
  return ((sf as unknown as { parseDiagnostics?: unknown[] }).parseDiagnostics ?? []).length;
}

export function pos(sf: ts.SourceFile, node: ts.Node): { line: number; column: number; endLine: number } {
  const s = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  const e = sf.getLineAndCharacterOfPosition(node.getEnd());
  return { line: s.line + 1, column: s.character + 1, endLine: e.line + 1 };
}

export function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (c) => walk(c, visit));
}

/** True if the text between the braces of a block contains any comment. */
export function blockHasComment(sf: ts.SourceFile, block: ts.Block): boolean {
  const inner = sf.text.slice(block.getStart(sf) + 1, block.getEnd() - 1);
  return /\/\/|\/\*/.test(inner);
}

export function calleeText(call: ts.CallExpression, sf: ts.SourceFile): string {
  return call.expression.getText(sf);
}

export function unwrapExpr(e: ts.Expression): ts.Expression {
  let x = e;
  while (ts.isParenthesizedExpression(x) || ts.isAsExpression(x) || ts.isNonNullExpression(x) || ts.isSatisfiesExpression(x)) x = x.expression;
  return x;
}
