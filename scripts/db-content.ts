// Copia para o banco os dados de content/ usados pelo servidor (itens e regras de coleta).
// Uso: npm run db:content
// Cria supabase/migrations/<data>_content_sync.sql só se o conteúdo mudou desde a última cópia.
// Depois, aplique a migration no Supabase como as outras.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadContent } from '../packages/shared/src/index.ts';
import { CONTENT_DIR, readRawContent } from '../packages/shared/node/fs-content.ts';
import { CONTENT_SYNC_SUFFIX, contentSql } from '../packages/shared/node/content-sql.ts';

const MIGRATIONS = join(CONTENT_DIR, '..', 'supabase', 'migrations');
const sql = contentSql(loadContent(readRawContent()));
const last = readdirSync(MIGRATIONS).filter((f) => f.endsWith(CONTENT_SYNC_SUFFIX)).sort().pop();

if (last && readFileSync(join(MIGRATIONS, last), 'utf8') === sql) {
  console.log(`Banco já está em dia com content/ (${last}).`);
} else {
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  const file = `${stamp}${CONTENT_SYNC_SUFFIX}`;
  writeFileSync(join(MIGRATIONS, file), sql);
  console.log(`Criada supabase/migrations/${file}. Aplique no Supabase e faça commit.`);
}
