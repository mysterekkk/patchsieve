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

export interface CommentInfo {
  line: number;
  /** Raw comment text including the // or slash-star markers. */
  text: string;
  /** True when only whitespace precedes the comment on its first line. */
  standalone: boolean;
}

/** All real comments in a parsed file (never text inside string/template/regex literals). */
export function collectComments(sf: ts.SourceFile): CommentInfo[] {
  const seen = new Set<number>();
  const out: CommentInfo[] = [];
  const text = sf.text;
  const add = (ranges: ts.CommentRange[] | undefined): void => {
    for (const r of ranges ?? []) {
      if (seen.has(r.pos)) continue;
      seen.add(r.pos);
      const lc = sf.getLineAndCharacterOfPosition(r.pos);
      const lineStart = r.pos - lc.character;
      out.push({ line: lc.line + 1, text: text.slice(r.pos, r.end), standalone: text.slice(lineStart, r.pos).trim() === '' });
    }
  };
  const visit = (n: ts.Node): void => {
    add(ts.getLeadingCommentRanges(text, n.getFullStart()));
    add(ts.getTrailingCommentRanges(text, n.getEnd()));
    ts.forEachChild(n, visit);
  };
  visit(sf);
  add(ts.getLeadingCommentRanges(text, sf.endOfFileToken.getFullStart()));
  return out.sort((a, b) => a.line - b.line);
}
