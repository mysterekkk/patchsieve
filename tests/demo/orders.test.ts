import { expect, it } from 'vitest';
import { calculateTotal } from '../../src/demo/orders.ts';

it('sums items', () => {
  expect(calculateTotal([1, 2, 3])).toBe(6);
});
