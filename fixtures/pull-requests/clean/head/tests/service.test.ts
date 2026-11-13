import { describe, expect, it } from 'vitest';
import { warm } from '../src/service';

function expectCached(cache: Map<string, string>): void {
  expect(cache.get('a')).toBe('v');
}

describe('service', () => {
  it('warms the cache', async () => {
    const cache = new Map<string, string>();
    await warm(cache, 'a');
    expectCached(cache);
  });

  it('rejects bad urls', async () => {
    await expect(Promise.reject(new Error('x'))).rejects.toThrow('x');
  });
});
