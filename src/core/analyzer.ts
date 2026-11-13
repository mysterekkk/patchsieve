import { basename } from 'node:path';
import { DEFAULT_IGNORES, ruleSetting, type Config } from './configuration.ts';
import { getChanges, mergeBaseOf } from './diff.ts';
import { classifyFile, fsSource, gitSource, languageOf, type FileSource } from './files.ts';
import { REPO_URL, SUGGESTIONS } from './findings.ts';
import { ALL_RULES } from './rule-registry.ts';
import type { Finding, RawFinding, Rule, Severity, SkippedFile, SourceFileInfo } from './types.ts';
import { parseSource, syntaxErrors } from '../parsers/typescript.ts';
import { parseSuppressions } from './suppressions.ts';
import { makeMatcher } from '../utils/glob.ts';
import { normalizePath, sha } from '../utils/text.ts';


export interface AnalyzeOptions {
  cwd: string;
  config: Config;
  base?: string;
  head?: string;
  /** Fingerprints accepted as pre-existing debt. */
  baseline?: Set<string>;
  rules?: Rule[];
  /** Registry lookups for PS104 (injected so tests can stub the network). */
  registryLookup?: (name: string, timeoutMs: number) => Promise<'exists' | 'missing' | 'unknown'>;
}

export interface AnalysisResult {
  findings: Finding[];
  skipped: SkippedFile[];
  filesAnalyzed: number;
  rulesExecuted: number;
  suppressed: number;
  baselined: number;
  mode: 'changed' | 'all';
}

