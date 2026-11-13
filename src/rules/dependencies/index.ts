import { parse as parseYaml } from 'yaml';
import type { RawFinding, Rule, RuleContext } from '../../core/types.ts';

export const DEP_SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies'] as const;
type Section = (typeof DEP_SECTIONS)[number];

export interface DepEntry {
  section: Section;
  name: string;
  range: string;
  line: number;
}

type Json = Record<string, unknown>;

function isObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Parse a manifest and locate each dependency's line (pretty-printed JSON; falls back to line 1). */
export function readManifest(text: string): { entries: DepEntry[]; json: Json } {
  const json: unknown = JSON.parse(text);
  if (!isObject(json)) throw new Error('package.json must contain an object');
  const lines = text.split(/\r\n|\r|\n/);
  const entries: DepEntry[] = [];
  for (const section of DEP_SECTIONS) {
    const deps = json[section];
    if (!isObject(deps)) continue;
    let inSection = false;
    const lineOf = new Map<string, number>();
    lines.forEach((l, i) => {
      if (!inSection) {
        if (new RegExp(`^\\s*"${section}"\\s*:\\s*\\{`).test(l)) inSection = true;
        return;
      }
      if (/^\s*\}/.test(l)) {
        inSection = false;
        return;
      }
      const m = /^\s*"((?:[^"\\]|\\.)*)"\s*:/.exec(l);
      if (m) lineOf.set(JSON.parse(`"${m[1]}"`) as string, i + 1);
    });
    for (const [name, range] of Object.entries(deps)) {
      if (typeof range !== 'string') continue;
      entries.push({ section, name, range, line: lineOf.get(name) ?? 1 });
    }
  }
  return { entries, json };
}

