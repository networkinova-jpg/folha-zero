-- Folha Zero: esquema proposto. Não foi aplicado em nenhum projeto.
-- Sem service_role, sem senha, sem URL. O cliente só poderá usar a anon key
-- de um projeto autorizado, e as regras abaixo é que limitam o acesso.
-- Dados de exemplo ficam em fixtures.sql e são fictícios.

create extension if not exists pgcrypto;

-- Papéis: prestador (módulo individual), equipe e gerente (mesmo módulo de gestão).
-- Equipe e gerente não leem valores. Ninguém se promove.

create table if not exists perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null default '',
  criado_em timestamptz not null default now()
);

create table if not exists organizacoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  criado_em timestamptz not null default now()
);

create table if not exists org_membros (
  org_id uuid not null references organizacoes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  papel text not null check (papel in ('prestador', 'equipe', 'gerente')),
  setor text not null default '',
  status text not null default 'ativo' check (status in ('convidado', 'ativo', 'revogado')),
  primary key (org_id, user_id)
);

create table if not exists convites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizacoes (id) on delete cascade,
  email text not null,
  papel text not null check (papel in ('prestador', 'equipe', 'gerente')),
  setor text not null default '',
  criado_por uuid not null references auth.users (id),
  criado_em timestamptz not null default now(),
  expira_em timestamptz,
  revogado_em timestamptz,
  aceito_por uuid references auth.users (id)
);

create table if not exists lancamentos (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  owner_id uuid not null references auth.users (id),
  org_id uuid references organizacoes (id),
  empresa text not null default '',
  setor text not null default '',
  os text not null default '',
  veiculo text not null default '',
  data_inicio date,
  hora_inicio text,
  data_termino date,
  hora_termino text,
  situacao text,
  obs text not null default '',
  atualizado_em timestamptz not null default now(),
  unique (owner_id, client_id)
);

-- Valores, descontos e alíquotas nunca entram na tabela compartilhada.
create table if not exists lancamento_valores (
  lancamento_id uuid primary key references lancamentos (id) on delete cascade,
  owner_id uuid not null references auth.users (id),
  valor numeric,
  ajudante numeric
);

create table if not exists ajustes_privados (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  quinzenas jsonb not null default '{}'::jsonb,
  descontos jsonb not null default '{}'::jsonb,
  valor_padrao jsonb not null default '{}'::jsonb,
  aliquota jsonb not null default '{}'::jsonb
);

create table if not exists pausas (
  id uuid primary key default gen_random_uuid(),
  lancamento_id uuid not null references lancamentos (id) on delete cascade,
  owner_id uuid not null references auth.users (id),
  motivo text not null,
  categoria text not null default 'outro' check (categoria in ('insumo', 'pessoal', 'fim_expediente', 'outro')),
  inicio timestamptz not null,
  fim timestamptz,
  outro boolean not null default false
);

create table if not exists atribuicoes (
  id uuid primary key default gen_random_uuid(),
  lancamento_id uuid not null references lancamentos (id) on delete cascade,
  org_id uuid not null references organizacoes (id) on delete cascade,
  user_id uuid not null references auth.users (id),
  etapa text not null,
  unique (lancamento_id, user_id, etapa)
);

-- Idempotência: repetir o mesmo lote não cria outra linha.
create table if not exists sync_mutacoes (
  mutation_id text primary key,
  user_id uuid not null references auth.users (id),
  sha256 text not null,
  estado text not null check (estado in ('recebida', 'verificada', 'parcial')),
  ids jsonb not null default '[]'::jsonb,
  criado_em timestamptz not null default now()
);

create table if not exists vinculos_legado (
  user_id uuid primary key references auth.users (id) on delete cascade,
  sha256 text not null,
  confirmado_em timestamptz not null default now()
);

alter table perfis enable row level security;
alter table organizacoes enable row level security;
alter table org_membros enable row level security;
alter table convites enable row level security;
alter table lancamentos enable row level security;
alter table lancamento_valores enable row level security;
alter table ajustes_privados enable row level security;
alter table pausas enable row level security;
alter table atribuicoes enable row level security;
alter table sync_mutacoes enable row level security;
alter table vinculos_legado enable row level security;

-- O cliente autenticado não altera papel por UPDATE direto.
revoke insert, update, delete on org_membros from anon, authenticated;
revoke insert, update, delete on convites from anon, authenticated;
grant select on org_membros to authenticated;
grant select on convites to authenticated;

