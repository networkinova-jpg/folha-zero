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
def arquivo(uid, nome, esperado, obs):
    corpo = doc.replace("Observação editada com aço", obs)
    pathlib.Path(work, nome).write_text(f"""begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '{uid}', true);
select public.backup_teste_gravar({esperado}, $fx$
{corpo}
$fx$::jsonb);
commit;
""")
arquivo("11111111-1111-4111-8111-111111111111", "base.sql", "null", "Observação editada com aço")
arquivo("11111111-1111-4111-8111-111111111111", "a.sql", "1", "versao A da corrida")
arquivo("11111111-1111-4111-8111-111111111111", "b.sql", "1", "versao B da corrida")
PY
chmod 755 "${work}"
chmod 644 "${work}/base.sql" "${work}/a.sql" "${work}/b.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "${db}" -c "delete from public.backups_teste_app;"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "${db}" -f "${work}/base.sql"
for i in $(seq 1 4); do
  sudo -u postgres psql -v ON_ERROR_STOP=1 -d "${db}" -f "${work}/a.sql" > "${work}/a${i}.log" 2>&1 &
  sudo -u postgres psql -v ON_ERROR_STOP=1 -d "${db}" -f "${work}/b.sql" > "${work}/b${i}.log" 2>&1 &
done
wait || true
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "${db}" << 'SQL'
do $$
declare total int; rev int; obs text;
begin
  select count(*), max(revisao) into total, rev from public.backups_teste_app;
  if total is distinct from 1 or rev is distinct from 2 then
    raise exception 'cas concorrente ficou com % linhas e revisao %', total, rev;
  end if;
  select documento->'entries'->1->>'obs' into obs from public.backups_teste_app;
  if obs is distinct from 'versao A da corrida' and obs is distinct from 'versao B da corrida' then
    raise exception 'cas concorrente perdeu o documento: %', obs;
  end if;
end $$;
SQL
echo "concorrencia backup ok"
rm -rf "${work}"
