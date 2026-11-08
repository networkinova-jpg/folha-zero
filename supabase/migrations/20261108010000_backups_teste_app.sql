-- Backup variável só do app de teste. Não aplicar neste passo.
-- Não altera public.copias_fixture_teste nem public.snapshots_privados.
-- Uma linha por conta. Não há DELETE. Não há hash persistido: o teste compara o jsonb.
-- A escrita autenticada passa por public.backup_teste_gravar (security invoker, schema exposto).
-- Ela só delega a private.backup_teste_aplicar (security definer, fora da API).
-- authenticated precisa de EXECUTE nessa função privada para o invoker alcançá-la.
-- O dono da linha é só auth.uid(). Não há parâmetro de dono nem GRANT dentro da função.
-- A revisão para em 100. O documento para em 64 KiB e em 30 lançamentos.

create or replace function private.backup_teste_data_ok(s text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if s is null or s !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
  return pg_catalog.to_char(pg_catalog.to_date(s, 'YYYY-MM-DD'), 'YYYY-MM-DD') = s;
exception when others then
  return false;
end;
$$;

revoke all on function private.backup_teste_data_ok(text) from public, anon, authenticated;

create or replace function private.backup_teste_local_ok(s text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if s is null or s !~ '^\d{4}-(0[1-9]|1[0-2])-\d{2}T([01][0-9]|2[0-3]):[0-5][0-9]$' then
    return false;
  end if;
  return private.backup_teste_data_ok(pg_catalog.substr(s, 1, 10));
end;
$$;

revoke all on function private.backup_teste_local_ok(text) from public, anon, authenticated;

create or replace function private.backup_teste_utc_ok(s text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if s is null or s !~ '^\d{4}-(0[1-9]|1[0-2])-\d{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,3})?Z$' then
    return false;
  end if;
  return private.backup_teste_data_ok(pg_catalog.substr(s, 1, 10));
end;
$$;

revoke all on function private.backup_teste_utc_ok(text) from public, anon, authenticated;

create or replace function private.backup_teste_inteiro_ok(n jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare v numeric;
begin
  if jsonb_typeof(n) is distinct from 'number' then return false; end if;
  v := (n #>> '{}')::numeric;
  if v < 0 or v <> trunc(v) then return false; end if;
  return true;
end;
$$;

revoke all on function private.backup_teste_inteiro_ok(jsonb) from public, anon, authenticated;

create or replace function private.backup_teste_documento_valido(doc jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  chaves text[];
  entrada jsonb;
  pausa jsonb;
  i int;
  j int;
  vistos text[] := '{}';
  obrigatorias text[] := array['ajudante','createdAt','dataInicio','dataTermino','empresa','horaInicio','horaTermino','id','obs','os','pausas','setor','situacao','updatedAt','valor','veiculo'];
  setores text[] := array['Aço','Aço Maçaneta','Aço de retrovisor','Churrasqueira','Desmontagem','Manta','Montagem','Overlap','Qualidade','Steel','Tampa','Tapeçaria','Vidro'];
  situacoes text[] := array['Em processo','Faltando peça','Faltando vidro','Problemas elétricos','Problemas com vidro','Aguardando etapa anterior','Aguardando vidraceiro','Aguardando ajuste da produção','Impasse na resolução de um problema','Finalizado'];
  motivos text[] := array['Faltando peça','Faltando vidro','Problemas elétricos','Problemas com vidro','Aguardando etapa anterior','Aguardando vidraceiro','Aguardando ajuste da produção','Impasse na resolução de um problema','Fim de expediente'];
  status_folha text[] := array['Aberta','Entregue','Assinada','Paga'];
  chave text;
begin
  if jsonb_typeof(doc) is distinct from 'object' then return false; end if;
  if pg_catalog.octet_length(doc::text) > 65536 then return false; end if;
  select coalesce(pg_catalog.array_agg(s.k order by s.k), '{}'::text[]) into chaves
  from (select pg_catalog.jsonb_object_keys(doc) as k) s;
  if chaves is distinct from array['descontos','entries','quinzenas','settings','version']::text[] then return false; end if;
  if jsonb_typeof(doc->'version') is distinct from 'number' then return false; end if;
  if (doc->>'version') is distinct from '2' then return false; end if;
  if jsonb_typeof(doc->'entries') is distinct from 'array' then return false; end if;
  if pg_catalog.jsonb_array_length(doc->'entries') > 30 then return false; end if;
  if jsonb_typeof(doc->'quinzenas') is distinct from 'object' then return false; end if;
  if jsonb_typeof(doc->'descontos') is distinct from 'object' then return false; end if;
  if jsonb_typeof(doc->'settings') is distinct from 'object' then return false; end if;

  for i in 0 .. pg_catalog.jsonb_array_length(doc->'entries') - 1 loop
    entrada := doc->'entries'->i;
    if jsonb_typeof(entrada) is distinct from 'object' then return false; end if;
    select coalesce(pg_catalog.array_agg(s.k order by s.k), '{}'::text[]) into chaves
    from (select pg_catalog.jsonb_object_keys(entrada) as k) s;
    if not (obrigatorias <@ chaves) then return false; end if;
    if not (chaves <@ (obrigatorias || array['exemplo'])) then return false; end if;
    if jsonb_typeof(entrada->'id') is distinct from 'string' then return false; end if;
    if pg_catalog.char_length(entrada->>'id') < 1 or pg_catalog.char_length(entrada->>'id') > 40 then return false; end if;
    if entrada->>'id' = any(vistos) then return false; end if;
    vistos := vistos || (entrada->>'id');
    if jsonb_typeof(entrada->'empresa') is distinct from 'string' then return false; end if;
    if pg_catalog.char_length(entrada->>'empresa') < 1 or pg_catalog.char_length(entrada->>'empresa') > 80 then return false; end if;
    if jsonb_typeof(entrada->'setor') is distinct from 'string' then return false; end if;
    if not (entrada->>'setor' = any(setores)) then return false; end if;
    if jsonb_typeof(entrada->'os') is distinct from 'string' then return false; end if;
    if pg_catalog.char_length(entrada->>'os') < 1 or pg_catalog.char_length(entrada->>'os') > 40 then return false; end if;
    if jsonb_typeof(entrada->'veiculo') is distinct from 'string' then return false; end if;
    if pg_catalog.char_length(entrada->>'veiculo') < 1 or pg_catalog.char_length(entrada->>'veiculo') > 80 then return false; end if;
    if not private.backup_teste_data_ok(entrada->>'dataInicio') then return false; end if;
    if jsonb_typeof(entrada->'horaInicio') = 'string' then
      if entrada->>'horaInicio' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return false; end if;
    elsif jsonb_typeof(entrada->'horaInicio') is distinct from 'null' then return false; end if;
    if jsonb_typeof(entrada->'dataTermino') = 'string' then
      if not private.backup_teste_data_ok(entrada->>'dataTermino') then return false; end if;
      if entrada->>'dataTermino' < entrada->>'dataInicio' then return false; end if;
    elsif jsonb_typeof(entrada->'dataTermino') is distinct from 'null' then return false; end if;
    if jsonb_typeof(entrada->'horaTermino') = 'string' then
      if jsonb_typeof(entrada->'dataTermino') is distinct from 'string' then return false; end if;
      if entrada->>'horaTermino' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return false; end if;
      if jsonb_typeof(entrada->'horaInicio') = 'string'
         and entrada->>'dataTermino' = entrada->>'dataInicio'
         and entrada->>'horaTermino' < entrada->>'horaInicio' then return false; end if;
    elsif jsonb_typeof(entrada->'horaTermino') is distinct from 'null' then return false; end if;
    if jsonb_typeof(entrada->'situacao') is distinct from 'string' then return false; end if;
    if not (entrada->>'situacao' = any(situacoes)) then return false; end if;
    if jsonb_typeof(entrada->'valor') = 'number' then
      if (entrada->>'valor')::numeric < 0 then return false; end if;
    elsif jsonb_typeof(entrada->'valor') is distinct from 'null' then return false; end if;
    if jsonb_typeof(entrada->'ajudante') = 'number' then
      if (entrada->>'ajudante')::numeric < 0 then return false; end if;
    elsif jsonb_typeof(entrada->'ajudante') is distinct from 'null' then return false; end if;
    if jsonb_typeof(entrada->'obs') is distinct from 'string' or pg_catalog.char_length(entrada->>'obs') > 500 then return false; end if;
    if not private.backup_teste_inteiro_ok(entrada->'createdAt') then return false; end if;
    if not private.backup_teste_inteiro_ok(entrada->'updatedAt') then return false; end if;
    if (entrada->'updatedAt'#>>'{}')::numeric < (entrada->'createdAt'#>>'{}')::numeric then return false; end if;
    if entrada ? 'exemplo' and jsonb_typeof(entrada->'exemplo') is distinct from 'boolean' then return false; end if;
    if jsonb_typeof(entrada->'pausas') is distinct from 'array' then return false; end if;
    if pg_catalog.jsonb_array_length(entrada->'pausas') > 20 then return false; end if;
    for j in 0 .. pg_catalog.jsonb_array_length(entrada->'pausas') - 1 loop
      pausa := entrada->'pausas'->j;
      if jsonb_typeof(pausa) is distinct from 'object' then return false; end if;
      select coalesce(pg_catalog.array_agg(s.k order by s.k), '{}'::text[]) into chaves
      from (select pg_catalog.jsonb_object_keys(pausa) as k) s;
      if not (array['fim','inicio','motivo']::text[] <@ chaves) then return false; end if;
      if not (chaves <@ array['fim','inicio','motivo','outro']::text[]) then return false; end if;
      if jsonb_typeof(pausa->'inicio') is distinct from 'string' or not private.backup_teste_local_ok(pausa->>'inicio') then return false; end if;
      if jsonb_typeof(pausa->'fim') = 'string' then
        if not private.backup_teste_local_ok(pausa->>'fim') then return false; end if;
        if pausa->>'fim' < pausa->>'inicio' then return false; end if;
      elsif jsonb_typeof(pausa->'fim') is distinct from 'null' then return false; end if;
      if jsonb_typeof(pausa->'motivo') is distinct from 'string' then return false; end if;
      if pausa ? 'outro' then
        if jsonb_typeof(pausa->'outro') is distinct from 'boolean' then return false; end if;
        if pg_catalog.char_length(pausa->>'motivo') < 1 or pg_catalog.char_length(pausa->>'motivo') > 60 then return false; end if;
      elsif not (pausa->>'motivo' = any(motivos)) then return false; end if;
    end loop;
  end loop;

  select coalesce(pg_catalog.array_agg(s.k order by s.k), '{}'::text[]) into chaves
  from (select pg_catalog.jsonb_object_keys(doc->'quinzenas') as k) s;
  if pg_catalog.cardinality(chaves) > 40 then return false; end if;
  foreach chave in array chaves loop
    if chave !~ '^[^|]{1,80}\|(19[0-9]{2}|20[0-9]{2}|21[0-9]{2})-(0[1-9]|1[0-2])\|[12]$' then return false; end if;
    if jsonb_typeof(doc->'quinzenas'->chave) is distinct from 'string' then return false; end if;
    if not ((doc->'quinzenas'->>chave) = any(status_folha)) then return false; end if;
  end loop;

  select coalesce(pg_catalog.array_agg(s.k order by s.k), '{}'::text[]) into chaves
  from (select pg_catalog.jsonb_object_keys(doc->'descontos') as k) s;
  if pg_catalog.cardinality(chaves) > 40 then return false; end if;
  foreach chave in array chaves loop
    if chave !~ '^[^|]{1,80}\|(19[0-9]{2}|20[0-9]{2}|21[0-9]{2})-(0[1-9]|1[0-2])\|[12]$' then return false; end if;
    if jsonb_typeof(doc->'descontos'->chave) is distinct from 'number' then return false; end if;
    if (doc->'descontos'->>chave)::numeric < 0 then return false; end if;
  end loop;

  select coalesce(pg_catalog.array_agg(s.k order by s.k), '{}'::text[]) into chaves
  from (select pg_catalog.jsonb_object_keys(doc->'settings') as k) s;
  if not (array['aliquota','lastBackup','operador','setorOperador','valorPadrao']::text[] <@ chaves) then return false; end if;
  if not (chaves <@ array['aliquota','lastBackup','liberado','operador','setorOperador','trialInicio','valorPadrao']::text[]) then return false; end if;
  if jsonb_typeof(doc->'settings'->'operador') is distinct from 'string' then return false; end if;
  if pg_catalog.char_length(doc->'settings'->>'operador') < 1 or pg_catalog.char_length(doc->'settings'->>'operador') > 80 then return false; end if;
  if jsonb_typeof(doc->'settings'->'setorOperador') is distinct from 'string' then return false; end if;
  if not ((doc->'settings'->>'setorOperador') = any(setores)) then return false; end if;
  if jsonb_typeof(doc->'settings'->'lastBackup') = 'string' then
    if not private.backup_teste_utc_ok(doc->'settings'->>'lastBackup') then return false; end if;
  elsif jsonb_typeof(doc->'settings'->'lastBackup') is distinct from 'null' then return false; end if;
  if doc->'settings' ? 'trialInicio' then
    if jsonb_typeof(doc->'settings'->'trialInicio') is distinct from 'string' then return false; end if;
    if not private.backup_teste_utc_ok(doc->'settings'->>'trialInicio') then return false; end if;
  end if;
  if doc->'settings' ? 'liberado' and jsonb_typeof(doc->'settings'->'liberado') is distinct from 'boolean' then return false; end if;
  if jsonb_typeof(doc->'settings'->'valorPadrao') is distinct from 'object' then return false; end if;
  if jsonb_typeof(doc->'settings'->'aliquota') is distinct from 'object' then return false; end if;
  select coalesce(pg_catalog.array_agg(s.k order by s.k), '{}'::text[]) into chaves
  from (select pg_catalog.jsonb_object_keys(doc->'settings'->'valorPadrao') as k) s;
  if pg_catalog.cardinality(chaves) > 20 then return false; end if;
  foreach chave in array chaves loop
    if pg_catalog.char_length(chave) < 1 or pg_catalog.char_length(chave) > 80 then return false; end if;
    if jsonb_typeof(doc->'settings'->'valorPadrao'->chave) is distinct from 'number' then return false; end if;
    if (doc->'settings'->'valorPadrao'->>chave)::numeric < 0 then return false; end if;
  end loop;
  select coalesce(pg_catalog.array_agg(s.k order by s.k), '{}'::text[]) into chaves
  from (select pg_catalog.jsonb_object_keys(doc->'settings'->'aliquota') as k) s;
  if pg_catalog.cardinality(chaves) > 20 then return false; end if;
  foreach chave in array chaves loop
    if pg_catalog.char_length(chave) < 1 or pg_catalog.char_length(chave) > 80 then return false; end if;
    if chave ~ '[[:cntrl:]]' then return false; end if;
    if jsonb_typeof(doc->'settings'->'aliquota'->chave) is distinct from 'number' then return false; end if;
    if (doc->'settings'->'aliquota'->>chave)::numeric < 0 or (doc->'settings'->'aliquota'->>chave)::numeric >= 100 then return false; end if;
  end loop;
  return true;
end;
$$;

revoke all on function private.backup_teste_documento_valido(jsonb) from public, anon, authenticated;

do $$
declare n int;
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relname = 'backups_teste_app'
  ) then
    select count(*) into n from information_schema.columns
    where table_schema = 'public' and table_name = 'backups_teste_app';
    if n is distinct from 7 then
      raise exception 'backups_teste_app existe com formato divergente';
    end if;
    if (
      select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'backups_teste_app'
        and (column_name, data_type) in (
          ('id', 'uuid'),
          ('owner_id', 'uuid'),
          ('revisao', 'integer'),
          ('bytes', 'integer'),
          ('documento', 'jsonb'),
          ('criado_em', 'timestamp with time zone'),
          ('atualizado_em', 'timestamp with time zone')
        )
    ) is distinct from 7 then
      raise exception 'backups_teste_app existe com formato divergente';
    end if;
  end if;
end $$;

create table if not exists public.backups_teste_app (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users (id) on delete cascade,
  revisao integer not null check (revisao >= 1 and revisao <= 100),
  bytes integer not null check (bytes >= 0 and bytes <= 65536),
  documento jsonb not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create or replace function private.backup_teste_validar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'sessao_ausente' using errcode = '42501';
  end if;
  if new.owner_id is distinct from auth.uid() then
    raise exception 'dono_alterado' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.owner_id is distinct from old.owner_id then
    raise exception 'dono_alterado' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (new.id is distinct from old.id or new.criado_em is distinct from old.criado_em) then
    raise exception 'metadado_protegido' using errcode = '42501';
  end if;
  if new.documento is null then
    raise exception 'carga_invalida' using errcode = '23514';
  end if;
  if pg_catalog.octet_length(new.documento::text) > 65536 then
    raise exception 'carga_grande' using errcode = '23514';
  end if;
  if not private.backup_teste_documento_valido(new.documento) then
    raise exception 'carga_invalida' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    new.revisao := 1;
  else
    if old.revisao >= 100 then
      raise exception 'quota_revisao' using errcode = '23514';
    end if;
    if new.revisao is distinct from old.revisao + 1 then
      raise exception 'revisao_divergente' using errcode = '23514';
    end if;
  end if;
  new.bytes := pg_catalog.octet_length(new.documento::text);
  if tg_op = 'UPDATE' then
    new.atualizado_em := pg_catalog.now();
  end if;
  return new;
end;
$$;

revoke all on function private.backup_teste_validar() from public, anon, authenticated;

drop trigger if exists backups_teste_app_validar on public.backups_teste_app;
create trigger backups_teste_app_validar
  before insert or update on public.backups_teste_app
  for each row execute function private.backup_teste_validar();

alter table public.backups_teste_app enable row level security;

drop policy if exists backups_teste_dono on public.backups_teste_app;
create policy backups_teste_dono on public.backups_teste_app
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

revoke all on table public.backups_teste_app from public, anon, authenticated;
grant select on table public.backups_teste_app to authenticated;

create or replace function private.backup_teste_aplicar(p_revisao_esperada integer, p_documento jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  atual integer;
begin
  if uid is null then
    raise exception 'sessao_ausente' using errcode = '42501';
  end if;
  if p_documento is null then
    raise exception 'carga_invalida' using errcode = '23514';
  end if;
  if pg_catalog.octet_length(p_documento::text) > 65536 then
    raise exception 'carga_grande' using errcode = '23514';
  end if;
  if not private.backup_teste_documento_valido(p_documento) then
    raise exception 'carga_invalida' using errcode = '23514';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(481208, pg_catalog.hashtext(uid::text));
  select revisao into atual
  from public.backups_teste_app
  where owner_id = uid
  for update;
  if atual is null then
    if p_revisao_esperada is not null then
      raise exception 'revisao_divergente' using errcode = '23514';
    end if;
    begin
      insert into public.backups_teste_app (owner_id, revisao, bytes, documento)
      values (uid, 1, 1, p_documento);
    exception when unique_violation then
      raise exception 'revisao_divergente' using errcode = '23514';
    end;
    return 1;
  end if;
  if p_revisao_esperada is distinct from atual then
    raise exception 'revisao_divergente' using errcode = '23514';
  end if;
  if atual >= 100 then
    raise exception 'quota_revisao' using errcode = '23514';
  end if;
  update public.backups_teste_app
  set documento = p_documento,
      revisao = atual + 1,
      bytes = 1
  where owner_id = uid and revisao = atual;
  if not found then
    raise exception 'revisao_divergente' using errcode = '23514';
  end if;
  return atual + 1;
end;
$$;

revoke all on function private.backup_teste_aplicar(integer, jsonb) from public, anon, authenticated;
grant execute on function private.backup_teste_aplicar(integer, jsonb) to authenticated;

create or replace function public.backup_teste_gravar(p_revisao_esperada integer, p_documento jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'sessao_ausente' using errcode = '42501';
  end if;
  return private.backup_teste_aplicar(p_revisao_esperada, p_documento);
end;
$$;

revoke all on function public.backup_teste_gravar(integer, jsonb) from public, anon;
grant execute on function public.backup_teste_gravar(integer, jsonb) to authenticated;
