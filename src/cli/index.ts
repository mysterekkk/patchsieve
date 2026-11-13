import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { analyze } from '../core/analyzer.ts';
import { serializeBaseline } from '../core/baseline.ts';
import { applyOverrides, ConfigError, type Overrides } from '../core/configuration.ts';
import { summarize } from '../core/findings.ts';
import { loadConfig } from '../core/load-config.ts';
import { ALL_RULES, EXTRA_RULE_INFO } from '../core/rule-registry.ts';
import { npmRegistryLookup } from '../rules/dependencies/registry.ts';
import { toConsole, toJson, toMarkdown, toSarif } from '../reporters/index.ts';
import { VERSION } from '../version.ts';
import { sanitize } from '../utils/text.ts';

const HELP = `patchsieve ${VERSION} - deterministic pull request quality gate (no LLM, no network by default)

Usage:
  patchsieve scan [options]      Analyze a change (default) or the whole tree (--all)
  patchsieve baseline [options]  Print a baseline of current findings (JSON)
  patchsieve rules [--json]      List rules
  patchsieve doctor              Diagnose the environment
  patchsieve --version | --help

scan options:
  --base <ref>            Base ref (default: origin/main, then main)
  --head <ref>            Head ref (default: HEAD)
  --all                   Scan every file in the working tree instead of a diff
  --format <fmt>          console | json | sarif | markdown   (default: console)
  --output <file>         Write the report to a file instead of stdout
  --config <file>         Config path (default: .patchsieve.yml)
  --fail-on <level>       error | warning | none
  --rule <ID=level>       Override a rule: error | warning | note | off (repeatable)
  --ignore <glob>         Extra ignore glob (repeatable)
  --max-files <n>         --max-file-size <bytes>
  --registry-check        Opt in to npm registry lookups (PS104)
  --trust-head-config     Read policy from the working tree (local use only)

Exit codes: 0 passed, 1 findings reached the failure threshold, 2 configuration or analysis failure.
`;

function git(cwd: string, args: string[]): string | undefined {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return undefined;
  }
}

function resolveBase(cwd: string, explicit?: string): string {
  if (explicit) return explicit;
  for (const c of ['origin/main', 'origin/master', 'main', 'master']) if (git(cwd, ['rev-parse', '--verify', '--quiet', c])) return c;
  throw new Error('Could not determine a base ref. Pass --base <ref>.');
}

function parseOverrides(v: Record<string, unknown>): Overrides {
  const o: Overrides = {};
  if (v['fail-on']) {
    if (!['error', 'warning', 'none'].includes(v['fail-on'] as string)) throw new ConfigError('--fail-on must be error, warning or none');
    o.failOn = v['fail-on'] as Overrides['failOn'];
  }
  if (v.all) o.mode = 'all';
  if (v['max-files']) o.maxFiles = Number(v['max-files']);
  if (v['max-file-size']) o.maxFileSize = Number(v['max-file-size']);
  if (v['registry-check']) o.registryEnabled = true;
  const rules = v.rule as string[] | undefined;
  if (rules?.length) {
    o.rules = {};
    for (const r of rules) {
      const m = /^(PS\d{3})=(error|warning|note|off)$/.exec(r);
      if (!m) throw new ConfigError(`--rule expects ID=level (e.g. PS201=warning), got ${JSON.stringify(r)}`);
      o.rules[m[1]!] = m[2] as 'error';
    }
  }
  if ((v.ignore as string[] | undefined)?.length) o.ignore = v.ignore as string[];
  for (const k of ['max-files', 'max-file-size'] as const) if (v[k] !== undefined && !(Number(v[k]) > 0)) throw new ConfigError(`--${k} must be a positive number`);
  return o;
}

