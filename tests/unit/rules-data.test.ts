import { describe, expect, it } from 'vitest';
import { lines, run } from '../helpers.ts';

const manifest = (deps: Record<string, string>): string => JSON.stringify({ name: 'app', dependencies: deps }, null, 2) + '\n';
const npmLock = (importer: Record<string, string>): string => JSON.stringify({ lockfileVersion: 3, packages: { '': { dependencies: importer } } });

describe('PS101/PS102 npm', () => {
  const base = { 'package.json': manifest({ a: '^1.0.0' }) };
  it('flags a new dependency missing from package-lock.json', () => {
    const head = manifest({ a: '^1.0.0', b: '^2.0.0' });
    const f = run('PS101', 'package.json', head, { baseFiles: base, files: { 'package-lock.json': npmLock({ a: '^1.0.0' }) } });
    expect(lines(f)).toEqual([5]);
  });
  it('does not flag deps that are present or unchanged', () => {
    const head = manifest({ a: '^1.0.0', b: '^2.0.0' });
    expect(run('PS101', 'package.json', head, { baseFiles: base, files: { 'package-lock.json': npmLock({ a: '^1.0.0', b: '^2.0.0' }) } })).toEqual([]);
  });
  it('stays silent when there is no lockfile at all', () => {
    expect(run('PS101', 'package.json', manifest({ b: '1' }), { baseFiles: base })).toEqual([]);
  });
  it('flags a changed range that the lockfile does not reflect (PS102)', () => {
    const head = manifest({ a: '^2.0.0' });
    const f = run('PS102', 'package.json', head, { baseFiles: base, files: { 'package-lock.json': npmLock({ a: '^1.0.0' }) } });
    expect(lines(f)).toEqual([4]);
  });
  it('resolves the lockfile from the monorepo root and the right importer', () => {
    const lock = JSON.stringify({ lockfileVersion: 3, packages: { '': {}, 'packages/web': { dependencies: { a: '^1.0.0' } } } });
    const head = manifest({ a: '^1.0.0', zed: '^1.0.0' });
    const f = run('PS101', 'packages/web/package.json', head, { baseFiles: { 'packages/web/package.json': manifest({ a: '^1.0.0' }) }, files: { 'package-lock.json': lock } });
    expect(f).toHaveLength(1);
    expect(f[0]!.message).toContain('zed');
  });
  it('skips workspace: and non-registry specifiers for PS101', () => {
    const head = manifest({ a: '^1.0.0', local: 'workspace:*' });
    expect(run('PS101', 'package.json', head, { baseFiles: base, files: { 'package-lock.json': npmLock({ a: '^1.0.0' }) } })).toEqual([]);
  });
  it('throws on invalid JSON (reported by the engine as a skipped file)', () => {
    expect(() => run('PS101', 'package.json', '{ nope', {})).toThrow();
  });
});

describe('PS101/PS102 pnpm and yarn', () => {
  const base = { 'package.json': manifest({ a: '^1.0.0' }) };
  it('pnpm importers: missing and mismatched specifier', () => {
    const lock = "lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n      a:\n        specifier: ^1.0.0\n        version: 1.2.3\n";
    expect(lines(run('PS101', 'package.json', manifest({ a: '^1.0.0', b: '^1.0.0' }), { baseFiles: base, files: { 'pnpm-lock.yaml': lock } }))).toEqual([5]);
    expect(lines(run('PS102', 'package.json', manifest({ a: '^1.1.0' }), { baseFiles: base, files: { 'pnpm-lock.yaml': lock } }))).toEqual([4]);
  });
  it('yarn classic: missing and mismatched', () => {
    const lock = '# yarn lockfile v1\n\n\na@^1.0.0:\n  version "1.2.3"\n';
    expect(lines(run('PS101', 'package.json', manifest({ a: '^1.0.0', b: '^1.0.0' }), { baseFiles: base, files: { 'yarn.lock': lock } }))).toEqual([5]);
    expect(lines(run('PS102', 'package.json', manifest({ a: '^1.5.0' }), { baseFiles: base, files: { 'yarn.lock': lock } }))).toEqual([4]);
  });
  it('yarn berry npm: protocol headers are understood', () => {
    const lock = '"a@npm:^1.0.0":\n  version: 1.2.3\n';
    expect(run('PS101', 'package.json', manifest({ a: '^1.0.0' }), { files: { 'yarn.lock': lock } })).toEqual([]);
  });
});

describe('PS103 suspicious references', () => {
  it('flags unpinned, insecure, floating git and orphan workspace refs', () => {
    const head = manifest({ a: '*', b: 'latest', c: 'http://x.example/c.tgz', d: 'github:someone/repo', e: 'workspace:*', f: 'file:/abs/path' });
    expect(lines(run('PS103', 'package.json', head, {}))).toEqual([4, 5, 6, 7, 8, 9]);
  });
  it('accepts pinned git, aliases, ranges and valid workspace usage', () => {
    const ok = manifest({ a: '^1.2.3', b: 'npm:left-pad@^1.0.0', c: 'github:someone/repo#0123456789abcdef0123456789abcdef01234567', d: 'file:../shared', e: 'workspace:*' });
    expect(run('PS103', 'package.json', ok, { files: { 'pnpm-workspace.yaml': 'packages:\n  - "*"\n' } })).toEqual([]);
  });
  it('flags only changed dependencies when a base exists', () => {
    const f = run('PS103', 'package.json', manifest({ a: '*', b: '*' }), { baseFiles: { 'package.json': manifest({ a: '*' }) } });
    expect(lines(f)).toEqual([5]);
  });
});

