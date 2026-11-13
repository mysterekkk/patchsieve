import { describe, expect, it } from 'vitest';
import { resolveRange } from '../../src/action/range.ts';

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);

describe('resolveRange', () => {
  it('uses PR base SHA for pull_request events (including forks)', () => {
    expect(resolveRange('pull_request', { pull_request: { base: { sha: A }, head: { sha: B } } })).toEqual({ base: A, head: 'HEAD' });
  });
  it('uses before-SHA for pushes and ignores the all-zero initial push', () => {
    expect(resolveRange('push', { before: A })).toEqual({ base: A, head: 'HEAD' });
    expect(resolveRange('push', { before: '0'.repeat(40) })).toBeUndefined();
  });
  it('rejects anything that is not a 40-hex SHA (untrusted payload)', () => {
    expect(resolveRange('pull_request', { pull_request: { base: { sha: '--output=x' }, head: { sha: B } } })).toBeUndefined();
    expect(resolveRange('pull_request', { pull_request: { base: { sha: A }, head: { sha: 'main; id' } } })).toBeUndefined();
    expect(resolveRange('workflow_dispatch', {})).toBeUndefined();
    expect(resolveRange('push', undefined)).toBeUndefined();
  });
});
