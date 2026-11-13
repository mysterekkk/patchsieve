import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export interface TempRepo {
  dir: string;
  base: string;
  head: string;
  cleanup(): void;
}

function clearWorktree(dir: string): void {
  for (const e of readdirSync(dir)) if (e !== '.git') rmSync(join(dir, e), { recursive: true, force: true });
}

/** Build a repo with a base commit (`baseFiles`) and a head commit on top (`headFiles`). Files are path -> text. */
export function makeRepo(baseFiles: Record<string, string>, headFiles: Record<string, string>): TempRepo {
  const dir = mkdtempSync(join(tmpdir(), 'patchsieve-'));
  git(dir, 'init', '-q', '-b', 'main');
  const put = (files: Record<string, string>): void => {
    for (const [p, t] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, p)), { recursive: true });
      writeFileSync(join(dir, p), t);
    }
  };
  put(baseFiles);
  if (Object.keys(baseFiles).length === 0) writeFileSync(join(dir, '.keep'), '');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'base');
  const base = git(dir, 'rev-parse', 'HEAD');
  clearWorktree(dir);
  put(headFiles);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '--allow-empty', '-m', 'head');
  return { dir, base, head: git(dir, 'rev-parse', 'HEAD'), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** Same, but from two fixture directories on disk. */
export function repoFromDirs(baseDir: string, headDir: string): TempRepo {
  const dir = mkdtempSync(join(tmpdir(), 'patchsieve-'));
  git(dir, 'init', '-q', '-b', 'main');
  if (existsSync(baseDir)) cpSync(baseDir, dir, { recursive: true });
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '--allow-empty', '-m', 'base');
  const base = git(dir, 'rev-parse', 'HEAD');
  clearWorktree(dir);
  cpSync(headDir, dir, { recursive: true });
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '--allow-empty', '-m', 'head');
  return { dir, base, head: git(dir, 'rev-parse', 'HEAD'), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
