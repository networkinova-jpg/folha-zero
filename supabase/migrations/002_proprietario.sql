-- Incremento do proprietário da plataforma. Não foi aplicado.
-- Não cria usuário, não envia e-mail e não lê carros nem valores.
-- O bootstrap fica revogado para anon e authenticated: só o SQL do titular, depois da config.

create table if not exists proprietarios (
  user_id uuid primary key references auth.users (id) on delete cascade,
  ativo boolean not null default true,
  bootstrap text not null default 'servidor' check (bootstrap = 'servidor'),
  criado_em timestamptz not null default now()
);

create table if not exists solicitacoes_acesso (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  nome text not null default '',
  org_id uuid references organizacoes (id),
  papel_pedido text not null check (papel_pedido in ('prestador', 'equipe', 'gerente')),
  status text not null default 'pendente' check (status in ('pendente', 'aprovada', 'recusada', 'suspensa', 'revogada')),
  decidido_por uuid references auth.users (id),
  criado_em timestamptz not null default now()
);

create table if not exists licencas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  org_id uuid references organizacoes (id),
  tipo text not null check (tipo in ('degustacao', 'licenca_manual')),
  status text not null check (status in ('ativa', 'suspensa', 'revogada')),
  inicio date,
  fim date,
  observacao text not null default ''
);

create table if not exists permissoes_org (
  org_id uuid primary key references organizacoes (id) on delete cascade,
  pode_gerir_membros boolean not null default false
);

alter table proprietarios enable row level security;
alter table solicitacoes_acesso enable row level security;
alter table licencas enable row level security;
alter table permissoes_org enable row level security;

create or replace function folha_sou_proprietario()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from proprietarios where user_id = auth.uid() and ativo);
$$;

create or replace function folha_bootstrap_proprietario(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_uid is null then raise exception 'uid ausente'; end if;
  if exists (select 1 from proprietarios where ativo) then raise exception 'ja existe proprietario'; end if;
  insert into proprietarios (user_id, ativo, bootstrap) values (p_uid, true, 'servidor');
end;
$$;

revoke all on function folha_bootstrap_proprietario(uuid) from public, anon, authenticated;
revoke insert, update, delete on proprietarios from anon, authenticated;
revoke insert, update, delete on solicitacoes_acesso from anon, authenticated;
revoke insert, update, delete on licencas from anon, authenticated;
revoke insert, update, delete on permissoes_org from anon, authenticated;
