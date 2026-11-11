-- Folha Zero: migração única para o banco vazio vyxfjdhhlzluwfesxgra (São Paulo, Free).
-- Não foi aplicada no projeto. Sem extensão nova, sem chave de serviço e sem e-mail.
-- Idempotente para funções e policies. Pensada para uma aplicação em banco vazio.
-- Funções privilegiadas ficam no schema private, fora da API. search_path vazio.
-- Retenção de produção após revogar NÃO está ativa: compartilhamento encerrado deixa de ser visível.
-- A linha do lançamento do prestador não é apagada. Não há promessa de exclusão irrestrita.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

revoke all on schema public from public;
grant usage on schema public to anon, authenticated;

-- Módulo individual: prestador, várias empresas clientes, org nula.
-- Gestão de Produção: equipe e gerente. Um gerente, uma organização.
-- Equipe de Produção é nome genérico. Concept não é nome fixo.

create table if not exists public.perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null default '',
  criado_em timestamptz not null default now()
);

create table if not exists public.organizacoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  criado_em timestamptz not null default now()
);

create table if not exists public.org_membros (
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  papel text not null check (papel in ('prestador', 'equipe', 'gerente')),
  setor text not null default '',
  status text not null default 'ativo' check (status in ('convidado', 'ativo', 'revogado')),
  primary key (org_id, user_id)
);

create table if not exists public.convites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  email text not null,
  papel text not null check (papel in ('prestador', 'equipe', 'gerente')),
  setor text not null default '',
  criado_por uuid not null references auth.users (id),
  criado_em timestamptz not null default now(),
  expira_em timestamptz,
  revogado_em timestamptz,
  aceito_por uuid references auth.users (id)
);

create table if not exists public.lancamentos (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  owner_id uuid not null references auth.users (id),
  org_id uuid references public.organizacoes (id),
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
  unique (owner_id, client_id),
  unique (id, owner_id)
);

create table if not exists public.lancamento_valores (
  lancamento_id uuid primary key,
  owner_id uuid not null references auth.users (id),
  valor numeric,
  ajudante numeric,
  foreign key (lancamento_id, owner_id) references public.lancamentos (id, owner_id) on delete cascade
);

create table if not exists public.ajustes_privados (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  quinzenas jsonb not null default '{}'::jsonb,
  descontos jsonb not null default '{}'::jsonb,
  valor_padrao jsonb not null default '{}'::jsonb,
  aliquota jsonb not null default '{}'::jsonb
);

create table if not exists public.pausas (
  id uuid primary key default gen_random_uuid(),
  lancamento_id uuid not null,
  owner_id uuid not null references auth.users (id),
  motivo text not null,
  outro boolean not null default false,
  inicio timestamptz not null,
  fim timestamptz,
  foreign key (lancamento_id, owner_id) references public.lancamentos (id, owner_id) on delete cascade,
  constraint pausa_motivo_do_app check (
    (
      outro = false
      and motivo in (
        'Faltando peça', 'Faltando vidro', 'Problemas elétricos', 'Problemas com vidro',
        'Aguardando etapa anterior', 'Aguardando vidraceiro', 'Aguardando ajuste da produção',
        'Impasse na resolução de um problema', 'Fim de expediente'
      )
    )
    or (
      outro = true
      and char_length(btrim(motivo)) between 1 and 60
      and motivo <> 'Fim de expediente'
    )
  )
);

create table if not exists public.atribuicoes (
  id uuid primary key default gen_random_uuid(),
  lancamento_id uuid not null references public.lancamentos (id) on delete cascade,
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  user_id uuid not null references auth.users (id),
  etapa text not null,
  unique (lancamento_id, user_id, etapa),
  constraint atribuicao_etapa_preenchida check (btrim(etapa) <> '')
);

create table if not exists public.sync_mutacoes (
  mutation_id text primary key,
  user_id uuid not null references auth.users (id),
  sha256 text not null,
  estado text not null check (estado in ('recebida', 'verificada', 'parcial')),
  ids jsonb not null default '[]'::jsonb,
  criado_em timestamptz not null default now()
);

create table if not exists public.vinculos_legado (
  user_id uuid primary key references auth.users (id) on delete cascade,
  sha256 text not null,
  confirmado_em timestamptz not null default now()
);

create table if not exists public.equipes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  nome text not null default 'Equipe de Produção',
  constraint equipe_sem_marca_fixa check (nome !~* 'concept')
);