export async function analyze(opts: AnalyzeOptions): Promise<AnalysisResult> {
  const { cwd } = opts;
  const config = opts.config;
  const mode = config.scan.mode;
  const rules = opts.rules ?? ALL_RULES;
  const skipped: SkippedFile[] = [];

  let headSource: FileSource;
  let baseSource: FileSource | undefined;
  let candidates: { path: string; changed: Set<number> | null; isNew: boolean }[];

  if (mode === 'changed') {
    const base = opts.base ?? 'origin/main';
    const head = opts.head ?? 'HEAD';
    const changes = getChanges(cwd, base, head);
    headSource = gitSource(cwd, head);
    baseSource = gitSource(cwd, mergeBaseOf(cwd, base, head));
    candidates = [];
    for (const c of changes) {
      if (c.status === 'deleted') continue;
      if (c.binary) {
        skipped.push({ path: c.path, reason: 'binary file' });
        continue;
      }
      candidates.push({ path: normalizePath(c.path), changed: c.status === 'added' ? null : c.addedLines, isNew: c.status === 'added' });
    }
  } else {
    headSource = fsSource(cwd);
    candidates = headSource.list().map((p) => ({ path: p, changed: null, isNew: false }));
  }

  const ignored = makeMatcher([...DEFAULT_IGNORES, ...config.ignore]);
  candidates = candidates.filter((c) => !ignored(c.path)).sort((a, b) => (a.path < b.path ? -1 : 1));
  const relevant = candidates.filter((c) => languageOf(c.path) !== null);
  let selected = relevant;
  if (relevant.length > config.scan.maxFiles) {
    for (const c of relevant.slice(config.scan.maxFiles)) skipped.push({ path: c.path, reason: `exceeds max-files (${config.scan.maxFiles})` });
    selected = relevant.slice(0, config.scan.maxFiles);
  }

  headSource.prefetch?.(selected.map((c) => c.path), config.scan.maxFileSize);
  const readFile = (p: string): string | undefined => {
    const r = headSource.read(normalizePath(p), config.scan.maxFileSize);
    return 'text' in r ? r.text : undefined;
  };
  const readBaseFile = (p: string): string | undefined => {
    if (!baseSource) return undefined;
    const r = baseSource.read(normalizePath(p), config.scan.maxFileSize);
    return 'text' in r ? r.text : undefined;
  };

  const changedPaths = mode === 'changed' ? new Set(candidates.map((c) => c.path)) : null;
  const out: Finding[] = [];
  const allRaw: { f: Finding }[] = [];
  let filesAnalyzed = 0;
  let suppressed = 0;
  const enabled = rules.filter((r) => ruleSetting(config, r.id).severity !== 'off');

  for (const cand of selected) {
    const lang = languageOf(cand.path)!;
    const read = headSource.read(cand.path, config.scan.maxFileSize);
    if ('skip' in read) {
      skipped.push({ path: cand.path, reason: read.skip });
      continue;
    }
    const text = read.text;
    const info: SourceFileInfo = { path: cand.path, text, kind: classifyFile(cand.path), changedLines: cand.changed, isNew: cand.isNew };
    let sf;
    if (lang === 'ts' || lang === 'js') {
      sf = parseSource(cand.path, text);
      if (syntaxErrors(sf) > 0) {
        skipped.push({ path: cand.path, reason: 'syntax errors; file not analyzed' });
        continue;
      }
    }
    const name = basename(cand.path);
    const applicable = enabled.filter((r) => {
      if (r.fileNames) return r.fileNames.includes(name);
      if (!r.languages.includes(lang as 'ts')) return false;
      if (r.appliesTo === 'test' && info.kind !== 'test') return false;
      if (r.appliesTo === 'production' && info.kind !== 'production') return false;
      return true;
    });
    if (applicable.length === 0) continue;
    filesAnalyzed++;
    const supp = lang === 'json' ? { valid: [], invalid: [] } : parseSuppressions(text, sf);
    const raws: { rule: Rule; raw: RawFinding }[] = [];
    for (const rule of applicable) {
      let found: RawFinding[];
      try {
        found = rule.check({ file: info, ts: sf, readFile, readBaseFile, changedPaths, options: ruleSetting(config, rule.id).options });
      } catch (e) {
        skipped.push({ path: cand.path, reason: `rule ${rule.id} failed: ${(e as Error).message.slice(0, 100)}` });
        continue;
      }
      for (const raw of found) raws.push({ rule, raw });
    }
    const occurrences = new Map<string, number>();
    raws.sort((a, b) => a.raw.line - b.raw.line || a.raw.column - b.raw.column || (a.rule.id < b.rule.id ? -1 : 1));
    for (const { rule, raw } of raws) {
      const endLine = raw.endLine ?? raw.line;
      const onChanged = info.changedLines === null || rangeHits(info.changedLines, raw.line, endLine);
      if (!onChanged) continue;
      const key = `${rule.id}|${cand.path}|${raw.anchor}`;
      const n = occurrences.get(key) ?? 0;
      occurrences.set(key, n + 1);
      const setting = ruleSetting(config, rule.id);
      const sev: Severity = (setting.severity as Severity | undefined) ?? raw.severity ?? rule.defaultSeverity;
      if (supp.valid.some((s) => s.line === raw.line && s.ids.has(rule.id))) {
        suppressed++;
        continue;
      }
      allRaw.push({
        f: {
          ruleId: rule.id,
          severity: sev,
          confidence: raw.confidence ?? 'high',
          file: cand.path,
          line: raw.line,
          column: raw.column,
          endLine,
          title: rule.name,
          message: raw.message,
          reason: raw.reason,
          suggestion: SUGGESTIONS[rule.id] ?? 'See the rule documentation.',
          docsUrl: `${REPO_URL}/blob/main/docs/rules.md#${rule.id.toLowerCase()}`,
          onChangedLine: true,
          fingerprint: sha(`${key}|${n}`),
        },
      });
    }
    for (const inv of supp.invalid) {
      if (info.changedLines !== null && !info.changedLines.has(inv.line)) continue;
      allRaw.push({
        f: {
          ruleId: 'PS001', severity: 'warning', confidence: 'high', file: cand.path, line: inv.line, column: 1, endLine: inv.line,
          title: 'Invalid suppression comment',
          message: 'This patchsieve-ignore comment is malformed and was NOT applied.',
          reason: 'expected `patchsieve-ignore PS123 -- reason` with explicit rule IDs and a reason',
          suggestion: 'Use `patchsieve-ignore PS201 -- why this is intentional`. Wildcards and missing reasons are rejected.',
          docsUrl: `${REPO_URL}/blob/main/docs/false-positives.md#suppressions`,
          onChangedLine: true,
          fingerprint: sha(`PS001|${cand.path}|${inv.text}`),
        },
      });
    }
  }

  // Registry verification (PS104) is opt-in and handled by the caller-provided lookup.
  if (config.registry.enabled && opts.registryLookup) {
    const { registryFindings } = await import('../rules/dependencies/registry.ts');
    allRaw.push(...(await registryFindings(cwd, selected, headSource, readBaseFile, config, opts.registryLookup)).map((f) => ({ f })));
  }

  const seen = new Set<string>();
  let baselined = 0;
  for (const { f } of allRaw) {
    if (seen.has(f.fingerprint)) continue;
    seen.add(f.fingerprint);
    if (opts.baseline?.has(f.fingerprint)) {
      baselined++;
      continue;
    }
    out.push(f);
  }
  out.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line || a.column - b.column || (a.ruleId < b.ruleId ? -1 : 1)));
  return { findings: out, skipped, filesAnalyzed, rulesExecuted: enabled.length, suppressed, baselined, mode };
}

function rangeHits(set: Set<number>, from: number, to: number): boolean {
  if (to - from > set.size) {
    for (const l of set) if (l >= from && l <= to) return true;
    return false;
  }
  for (let l = from; l <= to; l++) if (set.has(l)) return true;
  return false;
}
