import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { git } from './diff.ts';
import { looksBinary, normalizePath } from '../utils/text.ts';

export interface FileSource {
  /** Returns text, or a skip reason. */
  read(path: string, maxSize: number): { text: string } | { skip: string };
  exists(path: string): boolean;
  list(): string[];
  /** Optional: load many files with one process so later read() calls are cheap. */
  prefetch?(paths: string[], maxSize: number): void;
}

const TEST_RE = /(^|\/)(__tests__|__mocks__|tests?|spec|e2e|cypress|playwright)\/|\.(test|spec|cy|e2e)\.[cm]?[jt]sx?$/i;
export function classifyFile(path: string): 'test' | 'production' {
  return TEST_RE.test(path) ? 'test' : 'production';
}

const GENERATED_PATH = /(^|\/)(node_modules|dist|build|coverage|vendor|\.next|\.git|generated|__generated__)\//;
const GENERATED_FILE = /\.(min\.[cm]?js|d\.ts|bundle\.js|generated\.[jt]s|snap)$|\.gen\.[jt]s$/;
export function isGeneratedPath(path: string): boolean {
  return GENERATED_PATH.test(path) || GENERATED_FILE.test(path);
}

export function languageOf(path: string): 'ts' | 'js' | 'json' | 'sql' | 'yaml' | 'prisma' | null {
  if (/\.prisma$/i.test(path)) return 'prisma';
  if (/\.(tsx?|mts|cts)$/i.test(path)) return 'ts';
  if (/\.(jsx?|mjs|cjs)$/i.test(path)) return 'js';
  if (/\.json$/i.test(path)) return 'json';
  if (/\.sql$/i.test(path)) return 'sql';
  if (/\.ya?ml$/i.test(path)) return 'yaml';
  return null;
}

/** Reads blobs at a git ref. Never touches the working tree, so symlinks in a PR cannot redirect reads. */
export function gitSource(cwd: string, ref: string): FileSource {
  const modes = new Map<string, { mode: string; size: number; sha: string }>();
  const blobs = new Map<string, Buffer>();
  const out = git(cwd, ['-c', 'core.quotePath=false', 'ls-tree', '-r', '-l', '-z', ref]);
  for (const entry of out.split('\0')) {
    if (!entry) continue;
    const tab = entry.indexOf('\t');
    const meta = entry.slice(0, tab).trim().split(/\s+/);
    modes.set(entry.slice(tab + 1), { mode: meta[0] ?? '', size: Number(meta[3] ?? 0), sha: meta[2] ?? '' });
  }
  return {
    exists: (p) => modes.has(p),
    list: () => [...modes.keys()].sort(),
    prefetch(paths, maxSize) {
      const wanted = paths.filter((p) => {
        const i = modes.get(p);
        return i && i.mode !== '120000' && i.mode !== '160000' && i.size <= maxSize && /^[0-9a-f]{40,64}$/.test(i.sha) && !blobs.has(p);
      });
      for (let start = 0; start < wanted.length; start += 2000) {
        const chunk = wanted.slice(start, start + 2000);
        const raw = execFileSync('git', ['cat-file', '--batch'], { cwd, input: chunk.map((p) => modes.get(p)!.sha).join('\n') + '\n', maxBuffer: 1024 * 1024 * 1024, stdio: ['pipe', 'pipe', 'ignore'] });
        let off = 0;
        for (const p of chunk) {
          const nl = raw.indexOf(10, off);
          if (nl < 0) break;
          const header = raw.subarray(off, nl).toString('latin1').split(' ');
          off = nl + 1;
          if (header[1] === 'missing') continue;
          const size = Number(header[2]);
          blobs.set(p, raw.subarray(off, off + size));
          off += size + 1;
        }
      }
    },
    read(path, maxSize) {
      const info = modes.get(path);
      if (!info) return { skip: 'not present at ref' };
      if (info.mode === '120000') return { skip: 'symlink' };
      if (info.mode === '160000') return { skip: 'submodule' };
      if (info.size > maxSize) return { skip: `larger than ${maxSize} bytes` };
      try {
        const buf = blobs.get(path) ?? execBlob(cwd, ref, path);
        if (looksBinary(buf)) return { skip: 'binary' };
        return { text: decode(buf) };
      } catch {
        return { skip: 'unreadable' };
      }
    },
  };
}

import { execFileSync } from 'node:child_process';
function execBlob(cwd: string, ref: string, path: string): Buffer {
  return execFileSync('git', ['show', `${ref}:${path}`], { cwd, maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
}

function decode(buf: Buffer): string {
  let text = buf.toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text;
}

/** Reads the working tree, refusing symlinks. Used for `--all` scans. */
export function fsSource(root: string): FileSource {
  let cache: string[] | null = null;
  const walk = (dir: string, acc: string[]): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === '.git' || e.name === 'node_modules') continue;
      const full = join(dir, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) walk(full, acc);
      else if (e.isFile()) acc.push(normalizePath(relative(root, full).split(sep).join('/')));
    }
  };
  return {
    exists: (p) => { try { return lstatSync(join(root, p)).isFile(); } catch { return false; } },
    list: () => (cache ??= (() => { const a: string[] = []; walk(root, a); return a.sort(); })()),
    read(path, maxSize) {
      try {
        const full = join(root, path);
        const st = lstatSync(full);
        if (st.isSymbolicLink()) return { skip: 'symlink' };
        if (!st.isFile()) return { skip: 'not a regular file' };
        if (st.size > maxSize) return { skip: `larger than ${maxSize} bytes` };
        const buf = readFileSync(full);
        if (looksBinary(buf)) return { skip: 'binary' };
        return { text: decode(buf) };
      } catch {
        return { skip: 'unreadable' };
      }
    },
  };
}
