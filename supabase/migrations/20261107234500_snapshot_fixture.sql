-- Incremental corrigido. O texto do commit 014c3301 não foi aplicado no projeto.
-- Não cria trigger em public.snapshots_privados e não altera as linhas dessa tabela.
-- A cópia de teste vive só em public.copias_fixture_teste.
-- Uma linha por conta, pelo índice único. Não há COUNT antes do INSERT.
-- O documento tem de ser a árvore canônica inteira. Rótulo e nome de operador não bastam.
-- sha256-canon: 57228492711d49c94d20903583163d3241c7861859d12164a5fdc8ac97b2e365

drop trigger if exists snapshots_validar_fixture on public.snapshots_privados;
drop function if exists private.snapshot_validar_fixture();

create or replace function private.fixture_canonica()
returns jsonb
language sql
immutable
set search_path = ''
as $fn$
  select $fx$
  {
    "version": 2,
    "marca": "fixture-teste",
    "entries": [
      {
        "id": "fx-aco-01",
        "empresa": "INOVA Blindagem",
        "setor": "Tapeçaria",
        "os": "OS-FIXTURE-01",
        "veiculo": "Veículo fictício",
        "dataInicio": "2026-11-02",
        "horaInicio": "08:15",
        "dataTermino": "2026-11-02",
        "horaTermino": "17:00",
        "situacao": "Finalizado",
        "pausas": [
          {"motivo": "Fim de expediente", "inicio": "2026-11-02T12:00", "fim": "2026-11-02T13:00"},
          {"motivo": "Aço da maçaneta", "inicio": "2026-11-02T15:00", "fim": "2026-11-02T15:20", "outro": true}
        ],
        "valor": 0,
        "ajudante": 0,
        "obs": "Peça de teste com acento",
        "exemplo": true,
        "createdAt": 1762041600000,
        "updatedAt": 1762070400000
      },
      {
        "id": "fx-vidro-02",
        "empresa": "INOVA Blindagem",
        "setor": "Vidro",
        "os": "OS-FIXTURE-02",
        "veiculo": "Carro sem valor",
        "dataInicio": "2026-11-03",
        "horaInicio": "09:00",
        "dataTermino": null,
        "horaTermino": null,
        "situacao": "Em processo",
        "pausas": [],
        "valor": null,
        "ajudante": null,
        "obs": "",
        "exemplo": true,
        "createdAt": 1762128000000,
        "updatedAt": 1762128000000
      }
    ],
    "quinzenas": {},
    "descontos": {},
    "settings": {
      "operador": "Pessoa Exemplo",
      "setorOperador": "Tapeçaria",
      "lastBackup": null,
      "valorPadrao": {"INOVA Blindagem": 0},
      "aliquota": {}
    }
  }
  $fx$::jsonb
$fn$;

