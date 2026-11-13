import type { Finding, Severity, Confidence } from './types.ts';
import { sha } from '../utils/text.ts';

export const REPO_URL = 'https://github.com/mysterekkk/patchsieve';

export const SUGGESTIONS: Record<string, string> = {
  PS101: 'Run your package manager (e.g. `npm install`) and commit the updated lockfile.',
  PS102: 'Regenerate the lockfile so it matches the manifest, or fix the manifest range.',
  PS103: 'Verify the reference is intentional; prefer a registry version range or a workspace: protocol.',
  PS104: 'Check the package name for typos; confirm the package really exists before installing it.',
  PS201: 'Log the error, handle it, rethrow it, or add a comment explaining why ignoring it is safe.',
  PS202: 'Handle or log the rejection, or document why it can be ignored.',
  PS203: 'Do something meaningful with the error (log, wrap, return a controlled value, rethrow).',
  PS301: 'Assert on the returned value or observable side effect (e.g. `expect(result).toEqual(...)`).',
  PS302: 'Finish the assertion with a matcher, e.g. `expect(result).toBe(expected)`.',
  PS303: 'Assert against a real computed value instead of a constant.',
  PS304: 'Remove the skip, fix the test, or link a tracking issue in a comment.',
  PS305: 'Remove `.only` / `fit` / `fdescribe` before merging.',
  PS401: 'Implement the function or remove the code path before merging.',
  PS402: 'Implement the real logic; if the constant is intentional, add a comment or suppression.',
  PS403: 'Implement the missing logic or track it in an issue and remove the TODO.',
  PS404: 'Replace the hard-coded result with the real operation.',
  PS501: 'Keep the response and check `response.ok` (or `status`) before continuing.',
  PS502: 'Await the promise, return it, attach `.catch`, or mark intentional fire-and-forget with `void`.',
  PS503: 'Check `response.ok` before calling `response.json()`.',
  PS601: 'Add or update the migration so it matches the schema change (or vice versa).',
  PS602: 'Confirm data loss is intended; add a backup/backfill plan and have a human review it.',
  PS603: 'Add a DEFAULT, or add the column nullable, backfill, then set NOT NULL.',
  PS604: 'Update the Prisma schema together with the migration.',
};

export function docsUrl(ruleId: string): string {
  return `${REPO_URL}/blob/main/docs/rules.md#${ruleId.toLowerCase()}`;
}

export function makeFinding(p: {
  ruleId: string; title: string; severity: Severity; confidence?: Confidence; file: string; line: number; column?: number; endLine?: number;
  message: string; reason: string; anchor: string; occurrence?: number;
}): Finding {
  return {
    ruleId: p.ruleId, severity: p.severity, confidence: p.confidence ?? 'high', file: p.file, line: p.line, column: p.column ?? 1, endLine: p.endLine ?? p.line,
    title: p.title, message: p.message, reason: p.reason, suggestion: SUGGESTIONS[p.ruleId] ?? 'See the rule documentation.',
    docsUrl: docsUrl(p.ruleId), onChangedLine: true, fingerprint: sha(`${p.ruleId}|${p.file}|${p.anchor}|${p.occurrence ?? 0}`),
  };
}

export interface Summary {
  total: number;
  errors: number;
  warnings: number;
  notes: number;
  failed: boolean;
}

export function summarize(findings: Finding[], failOn: 'error' | 'warning' | 'none'): Summary {
  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.filter((f) => f.severity === 'warning').length;
  const notes = findings.filter((f) => f.severity === 'note').length;
  const failed = failOn === 'error' ? errors > 0 : failOn === 'warning' ? errors + warnings > 0 : false;
  return { total: findings.length, errors, warnings, notes, failed };
}
