-- Cópia individual dos lançamentos reais. Não aplicar nesta rodada.
-- Não altera backups_teste_app, copias_fixture_teste nem snapshots_privados.
-- Uma linha por conta. Sem DELETE para anon e authenticated.
-- O documento é guardado como chegou: a validação não remove chaves desconhecidas.
-- A escrita autenticada passa por public.copia_conta_gravar (security invoker).
-- Ela só delega a private.copia_conta_aplicar (security definer, fora da API).
-- O dono é só auth.uid(). Não há parâmetro de dono.

create or replace function private.copia_conta_documento_ok(doc jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  item jsonb;
  pausa jsonb;
  versao numeric;
begin
  if doc is null or pg_catalog.jsonb_typeof(doc) is distinct from 'object' then
    return false;
  end if;
  if pg_catalog.jsonb_typeof(doc -> 'version') is distinct from 'number' then
    return false;
  end if;
  versao := (doc ->> 'version')::numeric;
  if versao <> pg_catalog.trunc(versao) or versao < 1 or versao > 20 then
    return false;
  end if;
  if pg_catalog.jsonb_typeof(doc -> 'entries') is distinct from 'array' then
    return false;
  end if;
  if pg_catalog.jsonb_array_length(doc -> 'entries') > 20000 then
    return false;
  end if;
  for item in select value from pg_catalog.jsonb_array_elements(doc -> 'entries')
  loop
    if pg_catalog.jsonb_typeof(item) is distinct from 'object' then
      return false;
    end if;
    if item ? 'pausas' then
      if pg_catalog.jsonb_typeof(item -> 'pausas') is distinct from 'array' then
        return false;
      end if;
      if pg_catalog.jsonb_array_length(item -> 'pausas') > 400 then
        return false;
      end if;
      for pausa in select value from pg_catalog.jsonb_array_elements(item -> 'pausas')
      loop
        if pg_catalog.jsonb_typeof(pausa) is distinct from 'object' then
          return false;
        end if;
      end loop;
    end if;
  end loop;
  if doc ? 'quinzenas' and pg_catalog.jsonb_typeof(doc -> 'quinzenas') is distinct from 'object' then
    return false;
  end if;
  if doc ? 'descontos' and pg_catalog.jsonb_typeof(doc -> 'descontos') is distinct from 'object' then
    return false;
  end if;
  if doc ? 'settings' and pg_catalog.jsonb_typeof(doc -> 'settings') is distinct from 'object' then
    return false;
  end if;
  return true;
exception when others then
  return false;
end;
$$;

revoke all on function private.copia_conta_documento_ok(jsonb) from public, anon, authenticated;

do $$
begin
  if to_regclass('public.copias_conta') is not null then
    if (
      select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'copias_conta'
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
      raise exception 'copias_conta existe com formato divergente';
    end if;
  end if;
end $$;

create table if not exists public.copias_conta (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users (id) on delete cascade,
  revisao integer not null check (revisao >= 1 and revisao <= 20000),
  bytes integer not null check (bytes >= 0 and bytes <= 2097152),
  documento jsonb not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create or replace function private.copia_conta_validar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or new.owner_id is distinct from auth.uid() then
    raise exception 'sessao_ausente' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (new.id is distinct from old.id or new.criado_em is distinct from old.criado_em or new.owner_id is distinct from old.owner_id) then
    raise exception 'metadado_protegido' using errcode = '42501';
  end if;
  if pg_catalog.octet_length(new.documento::text) > 2097152 then
    raise exception 'carga_grande' using errcode = '23514';
  end if;
  if not private.copia_conta_documento_ok(new.documento) then
    raise exception 'carga_invalida' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    new.revisao := 1;
  else
    if old.revisao >= 20000 then
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

revoke all on function private.copia_conta_validar() from public, anon, authenticated;

drop trigger if exists copias_conta_validar on public.copias_conta;
create trigger copias_conta_validar
  before insert or update on public.copias_conta
  for each row execute function private.copia_conta_validar();

alter table public.copias_conta enable row level security;

drop policy if exists copias_conta_dono on public.copias_conta;
create policy copias_conta_dono on public.copias_conta
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

revoke all on table public.copias_conta from public, anon, authenticated;
grant select on table public.copias_conta to authenticated;

create or replace function private.copia_conta_aplicar(p_revisao_esperada integer, p_documento jsonb)
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
  if pg_catalog.octet_length(p_documento::text) > 2097152 then
    raise exception 'carga_grande' using errcode = '23514';
  end if;
  if not private.copia_conta_documento_ok(p_documento) then
    raise exception 'carga_invalida' using errcode = '23514';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(481209, pg_catalog.hashtext(uid::text));
  select revisao into atual
  from public.copias_conta
  where owner_id = uid
  for update;
  if atual is null then
    if p_revisao_esperada is not null then
      raise exception 'revisao_divergente' using errcode = '23514';
    end if;
    begin
      insert into public.copias_conta (owner_id, revisao, bytes, documento)
      values (uid, 1, 1, p_documento);
    exception when unique_violation then
      raise exception 'revisao_divergente' using errcode = '23514';
    end;
    return 1;
  end if;
  if p_revisao_esperada is distinct from atual then
    raise exception 'revisao_divergente' using errcode = '23514';
  end if;
  if atual >= 20000 then
    raise exception 'quota_revisao' using errcode = '23514';
  end if;
  update public.copias_conta
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

revoke all on function private.copia_conta_aplicar(integer, jsonb) from public, anon, authenticated;
grant execute on function private.copia_conta_aplicar(integer, jsonb) to authenticated;

create or replace function public.copia_conta_gravar(p_revisao_esperada integer, p_documento jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'sessao_ausente' using errcode = '42501';
  end if;
  return private.copia_conta_aplicar(p_revisao_esperada, p_documento);
end;
$$;

revoke all on function public.copia_conta_gravar(integer, jsonb) from public, anon;
grant execute on function public.copia_conta_gravar(integer, jsonb) to authenticated;
