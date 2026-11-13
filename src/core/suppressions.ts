import type ts from 'typescript';
import { collectComments } from '../parsers/typescript.ts';

// Line-based fallback for non-JS/TS files (SQL, YAML, ...).
const SUPPRESS_RE = /(?:\/\/|\/\*|#|--)\s*patchsieve-ignore\b(.*)$/;
// For JS/TS the text must start a genuine comment token.
const COMMENT_RE = /^(?:\/\/|\/\*)\s*patchsieve-ignore\b(.*)$/;
const SUPPRESS_VALID = /^\s+((?:PS\d{3})(?:\s*,\s*PS\d{3})*)\s+--\s+(\S.{2,}?)\s*(?:\*\/)?\s*$/;
const NEWLINE = /\r\n|\r|\n/;
const STANDALONE = /^\s*(\/\/|\/\*|#|--)/;

export interface Suppression {
  ids: Set<string>;
  /** The line whose findings are suppressed. */
  line: number;
}

export interface ParsedSuppressions {
  valid: Suppression[];
  invalid: { line: number; text: string }[];
}

/**
 * `patchsieve-ignore PS123[, PS456] -- reason`. Explicit IDs and a reason are mandatory; wildcards are rejected.
 * A trailing comment applies to its own line, a standalone comment to the next non-blank line.
 */
export function parseSuppressions(text: string, sf?: ts.SourceFile): ParsedSuppressions {
  const valid: Suppression[] = [];
  const invalid: { line: number; text: string }[] = [];
  const lines = text.split(NEWLINE);
  const handle = (line: number, rest: string, standalone: boolean, shown: string): void => {
    const v = SUPPRESS_VALID.exec(rest);
    if (!v) {
      invalid.push({ line, text: shown.trim().slice(0, 120) });
      return;
    }
    const ids = new Set(v[1]!.split(/\s*,\s*/));
    let target = line;
    if (standalone) {
      target = line + 1;
      while (target <= lines.length && lines[target - 1]!.trim() === '') target++;
    }
    valid.push({ ids, line: target });
  };
  if (sf) {
    for (const c of collectComments(sf)) {
      const first = c.text.split(NEWLINE)[0]!;
      const m = COMMENT_RE.exec(first);
      if (m) handle(c.line, m[1]!, c.standalone, first);
    }
  } else {
    lines.forEach((l, i) => {
      if (l.length > 2000) return;
      const m = SUPPRESS_RE.exec(l);
      if (m) handle(i + 1, m[1]!, STANDALONE.test(l), l);
    });
  }
  return { valid, invalid };
}
