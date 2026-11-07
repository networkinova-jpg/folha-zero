-- Folha Zero: esquema proposto. Não foi aplicado. Não existe projeto Supabase.
-- Quando Ricardo autorizar a criação: somente plano Free, titular Ricardo, região sa-east-1.
-- Fora desta proposta: Pro, PITR, cartão, addon e upgrade.
-- O Free não é produção sem limite nem backup gerenciado.
-- Sem service_role, sem senha, sem URL, sem SMTP e sem credencial.
-- Dados de exemplo ficam em fixtures.sql e são fictícios. Não entram no app pessoal.

create extension if not exists pgcrypto;

-- Módulo individual: prestador, pode atender várias empresas clientes.
-- Módulo único Gestão de Produção: equipe e gerente.
-- Cada conta gerente pertence a uma só organização. Outra empresa exige outra conta.
-- Não há seletor de várias empresas para o gerente.
-- Equipe de Produção é nome genérico. Não fixar Concept nem outra marca.

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

-- Motivos iguais aos do app: lista oficial, Outro motivo (texto livre) e Fim de expediente.
-- Não há taxonomia substituta (insumo, pessoal etc.).
create table if not exists pausas (
  id uuid primary key default gen_random_uuid(),
  lancamento_id uuid not null references lancamentos (id) on delete cascade,
  owner_id uuid not null references auth.users (id),
  motivo text not null,
  outro boolean not null default false,
  inicio timestamptz not null,
  fim timestamptz,
  constraint pausa_motivo_do_app check (
    (
      outro = false
      and motivo in (
        'Faltando peça',
        'Faltando vidro',
        'Problemas elétricos',
        'Problemas com vidro',
        'Aguardando etapa anterior',
        'Aguardando vidraceiro',
        'Aguardando ajuste da produção',
        'Impasse na resolução de um problema',
        'Fim de expediente'
      )
    )
    or (
      outro = true
      and char_length(btrim(motivo)) between 1 and 60
      and motivo <> 'Fim de expediente'
    )
  )
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

-- Nome genérico. A restrição impede cravar Concept no nome da equipe.
create table if not exists equipes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizacoes (id) on delete cascade,
  nome text not null default 'Equipe de Produção',
  constraint equipe_sem_marca_fixa check (nome !~* 'concept')
);

create table if not exists equipe_membros (
  equipe_id uuid not null references equipes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  setor text,
  prestador_id uuid references auth.users (id),
  primary key (equipe_id, user_id)
);

-- Consentimento informado antes de compartilhar. Guarda finalidade, versão, data e escopo.
create table if not exists consentimentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  org_id uuid not null references organizacoes (id) on delete cascade,
  finalidade text not null,
  versao_texto text not null,
  escopo jsonb not null,
  aceito_em timestamptz not null,
  revogado_em timestamptz
);

-- Produção já entregue pode ficar retida. Revogar não promete apagar tudo.
-- Valor privado não entra nesta tabela.
create table if not exists compartilhamentos (
  id uuid primary key default gen_random_uuid(),
  lancamento_id uuid not null references lancamentos (id) on delete cascade,
  org_id uuid not null references organizacoes (id) on delete cascade,
  consentimento_id uuid not null references consentimentos (id),
  compartilhado_em timestamptz not null default now(),
  encerrado_em timestamptz,
  retido boolean not null default true
);

-- Uma sessão ativa por conta, no servidor. Não apaga o folhazero_v1 do aparelho.
-- Aparelho offline só perde a nuvem quando voltar a falar com o servidor.
create table if not exists aparelhos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  aparelho_id text not null,
  status text not null check (status in ('ativo', 'revogado')),
  confirmado_em timestamptz,
  revogado_em timestamptz
);

create unique index if not exists gerente_uma_organizacao
  on org_membros (user_id)
  where papel = 'gerente' and status = 'ativo';

