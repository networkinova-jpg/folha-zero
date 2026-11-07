#!/bin/bash
# Postgres local descartável. Não fala com o projeto Supabase.
set -euo pipefail
raiz="$(cd "$(dirname "$0")/../.." && pwd)"
db="folha_zero_sql_$$"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "drop database if exists ${db}"
sudo -u postgres createdb "${db}"
cleanup() { sudo -u postgres psql -c "drop database if exists ${db}" >/dev/null; }
trap cleanup EXIT
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "${db}" -f "${raiz}/test/sql/00_auth.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "${db}" -f "${raiz}/supabase/migrations/20261107210000_base_segura.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "${db}" -f "${raiz}/supabase/migrations/002_proprietario.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "${db}" -f "${raiz}/supabase/migrations/20261107210000_base_segura.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "${db}" -f "${raiz}/test/sql/adversario.sql"
echo "sql ok ${db}"