create or replace function private.fixture_arvore_fechada(doc jsonb)
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
begin
  if jsonb_typeof(doc) is distinct from 'object' then return false; end if;
  select coalesce(array_agg(s.k order by s.k), '{}'::text[]) into chaves
  from (select jsonb_object_keys(doc) as k) s;
  if chaves is distinct from array['descontos','entries','marca','quinzenas','settings','version']::text[] then
    return false;
  end if;
  if jsonb_typeof(doc->'version') is distinct from 'number' then return false; end if;
  if jsonb_typeof(doc->'marca') is distinct from 'string' then return false; end if;
  if jsonb_typeof(doc->'entries') is distinct from 'array' then return false; end if;
  if jsonb_array_length(doc->'entries') is distinct from 2 then return false; end if;
  if (doc->'quinzenas') is distinct from '{}'::jsonb then return false; end if;
  if (doc->'descontos') is distinct from '{}'::jsonb then return false; end if;
  if jsonb_typeof(doc->'settings') is distinct from 'object' then return false; end if;
  select coalesce(array_agg(s.k order by s.k), '{}'::text[]) into chaves
  from (select jsonb_object_keys(doc->'settings') as k) s;
  if chaves is distinct from array['aliquota','lastBackup','operador','setorOperador','valorPadrao']::text[] then
    return false;
  end if;
  if (doc->'settings'->'lastBackup') is distinct from 'null'::jsonb then return false; end if;
  if jsonb_typeof(doc->'settings'->'operador') is distinct from 'string' then return false; end if;
  if jsonb_typeof(doc->'settings'->'setorOperador') is distinct from 'string' then return false; end if;
  if (doc->'settings'->'aliquota') is distinct from '{}'::jsonb then return false; end if;
  if jsonb_typeof(doc->'settings'->'valorPadrao') is distinct from 'object' then return false; end if;
  select coalesce(array_agg(s.k order by s.k), '{}'::text[]) into chaves
  from (select jsonb_object_keys(doc->'settings'->'valorPadrao') as k) s;
  if chaves is distinct from array['INOVA Blindagem']::text[] then return false; end if;
  if jsonb_typeof(doc->'settings'->'valorPadrao'->'INOVA Blindagem') is distinct from 'number' then return false; end if;

  for i in 0..1 loop
    entrada := doc->'entries'->i;
    if jsonb_typeof(entrada) is distinct from 'object' then return false; end if;
    select coalesce(array_agg(s.k order by s.k), '{}'::text[]) into chaves
    from (select jsonb_object_keys(entrada) as k) s;
    if chaves is distinct from array['ajudante','createdAt','dataInicio','dataTermino','empresa','exemplo','horaInicio','horaTermino','id','obs','os','pausas','setor','situacao','updatedAt','valor','veiculo']::text[] then
      return false;
    end if;
    if jsonb_typeof(entrada->'id') is distinct from 'string' then return false; end if;
    if jsonb_typeof(entrada->'empresa') is distinct from 'string' then return false; end if;
    if jsonb_typeof(entrada->'setor') is distinct from 'string' then return false; end if;
    if jsonb_typeof(entrada->'os') is distinct from 'string' then return false; end if;
    if jsonb_typeof(entrada->'veiculo') is distinct from 'string' then return false; end if;
    if jsonb_typeof(entrada->'dataInicio') is distinct from 'string' then return false; end if;
    if jsonb_typeof(entrada->'horaInicio') is distinct from 'string' then return false; end if;
    if jsonb_typeof(entrada->'situacao') is distinct from 'string' then return false; end if;
    if jsonb_typeof(entrada->'obs') is distinct from 'string' then return false; end if;
    if jsonb_typeof(entrada->'exemplo') is distinct from 'boolean' then return false; end if;
    if jsonb_typeof(entrada->'createdAt') is distinct from 'number' then return false; end if;
    if jsonb_typeof(entrada->'updatedAt') is distinct from 'number' then return false; end if;
    if jsonb_typeof(entrada->'dataTermino') is distinct from 'string'
       and jsonb_typeof(entrada->'dataTermino') is distinct from 'null' then return false; end if;
    if jsonb_typeof(entrada->'horaTermino') is distinct from 'string'
       and jsonb_typeof(entrada->'horaTermino') is distinct from 'null' then return false; end if;
    if jsonb_typeof(entrada->'valor') is distinct from 'number'
       and jsonb_typeof(entrada->'valor') is distinct from 'null' then return false; end if;
    if jsonb_typeof(entrada->'ajudante') is distinct from 'number'
       and jsonb_typeof(entrada->'ajudante') is distinct from 'null' then return false; end if;
    if jsonb_typeof(entrada->'pausas') is distinct from 'array' then return false; end if;
    for j in 0 .. jsonb_array_length(entrada->'pausas') - 1 loop
      pausa := entrada->'pausas'->j;
      if jsonb_typeof(pausa) is distinct from 'object' then return false; end if;
      select coalesce(array_agg(s.k order by s.k), '{}'::text[]) into chaves
      from (select jsonb_object_keys(pausa) as k) s;
      if pausa ? 'outro' then
        if chaves is distinct from array['fim','inicio','motivo','outro']::text[] then return false; end if;
        if jsonb_typeof(pausa->'outro') is distinct from 'boolean' then return false; end if;
      else
        if chaves is distinct from array['fim','inicio','motivo']::text[] then return false; end if;
      end if;
      if jsonb_typeof(pausa->'motivo') is distinct from 'string' then return false; end if;
      if jsonb_typeof(pausa->'inicio') is distinct from 'string' then return false; end if;
      if jsonb_typeof(pausa->'fim') is distinct from 'string' then return false; end if;
    end loop;
  end loop;
  if doc is distinct from private.fixture_canonica() then return false; end if;
  return true;
end;
$$;

revoke all on function private.fixture_canonica() from public, anon, authenticated;
revoke all on function private.fixture_arvore_fechada(jsonb) from public, anon, authenticated;

create table if not exists public.copias_fixture_teste (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users (id) on delete cascade,
  sha256 text not null,
  bytes integer not null check (bytes >= 0 and bytes <= 65536),
  documento jsonb not null,
  criado_em timestamptz not null default now()
);

create or replace function private.copia_fixture_validar()
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
  if new.documento is null then
    raise exception 'carga_invalida' using errcode = '23514';
  end if;
  if octet_length(new.documento::text) > 65536 then
    raise exception 'carga_grande' using errcode = '23514';
  end if;
  if new.sha256 is distinct from '57228492711d49c94d20903583163d3241c7861859d12164a5fdc8ac97b2e365' then
    raise exception 'carga_invalida' using errcode = '23514';
  end if;
  if not private.fixture_arvore_fechada(new.documento) then
    raise exception 'carga_invalida' using errcode = '23514';
  end if;
  new.bytes := octet_length(new.documento::text);
  return new;
end;
$$;

revoke all on function private.copia_fixture_validar() from public, anon, authenticated;

drop trigger if exists copias_fixture_validar on public.copias_fixture_teste;
create trigger copias_fixture_validar
  before insert or update on public.copias_fixture_teste
  for each row execute function private.copia_fixture_validar();

alter table public.copias_fixture_teste enable row level security;

drop policy if exists copias_fixture_dono on public.copias_fixture_teste;
create policy copias_fixture_dono on public.copias_fixture_teste
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

revoke all on table public.copias_fixture_teste from public, anon, authenticated;
grant select, insert, delete on table public.copias_fixture_teste to authenticated;
