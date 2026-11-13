import type { Config } from '../../core/configuration.ts';
import type { FileSource } from '../../core/files.ts';
import { makeFinding } from '../../core/findings.ts';
import type { Finding } from '../../core/types.ts';
import { isRegistryRange, readManifest } from './index.ts';

export type RegistryVerdict = 'exists' | 'missing' | 'unknown';
export type RegistryLookup = (name: string, timeoutMs: number) => Promise<RegistryVerdict>;

const PUBLIC_NAME = /^[a-z0-9][a-z0-9._-]{0,213}$/;

/** Real lookup against the public npm registry. 404 is the only response treated as "missing". */
export function npmRegistryLookup(): RegistryLookup {
  const cache = new Map<string, RegistryVerdict>();
  return async (name, timeoutMs) => {
    const hit = cache.get(name);
    if (hit) return hit;
    let v: RegistryVerdict;
    try {
      const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
        method: 'GET',
        headers: { accept: 'application/vnd.npm.install-v1+json' },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'error',
      });
      v = res.status === 200 ? 'exists' : res.status === 404 ? 'missing' : 'unknown'; // 429/403/5xx: cannot conclude
      await res.body?.cancel();
    } catch {
      v = 'unknown';
    }
    if (v !== 'unknown') cache.set(name, v);
    return v;
  };
}

export async function registryFindings(
  _cwd: string,
  files: { path: string; changed: Set<number> | null; isNew: boolean }[],
  head: FileSource,
  readBase: (p: string) => string | undefined,
  config: Config,
  lookup: RegistryLookup,
): Promise<Finding[]> {
  const out: Finding[] = [];
  // A custom registry configuration means names may be private: never send them to the public registry.
  const npmrc = head.read('.npmrc', 65536);
  if ('text' in npmrc && /^\s*(@[\w.-]+:)?registry\s*=\s*(?!https?:\/\/registry\.npmjs\.org)/im.test(npmrc.text)) return out;
  for (const f of files) {
    if (!f.path.endsWith('package.json')) continue;
    const r = head.read(f.path, config.scan.maxFileSize);
    if (!('text' in r)) continue;
    let entries;
    try {
      entries = readManifest(r.text).entries;
    } catch {
      continue;
    }
    const baseText = readBase(f.path);
    let before = new Set<string>();
    if (baseText !== undefined && !f.isNew) {
      try {
        before = new Set(readManifest(baseText).entries.map((e) => e.name));
      } catch {
        /* treat as all new */
      }
    }
    for (const e of entries) {
      if (before.has(e.name) || !isRegistryRange(e.range) || e.name.startsWith('@') || !PUBLIC_NAME.test(e.name)) continue;
      if (f.changed && !f.changed.has(e.line)) continue;
      if ((await lookup(e.name, config.registry.timeoutMs)) === 'missing') {
        const sev = config.rules.PS104;
        out.push(
          makeFinding({
            ruleId: 'PS104', title: 'Unverified new package', severity: typeof sev === 'string' && sev !== 'off' ? sev : 'warning', confidence: 'medium',
            file: f.path, line: e.line, message: `\`${e.name}\` was not found on the public npm registry.`,
            reason: 'registry.npmjs.org answered 404 for this name (private packages and typos both look like this)', anchor: `${e.section}:${e.name}`,
          }),
        );
      }
    }
  }
  return out;
}
