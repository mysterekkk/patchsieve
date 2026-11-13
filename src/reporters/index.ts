import type { AnalysisResult } from '../core/analyzer.ts';
import { REPO_URL, docsUrl, summarize } from '../core/findings.ts';
import { ALL_RULES, EXTRA_RULE_INFO } from '../core/rule-registry.ts';
import type { Finding, Severity } from '../core/types.ts';
import { VERSION } from '../version.ts';
import { sanitize } from '../utils/text.ts';

type FailOn = 'error' | 'warning' | 'none';

// ---------- JSON ----------
export function toJson(r: AnalysisResult, failOn: FailOn): string {
  const s = summarize(r.findings, failOn, r.blockingSkips);
  return (
    JSON.stringify(
      {
        tool: { name: 'patchsieve', version: VERSION },
        schemaVersion: 1,
        mode: r.mode,
        summary: { filesAnalyzed: r.filesAnalyzed, rulesExecuted: r.rulesExecuted, findings: s.total, errors: s.errors, warnings: s.warnings, notes: s.notes, suppressed: r.suppressed, baselined: r.baselined, blockingSkips: r.blockingSkips, result: s.failed ? 'failed' : 'passed' },
        findings: r.findings,
        skipped: r.skipped,
      },
      null,
      2,
    ) + '\n'
  );
}

// ---------- SARIF 2.1.0 ----------
const SARIF_LEVEL: Record<Severity, string> = { error: 'error', warning: 'warning', note: 'note' };

export function toSarif(r: AnalysisResult): string {
  const known = [...ALL_RULES.map((x) => ({ id: x.id, name: x.name, description: x.description, severity: x.defaultSeverity })), ...EXTRA_RULE_INFO.map((x) => ({ id: x.id, name: x.name, description: x.description, severity: x.defaultSeverity as Severity })), { id: 'PS001', name: 'Invalid suppression comment', description: 'A patchsieve-ignore comment is malformed and was not applied.', severity: 'warning' as Severity }].sort((a, b) => (a.id < b.id ? -1 : 1));
  const sarif = {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'PatchSieve',
            version: VERSION,
            informationUri: REPO_URL,
            rules: known.map((k) => ({ id: k.id, name: k.name.replace(/[^A-Za-z0-9]+(.)?/g, (_m, c: string | undefined) => (c ?? '').toUpperCase()), shortDescription: { text: k.name }, fullDescription: { text: k.description }, helpUri: docsUrl(k.id), defaultConfiguration: { level: SARIF_LEVEL[k.severity] } })),
          },
        },
        results: r.findings.map((f) => ({
          ruleId: f.ruleId,
          ruleIndex: known.findIndex((k) => k.id === f.ruleId),
          level: SARIF_LEVEL[f.severity],
          message: { text: `${f.message} ${f.suggestion}` },
          locations: [{ physicalLocation: { artifactLocation: { uri: f.file.split('/').map(encodeURIComponent).join('/'), uriBaseId: '%SRCROOT%' }, region: { startLine: f.line, startColumn: f.column, endLine: Math.max(f.endLine, f.line) } } }],
          partialFingerprints: { 'patchsieve/v1': f.fingerprint },
          properties: { confidence: f.confidence, reason: f.reason },
        })),
        columnKind: 'utf16CodeUnits',
      },
    ],
  };
  return JSON.stringify(sarif, null, 2) + '\n';
}

// ---------- Markdown (Job Summary) ----------
// Untrusted text (paths, package names, messages) must not be able to form links, HTML, emphasis or table cells.
const esc = (s: string): string => sanitize(s).replace(/[\\`*_{}[\]()#+!|<>&~]/g, (c) => `\\${c}`);
/** Inline code span that cannot be closed early: the fence is longer than any backtick run inside. */
const code = (s: string): string => {
  const t = sanitize(s);
  const longest = Math.max(0, ...(t.match(/`+/g) ?? []).map((m) => m.length));
  const fence = '`'.repeat(longest + 1);
  return `${fence} ${t} ${fence}`.replace(/\|/g, '&#124;');
};

