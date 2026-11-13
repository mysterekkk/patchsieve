import { parse } from 'yaml';
import { z } from 'zod';
import type { Severity } from './types.ts';

const sev = z.enum(['error', 'warning', 'note', 'off']);
const ruleEntry = z.union([sev, z.object({ severity: sev.optional(), options: z.record(z.string(), z.unknown()).optional() }).strict()]);

export const configSchema = z
  .object({
    version: z.literal(1),
    scan: z
      .object({
        mode: z.enum(['changed', 'all']).default('changed'),
        maxFiles: z.number().int().positive().max(100000).default(2000),
        maxFileSize: z.number().int().positive().max(64 * 1024 * 1024).default(1048576),
      })
      .strict()
      .default({ mode: 'changed', maxFiles: 2000, maxFileSize: 1048576 }),
    rules: z.record(z.string().regex(/^PS\d{3}$/), ruleEntry).default({}),
    ignore: z.array(z.string().max(300)).max(500).default([]),
    reporting: z
      .object({ annotations: z.boolean().default(true), sarif: z.boolean().default(false) })
      .strict()
      .default({ annotations: true, sarif: false }),
    failOn: z.enum(['error', 'warning', 'none']).default('error'),
    baseline: z.string().max(300).optional(),
    registry: z
      .object({ enabled: z.boolean().default(false), timeoutMs: z.number().int().min(100).max(30000).default(5000) })
      .strict()
      .default({ enabled: false, timeoutMs: 5000 }),
  })
  .strict();

export type Config = z.infer<typeof configSchema>;
export type RuleSetting = { severity: Severity | 'off' | undefined; options: Record<string, unknown> };

export const DEFAULT_IGNORES = ['**/node_modules/**', '**/dist/**', '**/build/**', '**/coverage/**', '**/generated/**', '**/.next/**'];

export function defaultConfig(): Config {
  return configSchema.parse({ version: 1 });
}

export class ConfigError extends Error {}

export function parseConfig(text: string, source = '.patchsieve.yml'): Config {
  let raw: unknown;
  try {
    // YAML is parsed as pure data: no tags that construct objects, no code execution.
    raw = parse(text, { schema: 'core', maxAliasCount: 20 });
  } catch (e) {
    throw new ConfigError(`${source}: invalid YAML: ${(e as Error).message}`);
  }
  const r = configSchema.safeParse(raw ?? {});
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    throw new ConfigError(`${source}: ${msg}`);
  }
  return r.data;
}

export function ruleSetting(cfg: Config, id: string): RuleSetting {
  const e = cfg.rules[id];
  if (e === undefined) return { severity: undefined, options: {} };
  if (typeof e === 'string') return { severity: e, options: {} };
  return { severity: e.severity, options: e.options ?? {} };
}

export interface Overrides {
  failOn?: Config['failOn'];
  mode?: 'changed' | 'all';
  maxFiles?: number;
  maxFileSize?: number;
  rules?: Record<string, Severity | 'off'>;
  ignore?: string[];
  registryEnabled?: boolean;
  annotations?: boolean;
}

/** Precedence (low→high): defaults < trusted config (base branch) < CLI/Action inputs. */
export function applyOverrides(cfg: Config, o: Overrides): Config {
  const c: Config = structuredClone(cfg);
  if (o.failOn) c.failOn = o.failOn;
  if (o.mode) c.scan.mode = o.mode;
  if (o.maxFiles) c.scan.maxFiles = o.maxFiles;
  if (o.maxFileSize) c.scan.maxFileSize = o.maxFileSize;
  if (o.rules) for (const [k, v] of Object.entries(o.rules)) c.rules[k] = v;
  if (o.ignore) c.ignore = [...c.ignore, ...o.ignore];
  if (o.registryEnabled !== undefined) c.registry.enabled = o.registryEnabled;
  if (o.annotations !== undefined) c.reporting.annotations = o.annotations;
  return c;
}
