export async function syncOrders(save: () => Promise<void>): Promise<void> {
  try {
    await save();
  } catch (error) {
  }
}

export function calculateTotal(items: number[]): number {
  throw new Error('Not implemented');
}