const sql = (s: string): string => s;

describe('PS602 destructive migration', () => {
  it('flags DROP TABLE, TRUNCATE, DROP COLUMN, type change', () => {
    const f = run('PS602', 'migrations/002.sql', sql('DROP TABLE a;\nTRUNCATE b;\nALTER TABLE c DROP COLUMN d;\nALTER TABLE c ALTER COLUMN e TYPE integer;\n'));
    expect(lines(f)).toEqual([1, 2, 3, 4]);
  });
  it('ignores statements inside comments and strings', () => {
    expect(run('PS602', 'migrations/002.sql', sql("-- DROP TABLE a;\n/* DROP TABLE b; */\nINSERT INTO t VALUES ('DROP TABLE x');\nCREATE TABLE ok (id int);\n"))).toEqual([]);
  });
  it('ignores dollar-quoted bodies and additive changes', () => {
    expect(run('PS602', 'migrations/002.sql', sql("CREATE FUNCTION f() RETURNS void AS $$ DROP TABLE x; $$ LANGUAGE sql;\nALTER TABLE t ADD COLUMN c text;\nALTER TABLE t DROP CONSTRAINT k;\n"))).toEqual([]);
  });
});

describe('PS603 non-null without strategy', () => {
  it('flags ADD COLUMN NOT NULL without default on an existing table', () => {
    expect(lines(run('PS603', 'migrations/002.sql', sql('ALTER TABLE users ADD COLUMN plan text NOT NULL;')))).toEqual([1]);
  });
  it('accepts DEFAULT, serial, brand-new tables and nullable columns', () => {
    const s = sql("ALTER TABLE users ADD COLUMN a text NOT NULL DEFAULT 'x';\nALTER TABLE users ADD COLUMN b serial NOT NULL;\nALTER TABLE users ADD COLUMN c text;\nCREATE TABLE fresh (id int);\nALTER TABLE fresh ADD COLUMN d text NOT NULL;\n");
    expect(run('PS603', 'migrations/002.sql', s)).toEqual([]);
  });
  it('SET NOT NULL needs a prior backfill in the same migration', () => {
    expect(lines(run('PS603', 'migrations/002.sql', sql('ALTER TABLE users ALTER COLUMN a SET NOT NULL;')))).toEqual([1]);
    expect(run('PS603', 'migrations/002.sql', sql("UPDATE users SET a = 'x' WHERE a IS NULL;\nALTER TABLE users ALTER COLUMN a SET NOT NULL;"))).toEqual([]);
  });
});

describe('Prisma PS601/PS604', () => {
  const schema = 'model User {\n  id Int @id\n  email String\n  name String @map("full_name")\n  posts Post[]\n  @@map("users")\n}\nmodel Post {\n  id Int @id\n  author User @relation(fields: [authorId], references: [id])\n  authorId Int\n}\n';
  const mig = 'prisma/migrations/20240101_x/migration.sql';
  it('PS601: migration adds a column the schema lacks, and drops one it still has', () => {
    const f = run('PS601', mig, 'ALTER TABLE "users" ADD COLUMN "age" integer;\nALTER TABLE "users" DROP COLUMN "email";\n', { files: { 'prisma/schema.prisma': schema } });
    expect(lines(f)).toEqual([1, 2]);
  });
  it('PS601: honours @map and relation fields', () => {
    expect(run('PS601', mig, 'ALTER TABLE "users" ADD COLUMN "full_name" text;\nALTER TABLE "Post" ADD COLUMN "authorId" integer;\n', { files: { 'prisma/schema.prisma': schema } })).toEqual([]);
  });
  it('PS601: silent when there is no schema.prisma', () => {
    expect(run('PS601', mig, 'ALTER TABLE t ADD COLUMN c int;', {})).toEqual([]);
  });
  it('PS604: schema change without a migration', () => {
    const head = schema.replace('email String', 'email String\n  age Int');
    const f = run('PS604', 'prisma/schema.prisma', head, { baseFiles: { 'prisma/schema.prisma': schema }, changedPaths: ['prisma/schema.prisma'] });
    expect(f).toHaveLength(1);
    expect(f[0]!.message).toContain('User.age');
  });
  it('PS604: satisfied when a migration is part of the change', () => {
    const head = schema.replace('email String', 'email String\n  age Int');
    expect(run('PS604', 'prisma/schema.prisma', head, { baseFiles: { 'prisma/schema.prisma': schema }, changedPaths: ['prisma/schema.prisma', mig] })).toEqual([]);
  });
});
