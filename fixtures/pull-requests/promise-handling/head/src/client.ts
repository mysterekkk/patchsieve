export const base = 1;

async function audit(): Promise<void> {}

export async function sync(): Promise<unknown> {
  await fetch('https://example.com/ping', { method: 'POST' });
  audit();
  const res = await fetch('https://example.com/data');
  return res.json();
}