create table if not exists public.equipe_membros (
  equipe_id uuid not null references public.equipes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  setor text,
  prestador_id uuid references auth.users (id),
  primary key (equipe_id, user_id)
);

create table if not exists public.consentimentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  finalidade text not null,
  versao_texto text not null,
  escopo jsonb not null,
  aceito_em timestamptz not null,
  revogado_em timestamptz
);

-- retido existe só como reserva. O padrão é false e nenhuma policy usa retido.
-- Revogação encerra a visibilidade. Retenção empresarial continua decisão pendente.
create table if not exists public.compartilhamentos (
  id uuid primary key default gen_random_uuid(),
  lancamento_id uuid not null,
  owner_id uuid not null,
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  consentimento_id uuid not null references public.consentimentos (id),
  compartilhado_em timestamptz not null default now(),
  encerrado_em timestamptz,
  retido boolean not null default false,
  foreign key (lancamento_id, owner_id) references public.lancamentos (id, owner_id) on delete cascade
);

create table if not exists public.aparelhos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  aparelho_id text not null,
  status text not null check (status in ('ativo', 'revogado')),
  confirmado_em timestamptz,
  revogado_em timestamptz
);

create table if not exists public.proprietarios (
  user_id uuid primary key references auth.users (id) on delete cascade,
  ativo boolean not null default true,
  bootstrap text not null default 'servidor' check (bootstrap = 'servidor'),
  criado_em timestamptz not null default now()
);

create table if not exists public.solicitacoes_acesso (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  nome text not null default '',
  org_id uuid references public.organizacoes (id),
  papel_pedido text not null check (papel_pedido in ('prestador', 'equipe', 'gerente')),
  status text not null default 'pendente' check (status in ('pendente', 'aprovada', 'recusada', 'suspensa', 'revogada')),
  decidido_por uuid references auth.users (id),
  criado_em timestamptz not null default now()
);

create table if not exists public.licencas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  org_id uuid references public.organizacoes (id),
  tipo text not null check (tipo in ('degustacao', 'licenca_manual')),
  status text not null check (status in ('ativa', 'suspensa', 'revogada')),
  inicio date,
  fim date,
  observacao text not null default ''
);

create table if not exists public.permissoes_org (
  org_id uuid primary key references public.organizacoes (id) on delete cascade,
  pode_gerir_membros boolean not null default false
);

-- Auditoria mínima: ação, ator e id. Sem OS, valor, e-mail ou veículo.
create table if not exists public.auditoria_acesso (
  id uuid primary key default gen_random_uuid(),
  em timestamptz not null default now(),
  ator uuid,
  acao text not null,
  alvo_tipo text not null,
  alvo_id uuid
);

create unique index if not exists gerente_uma_organizacao
  on public.org_membros (user_id)
  where papel = 'gerente' and status = 'ativo';

create unique index if not exists aparelho_ativo_unico
  on public.aparelhos (user_id)
  where status = 'ativo';

create index if not exists compartilhamentos_lancamento_idx on public.compartilhamentos (lancamento_id);
create index if not exists compartilhamentos_org_idx on public.compartilhamentos (org_id);
create index if not exists pausas_lancamento_idx on public.pausas (lancamento_id);
create index if not exists atribuicoes_lancamento_idx on public.atribuicoes (lancamento_id);
create index if not exists atribuicoes_user_idx on public.atribuicoes (user_id);
create index if not exists equipe_membros_user_idx on public.equipe_membros (user_id);
create index if not exists consentimentos_user_idx on public.consentimentos (user_id);
create index if not exists consentimentos_org_idx on public.consentimentos (org_id);

alter table public.perfis enable row level security;
alter table public.organizacoes enable row level security;
alter table public.org_membros enable row level security;
alter table public.convites enable row level security;
alter table public.lancamentos enable row level security;
alter table public.lancamento_valores enable row level security;
alter table public.ajustes_privados enable row level security;
alter table public.pausas enable row level security;
alter table public.atribuicoes enable row level security;
alter table public.sync_mutacoes enable row level security;
alter table public.vinculos_legado enable row level security;
alter table public.equipes enable row level security;
alter table public.equipe_membros enable row level security;
alter table public.consentimentos enable row level security;
alter table public.compartilhamentos enable row level security;
alter table public.aparelhos enable row level security;
alter table public.proprietarios enable row level security;
alter table public.solicitacoes_acesso enable row level security;
alter table public.licencas enable row level security;
alter table public.permissoes_org enable row level security;
alter table public.auditoria_acesso enable row level security;

