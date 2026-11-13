/** Tiny line-oriented Prisma schema reader: models, scalar columns, @map / @@map. Not a full grammar. */
export interface PrismaModel {
  name: string;
  table: string;
  line: number;
  /** column name -> declaring line */
  columns: Map<string, number>;
  /** field name + type signature, used to detect schema edits */
  signatures: Map<string, string>;
}

export function parsePrisma(text: string): PrismaModel[] {
  const lines = text.split(/\r\n|\r|\n/);
  const names = new Set<string>();
  for (const l of lines) {
    const m = /^\s*(?:model|enum|type|view)\s+(\w+)\s*\{/.exec(l);
    if (m) names.add(m[1]!);
  }
  const enums = new Set<string>();
  for (const l of lines) {
    const m = /^\s*enum\s+(\w+)\s*\{/.exec(l);
    if (m) enums.add(m[1]!);
  }
  const models: PrismaModel[] = [];
  let cur: PrismaModel | null = null;
  lines.forEach((raw, idx) => {
    const l = raw.replace(/\/\/.*$/, '').trim();
    if (!cur) {
      const m = /^model\s+(\w+)\s*\{/.exec(l);
      if (m) cur = { name: m[1]!, table: m[1]!, line: idx + 1, columns: new Map(), signatures: new Map() };
      return;
    }
    if (l.startsWith('}')) { models.push(cur); cur = null; return; }
    if (!l) return;
    const map = /^@@map\(\s*(?:name:\s*)?"([^"]+)"/.exec(l);
    if (map) { cur.table = map[1]!; return; }
    if (l.startsWith('@@')) return;
    const f = /^(\w+)\s+(\w+)(\[\])?(\?)?(.*)$/.exec(l);
    if (!f) return;
    const [, fname, ftype, list, , attrs] = f as unknown as [string, string, string, string | undefined, string | undefined, string];
    cur.signatures.set(fname, l.replace(/\s+/g, ' '));
    const isRelation = Boolean(list) || (names.has(ftype) && !enums.has(ftype));
    if (isRelation) return;
    const colMap = /@map\(\s*(?:name:\s*)?"([^"]+)"/.exec(attrs ?? '');
    cur.columns.set(colMap ? colMap[1]! : fname, idx + 1);
  });
  return models;
}