export function isRegistryRange(range: string): boolean {
  return !/^(workspace:|file:|link:|portal:|patch:|git\+|git:|github:|gitlab:|bitbucket:|https?:|npm:|[\w.-]+\/[\w.-]+(#.*)?$)/.test(range);
}

function dirname(p: string): string {
  const i = p.lastIndexOf('/');
  return i < 0 ? '' : p.slice(0, i);
}

type LockKind = 'npm' | 'pnpm' | 'yarn';
interface Lock {
  kind: LockKind;
  path: string;
  text: string;
}

/** Nearest lockfile in the manifest's directory or any ancestor (monorepo root). */
export function findLock(ctx: RuleContext, manifestPath: string): Lock | undefined {
  let dir = dirname(manifestPath);
  for (;;) {
    for (const [name, kind] of [['package-lock.json', 'npm'], ['pnpm-lock.yaml', 'pnpm'], ['yarn.lock', 'yarn']] as const) {
      const path = dir ? `${dir}/${name}` : name;
      const text = ctx.readFile(path);
      if (text !== undefined) return { kind, path, text };
    }
    if (!dir) return undefined;
    dir = dirname(dir);
  }
}

export type LockVerdict = { state: 'ok' } | { state: 'missing' } | { state: 'mismatch'; locked: string } | { state: 'unknown' };

function importerDir(manifestPath: string, lockPath: string): string {
  const lockDir = dirname(lockPath);
  const dir = dirname(manifestPath);
  return lockDir && dir.startsWith(`${lockDir}/`) ? dir.slice(lockDir.length + 1) : dir === lockDir ? '' : dir;
}

export function checkAgainstLock(lock: Lock, manifestPath: string, e: DepEntry): LockVerdict {
  const imp = importerDir(manifestPath, lock.path);
  if (lock.kind === 'npm') {
    let j: unknown;
    try {
      j = JSON.parse(lock.text);
    } catch {
      return { state: 'unknown' };
    }
    if (!isObject(j)) return { state: 'unknown' };
    const pkgs = j.packages;
    if (isObject(pkgs)) {
      const importer = pkgs[imp];
      if (!isObject(importer)) return { state: 'unknown' }; // package not part of this lockfile's workspace graph
      for (const s of [...DEP_SECTIONS, 'peerDependencies']) {
        const d = importer[s];
        if (isObject(d) && typeof d[e.name] === 'string') return d[e.name] === e.range ? { state: 'ok' } : { state: 'mismatch', locked: d[e.name] as string };
      }
      return { state: 'missing' };
    }
    if (isObject(j.dependencies)) return Object.hasOwn(j.dependencies, e.name) ? { state: 'ok' } : { state: 'missing' }; // lockfile v1
    return { state: 'unknown' };
  }
  if (lock.kind === 'pnpm') {
    let y: unknown;
    try {
      y = parseYaml(lock.text, { schema: 'core', maxAliasCount: 100 });
    } catch {
      return { state: 'unknown' };
    }
    if (!isObject(y)) return { state: 'unknown' };
    let scope: Json | undefined;
    if (isObject(y.importers)) {
      const i = y.importers[imp || '.'];
      if (!isObject(i)) return { state: 'unknown' };
      scope = i;
    } else scope = y; // pre-workspace single project format
    for (const s of DEP_SECTIONS) {
      const d = scope[s];
      if (!isObject(d) || !Object.hasOwn(d, e.name)) continue;
      const v = d[e.name];
      const spec = isObject(v) ? v.specifier : isObject(scope.specifiers) ? scope.specifiers[e.name] : undefined;
      if (typeof spec !== 'string') return { state: 'ok' };
      return spec === e.range ? { state: 'ok' } : { state: 'mismatch', locked: spec };
    }
    return { state: 'missing' };
  }
  // yarn: classic v1 and berry headers
  const wanted = new Set([`${e.name}@${e.range}`, `${e.name}@npm:${e.range}`]);
  let nameSeen = false;
  let lockedRange = '';
  for (const l of lock.text.split(/\r?\n/)) {
    if (!l || l.startsWith(' ') || l.startsWith('#') || !l.endsWith(':')) continue;
    for (const raw of l.slice(0, -1).split(',')) {
      const spec = raw.trim().replace(/^"|"$/g, '');
      if (wanted.has(spec)) return { state: 'ok' };
      if (spec.startsWith(`${e.name}@`)) {
        nameSeen = true;
        lockedRange ||= spec.slice(e.name.length + 1).replace(/^npm:/, '');
      }
    }
  }
  return nameSeen ? { state: 'mismatch', locked: lockedRange } : { state: 'missing' };
}

/** Dependencies added or whose range changed relative to base (all of them when there is no base). */
function candidates(ctx: RuleContext): { entries: DepEntry[]; json: Json } {
  const head = readManifest(ctx.file.text);
  const baseText = ctx.readBaseFile(ctx.file.path);
  if (baseText === undefined || ctx.file.isNew) return head;
  let baseMap = new Map<string, string>();
  try {
    baseMap = new Map(readManifest(baseText).entries.map((x) => [`${x.section}:${x.name}`, x.range]));
  } catch {
    return head;
  }
  return { json: head.json, entries: head.entries.filter((x) => baseMap.get(`${x.section}:${x.name}`) !== x.range) };
}

const NAME = ['package.json'];

export const dependencyRules: Rule[] = [
  {
    id: 'PS101',
    name: 'Dependency missing from lockfile',
    category: 'dependencies',
    defaultSeverity: 'error',
    languages: ['json'],
    fileNames: NAME,
    description: 'A dependency was added to package.json but the nearest lockfile has no entry for it.',
    check(ctx) {
      const { entries } = candidates(ctx);
      const lock = findLock(ctx, ctx.file.path);
      if (!lock) return [];
      const out: RawFinding[] = [];
      for (const e of entries) {
        if (!isRegistryRange(e.range) && e.range.startsWith('workspace:')) continue;
        if (checkAgainstLock(lock, ctx.file.path, e).state === 'missing') {
          out.push({ line: e.line, column: 1, message: `\`${e.name}\` is declared in ${e.section} but is missing from ${lock.path}.`, reason: `${lock.path} has no entry for ${e.name} in this package's dependency list`, anchor: `${e.section}:${e.name}`, confidence: 'high' });
        }
      }
      return out;
    },
  },
  {
    id: 'PS102',
    name: 'Manifest/lockfile version mismatch',
    category: 'dependencies',
    defaultSeverity: 'error',
    languages: ['json'],
    fileNames: NAME,
    description: 'The range in package.json differs from the range recorded in the lockfile for the same dependency.',
    check(ctx) {
      const { entries } = candidates(ctx);
      const lock = findLock(ctx, ctx.file.path);
      if (!lock) return [];
      const out: RawFinding[] = [];
      for (const e of entries) {
        const v = checkAgainstLock(lock, ctx.file.path, e);
        if (v.state === 'mismatch') {
          out.push({ line: e.line, column: 1, message: `\`${e.name}\` is \`${e.range}\` in package.json but \`${v.locked}\` in ${lock.path}.`, reason: 'the lockfile records a different requested range than the manifest', anchor: `${e.section}:${e.name}:${e.range}`, confidence: 'high' });
        }
      }
      return out;
    },
  },
  {
    id: 'PS103',
    name: 'Suspicious dependency reference',
    category: 'dependencies',
    defaultSeverity: 'warning',
    languages: ['json'],
    fileNames: NAME,
    description: 'Unpinned (`*`, `latest`), insecure (`http:`), floating git, absolute-path, or orphan `workspace:` dependency references.',
    check(ctx) {
      const { entries, json } = candidates(ctx);
      const out: RawFinding[] = [];
      const hasWorkspaces = Boolean(json.workspaces) || ctx.readFile('pnpm-workspace.yaml') !== undefined || ctx.readFile('package.json') !== undefined && /"workspaces"/.test(ctx.readFile('package.json') ?? '');
      for (const e of entries) {
        const r = e.range.trim();
        let why: string | undefined;
        let confidence: RawFinding['confidence'] = 'medium';
        let severity: RawFinding['severity'];
        if (r === '' || r === '*' || r === 'latest' || r === 'x') why = `unpinned range "${r}" accepts any future version`;
        else if (/^http:\/\//i.test(r) || /^git:\/\//i.test(r)) { why = 'insecure (unencrypted) URL reference'; severity = 'error'; confidence = 'high'; }
        else if (/^(git\+\w+:\/\/|github:|gitlab:|bitbucket:|[\w.-]+\/[\w.-]+)/.test(r) && !/#([0-9a-f]{40}|v?\d+\.\d+\.\d+.*|semver:.*)$/i.test(r) && !r.startsWith('npm:')) why = 'git dependency without a pinned commit or version tag';
        else if (/^(file|link|portal):(\/|[A-Za-z]:|~)/.test(r)) why = 'absolute filesystem path reference is not portable';
        else if (r.startsWith('workspace:') && !hasWorkspaces) why = '`workspace:` protocol used but no workspace configuration was found';
        if (why) out.push({ line: e.line, column: 1, message: `\`${e.name}\`: ${why}.`, reason: why, anchor: `${e.section}:${e.name}:${r}`, confidence, ...(severity ? { severity } : {}) });
      }
      return out;
    },
  },
];
