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
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "${db}" -f "${raiz}/supabase/migrations/20261107223000_snapshot_privado.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "${db}" -f "${raiz}/test/sql/snapshot.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "${db}" -f "${raiz}/supabase/migrations/20261107234500_snapshot_fixture.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "${db}" -f "${raiz}/supabase/migrations/20261107234500_snapshot_fixture.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "${db}" -f "${raiz}/test/sql/snapshot-fixture.sql"
bash "${raiz}/test/sql/concorrencia-fixture.sh" "${db}" "${raiz}"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "${db}" -f "${raiz}/supabase/migrations/20261108010000_backups_teste_app.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "${db}" -f "${raiz}/supabase/migrations/20261108010000_backups_teste_app.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "${db}" -f "${raiz}/test/sql/backups-teste.sql"
bash "${raiz}/test/sql/concorrencia-backup.sh" "${db}" "${raiz}"
echo "sql ok ${db}"
