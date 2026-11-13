// Renders the real console output of `patchsieve scan` on a fixture PR into assets/report-preview.svg.
// This is a documentation image generated from fixtures, not a screenshot of a GitHub pull request.
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const fixture = process.argv[2] ?? 'fake-test';
const root = resolve('fixtures/pull-requests', fixture);
const dir = mkdtempSync(join(tmpdir(), 'ps-preview-'));
const git = (...a) => execFileSync('git', ['-c', 'user.name=p', '-c', 'user.email=p@example.com', '-c', 'commit.gpgsign=false', ...a], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
try {
  git('init', '-q', '-b', 'main');
  cpSync(join(root, 'base'), dir, { recursive: true });
  git('add', '-A');
  git('commit', '-q', '--allow-empty', '-m', 'base');
  const base = git('rev-parse', 'HEAD');
  for (const e of readdirSync(dir)) if (e !== '.git') rmSync(join(dir, e), { recursive: true, force: true });
  cpSync(join(root, 'head'), dir, { recursive: true });
  git('add', '-A');
  git('commit', '-q', '-m', 'head');
  const res = spawnSync(process.execPath, [resolve('dist/cli.js'), 'scan', '--base', base], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  const lines = res.stdout.split('\n').filter((l, i, a) => !(l === '' && i === a.length - 1));
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const color = (l) => (/^error/.test(l) ? '#f87171' : /^warning/.test(l) ? '#fbbf24' : /^note/.test(l) ? '#67e8f9' : /Result: FAILED/.test(l) ? '#f87171' : /Result: PASSED/.test(l) ? '#2dd4bf' : /^\s+fix:/.test(l) ? '#8b8fb8' : '#e5e7ff');
  const lh = 20;
  const width = 940;
  const height = 96 + lines.length * lh;
  const text = lines
    .map((l, i) => `<text x="28" y="${84 + i * lh}" fill="${color(l)}" xml:space="preserve">${esc(l.length > 118 ? l.slice(0, 117) + '…' : l)}</text>`)
    .join('\n    ');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="PatchSieve console report for the ${fixture} fixture">
  <rect width="${width}" height="${height}" rx="14" fill="#0b1437"/>
  <rect width="${width}" height="44" rx="14" fill="#1a1f4d"/>
  <rect y="30" width="${width}" height="14" fill="#1a1f4d"/>
  <circle cx="26" cy="22" r="6" fill="#f87171"/><circle cx="46" cy="22" r="6" fill="#fbbf24"/><circle cx="66" cy="22" r="6" fill="#2dd4bf"/>
  <text x="90" y="27" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="13" fill="#b9b6f7">$ patchsieve scan --base main   (fixture: fixtures/pull-requests/${fixture})</text>
  <g font-family="Cascadia Mono, Consolas, Menlo, monospace" font-size="13.5">
    ${text}
  </g>
</svg>
`;
  writeFileSync(resolve('assets/report-preview.svg'), svg);
  console.log(`wrote assets/report-preview.svg (${lines.length} lines, exit ${res.status})`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
