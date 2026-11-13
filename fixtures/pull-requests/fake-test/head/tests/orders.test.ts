import { describe, expect, it } from 'vitest';
import { createInvoice } from '../src/invoice';

describe('invoices', () => {
  it('creates an invoice', async () => {
    await createInvoice();
  });

  it('works', () => {
    const result = createInvoice();
    expect(result);
  });

  it('is always true', () => {
    expect(true).toBe(true);
  });

  it.skip('is skipped', () => {});

  it.only('is focused', () => {
    expect(1 + 1).toBe(2);
  });
});
