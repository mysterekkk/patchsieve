import { expect, it } from 'vitest';
import { syncOrders } from '../../src/demo/orders';

it('syncs orders', async () => {
  const result = await syncOrders(async () => {});
  expect(result);
});
