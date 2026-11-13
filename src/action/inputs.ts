import { ConfigError, type Overrides } from '../core/configuration.ts';

export interface ActionInputs {
  config?: string;
  failOn?: 'error' | 'warning' | 'none';
  format: 'console' | 'json' | 'sarif' | 'markdown';
  scanMode?: 'changed' | 'all';
  annotations?: boolean;
  registryCheck?: boolean;
  sarifOutput?: string;
  overrides: Overrides;
}

const list = (s: string): string[] => s.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);

function bool(name: string, v: string): boolean | undefined {
  if (v === '') return undefined;
  if (/^(true|false)$/i.test(v)) return v.toLowerCase() === 'true';
  throw new ConfigError(`input "${name}" must be true or false`);
}

function oneOf<T extends string>(name: string, v: string, allowed: readonly T[]): T | undefined {
  if (v === '') return undefined;
  if (!(allowed as readonly string[]).includes(v)) throw new ConfigError(`input "${name}" must be one of: ${allowed.join(', ')}`);
  return v as T;
}

function int(name: string, v: string): number | undefined {
  if (v === '') return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new ConfigError(`input "${name}" must be a positive integer`);
  return n;
}

/** `get` returns the raw string for an input name ('' when unset). Pure so it can be unit-tested. */
export function parseInputs(get: (name: string) => string): ActionInputs {
  const failOn = oneOf('fail-on', get('fail-on'), ['error', 'warning', 'none'] as const);
  const scanMode = oneOf('scan-mode', get('scan-mode'), ['changed', 'all'] as const);
  const annotations = bool('annotations', get('annotations'));
  const registryCheck = bool('registry-check', get('registry-check'));
  const rules: Record<string, 'error'> = {};
  for (const r of list(get('rules'))) {
    const m = /^(PS\d{3})=(error|warning|note|off)$/.exec(r);
    if (!m) throw new ConfigError(`input "rules" expects entries like PS201=warning, got ${JSON.stringify(r)}`);
    rules[m[1]!] = m[2] as 'error';
  }
  return {
    config: get('config') || undefined,
    failOn,
    format: oneOf('format', get('format'), ['console', 'json', 'sarif', 'markdown'] as const) ?? 'console',
    scanMode,
    annotations,
    registryCheck,
    sarifOutput: get('sarif-output') || undefined,
    overrides: {
      failOn,
      mode: scanMode,
      maxFiles: int('max-files', get('max-files')),
      maxFileSize: int('max-file-size', get('max-file-size')),
      rules: Object.keys(rules).length ? rules : undefined,
      ignore: list(get('ignore')).length ? list(get('ignore')) : undefined,
      registryEnabled: registryCheck,
      annotations,
    },
  };
}
