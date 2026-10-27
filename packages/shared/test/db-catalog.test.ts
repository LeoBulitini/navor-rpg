import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadContent } from '../src/index.ts';
import { readRawContent, CONTENT_DIR } from '../node/fs-content.ts';
import { CONTENT_SYNC_SUFFIX, contentSql } from '../node/content-sql.ts';

// O banco guarda uma cópia do catálogo de classes (para validar create_character no servidor).
// Este teste impede que content/classes.json e as migrations fiquem diferentes.
const MIGRATIONS = join(CONTENT_DIR, '..', 'supabase', 'migrations');

function classRowsFromMigrations(): { id: string; name: string; path: string; level: number }[] {
  const sql = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS, f), 'utf8'))
    .join('\n');
  const block = sql.match(/insert into public\.classes[^;]+;/i)?.[0] ?? '';
  return [...block.matchAll(/\('([^']+)',\s*'([^']+)',\s*'([^']+)',\s*(\d+),\s*(true|false)\)/g)].map((m) => ({
    id: m[1]!,
    name: m[2]!,
    path: m[3]!,
    level: Number(m[4]),
  }));
}

describe('catálogo de classes no banco', () => {
  it('é igual a content/classes.json', () => {
    const content = loadContent(readRawContent());
    const fromContent = content.classes.paths
      .flatMap((p) => p.stages.map((s) => ({ id: s.classId, name: s.name, path: p.id, level: s.level })))
      .sort((a, b) => a.id.localeCompare(b.id));
    const fromDb = classRowsFromMigrations().sort((a, b) => a.id.localeCompare(b.id));
    expect(fromDb).toEqual(fromContent);
  });
});

// Itens e regras de coleta: o servidor sorteia a partir da cópia no banco (migration *_content_sync.sql).
describe('itens e regras de coleta no banco', () => {
  it('a última migration de content_sync é igual ao content/ atual (senão rode npm run db:content)', () => {
    const syncs = readdirSync(MIGRATIONS).filter((f) => f.endsWith(CONTENT_SYNC_SUFFIX)).sort();
    expect(syncs.length).toBeGreaterThan(0);
    const latest = readFileSync(join(MIGRATIONS, syncs[syncs.length - 1]!), 'utf8');
    expect(latest).toBe(contentSql(loadContent(readRawContent())));
  });

  it('roda depois da migration que cria as tabelas', () => {
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
    const schema = files.findIndex((f) => /create table public\.items/i.test(readFileSync(join(MIGRATIONS, f), 'utf8')));
    const firstSync = files.findIndex((f) => f.endsWith(CONTENT_SYNC_SUFFIX));
    expect(schema).toBeGreaterThanOrEqual(0);
    expect(firstSync).toBeGreaterThan(schema);
  });
});
