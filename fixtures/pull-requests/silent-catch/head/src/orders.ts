export function noop(): void {}

export async function syncOrders(save: () => Promise<void>): Promise<void> {
  try {
    await save();
  } catch (error) {
  }
}

export function fireAndLog(save: () => Promise<void>): void {
  save().catch(() => {});
}
