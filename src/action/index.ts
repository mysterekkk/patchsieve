import * as core from '@actions/core';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyze } from '../core/analyzer.ts';
import { applyOverrides } from '../core/configuration.ts';
import { summarize } from '../core/findings.ts';
import { loadConfig } from '../core/load-config.ts';
import { npmRegistryLookup } from '../rules/dependencies/registry.ts';
import { toAnnotations, toConsole, toJson, toMarkdown, toSarif } from '../reporters/index.ts';
import { sanitize } from '../utils/text.ts';
import { parseInputs } from './inputs.ts';
import { resolveRange } from './range.ts';

async function run(): Promise<void> {
  const inputs = parseInputs((n) => core.getInput(n));
  const cwd = process.env.GITHUB_WORKSPACE ?? process.cwd();
  let payload: Record<string, any> | undefined;
  try {
    if (process.env.GITHUB_EVENT_PATH) payload = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  } catch {
    payload = undefined;
  }
  const range = resolveRange(process.env.GITHUB_EVENT_NAME ?? '', payload);
  const wantAll = inputs.scanMode === 'all' || !range;
  const mode = wantAll ? 'all' : 'changed';
  if (wantAll && inputs.scanMode !== 'all') core.info('No pull request or push range found in the event; scanning the whole working tree.');

  const loaded = loadConfig({ cwd, mode, base: range?.base, head: range?.head, configPath: inputs.config });
  const config = applyOverrides(loaded.config, { ...inputs.overrides, mode: inputs.overrides.mode ?? (wantAll ? 'all' : undefined) });
  for (const n of loaded.notes) core.notice(sanitize(n));

  const result = await analyze({ cwd, config, base: range?.base, head: range?.head, baseline: loaded.baseline, registryLookup: config.registry.enabled ? npmRegistryLookup() : undefined });
  const s = summarize(result.findings, config.failOn);

  const dir = process.env.RUNNER_TEMP ?? cwd;
  const jsonPath = join(dir, 'patchsieve.json');
  const sarifPath = inputs.sarifOutput ? join(cwd, inputs.sarifOutput) : join(dir, 'patchsieve.sarif');
  const mdPath = join(dir, 'patchsieve.md');
  const md = toMarkdown(result, config.failOn);
  writeFileSync(jsonPath, toJson(result, config.failOn));
  writeFileSync(sarifPath, toSarif(result));
  writeFileSync(mdPath, md);

  if (config.reporting.annotations) for (const line of toAnnotations(result.findings)) process.stdout.write(line + '\n');
  if (inputs.format === 'console') process.stdout.write(toConsole(result, config.failOn, false));
  else if (inputs.format === 'json') process.stdout.write(toJson(result, config.failOn));
  else if (inputs.format === 'sarif') process.stdout.write(toSarif(result));
  else process.stdout.write(md);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');

  core.setOutput('findings', String(s.total));
  core.setOutput('errors', String(s.errors));
  core.setOutput('warnings', String(s.warnings));
  core.setOutput('passed', String(!s.failed));
  core.setOutput('json-path', jsonPath);
  core.setOutput('sarif-path', sarifPath);
  core.setOutput('markdown-path', mdPath);
  if (s.failed) core.setFailed(`PatchSieve: ${s.errors} error(s), ${s.warnings} warning(s) reached the fail-on=${config.failOn} threshold.`);
}

run().catch((e: unknown) => {
  core.setFailed(`PatchSieve could not complete the analysis: ${sanitize(e instanceof Error ? e.message : String(e))}`);
  process.exitCode = 2;
});
