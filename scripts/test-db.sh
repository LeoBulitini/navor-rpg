#!/usr/bin/env bash
# Roda os testes de banco (pgTAP) num Postgres local temporário, SEM Docker.
# Usa o stub de supabase/tests/stub/ no lugar do Supabase de verdade.
# Requisitos: Postgres 16+ (initdb/pg_ctl/psql no PATH ou em /usr/lib/postgresql/*/bin) e a extensão pgTAP.
# Com Docker disponível, prefira: npx supabase start && npx supabase test db
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="$(dirname "$(command -v initdb 2>/dev/null || ls -d /usr/lib/postgresql/*/bin/initdb | tail -1)")"
PORT="${TEST_DB_PORT:-54329}"
DATA="$(mktemp -d)"
LOG="$DATA/postgres.log"
RUN_AS=()
if [ "$(id -u)" = "0" ]; then
  # O Postgres não roda como root; usa o usuário "postgres" se existir.
  chown -R postgres "$DATA"
  RUN_AS=(sudo -u postgres)
fi

cleanup() { "${RUN_AS[@]}" "$PGBIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA"; }
trap cleanup EXIT

"${RUN_AS[@]}" "$PGBIN/initdb" -D "$DATA" -U postgres --auth=trust >/dev/null
"${RUN_AS[@]}" "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k $DATA -c listen_addresses=''" -l "$LOG" -w start >/dev/null

PSQL=("$PGBIN/psql" -h "$DATA" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)
"${PSQL[@]}" -f "$ROOT/supabase/tests/stub/supabase-auth-stub.sql" >/dev/null
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "migration: $(basename "$f")"
  "${PSQL[@]}" -f "$f" >/dev/null
done

FAILED=0
for t in "$ROOT"/supabase/tests/database/*.test.sql; do
  echo "== $(basename "$t")"
  OUT="$("${PSQL[@]}" -t -A -f "$t" 2>&1)" || FAILED=1
  echo "$OUT" | grep -E '^(ok|not ok|#|1\.\.)' || true
  if echo "$OUT" | grep -qE '^not ok|Looks like|ERROR'; then
    FAILED=1
    echo "$OUT" | grep -E 'ERROR' || true
  fi
done

if [ "$FAILED" = "0" ]; then echo "Testes de banco: todos passaram."; else echo "Testes de banco: FALHARAM."; exit 1; fi
