import { execFileSync } from 'node:child_process';

export interface FileChange {
  path: string;
  oldPath?: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  /** 1-based new-file line numbers that were added or modified. */
  addedLines: Set<number>;
  /** Set when the change is too large to track line by line; the whole file counts as changed. */
  whole?: boolean;
  binary: boolean;
}

const MAX_TRACKED_LINES = 1_000_000;

export function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

/** Parse `git diff --unified=0 -M` output. Pure function, unit-tested. */
export function parseUnifiedDiff(diff: string): FileChange[] {
  const changes: FileChange[] = [];
  let cur: FileChange | null = null;
  let inHunk = false;
  let minus = '';
  const hdrPath = new Map<FileChange, string>();
  for (const raw of diff.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (line.startsWith('diff --git ')) {
      if (cur) changes.push(cur);
      cur = { path: '', status: 'modified', addedLines: new Set(), binary: false };
      inHunk = false;
      minus = '';
      const h = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
      if (h && !line.includes('"') && h[1] === h[2]) hdrPath.set(cur, h[2]!);
      continue;
    }
    if (!cur) continue;
    // Headers are only valid before the first hunk of a file. Inside a hunk every line is content
    // ('+', '-', ' ', '\'), so an added line such as "++ x" must never be read as a header.
    if (inHunk && !line.startsWith('@@')) continue;
    if (line.startsWith('new file mode')) cur.status = 'added';
    else if (line.startsWith('deleted file mode')) cur.status = 'deleted';
    else if (line.startsWith('rename from ')) { cur.status = 'renamed'; cur.oldPath = unquote(line.slice(12)); }
    else if (line.startsWith('rename to ')) cur.path = unquote(line.slice(10));
    else if (line.startsWith('Binary files ') || line.startsWith('GIT binary patch')) cur.binary = true;
    else if (line.startsWith('--- ')) {
      // git appends a TAB after header paths that contain spaces
      const m = headerPath(line);
      minus = m === '/dev/null' ? '' : unquote(m).replace(/^a\//, '');
    }
    else if (line.startsWith('+++ ')) {
      const p = headerPath(line);
      if (p !== '/dev/null') cur.path = unquote(p).replace(/^b\//, '');
      else if (!cur.path) cur.path = minus;
    } else if (line.startsWith('@@')) {
      const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
      if (m) {
        const start = Number(m[1]);
        const count = m[2] === undefined ? 1 : Number(m[2]);
        if (count > MAX_TRACKED_LINES || cur.addedLines.size + count > MAX_TRACKED_LINES) cur.whole = true; // huge change: treat the whole file as changed
        else for (let i = 0; i < count; i++) cur.addedLines.add(start + i);
        inHunk = true;
      }
    }
  }
  if (cur) changes.push(cur);
  for (const c of changes) {
    if (!c.path) c.path = c.oldPath ?? hdrPath.get(c) ?? '';
  }
  return changes.filter((c) => c.path);
}

function headerPath(line: string): string {
  const t = line.slice(4);
  const tab = t.indexOf('\t');
  return tab >= 0 ? t.slice(0, tab) : t;
}

const C_ESC: Record<string, number> = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, '\\': 92 };

/** Decode git's C-style quoted path ("..." with \a \b \t \n \v \f \r \" \\ and octal \NNN bytes). */
export function unquote(p: string): string {
  if (!(p.length >= 2 && p.startsWith('"') && p.endsWith('"'))) return p;
  const s = p.slice(1, -1);
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c !== '\\') {
      for (const b of Buffer.from(c, 'utf8')) bytes.push(b);
      continue;
    }
    const n = s[i + 1];
    if (n !== undefined && /[0-7]/.test(n)) {
      const oct = /^[0-7]{1,3}/.exec(s.slice(i + 1))![0];
      bytes.push(parseInt(oct, 8) & 0xff);
      i += oct.length;
    } else if (n !== undefined && Object.hasOwn(C_ESC, n)) {
      bytes.push(C_ESC[n]!);
      i++;
    } else {
      bytes.push(92);
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

export function assertSafeRef(ref: string): void {
  if (!/^[A-Za-z0-9._/~^@{}-]+$/.test(ref) || ref.startsWith('-')) throw new Error(`Unsafe git ref: ${JSON.stringify(ref)}`);
}

export function getChanges(cwd: string, base: string, head: string): FileChange[] {
  assertSafeRef(base);
  assertSafeRef(head);
  // Three-dot semantics: diff from the merge base to head.
  const mergeBase = git(cwd, ['merge-base', base, head]).trim();
  const out = git(cwd, ['-c', 'core.quotePath=false', 'diff', '--unified=0', '-M', '--no-color', '--no-ext-diff', '--no-textconv', '--text', mergeBase, head]);
  return parseUnifiedDiff(out);
}

export function showFile(cwd: string, ref: string, path: string): string | undefined {
  try {
    return git(cwd, ['show', `${ref}:${path}`]);
  } catch {
    return undefined;
  }
}

export function mergeBaseOf(cwd: string, base: string, head: string): string {
  assertSafeRef(base);
  assertSafeRef(head);
  return git(cwd, ['merge-base', base, head]).trim();
}
