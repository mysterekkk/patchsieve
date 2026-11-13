import { dependencyRules } from '../rules/dependencies/index.ts';
import { errorHandlingRules } from '../rules/error-handling/index.ts';
import { migrationRules } from '../rules/migrations/index.ts';
import { reliabilityRules } from '../rules/reliability/index.ts';
import { stubRules } from '../rules/stubs/index.ts';
import { testRules } from '../rules/tests/index.ts';
import type { Rule } from './types.ts';

/** PS104 (registry verification) is implemented in rules/dependencies/registry.ts and gated by config. */
export const ALL_RULES: Rule[] = [...dependencyRules, ...errorHandlingRules, ...testRules, ...stubRules, ...reliabilityRules, ...migrationRules].sort((a, b) => (a.id < b.id ? -1 : 1));

export const EXTRA_RULE_INFO = [{ id: 'PS104', name: 'Unverified new package', category: 'dependencies', defaultSeverity: 'warning', description: 'Opt-in: new unscoped package name not found on the public npm registry (HTTP 404 only).' }];

const ids = ALL_RULES.map((r) => r.id);
if (new Set(ids).size !== ids.length) throw new Error('Duplicate rule IDs');
