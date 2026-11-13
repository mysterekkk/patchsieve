export const ready = true;

export async function load(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function warm(cache: Map<string, string>, key: string): Promise<void> {
  try {
    cache.set(key, await Promise.resolve('v'));
  } catch {
    // best effort: the cache is optional
  }
}

export function track(send: () => Promise<void>): void {
  void send();
  send().catch((e) => console.error('track failed', e));
}
