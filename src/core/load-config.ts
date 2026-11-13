import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseBaseline } from './baseline.ts';
import { ConfigError, defaultConfig, parseConfig, type Config } from './configuration.ts';
import { mergeBaseOf, showFile } from './diff.ts';

export interface LoadedConfig {
  config: Config;
  baseline: Set<string>;
  notes: string[];
}

export interface LoadOptions {
  cwd: string;
  mode: 'changed' | 'all';
  base?: string;
  head?: string;
  configPath?: string;
  /** Local development only: read policy from the working tree instead of the base branch. */
  trustHeadConfig?: boolean;
}

const DEFAULT_CONFIG = '.patchsieve.yml';
const DEFAULT_BASELINE = '.patchsieve-baseline.json';

function readWorking(cwd: string, rel: string): string | undefined {
  const p = join(cwd, rel);
  return existsSync(p) ? readFileSync(p, 'utf8') : undefined;
}

/**
 * Trust boundary: when analyzing a change, policy (config + baseline) comes from the merge base,
 * never from the PR head, so a PR cannot weaken its own checks. Edits to policy files are surfaced as notes.
 */
export function loadConfig(o: LoadOptions): LoadedConfig {
  const rel = o.configPath ?? DEFAULT_CONFIG;
  const notes: string[] = [];

  const useBase = o.mode === 'changed' && !o.trustHeadConfig && o.base !== undefined;
  const mb = useBase ? mergeBaseOf(o.cwd, o.base!, o.head ?? 'HEAD') : undefined;
  const read = (p: string): string | undefined => (mb ? showFile(o.cwd, mb, p) : readWorking(o.cwd, p));

  const trustedText = read(rel);
  const headText = mb ? readWorking(o.cwd, rel) : undefined;
  if (mb && headText !== undefined && headText !== trustedText) {
    notes.push(`${rel} differs between the base branch and this change. The base branch version is enforced; changes to it take effect after merge.`);
  }
  let config: Config;
  try {
    config = trustedText === undefined ? defaultConfig() : parseConfig(trustedText, rel);
  } catch (e) {
    if (e instanceof ConfigError) throw e;
    throw new ConfigError(String(e));
  }
  const baselineRel = config.baseline ?? DEFAULT_BASELINE;
  if (/^(\/|[A-Za-z]:|.*\.\.)/.test(baselineRel)) throw new ConfigError(`baseline path must be a relative path inside the repository: ${baselineRel}`);
  const baselineText = read(baselineRel);
  let baseline = new Set<string>();
  if (baselineText !== undefined) {
    try {
      baseline = parseBaseline(baselineText);
    } catch (e) {
      throw new ConfigError(`${baselineRel}: ${(e as Error).message}`);
    }
  }
  return { config, baseline, notes };
}
