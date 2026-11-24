#!/bin/bash
# Duas gravações da mesma revisão na cópia real. Uma vence. A outra não apaga.
set -euo pipefail
db="$1"
work="$(mktemp -d)"
chmod 755 "${work}"
cat > "${work}/base.sql" << 'SQL'
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select public.copia_conta_gravar(null, '{"version":2,"entries":[{"id":"a","obs":"base"}]}'::jsonb);
commit;
SQL
cat > "${work}/a.sql" << 'SQL'
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select public.copia_conta_gravar(1, '{"version":2,"entries":[{"id":"a","obs":"versao A"}]}'::jsonb);
commit;
SQL
cat > "${work}/b.sql" << 'SQL'
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select public.copia_conta_gravar(1, '{"version":2,"entries":[{"id":"a","obs":"versao B"}]}'::jsonb);
commit;
SQL
chmod 644 "${work}/base.sql" "${work}/a.sql" "${work}/b.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "${db}" -c "delete from public.copias_conta;"
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
  select count(*), max(revisao), max(documento -> 'entries' -> 0 ->> 'obs')
    into total, rev, obs
  from public.copias_conta;
  if total is distinct from 1 or rev is distinct from 2 then
    raise exception 'corrida real total % revisao %', total, rev;
  end if;
  if obs is distinct from 'versao A' and obs is distinct from 'versao B' then
    raise exception 'corrida real misturou %', obs;
  end if;
end $$;
SQL
echo "concorrencia conta ok"
