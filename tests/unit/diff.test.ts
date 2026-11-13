import { describe, expect, it } from 'vitest';
import { assertSafeRef, parseUnifiedDiff } from '../../src/core/diff.ts';

const diff = [
  'diff --git a/src/a.ts b/src/a.ts',
  'index 111..222 100644',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1,0 +2,2 @@',
  '+one',
  '+two',
  '@@ -10 +12 @@',
  '-old',
  '+new',
  'diff --git a/new file.ts b/new file.ts',
  'new file mode 100644',
  '--- /dev/null',
  '+++ b/new file.ts',
  '@@ -0,0 +1,3 @@',
  '+a',
  '+b',
  '+c',
  'diff --git a/gone.ts b/gone.ts',
  'deleted file mode 100644',
  '--- a/gone.ts',
  '+++ /dev/null',
  '@@ -1,2 +0,0 @@',
  '-x',
  '-y',
  'diff --git a/old.ts b/renamed.ts',
  'similarity index 90%',
  'rename from old.ts',
  'rename to renamed.ts',
  '--- a/old.ts',
  '+++ b/renamed.ts',
  '@@ -5 +5 @@',
  '-q',
  '+r',
  'diff --git a/img.png b/img.png',
  'Binary files a/img.png and b/img.png differ',
].join('\n');

describe('parseUnifiedDiff', () => {
  const changes = parseUnifiedDiff(diff);
  it('tracks added lines per file', () => {
    expect(changes[0]).toMatchObject({ path: 'src/a.ts', status: 'modified' });
    expect([...changes[0]!.addedLines]).toEqual([2, 3, 12]);
  });
  it('handles new files with spaces, deletions, renames and binaries', () => {
    expect(changes[1]).toMatchObject({ path: 'new file.ts', status: 'added' });
    expect([...changes[1]!.addedLines]).toEqual([1, 2, 3]);
    expect(changes[2]).toMatchObject({ path: 'gone.ts', status: 'deleted' });
    expect(changes[3]).toMatchObject({ path: 'renamed.ts', oldPath: 'old.ts', status: 'renamed' });
    expect(changes[4]).toMatchObject({ path: 'img.png', binary: true });
  });
  it('tolerates CRLF output', () => {
    expect(parseUnifiedDiff(diff.replace(/\n/g, '\r\n'))[0]!.path).toBe('src/a.ts');
  });
  it('does not let hunk content masquerade as a file header', () => {
    const evil = ['diff --git a/src/a.ts b/src/a.ts', '--- a/src/a.ts', '+++ b/src/a.ts', '@@ -0,0 +1,3 @@', '+++ b/src/innocent.ts', '+rename to src/innocent.ts', '+new file mode 100644'].join('\n');
    const r = parseUnifiedDiff(evil);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ path: 'src/a.ts', status: 'modified' });
    expect([...r[0]!.addedLines]).toEqual([1, 2, 3]);
  });
});

describe('assertSafeRef', () => {
  it('accepts normal refs and rejects option-like or shell-ish refs', () => {
    expect(() => assertSafeRef('origin/main')).not.toThrow();
    expect(() => assertSafeRef('a'.repeat(40))).not.toThrow();
    expect(() => assertSafeRef('--output=/tmp/x')).toThrow();
    expect(() => assertSafeRef('main; rm -rf /')).toThrow();
  });
});
