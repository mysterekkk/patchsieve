export async function syncOrders(save: () => Promise<void>): Promise<void> {
  try {
    await save();
  } catch (error) {
    console.error('sync failed', error);
    throw error;
  }
}

export function calculateTotal(items: number[]): number {
  return items.reduce((sum, n) => sum + n, 0);
}