create or replace function folha_sou_membro(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from org_membros
    where org_id = p_org and user_id = auth.uid() and status = 'ativo'
  );
$$;

create or replace function folha_sou_gerente(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from org_membros
    where org_id = p_org and user_id = auth.uid() and papel = 'gerente' and status = 'ativo'
  );
$$;

create or replace function folha_definir_papel(p_org uuid, p_user uuid, p_papel text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'sem sessao';
  end if;
  if p_user = auth.uid() then
    raise exception 'nao pode alterar o proprio papel';
  end if;
  if p_papel not in ('prestador', 'equipe', 'gerente') then
    raise exception 'papel invalido';
  end if;
  if not folha_sou_gerente(p_org) then
    raise exception 'somente gerente da organizacao';
  end if;
  update org_membros
     set papel = p_papel
   where org_id = p_org and user_id = p_user and status = 'ativo';
  if not found then
    raise exception 'membro ausente nesta organizacao';
  end if;
end;
$$;

create or replace function folha_revogar_convite(p_convite uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  select org_id into v_org from convites where id = p_convite;
  if v_org is null then
    raise exception 'convite ausente';
  end if;
  if not folha_sou_gerente(v_org) then
    raise exception 'somente gerente da organizacao';
  end if;
  update convites set revogado_em = now() where id = p_convite and revogado_em is null;
end;
$$;

revoke all on function folha_definir_papel(uuid, uuid, text) from public, anon;
revoke all on function folha_revogar_convite(uuid) from public, anon;
grant execute on function folha_definir_papel(uuid, uuid, text) to authenticated;
grant execute on function folha_revogar_convite(uuid) to authenticated;

-- Perfil: só o próprio.
create policy perfis_proprio on perfis
  for all to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Valores e ajustes: só o dono. Gerente não entra.
create policy valores_dono on lancamento_valores
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy ajustes_dono on ajustes_privados
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Lançamento pessoal (org nula): só o dono.
-- Lançamento de organização: gerente vê a produção da própria org;
-- equipe vê o próprio setor ou o que lhe foi atribuído; prestador vê o que é dele.
-- Nenhuma política libera outra organização.
create policy lancamentos_ler on lancamentos
  for select to authenticated
  using (
    owner_id = auth.uid()
    or (
      org_id is not null
      and folha_sou_gerente(org_id)
    )
    or (
      org_id is not null
      and exists (
        select 1 from org_membros m
        where m.org_id = lancamentos.org_id
          and m.user_id = auth.uid()
          and m.status = 'ativo'
          and m.papel = 'equipe'
          and (
            m.setor = lancamentos.setor
            or exists (
              select 1 from atribuicoes a
              where a.lancamento_id = lancamentos.id and a.user_id = auth.uid()
            )
          )
      )
    )
  );

create policy lancamentos_gravar on lancamentos
  for insert to authenticated
  with check (owner_id = auth.uid());

create policy lancamentos_atualizar on lancamentos
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and (org_id is null or folha_sou_membro(org_id)));

create policy pausas_ler on pausas
  for select to authenticated
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from lancamentos l
      where l.id = pausas.lancamento_id
        and l.org_id is not null
        and (
          folha_sou_gerente(l.org_id)
          or exists (
            select 1 from org_membros m
            where m.org_id = l.org_id and m.user_id = auth.uid() and m.status = 'ativo' and m.papel = 'equipe'
              and (m.setor = l.setor or exists (select 1 from atribuicoes a where a.lancamento_id = l.id and a.user_id = auth.uid()))
          )
        )
    )
  );

create policy pausas_dono on pausas
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy membros_ler on org_membros
  for select to authenticated
  using (user_id = auth.uid() or folha_sou_gerente(org_id) or folha_sou_membro(org_id));

create policy convites_ler on convites
  for select to authenticated
  using (folha_sou_gerente(org_id) or aceito_por = auth.uid());

create policy sync_proprio on sync_mutacoes
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy legado_proprio on vinculos_legado
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Produtividade sem colunas de dinheiro. security invoker: respeita a RLS de lancamentos.
create or replace view v_producao_sem_valor
with (security_invoker = true) as
select id, client_id, owner_id, org_id, empresa, setor, os, veiculo,
       data_inicio, data_termino, situacao, atualizado_em
  from lancamentos;
