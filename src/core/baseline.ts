import { z } from 'zod';

const schema = z.object({ version: z.literal(1), fingerprints: z.array(z.string().regex(/^[0-9a-f]{16}$/)).max(200000) }).strict();

export function parseBaseline(text: string): Set<string> {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch (e) { throw new Error(`baseline: invalid JSON: ${(e as Error).message}`, { cause: e }); }
  const r = schema.safeParse(raw);
  if (!r.success) throw new Error(`baseline: ${r.error.issues.map((i) => i.message).join('; ')}`);
  return new Set(r.data.fingerprints);
}

export function serializeBaseline(fingerprints: string[]): string {
  return JSON.stringify({ version: 1, fingerprints: [...new Set(fingerprints)].sort() }, null, 2) + '\n';
}