export async function main(argv: string[], out: { write(s: string): void } = process.stdout, err: { write(s: string): void } = process.stderr, cwd = process.cwd()): Promise<number> {
  const cmd = argv[0] && !argv[0].startsWith('-') ? argv[0] : 'scan';
  const rest = argv[0] && !argv[0].startsWith('-') ? argv.slice(1) : argv;
  try {
    const { values } = parseArgs({
      args: rest,
      allowPositionals: false,
      options: {
        base: { type: 'string' }, head: { type: 'string' }, all: { type: 'boolean' }, format: { type: 'string' }, output: { type: 'string' }, config: { type: 'string' },
        'fail-on': { type: 'string' }, rule: { type: 'string', multiple: true }, ignore: { type: 'string', multiple: true }, 'max-files': { type: 'string' }, 'max-file-size': { type: 'string' },
        'registry-check': { type: 'boolean' }, 'trust-head-config': { type: 'boolean' }, json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' },
      },
    });
    if (values.help || cmd === 'help') { out.write(HELP); return 0; }
    if (values.version) { out.write(`${VERSION}\n`); return 0; }

    if (cmd === 'rules') {
      const rows = [...ALL_RULES.map((r) => ({ id: r.id, name: r.name, category: r.category, severity: r.defaultSeverity, description: r.description })), ...EXTRA_RULE_INFO.map((x) => ({ id: x.id, name: x.name, category: x.category, severity: x.defaultSeverity, description: x.description }))].sort((a, b) => (a.id < b.id ? -1 : 1));
      out.write(values.json ? JSON.stringify(rows, null, 2) + '\n' : rows.map((r) => `${r.id}  ${String(r.severity).padEnd(7)} ${r.category.padEnd(15)} ${r.name}`).join('\n') + '\n');
      return 0;
    }

    if (cmd === 'doctor') {
      const lines: string[] = [];
      const major = Number(process.versions.node.split('.')[0]);
      lines.push(`${major >= 24 ? 'ok  ' : 'WARN'} node ${process.versions.node} (needs >= 24)`);
      lines.push(`${git(cwd, ['--version']) ? 'ok  ' : 'FAIL'} ${git(cwd, ['--version']) ?? 'git not found'}`);
      const inRepo = git(cwd, ['rev-parse', '--is-inside-work-tree']) === 'true';
      lines.push(`${inRepo ? 'ok  ' : 'WARN'} git repository: ${inRepo ? 'yes' : 'no (only --all scans work)'}`);
      if (inRepo) {
        const shallow = git(cwd, ['rev-parse', '--is-shallow-repository']) === 'true';
        lines.push(`${shallow ? 'WARN' : 'ok  '} history: ${shallow ? 'shallow clone - use fetch-depth: 0 so the merge base can be found' : 'complete'}`);
        try { lines.push(`ok   base ref: ${resolveBase(cwd, values.base)}`); } catch (e) { lines.push(`WARN ${(e as Error).message}`); }
      }
      const cfg = resolve(cwd, values.config ?? '.patchsieve.yml');
      lines.push(existsSync(cfg) ? `ok   config: ${cfg}` : 'ok   config: none (defaults)');
      out.write(lines.join('\n') + '\n');
      return lines.some((l) => l.startsWith('FAIL')) ? 2 : 0;
    }

    if (cmd !== 'scan' && cmd !== 'baseline') { err.write(`Unknown command: ${sanitize(cmd)}\n${HELP}`); return 2; }

    const overrides = parseOverrides(values as Record<string, unknown>);
    const mode = overrides.mode ?? 'changed';
    let base: string | undefined;
    if (mode === 'changed') base = resolveBase(cwd, values.base);
    const loaded = loadConfig({ cwd, mode, base, head: values.head, configPath: values.config, trustHeadConfig: values['trust-head-config'] });
    // `--all` flag wins over the trusted config's scan.mode; otherwise config may select all.
    let config = applyOverrides(loaded.config, overrides);
    if (config.scan.mode === 'changed' && mode === 'all') config.scan.mode = 'all';
    if (config.scan.mode === 'all' && mode === 'changed') {
      base = undefined;
    } else if (config.scan.mode === 'changed' && !base) {
      base = resolveBase(cwd, values.base);
    }
    config = applyOverrides(config, {});
    for (const n of loaded.notes) err.write(`note: ${n}\n`);

    const result = await analyze({ cwd, config, base, head: values.head, baseline: cmd === 'baseline' ? undefined : loaded.baseline, registryLookup: config.registry.enabled ? npmRegistryLookup() : undefined });

    if (cmd === 'baseline') {
      out.write(serializeBaseline(result.findings.map((f) => f.fingerprint)));
      return 0;
    }
    const fmt = values.format ?? 'console';
    let text: string;
    if (fmt === 'json') text = toJson(result, config.failOn);
    else if (fmt === 'sarif') text = toSarif(result);
    else if (fmt === 'markdown') text = toMarkdown(result, config.failOn);
    else if (fmt === 'console') text = toConsole(result, config.failOn, Boolean(process.stdout.isTTY) && !process.env.NO_COLOR && !values.output);
    else throw new ConfigError(`Unknown --format ${sanitize(fmt)} (console, json, sarif, markdown)`);
    if (values.output) writeFileSync(resolve(cwd, values.output), text);
    else out.write(text);
    for (const s of result.skipped.slice(0, 20)) if (fmt !== 'console') err.write(`skipped: ${sanitize(s.path)} (${sanitize(s.reason)})\n`);
    return summarize(result.findings, config.failOn).failed ? 1 : 0;
  } catch (e) {
    err.write(`patchsieve: ${sanitize((e as Error).message)}\n`);
    return 2;
  }
}

if (process.argv[1] && /cli\.(js|ts)$/.test(process.argv[1].replace(/\\/g, '/'))) {
  void main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
