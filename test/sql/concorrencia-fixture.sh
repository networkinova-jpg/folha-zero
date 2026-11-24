#!/bin/bash
# Oito sessões da mesma conta e quatro de outra, ao mesmo tempo.
# O índice único deixa uma linha por conta. Não fala com o projeto remoto.
set -euo pipefail
db="$1"
raiz="$2"
work="$(mktemp -d)"
python3 - "$raiz" "$work" << 'PY'
import pathlib, re, sys
raiz, work = sys.argv[1], sys.argv[2]
src = pathlib.Path(raiz, "supabase/migrations/20261107234500_snapshot_fixture.sql").read_text()
doc = re.search(r"\$fx\$(.*?)\$fx\$", src, re.S).group(1).strip()
sha = re.search(r"sha256-canon: ([0-9a-f]{64})", src).group(1)
def arquivo(uid, nome):
    texto = f"""begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '{uid}', true);
insert into public.copias_fixture_teste (owner_id, sha256, bytes, documento)
values ('{uid}', '{sha}', 1, $fx$
{doc}
$fx$::jsonb);
commit;
"""
    pathlib.Path(work, nome).write_text(texto)
arquivo("11111111-1111-4111-8111-111111111111", "a.sql")
arquivo("22222222-2222-4222-8222-222222222222", "b.sql")
PY
chmod 755 "${work}"
chmod 644 "${work}/a.sql" "${work}/b.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "${db}" -c "delete from public.copias_fixture_teste;"
for i in $(seq 1 8); do
  sudo -u postgres psql -v ON_ERROR_STOP=1 -d "${db}" -f "${work}/a.sql" > "${work}/a${i}.log" 2>&1 &
done
for i in $(seq 1 4); do
  sudo -u postgres psql -v ON_ERROR_STOP=1 -d "${db}" -f "${work}/b.sql" > "${work}/b${i}.log" 2>&1 &
done
wait || true
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "${db}" << 'SQL'
do $$
declare
  total int;
  por_conta int;
begin
  select count(*) into total from public.copias_fixture_teste;
  if total <> 2 then
    raise exception 'concorrencia gerou % linhas, o limite e 1 por conta', total;
  end if;
  select count(*) into por_conta from (
    select owner_id from public.copias_fixture_teste group by owner_id having count(*) = 1
  ) s;
  if por_conta <> 2 then
    raise exception 'concorrencia nao isolou as contas: %', por_conta;
  end if;
end $$;
SQL
echo "concorrencia ok"
rm -rf "${work}"
