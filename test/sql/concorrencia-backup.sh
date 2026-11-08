#!/bin/bash
# Inserções simultâneas do backup variável. Uma linha por conta. Sem DELETE.
set -euo pipefail
db="$1"
raiz="$2"
work="$(mktemp -d)"
python3 - "$raiz" "$work" << 'PY'
import pathlib, re, sys
raiz, work = sys.argv[1], sys.argv[2]
src = pathlib.Path(raiz, "test/sql/backups-teste.sql").read_text()
doc = re.search(r"\$fx\$(.*?)\$fx\$", src, re.S).group(1).strip()
def arquivo(uid, nome):
    pathlib.Path(work, nome).write_text(f"""begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '{uid}', true);
insert into public.backups_teste_app (owner_id, revisao, bytes, documento)
values ('{uid}', 4, 1, $fx$
{doc}
$fx$::jsonb);
commit;
""")
arquivo("11111111-1111-4111-8111-111111111111", "a.sql")
arquivo("22222222-2222-4222-8222-222222222222", "b.sql")
PY
chmod 755 "${work}"
chmod 644 "${work}/a.sql" "${work}/b.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "${db}" -c "delete from public.backups_teste_app;"
for i in $(seq 1 8); do
  sudo -u postgres psql -v ON_ERROR_STOP=1 -d "${db}" -f "${work}/a.sql" > "${work}/a${i}.log" 2>&1 &
done
for i in $(seq 1 4); do
  sudo -u postgres psql -v ON_ERROR_STOP=1 -d "${db}" -f "${work}/b.sql" > "${work}/b${i}.log" 2>&1 &
done
wait || true
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "${db}" << 'SQL'
do $$
declare total int; contas int;
begin
  select count(*) into total from public.backups_teste_app;
  if total <> 2 then
    raise exception 'concorrencia do backup gerou % linhas', total;
  end if;
  select count(*) into contas from (
    select owner_id from public.backups_teste_app group by owner_id having count(*) = 1
  ) s;
  if contas <> 2 then
    raise exception 'concorrencia nao isolou as contas: %', contas;
  end if;
end $$;
SQL
echo "concorrencia backup ok"
rm -rf "${work}"
