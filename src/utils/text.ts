import { createHash } from 'node:crypto';

// Built from a string of escapes so no raw line separators or control characters live in this source file.
// eslint-disable-next-line no-control-regex
const UNSAFE = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2066-\\u2069\\ufeff]', 'g');

/**
 * Render every control character (including newline, carriage return, tab), line/paragraph separator,
 * zero-width and bidi control as a visible \uXXXX escape. Untrusted text can then never start a new log
 * line (workflow commands are only recognised at the start of a line) or restyle the terminal.
 */
export function sanitize(s: string): string {
  return s.replace(UNSAFE, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

export function sha(s: string): string {
  return createHash('sha256').update(s).digest('hex').slice(0, 16);
}

export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}

/** Heuristic: NUL byte in the first 8000 bytes means binary. */
export function looksBinary(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}
