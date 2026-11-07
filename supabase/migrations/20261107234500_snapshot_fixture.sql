-- Incremental. Não aplicar no projeto remoto nesta etapa.
-- A tabela public.snapshots_privados já existe (20261107223000). Não recriar a base.
-- Esta etapa só aceita documento fictício, com teto de teste.
-- O teto não é a política de retenção do aplicativo: produção já entregue continua pendente.
-- Free: o banco entra em modo somente leitura acima de 500 MB e não tem PITR.
-- O schema private continua fora da Data API. A função abaixo fica nele e sem EXECUTE para o cliente.

create or replace function private.snapshot_validar_fixture()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  doc jsonb := new.documento;
  entrada jsonb;
  pausa jsonb;
  i int;
  j int;
  n int;
  limite constant int := 65536;
  max_copias constant int := 3;
begin
  if auth.uid() is null then
    raise exception 'sessao_ausente' using errcode = '42501';
  end if;
  if new.owner_id is distinct from auth.uid() then
    raise exception 'dono_alterado' using errcode = '42501';
  end if;
  if new.sha256 is null or new.sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'carga_invalida' using errcode = '23514';
  end if;
  if doc is null or jsonb_typeof(doc) <> 'object' then
    raise exception 'carga_invalida' using errcode = '23514';
  end if;
  if octet_length(doc::text) > limite then
    raise exception 'carga_grande' using errcode = '23514';
  end if;
  if doc->>'marca' is distinct from 'fixture-teste'
     or doc->>'version' is distinct from '2'
     or jsonb_typeof(doc->'entries') <> 'array'
     or jsonb_array_length(doc->'entries') < 1
     or jsonb_array_length(doc->'entries') > 8
     or jsonb_typeof(doc->'quinzenas') <> 'object'
     or jsonb_typeof(doc->'descontos') <> 'object'
     or jsonb_typeof(doc->'settings') <> 'object'
     or (doc->'settings'->>'operador') is distinct from 'Pessoa Exemplo' then
    raise exception 'carga_invalida' using errcode = '23514';
  end if;
  for i in 0 .. jsonb_array_length(doc->'entries') - 1 loop
    entrada := doc->'entries'->i;
    if jsonb_typeof(entrada) <> 'object'
       or coalesce(entrada->>'id', '') = ''
       or char_length(entrada->>'id') > 40
       or coalesce(entrada->>'dataInicio', '') !~ '^\d{4}-\d{2}-\d{2}$'
       or jsonb_typeof(entrada->'pausas') <> 'array'
       or char_length(coalesce(entrada->>'veiculo', '')) > 120
       or (entrada ? 'valor' and jsonb_typeof(entrada->'valor') not in ('number', 'null'))
       or (entrada ? 'ajudante' and jsonb_typeof(entrada->'ajudante') not in ('number', 'null')) then
      raise exception 'carga_invalida' using errcode = '23514';
    end if;
    if char_length(coalesce(entrada->>'obs', '')) > 200 then
      raise exception 'carga_grande' using errcode = '23514';
    end if;
    for j in 0 .. jsonb_array_length(entrada->'pausas') - 1 loop
      pausa := entrada->'pausas'->j;
      if jsonb_typeof(pausa) <> 'object'
         or coalesce(pausa->>'motivo', '') = ''
         or char_length(pausa->>'motivo') > 80
         or coalesce(pausa->>'inicio', '') !~ '^\d{4}-\d{2}-\d{2}T([01][0-9]|2[0-3]):[0-5][0-9]$' then
        raise exception 'carga_invalida' using errcode = '23514';
      end if;
    end loop;
  end loop;
  new.bytes := octet_length(doc::text);
  if tg_op = 'INSERT' then
    select count(*) into n from public.snapshots_privados where owner_id = auth.uid();
    if n >= max_copias then
      raise exception 'quota_teste' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.snapshot_validar_fixture() from public, anon, authenticated;

drop trigger if exists snapshots_validar_fixture on public.snapshots_privados;
create trigger snapshots_validar_fixture
  before insert or update on public.snapshots_privados
  for each row execute function private.snapshot_validar_fixture();
