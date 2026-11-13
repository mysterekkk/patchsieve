import { classifyFile } from '../src/core/files.ts';
import { ALL_RULES } from '../src/core/rule-registry.ts';
import type { RawFinding, RuleContext } from '../src/core/types.ts';
import { parseSource } from '../src/parsers/typescript.ts';

export interface RunOpts {
  files?: Record<string, string>;
  baseFiles?: Record<string, string>;
  changedPaths?: string[];
}

/** Run one rule against in-memory text (no git involved). */
export function run(ruleId: string, path: string, text: string, o: RunOpts = {}): RawFinding[] {
  const rule = ALL_RULES.find((r) => r.id === ruleId);
  if (!rule) throw new Error(`unknown rule ${ruleId}`);
  const isCode = /\.(tsx?|jsx?|mjs|cjs)$/.test(path);
  const ctx: RuleContext = {
    file: { path, text, kind: classifyFile(path), changedLines: null, isNew: false },
    ts: isCode ? parseSource(path, text) : undefined,
    readFile: (p) => (p === path ? text : o.files?.[p]),
    readBaseFile: (p) => o.baseFiles?.[p],
    changedPaths: o.changedPaths ? new Set(o.changedPaths) : null,
    options: {},
  };
  return rule.check(ctx);
}

export const lines = (f: RawFinding[]): number[] => f.map((x) => x.line);