create unique index if not exists aparelho_ativo_unico
  on aparelhos (user_id)
  where status = 'ativo';

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
alter table equipes enable row level security;
alter table equipe_membros enable row level security;
alter table consentimentos enable row level security;
alter table compartilhamentos enable row level security;
alter table aparelhos enable row level security;

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
  if p_papel = 'gerente' and exists (
    select 1 from org_membros
    where user_id = p_user and papel = 'gerente' and status = 'ativo' and org_id <> p_org
  ) then
    raise exception 'gerente ja pertence a outra empresa';
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

-- Dono sempre lê o próprio lançamento, compartilhado ou não.
-- Gerente lê só produção compartilhada da única organização dele.
-- Equipe lê o setor, o prestador ou a equipe que o gerente atribuiu, também só se compartilhado.
-- Sem compartilhamento não há leitura de terceiros. Valor continua na outra tabela.
create policy lancamentos_ler on lancamentos
  for select to authenticated
  using (
    owner_id = auth.uid()
    or exists (
      select 1
        from compartilhamentos c
        join org_membros m on m.org_id = c.org_id and m.user_id = auth.uid() and m.status = 'ativo'
       where c.lancamento_id = lancamentos.id
         and (c.encerrado_em is null or c.retido)
         and (
           m.papel = 'gerente'
           or (
             m.papel = 'equipe'
             and (
               m.setor = lancamentos.setor
               or exists (
                 select 1 from atribuicoes a
                 where a.lancamento_id = lancamentos.id and a.user_id = auth.uid()
               )
               or exists (
                 select 1
                   from equipe_membros em
                   join equipes eq on eq.id = em.equipe_id and eq.org_id = c.org_id
                  where em.user_id = auth.uid()
                    and (em.setor = lancamentos.setor or em.prestador_id = lancamentos.owner_id)
               )
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
      select 1
        from lancamentos l
        join compartilhamentos c on c.lancamento_id = l.id
        join org_membros m on m.org_id = c.org_id and m.user_id = auth.uid() and m.status = 'ativo'
       where l.id = pausas.lancamento_id
         and (c.encerrado_em is null or c.retido)
         and (
           m.papel = 'gerente'
           or (
             m.papel = 'equipe'
             and (
               m.setor = l.setor
               or exists (select 1 from atribuicoes a where a.lancamento_id = l.id and a.user_id = auth.uid())
               or exists (
                 select 1 from equipe_membros em
                 join equipes eq on eq.id = em.equipe_id and eq.org_id = c.org_id
                 where em.user_id = auth.uid()
                   and (em.setor = l.setor or em.prestador_id = l.owner_id)
               )
             )
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

-- Consentimento e aparelho: só a própria pessoa lê. Escrita passa por função, não por INSERT solto.
create policy consentimento_proprio on consentimentos
  for select to authenticated
  using (user_id = auth.uid() or folha_sou_gerente(org_id));

create policy aparelho_proprio on aparelhos
  for select to authenticated
  using (user_id = auth.uid());

create policy compartilhamento_ler on compartilhamentos
  for select to authenticated
  using (
    folha_sou_gerente(org_id)
    or exists (select 1 from lancamentos l where l.id = compartilhamentos.lancamento_id and l.owner_id = auth.uid())
  );

revoke insert, update, delete on consentimentos from anon, authenticated;
revoke insert, update, delete on compartilhamentos from anon, authenticated;
revoke insert, update, delete on aparelhos from anon, authenticated;
revoke insert, update, delete on equipes from anon, authenticated;
revoke insert, update, delete on equipe_membros from anon, authenticated;
grant select on equipes, equipe_membros, consentimentos, compartilhamentos, aparelhos to authenticated;

-- Produtividade sem colunas de dinheiro. security invoker: respeita a RLS de lancamentos.
create or replace view v_producao_sem_valor
with (security_invoker = true) as
select id, client_id, owner_id, org_id, empresa, setor, os, veiculo,
       data_inicio, data_termino, situacao, atualizado_em
  from lancamentos;
