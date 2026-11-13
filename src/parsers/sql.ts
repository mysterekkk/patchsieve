/**
 * Minimal PostgreSQL-oriented SQL tokenizer and statement splitter.
 * It understands comments, string literals, quoted identifiers and dollar-quoting, so statement
 * boundaries are reliable. It does NOT build a full SQL AST: rules inspect token sequences of a
 * small, documented set of statements (see docs/limitations.md).
 */
export interface Token {
  type: 'word' | 'ident' | 'string' | 'number' | 'punct';
  /** Original text (idents unquoted). */
  text: string;
  /** Uppercased text for words, same as text otherwise. */
  up: string;
  line: number;
}

export interface Statement {
  tokens: Token[];
  line: number;
}

export function tokenize(src: string): Statement[] {
  const statements: Statement[] = [];
  let cur: Token[] = [];
  let line = 1;
  let i = 0;
  const n = src.length;
  const push = (t: Omit<Token, 'up'>): void => {
    cur.push({ ...t, up: t.type === 'word' ? t.text.toUpperCase() : t.text });
  };
  const flush = (): void => {
    if (cur.length) statements.push({ tokens: cur, line: cur[0]!.line });
    cur = [];
  };
  while (i < n) {
    const c = src[i]!;
    if (c === '\n') { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === '-' && src[i + 1] === '-') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      let depth = 1; i += 2;
      while (i < n && depth > 0) {
        if (src[i] === '\n') line++;
        if (src[i] === '/' && src[i + 1] === '*') { depth++; i += 2; } else if (src[i] === '*' && src[i + 1] === '/') { depth--; i += 2; } else i++;
      }
      continue;
    }
    if (c === "'") {
      const start = line; i++;
      let s = '';
      while (i < n) {
        if (src[i] === "'" && src[i + 1] === "'") { s += "'"; i += 2; continue; }
        if (src[i] === "'") { i++; break; }
        if (src[i] === '\n') line++;
        s += src[i]; i++;
      }
      push({ type: 'string', text: s, line: start });
      continue;
    }
    if (c === '"') {
      const start = line; i++;
      let s = '';
      while (i < n) {
        if (src[i] === '"' && src[i + 1] === '"') { s += '"'; i += 2; continue; }
        if (src[i] === '"') { i++; break; }
        s += src[i]; i++;
      }
      push({ type: 'ident', text: s, line: start });
      continue;
    }
    if (c === '$') {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(src.slice(i, i + 64));
      if (m) {
        const tag = m[0];
        const end = src.indexOf(tag, i + tag.length);
        const stop = end < 0 ? n : end + tag.length;
        const start = line;
        for (let k = i; k < stop; k++) if (src[k] === '\n') line++;
        push({ type: 'string', text: src.slice(i, stop), line: start });
        i = stop;
        continue;
      }
    }
    if (c === ';') { i++; flush(); continue; }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_$]/.test(src[j]!)) j++;
      push({ type: 'word', text: src.slice(i, j), line });
      i = j;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i + 1;
      while (j < n && /[0-9.]/.test(src[j]!)) j++;
      push({ type: 'number', text: src.slice(i, j), line });
      i = j;
      continue;
    }
    push({ type: 'punct', text: c, line });
    i++;
  }
  flush();
  return statements;
}

export const name = (t: Token | undefined): string => (t ? (t.type === 'word' ? t.text.toLowerCase() : t.text) : '');

/** Reads `[schema.]table` starting at index i; returns the unqualified lowercase-normalised table name. */
export function readQualifiedName(tokens: Token[], i: number): { table: string; next: number } {
  let table = name(tokens[i]);
  let next = i + 1;
  while (tokens[next]?.text === '.' && tokens[next + 1]) {
    table = name(tokens[next + 1]);
    next += 2;
  }
  return { table, next };
}

/** Splits tokens on commas at paren depth 0. */
export function splitTopLevel(tokens: Token[]): Token[][] {
  const parts: Token[][] = [[]];
  let depth = 0;
  for (const t of tokens) {
    if (t.text === '(') depth++;
    else if (t.text === ')') depth--;
    if (t.text === ',' && depth === 0 && t.type === 'punct') parts.push([]);
    else parts[parts.length - 1]!.push(t);
  }
  return parts.filter((p) => p.length);
}

export interface AlterAction {
  kind: 'add-column' | 'drop-column' | 'alter-type' | 'set-not-null' | 'other';
  table: string;
  column?: string;
  line: number;
  notNull?: boolean;
  hasDefault?: boolean;
  generated?: boolean;
}

/** Interprets `ALTER TABLE ...` statements. */
export function alterActions(st: Statement): AlterAction[] {
  const t = st.tokens;
  if (t[0]?.up !== 'ALTER' || t[1]?.up !== 'TABLE') return [];
  let i = 2;
  if (t[i]?.up === 'IF' && t[i + 1]?.up === 'EXISTS') i += 2;
  if (t[i]?.up === 'ONLY') i++;
  const { table, next } = readQualifiedName(t, i);
  const out: AlterAction[] = [];
  for (const part of splitTopLevel(t.slice(next))) {
    const first = part[0]?.up;
    const line = part[0]?.line ?? st.line;
    if (first === 'ADD') {
      let j = 1;
      if (part[j]?.up === 'COLUMN') j++;
      else if (['CONSTRAINT', 'PRIMARY', 'UNIQUE', 'FOREIGN', 'CHECK', 'EXCLUDE'].includes(part[j]?.up ?? '')) { out.push({ kind: 'other', table, line }); continue; }
      if (part[j]?.up === 'IF' && part[j + 1]?.up === 'NOT' && part[j + 2]?.up === 'EXISTS') j += 3;
      const column = name(part[j]);
      const rest = part.slice(j + 1);
      const ups = rest.map((x) => x.up);
      const type = ups[0] ?? '';
      const serial = /^(SMALLSERIAL|SERIAL|BIGSERIAL|SERIAL[248])$/.test(type);
      const notNull = ups.some((u, k) => u === 'NOT' && ups[k + 1] === 'NULL');
      out.push({ kind: 'add-column', table, column, line, notNull, hasDefault: ups.includes('DEFAULT'), generated: serial || ups.includes('GENERATED') || ups.includes('IDENTITY') });
    } else if (first === 'DROP') {
      let j = 1;
      if (part[j]?.up === 'COLUMN') j++;
      else if (['CONSTRAINT', 'INDEX', 'DEFAULT', 'NOT'].includes(part[j]?.up ?? '')) { out.push({ kind: 'other', table, line }); continue; }
      if (part[j]?.up === 'IF' && part[j + 1]?.up === 'EXISTS') j += 2;
      out.push({ kind: 'drop-column', table, column: name(part[j]), line });
    } else if (first === 'ALTER') {
      let j = 1;
      if (part[j]?.up === 'COLUMN') j++;
      const column = name(part[j]);
      const ups = part.slice(j + 1).map((x) => x.up);
      if (ups[0] === 'TYPE' || (ups[0] === 'SET' && ups[1] === 'DATA' && ups[2] === 'TYPE')) out.push({ kind: 'alter-type', table, column, line });
      else if (ups[0] === 'SET' && ups[1] === 'NOT' && ups[2] === 'NULL') out.push({ kind: 'set-not-null', table, column, line });
      else out.push({ kind: 'other', table, line });
    } else out.push({ kind: 'other', table, line });
  }
  return out;
}