-- Helpers só no schema private. A policy do usuário autenticado precisa de EXECUTE.
-- anon e public não executam. Não há RPC destes helpers.

create or replace function private.folha_sou_membro(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.org_membros
    where org_id = p_org and user_id = (select auth.uid()) and status = 'ativo'
  );
$$;

create or replace function private.folha_sou_gerente(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.org_membros
    where org_id = p_org and user_id = (select auth.uid()) and papel = 'gerente' and status = 'ativo'
  );
$$;

create or replace function private.folha_sou_proprietario()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.proprietarios where user_id = (select auth.uid()) and ativo
  );
$$;

create or replace function private.folha_auditar(p_acao text, p_alvo_tipo text, p_alvo_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.auditoria_acesso (ator, acao, alvo_tipo, alvo_id)
  values ((select auth.uid()), p_acao, p_alvo_tipo, p_alvo_id);
$$;

create or replace function private.folha_definir_papel(p_org uuid, p_user uuid, p_papel text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'sem sessao';
  end if;
  if p_user = (select auth.uid()) then
    raise exception 'nao pode alterar o proprio papel';
  end if;
  if p_papel not in ('prestador', 'equipe', 'gerente') then
    raise exception 'papel invalido';
  end if;
  if not private.folha_sou_gerente(p_org) then
    raise exception 'somente gerente da organizacao';
  end if;
  if not exists (
    select 1 from public.permissoes_org where org_id = p_org and pode_gerir_membros
  ) then
    raise exception 'proprietario nao autorizou';
  end if;
  if p_papel = 'gerente' and exists (
    select 1 from public.org_membros
    where user_id = p_user and papel = 'gerente' and status = 'ativo' and org_id <> p_org
  ) then
    raise exception 'gerente ja pertence a outra empresa';
  end if;
  update public.org_membros
     set papel = p_papel
   where org_id = p_org and user_id = p_user and status = 'ativo';
  if not found then
    raise exception 'membro ausente nesta organizacao';
  end if;
  perform private.folha_auditar('definir_papel', 'org_membro', p_user);
end;
$$;

create or replace function private.folha_revogar_convite(p_convite uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'sem sessao';
  end if;
  select org_id into v_org from public.convites where id = p_convite;
  if v_org is null then
    raise exception 'convite ausente';
  end if;
  if not private.folha_sou_gerente(v_org) then
    raise exception 'somente gerente da organizacao';
  end if;
  update public.convites set revogado_em = now() where id = p_convite and revogado_em is null;
  perform private.folha_auditar('revogar_convite', 'convite', p_convite);
end;
$$;

create or replace function private.folha_decidir_solicitacao(p_id uuid, p_acao text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if not private.folha_sou_proprietario() then
    raise exception 'somente proprietario';
  end if;
  v_status := case p_acao
    when 'aprovar' then 'aprovada'
    when 'recusar' then 'recusada'
    when 'suspender' then 'suspensa'
    when 'revogar' then 'revogada'
    else null
  end;
  if v_status is null then
    raise exception 'acao invalida';
  end if;
  update public.solicitacoes_acesso
     set status = v_status, decidido_por = (select auth.uid())
   where id = p_id;
  if not found then
    raise exception 'solicitacao ausente';
  end if;
  perform private.folha_auditar('decidir_solicitacao', 'solicitacao', p_id);
end;
$$;

create or replace function private.folha_registrar_licenca(
  p_user uuid, p_org uuid, p_tipo text, p_status text, p_inicio date, p_fim date, p_obs text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.folha_sou_proprietario() then
    raise exception 'somente proprietario';
  end if;
  if p_tipo not in ('degustacao', 'licenca_manual') then
    raise exception 'tipo invalido';
  end if;
  if p_status is not null and p_status not in ('ativa', 'suspensa', 'revogada') then
    raise exception 'status invalido';
  end if;
  insert into public.licencas (user_id, org_id, tipo, status, inicio, fim, observacao)
  values (p_user, p_org, p_tipo, coalesce(p_status, 'ativa'), p_inicio, p_fim, coalesce(p_obs, ''))
  returning id into v_id;
  perform private.folha_auditar('registrar_licenca', 'licenca', v_id);
end;
$$;

create or replace function private.folha_registrar_consentimento(
  p_org uuid, p_finalidade text, p_versao text, p_escopo jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'sem sessao';
  end if;
  if p_finalidade is null or btrim(p_finalidade) = '' or p_versao is null or btrim(p_versao) = '' or p_escopo is null then
    raise exception 'consentimento incompleto';
  end if;
  if not exists (select 1 from public.organizacoes where id = p_org) then
    raise exception 'organizacao ausente';
  end if;
  insert into public.consentimentos (user_id, org_id, finalidade, versao_texto, escopo, aceito_em)
  values ((select auth.uid()), p_org, p_finalidade, p_versao, p_escopo, now())
  returning id into v_id;
  perform private.folha_auditar('registrar_consentimento', 'consentimento', v_id);
  return v_id;
end;
$$;

create or replace function private.folha_compartilhar(p_lancamento uuid, p_org uuid, p_consentimento uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_empresa text;
  v_setor text;
  v_escopo jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'sem sessao';
  end if;
  select empresa, setor into v_empresa, v_setor
    from public.lancamentos
   where id = p_lancamento and owner_id = (select auth.uid());
  if not found then
    raise exception 'lancamento nao e do usuario';
  end if;
  select escopo into v_escopo
    from public.consentimentos
   where id = p_consentimento
     and user_id = (select auth.uid())
     and org_id = p_org
     and revogado_em is null;
  if v_escopo is null then
    raise exception 'sem consentimento';
  end if;
  if not (v_escopo -> 'empresas' ? v_empresa and v_escopo -> 'setores' ? v_setor) then
    raise exception 'fora do escopo';
  end if;
  if btrim(v_setor) = '' then
    raise exception 'setor vazio';
  end if;
  insert into public.compartilhamentos (lancamento_id, owner_id, org_id, consentimento_id, retido)
  values (p_lancamento, (select auth.uid()), p_org, p_consentimento, false)
  returning id into v_id;
  perform private.folha_auditar('compartilhar', 'lancamento', p_lancamento);
  return v_id;
end;
$$;

create or replace function private.folha_revogar_consentimento(p_consentimento uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'sem sessao';
  end if;
  update public.consentimentos
     set revogado_em = now()
   where id = p_consentimento and user_id = (select auth.uid()) and revogado_em is null;
  if not found then
    raise exception 'consentimento ausente';
  end if;
  update public.compartilhamentos
     set encerrado_em = now(), retido = false
   where consentimento_id = p_consentimento and encerrado_em is null;
  perform private.folha_auditar('revogar_consentimento', 'consentimento', p_consentimento);
end;
$$;

create or replace function private.folha_ativar_aparelho(p_aparelho text, p_confirmar boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'sem sessao';
  end if;
  if p_aparelho is null or btrim(p_aparelho) = '' then
    raise exception 'aparelho ausente';
  end if;
  if exists (
    select 1 from public.aparelhos
    where user_id = (select auth.uid()) and status = 'ativo' and aparelho_id = p_aparelho
  ) then
    return;
  end if;
  if exists (
    select 1 from public.aparelhos
    where user_id = (select auth.uid()) and status = 'ativo' and aparelho_id <> p_aparelho
  ) and p_confirmar is not true then
    raise exception 'confirma_revogacao_anterior';
  end if;
  update public.aparelhos
     set status = 'revogado', revogado_em = now()
   where user_id = (select auth.uid()) and status = 'ativo';
  insert into public.aparelhos (user_id, aparelho_id, status, confirmado_em)
  values ((select auth.uid()), p_aparelho, 'ativo', now());
  perform private.folha_auditar('ativar_aparelho', 'aparelho', null);
end;
$$;

create or replace function private.folha_criar_equipe(p_org uuid, p_nome text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_nome text;
begin
  if not private.folha_sou_gerente(p_org) then
    raise exception 'somente gerente da organizacao';
  end if;
  v_nome := coalesce(nullif(btrim(p_nome), ''), 'Equipe de Produção');
  if v_nome ~* 'concept' then
    raise exception 'nome de marca fixo';
  end if;
  insert into public.equipes (org_id, nome) values (p_org, v_nome) returning id into v_id;
  perform private.folha_auditar('criar_equipe', 'equipe', v_id);
  return v_id;
end;
$$;

-- RPC públicas são invoker: não elevam privilégio. Delegam ao private.
-- Helpers sou_* não têm cópia em public.

create or replace function public.folha_definir_papel(p_org uuid, p_user uuid, p_papel text)
returns void language plpgsql security invoker set search_path = ''
as $$ begin perform private.folha_definir_papel(p_org, p_user, p_papel); end $$;

create or replace function public.folha_revogar_convite(p_convite uuid)
returns void language plpgsql security invoker set search_path = ''
as $$ begin perform private.folha_revogar_convite(p_convite); end $$;

create or replace function public.folha_decidir_solicitacao(p_id uuid, p_acao text)
returns void language plpgsql security invoker set search_path = ''
as $$ begin perform private.folha_decidir_solicitacao(p_id, p_acao); end $$;

create or replace function public.folha_registrar_licenca(
  p_user uuid, p_org uuid, p_tipo text, p_status text, p_inicio date, p_fim date, p_obs text
) returns void language plpgsql security invoker set search_path = ''
as $$ begin perform private.folha_registrar_licenca(p_user, p_org, p_tipo, p_status, p_inicio, p_fim, p_obs); end $$;

create or replace function public.folha_registrar_consentimento(
  p_org uuid, p_finalidade text, p_versao text, p_escopo jsonb
) returns uuid language plpgsql security invoker set search_path = ''
as $$ begin return private.folha_registrar_consentimento(p_org, p_finalidade, p_versao, p_escopo); end $$;

create or replace function public.folha_compartilhar(p_lancamento uuid, p_org uuid, p_consentimento uuid)
returns uuid language plpgsql security invoker set search_path = ''
as $$ begin return private.folha_compartilhar(p_lancamento, p_org, p_consentimento); end $$;

create or replace function public.folha_revogar_consentimento(p_consentimento uuid)
returns void language plpgsql security invoker set search_path = ''
as $$ begin perform private.folha_revogar_consentimento(p_consentimento); end $$;

create or replace function public.folha_ativar_aparelho(p_aparelho text, p_confirmar boolean)
returns void language plpgsql security invoker set search_path = ''
as $$ begin perform private.folha_ativar_aparelho(p_aparelho, p_confirmar); end $$;

create or replace function public.folha_criar_equipe(p_org uuid, p_nome text)
returns uuid language plpgsql security invoker set search_path = ''
as $$ begin return private.folha_criar_equipe(p_org, p_nome); end $$;

revoke all on function private.folha_sou_membro(uuid) from public, anon, authenticated;
revoke all on function private.folha_sou_gerente(uuid) from public, anon, authenticated;
revoke all on function private.folha_sou_proprietario() from public, anon, authenticated;
revoke all on function private.folha_auditar(text, text, uuid) from public, anon, authenticated;
revoke all on function private.folha_definir_papel(uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.folha_revogar_convite(uuid) from public, anon, authenticated;
revoke all on function private.folha_decidir_solicitacao(uuid, text) from public, anon, authenticated;
revoke all on function private.folha_registrar_licenca(uuid, uuid, text, text, date, date, text) from public, anon, authenticated;
revoke all on function private.folha_registrar_consentimento(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function private.folha_compartilhar(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.folha_revogar_consentimento(uuid) from public, anon, authenticated;
revoke all on function private.folha_ativar_aparelho(text, boolean) from public, anon, authenticated;
revoke all on function private.folha_criar_equipe(uuid, text) from public, anon, authenticated;

-- authenticated precisa executar o private porque as RPC invoker e as policies chamam essas funções.
-- O schema private não entra na API. anon não executa.
grant execute on function private.folha_sou_membro(uuid) to authenticated;
grant execute on function private.folha_sou_gerente(uuid) to authenticated;
grant execute on function private.folha_sou_proprietario() to authenticated;
grant execute on function private.folha_definir_papel(uuid, uuid, text) to authenticated;
grant execute on function private.folha_revogar_convite(uuid) to authenticated;
grant execute on function private.folha_decidir_solicitacao(uuid, text) to authenticated;
grant execute on function private.folha_registrar_licenca(uuid, uuid, text, text, date, date, text) to authenticated;
grant execute on function private.folha_registrar_consentimento(uuid, text, text, jsonb) to authenticated;
grant execute on function private.folha_compartilhar(uuid, uuid, uuid) to authenticated;
grant execute on function private.folha_revogar_consentimento(uuid) to authenticated;
grant execute on function private.folha_ativar_aparelho(text, boolean) to authenticated;
grant execute on function private.folha_criar_equipe(uuid, text) to authenticated;

revoke all on function public.folha_definir_papel(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.folha_revogar_convite(uuid) from public, anon, authenticated;
revoke all on function public.folha_decidir_solicitacao(uuid, text) from public, anon, authenticated;
revoke all on function public.folha_registrar_licenca(uuid, uuid, text, text, date, date, text) from public, anon, authenticated;
revoke all on function public.folha_registrar_consentimento(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.folha_compartilhar(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.folha_revogar_consentimento(uuid) from public, anon, authenticated;
revoke all on function public.folha_ativar_aparelho(text, boolean) from public, anon, authenticated;
revoke all on function public.folha_criar_equipe(uuid, text) from public, anon, authenticated;

grant execute on function public.folha_definir_papel(uuid, uuid, text) to authenticated;
grant execute on function public.folha_revogar_convite(uuid) to authenticated;
grant execute on function public.folha_decidir_solicitacao(uuid, text) to authenticated;
grant execute on function public.folha_registrar_licenca(uuid, uuid, text, text, date, date, text) to authenticated;
grant execute on function public.folha_registrar_consentimento(uuid, text, text, jsonb) to authenticated;
grant execute on function public.folha_compartilhar(uuid, uuid, uuid) to authenticated;
grant execute on function public.folha_revogar_consentimento(uuid) to authenticated;
grant execute on function public.folha_ativar_aparelho(text, boolean) to authenticated;
grant execute on function public.folha_criar_equipe(uuid, text) to authenticated;

-- Policies. (select auth.uid()) é avaliado uma vez por comando.

drop policy if exists perfis_proprio on public.perfis;
create policy perfis_proprio on public.perfis
  for all to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists organizacoes_ler on public.organizacoes;
create policy organizacoes_ler on public.organizacoes
  for select to authenticated
  using (
    exists (
      select 1 from public.org_membros m
      where m.org_id = organizacoes.id
        and m.user_id = (select auth.uid())
        and m.status = 'ativo'
    )
  );

drop policy if exists membros_ler on public.org_membros;
create policy membros_ler on public.org_membros
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.folha_sou_gerente(org_id)
    or private.folha_sou_membro(org_id)
  );

drop policy if exists convites_ler on public.convites;
create policy convites_ler on public.convites
  for select to authenticated
  using (private.folha_sou_gerente(org_id) or aceito_por = (select auth.uid()));

drop policy if exists lancamentos_ler on public.lancamentos;
create policy lancamentos_ler on public.lancamentos
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    or exists (
      select 1
        from public.compartilhamentos c
        join public.org_membros m
          on m.org_id = c.org_id and m.user_id = (select auth.uid()) and m.status = 'ativo'
       where c.lancamento_id = lancamentos.id
         and c.encerrado_em is null
         and (
           m.papel = 'gerente'
           or (
             m.papel = 'equipe'
             and (
               (btrim(m.setor) <> '' and btrim(lancamentos.setor) <> '' and m.setor = lancamentos.setor)
               or exists (
                 select 1 from public.atribuicoes a
                 where a.lancamento_id = lancamentos.id
                   and a.user_id = (select auth.uid())
                   and btrim(a.etapa) <> ''
               )
               or exists (
                 select 1
                   from public.equipe_membros em
                   join public.equipes eq on eq.id = em.equipe_id and eq.org_id = c.org_id
                  where em.user_id = (select auth.uid())
                    and (
                      (em.setor is not null and btrim(em.setor) <> '' and btrim(lancamentos.setor) <> '' and em.setor = lancamentos.setor)
                      or em.prestador_id = lancamentos.owner_id
                    )
               )
             )
           )
         )
    )
  );

drop policy if exists lancamentos_gravar on public.lancamentos;
create policy lancamentos_gravar on public.lancamentos
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (
      org_id is null
      or exists (
        select 1 from public.org_membros m
        where m.org_id = lancamentos.org_id
          and m.user_id = (select auth.uid())
          and m.status = 'ativo'
      )
    )
  );

drop policy if exists lancamentos_atualizar on public.lancamentos;
create policy lancamentos_atualizar on public.lancamentos
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and (
      org_id is null
      or exists (
        select 1 from public.org_membros m
        where m.org_id = lancamentos.org_id
          and m.user_id = (select auth.uid())
          and m.status = 'ativo'
      )
    )
  );

drop policy if exists valores_dono on public.lancamento_valores;
create policy valores_dono on public.lancamento_valores
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.lancamentos l
      where l.id = lancamento_valores.lancamento_id
        and l.owner_id = (select auth.uid())
    )
  );

drop policy if exists ajustes_dono on public.ajustes_privados;
create policy ajustes_dono on public.ajustes_privados
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists pausas_ler on public.pausas;
create policy pausas_ler on public.pausas
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    or exists (
      select 1 from public.lancamentos l
      where l.id = pausas.lancamento_id
    )
  );

drop policy if exists pausas_dono on public.pausas;
create policy pausas_dono on public.pausas
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.lancamentos l
      where l.id = pausas.lancamento_id and l.owner_id = (select auth.uid())
    )
  );

drop policy if exists pausas_atualizar on public.pausas;
create policy pausas_atualizar on public.pausas
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.lancamentos l
      where l.id = pausas.lancamento_id and l.owner_id = (select auth.uid())
    )
  );

drop policy if exists atribuicoes_ler on public.atribuicoes;
create policy atribuicoes_ler on public.atribuicoes
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.folha_sou_gerente(org_id)
  );

drop policy if exists sync_proprio on public.sync_mutacoes;
create policy sync_proprio on public.sync_mutacoes
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists legado_proprio on public.vinculos_legado;
create policy legado_proprio on public.vinculos_legado
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists equipes_ler on public.equipes;
create policy equipes_ler on public.equipes
  for select to authenticated
  using (private.folha_sou_membro(org_id));

drop policy if exists equipe_membros_ler on public.equipe_membros;
create policy equipe_membros_ler on public.equipe_membros
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.equipes eq
      where eq.id = equipe_membros.equipe_id and private.folha_sou_gerente(eq.org_id)
    )
  );

drop policy if exists consentimento_proprio on public.consentimentos;
create policy consentimento_proprio on public.consentimentos
  for select to authenticated
  using (user_id = (select auth.uid()) or private.folha_sou_gerente(org_id));

drop policy if exists aparelho_proprio on public.aparelhos;
create policy aparelho_proprio on public.aparelhos
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists compartilhamento_ler on public.compartilhamentos;
create policy compartilhamento_ler on public.compartilhamentos
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    or exists (
      select 1 from public.org_membros m
      where m.org_id = compartilhamentos.org_id
        and m.user_id = (select auth.uid())
        and m.status = 'ativo'
    )
  );

drop policy if exists proprietario_le_a_si on public.proprietarios;
create policy proprietario_le_a_si on public.proprietarios
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists solicitacao_proprietario on public.solicitacoes_acesso;
create policy solicitacao_proprietario on public.solicitacoes_acesso
  for select to authenticated
  using (private.folha_sou_proprietario());

drop policy if exists licenca_leitura on public.licencas;
create policy licenca_leitura on public.licencas
  for select to authenticated
  using (user_id = (select auth.uid()) or private.folha_sou_proprietario());

drop policy if exists permissao_leitura on public.permissoes_org;
create policy permissao_leitura on public.permissoes_org
  for select to authenticated
  using (private.folha_sou_proprietario() or private.folha_sou_gerente(org_id));

drop policy if exists auditoria_leitura on public.auditoria_acesso;
create policy auditoria_leitura on public.auditoria_acesso
  for select to authenticated
  using (ator = (select auth.uid()) or private.folha_sou_proprietario());

drop view if exists public.v_producao_sem_valor;
create view public.v_producao_sem_valor
with (security_invoker = true) as
select id, client_id, owner_id, org_id, empresa, setor, os, veiculo,
       data_inicio, data_termino, situacao, atualizado_em
  from public.lancamentos;

revoke all on all tables in schema public from public, anon, authenticated;
grant select, insert, update, delete on
  public.perfis,
  public.lancamentos,
  public.lancamento_valores,
  public.pausas,
  public.ajustes_privados,
  public.vinculos_legado
to authenticated;
grant select on
  public.organizacoes,
  public.org_membros,
  public.convites,
  public.atribuicoes,
  public.sync_mutacoes,
  public.equipes,
  public.equipe_membros,
  public.consentimentos,
  public.compartilhamentos,
  public.aparelhos,
  public.proprietarios,
  public.solicitacoes_acesso,
  public.licencas,
  public.permissoes_org,
  public.auditoria_acesso,
  public.v_producao_sem_valor
to authenticated;
