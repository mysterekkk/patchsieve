import type { RawFinding, Rule, RuleContext } from '../../core/types.ts';
import { parsePrisma } from '../../parsers/prisma.ts';
import { alterActions, name, readQualifiedName, tokenize } from '../../parsers/sql.ts';

function dirname(p: string): string {
  const i = p.lastIndexOf('/');
  return i < 0 ? '' : p.slice(0, i);
}

/** `<root>/migrations/<name>/migration.sql` next to `<root>/schema.prisma` (Prisma Migrate layout). */
function prismaSchemaFor(ctx: RuleContext): { text: string; path: string } | undefined {
  const m = /^(.*?)\/?migrations\/[^/]+\/migration\.sql$/.exec(ctx.file.path);
  if (!m) return undefined;
  const root = m[1] ?? '';
  const path = root ? `${root}/schema.prisma` : 'schema.prisma';
  const text = ctx.readFile(path);
  return text === undefined ? undefined : { text, path };
}

export const migrationRules: Rule[] = [
  {
    id: 'PS601',
    name: 'Schema/migration mismatch',
    category: 'migrations',
    defaultSeverity: 'warning',
    languages: ['sql'],
    description: 'A Prisma migration adds or drops a column that the sibling schema.prisma does not reflect.',
    check(ctx) {
      const schema = prismaSchemaFor(ctx);
      if (!schema) return [];
      const models = parsePrisma(schema.text);
      const byTable = new Map(models.map((m) => [m.table.toLowerCase(), m]));
      const out: RawFinding[] = [];
      for (const st of tokenize(ctx.file.text)) {
        for (const a of alterActions(st)) {
          const model = byTable.get(a.table.toLowerCase());
          if (!model || !a.column) continue;
          const has = [...model.columns.keys()].some((c) => c.toLowerCase() === a.column!.toLowerCase());
          if (a.kind === 'add-column' && !has) {
            out.push({ line: a.line, column: 1, message: `Migration adds column \`${a.table}.${a.column}\` but \`${schema.path}\` has no matching field.`, reason: `model ${model.name} (table ${model.table}) does not declare column ${a.column}`, anchor: `add:${a.table}.${a.column}`, confidence: 'medium' });
          } else if (a.kind === 'drop-column' && has) {
            out.push({ line: a.line, column: 1, message: `Migration drops column \`${a.table}.${a.column}\` but \`${schema.path}\` still declares it.`, reason: `model ${model.name} still has a field mapped to ${a.column}`, anchor: `drop:${a.table}.${a.column}`, confidence: 'medium' });
          }
        }
      }
      return out;
    },
  },
  {
    id: 'PS602',
    name: 'Destructive migration',
    category: 'migrations',
    defaultSeverity: 'warning',
    languages: ['sql'],
    description: 'DROP TABLE / DROP COLUMN / DROP SCHEMA / TRUNCATE / column type change in a SQL migration. Not always wrong, but always worth human review.',
    check(ctx) {
      const out: RawFinding[] = [];
      for (const st of tokenize(ctx.file.text)) {
        const t = st.tokens;
        const first = t[0]?.up;
        if (first === 'DROP' && (t[1]?.up === 'TABLE' || t[1]?.up === 'SCHEMA')) {
          out.push({ line: st.line, column: 1, message: `\`DROP ${t[1].up}\` permanently deletes data.`, reason: 'DROP statement in a migration', anchor: `drop-${t[1].up}:${t.slice(2).map((x) => x.text).join(' ')}`, confidence: 'high' });
        } else if (first === 'TRUNCATE') {
          out.push({ line: st.line, column: 1, message: '`TRUNCATE` deletes all rows.', reason: 'TRUNCATE statement in a migration', anchor: `truncate:${t.slice(1).map((x) => x.text).join(' ')}`, confidence: 'high' });
        } else if (first === 'ALTER') {
          for (const a of alterActions(st)) {
            if (a.kind === 'drop-column') out.push({ line: a.line, column: 1, message: `Dropping column \`${a.table}.${a.column}\` permanently deletes its data.`, reason: 'ALTER TABLE ... DROP COLUMN', anchor: `dropcol:${a.table}.${a.column}`, confidence: 'high' });
            else if (a.kind === 'alter-type') out.push({ line: a.line, column: 1, message: `Changing the type of \`${a.table}.${a.column}\` can lose or reject data and rewrites the table.`, reason: 'ALTER COLUMN ... TYPE', anchor: `type:${a.table}.${a.column}`, confidence: 'low' });
          }
        }
      }
      return out;
    },
  },
  {
    id: 'PS603',
    name: 'Non-null field without data strategy',
    category: 'migrations',
    defaultSeverity: 'error',
    languages: ['sql'],
    description: 'ADD COLUMN ... NOT NULL without DEFAULT on an existing table fails on non-empty tables; SET NOT NULL without a prior backfill fails on NULL rows.',
    check(ctx) {
      const out: RawFinding[] = [];
      const statements = tokenize(ctx.file.text);
      const created = new Set<string>();
      const updated = new Set<string>();
      for (const st of statements) {
        const t = st.tokens;
        if (t[0]?.up === 'CREATE' && t[1]?.up === 'TABLE') {
          let i = 2;
          if (t[i]?.up === 'IF' && t[i + 1]?.up === 'NOT' && t[i + 2]?.up === 'EXISTS') i += 3;
          created.add(readQualifiedName(t, i).table.toLowerCase());
        }
      }
      for (const st of statements) {
        const t = st.tokens;
        if (t[0]?.up === 'UPDATE') updated.add(readQualifiedName(t, t[1]?.up === 'ONLY' ? 2 : 1).table.toLowerCase());
        for (const a of alterActions(st)) {
          if (created.has(a.table.toLowerCase())) continue;
          if (a.kind === 'add-column' && a.notNull && !a.hasDefault && !a.generated) {
            out.push({ line: a.line, column: 1, message: `Column \`${a.table}.${a.column}\` is added as NOT NULL with no DEFAULT.`, reason: 'PostgreSQL rejects this on any table that already has rows', anchor: `addnn:${a.table}.${a.column}`, confidence: 'high' });
          } else if (a.kind === 'set-not-null' && !updated.has(a.table.toLowerCase())) {
            out.push({ line: a.line, column: 1, message: `\`${a.table}.${a.column}\` is set NOT NULL with no preceding UPDATE backfill in this migration.`, reason: 'existing NULL rows would make the statement fail', anchor: `setnn:${a.table}.${a.column}`, confidence: 'medium', severity: 'warning' });
          }
        }
      }
      void name;
      return out;
    },
  },
  {
    id: 'PS604',
    name: 'Missing schema update',
    category: 'migrations',
    defaultSeverity: 'warning',
    languages: ['prisma'],
    fileNames: ['schema.prisma'],
    description: 'schema.prisma gained, lost or changed a model/field in this PR, but no new migration.sql was added next to it.',
    check(ctx) {
      if (!ctx.changedPaths) return [];
      const baseText = ctx.readBaseFile(ctx.file.path);
      if (baseText === undefined) return [];
      const base = new Map(parsePrisma(baseText).map((m) => [m.name, m]));
      const head = parsePrisma(ctx.file.text);
      const root = dirname(ctx.file.path);
      const prefix = root ? `${root}/migrations/` : 'migrations/';
      for (const p of ctx.changedPaths) if (p.startsWith(prefix) && p.endsWith('.sql')) return [];
      const out: RawFinding[] = [];
      for (const m of head) {
        const b = base.get(m.name);
        if (!b) {
          out.push({ line: m.line, column: 1, message: `New model \`${m.name}\` has no accompanying migration.`, reason: `no changed .sql file under ${prefix}`, anchor: `model:${m.name}`, confidence: 'medium' });
          continue;
        }
        for (const [f, sig] of m.signatures) {
          if (b.signatures.get(f) !== sig) {
            const line = [...m.columns.entries()].find(([c]) => c === f)?.[1] ?? m.line;
            out.push({ line, column: 1, message: `Field \`${m.name}.${f}\` changed in schema.prisma with no accompanying migration.`, reason: `no changed .sql file under ${prefix}`, anchor: `field:${m.name}.${f}`, confidence: 'medium' });
          }
        }
        for (const f of b.signatures.keys()) {
          if (!m.signatures.has(f)) out.push({ line: m.line, column: 1, message: `Field \`${m.name}.${f}\` was removed from schema.prisma with no accompanying migration.`, reason: `no changed .sql file under ${prefix}`, anchor: `removed:${m.name}.${f}`, confidence: 'medium' });
        }
      }
      return out;
    },
  },
];
