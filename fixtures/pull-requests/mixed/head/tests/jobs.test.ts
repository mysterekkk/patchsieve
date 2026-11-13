import { expect, it } from 'vitest';
import { good } from '../src/jobs';

it('reads', async () => {
  expect(await good(async () => 'x')).toBe('x');
});

it('reads again', async () => {
  await good(async () => 'x');
});
