import { createHash } from 'node:crypto';

/** Escape terminal control chars (ESC, C0, C1, bidi overrides) so untrusted text cannot inject escapes. */
export function sanitize(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f‪-‮⁦-⁩]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
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
