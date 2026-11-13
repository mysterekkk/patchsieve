export interface Range {
  base?: string;
  head: string;
}

const ZERO = /^0+$/;

/** Work out base/head from the (untrusted) event payload; values are validated as SHAs before use. */
export function resolveRange(eventName: string, payload: Record<string, any> | undefined): Range | undefined {
  const sha = (v: unknown): string | undefined => (typeof v === 'string' && /^[0-9a-f]{40}$/i.test(v) && !ZERO.test(v) ? v : undefined);
  if (eventName.startsWith('pull_request')) {
    const base = sha(payload?.pull_request?.base?.sha);
    const head = sha(payload?.pull_request?.head?.sha);
    if (base && head) return { base, head: 'HEAD' };
  }
  if (eventName === 'push') {
    const before = sha(payload?.before);
    if (before) return { base: before, head: 'HEAD' };
  }
  return undefined;
}