export function toMarkdown(r: AnalysisResult, failOn: FailOn): string {
  const s = summarize(r.findings, failOn, r.blockingSkips);
  const out: string[] = ['## PatchSieve — PR Quality Gate', '', `Files analyzed: **${r.filesAnalyzed}** · Rules executed: **${r.rulesExecuted}** · Errors: **${s.errors}** · Warnings: **${s.warnings}**${s.notes ? ` · Notes: **${s.notes}**` : ''}`, ''];
  const section = (title: string, sev: Severity): void => {
    const list = r.findings.filter((f) => f.severity === sev);
    if (!list.length) return;
    out.push(`### ${title}`, '', '| Rule | Finding | Location |', '| --- | --- | --- |');
    for (const f of list) out.push(`| [${f.ruleId}](${f.docsUrl}) | **${esc(f.title)}** — ${esc(f.message)} | ${code(`${f.file}:${f.line}`)} |`);
    out.push('');
  };
  section('Errors', 'error');
  section('Warnings', 'warning');
  section('Notes', 'note');
  if (!r.findings.length) out.push('No findings on the analyzed changes.', '');
  if (r.skipped.length) {
    out.push('<details><summary>Skipped files (' + r.skipped.length + ')</summary>', '');
    for (const k of r.skipped.slice(0, 50)) out.push(`- ${code(k.path)}: ${esc(k.reason)}${k.blocking ? ' **(blocks the gate)**' : ''}`);
    if (r.skipped.length > 50) out.push(`- … and ${r.skipped.length - 50} more`);
    out.push('', '</details>', '');
  }
  if (r.suppressed || r.baselined) out.push(`Suppressed by comment: ${r.suppressed} · Accepted by baseline: ${r.baselined}`, '');
  if (s.blockedSkips) out.push(`${s.blockedSkips} in-scope file(s) could not be analyzed, which fails the gate (set \`failOnSkipped: false\` to disable).`, '');
  out.push(`**Result: ${s.failed ? 'FAILED' : 'PASSED'}** (fail-on: ${failOn})`, '');
  return out.join('\n');
}

// ---------- Console ----------
export function toConsole(r: AnalysisResult, failOn: FailOn, color: boolean): string {
  const c = (code: number, t: string): string => (color ? `\u001b[${code}m${t}\u001b[0m` : t);
  const s = summarize(r.findings, failOn, r.blockingSkips);
  const out: string[] = [];
  for (const f of r.findings) {
    const tag = f.severity === 'error' ? c(31, 'error  ') : f.severity === 'warning' ? c(33, 'warning') : c(36, 'note   ');
    out.push(`${tag} ${c(1, f.ruleId)} ${sanitize(f.title)}  ${c(2, `${sanitize(f.file)}:${f.line}:${f.column}`)}`);
    out.push(`        ${sanitize(f.message)}`);
    out.push(`        ${c(2, 'fix:')} ${f.suggestion}`);
  }
  if (r.skipped.length) {
    out.push('', c(2, `Skipped ${r.skipped.length} file(s):`));
    for (const k of r.skipped.slice(0, 20)) out.push(c(2, `  ${sanitize(k.path)} (${sanitize(k.reason)})${k.blocking ? ' [blocks the gate]' : ''}`));
  }
  if (s.blockedSkips) out.push('', `${s.blockedSkips} in-scope file(s) could not be analyzed; this fails the gate (failOnSkipped).`);
  out.push('', `${r.filesAnalyzed} files analyzed, ${r.rulesExecuted} rules, ${s.errors} error(s), ${s.warnings} warning(s), ${s.notes} note(s)`);
  out.push(s.failed ? c(31, 'Result: FAILED') : c(32, 'Result: PASSED'));
  return out.join('\n') + '\n';
}

// ---------- GitHub workflow commands ----------
const escData = (s: string): string => sanitize(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const escProp = (s: string): string => escData(s).replace(/:/g, '%3A').replace(/,/g, '%2C');

export function toAnnotations(findings: Finding[], limitPerLevel = 10): string[] {
  const used: Record<string, number> = { error: 0, warning: 0, notice: 0 };
  const lines: string[] = [];
  for (const f of findings) {
    const level = f.severity === 'note' ? 'notice' : f.severity;
    if ((used[level] ?? 0) >= limitPerLevel) continue;
    used[level] = (used[level] ?? 0) + 1;
    lines.push(`::${level} file=${escProp(f.file)},line=${f.line},endLine=${Math.max(f.line, f.endLine)},col=${f.column},title=${escProp(`${f.ruleId} ${f.title}`)}::${escData(`${f.message} ${f.suggestion}`)}`);
  }
  const hidden = findings.length - lines.length;
  if (hidden > 0) lines.push(`::notice title=${escProp('PatchSieve')}::${escData(`${hidden} more finding(s) not annotated (GitHub limits annotations per step). See the job summary or SARIF report.`)}`);
  return lines;
}
