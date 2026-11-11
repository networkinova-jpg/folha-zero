-- Painel do proprietário. Não aplicar nesta etapa.
-- Não altera copias_conta, backups_teste_app nem o documento dos lançamentos.
-- A lista de donos fica no schema private. O comando de inclusão fica comentado
-- de propósito: o uid real entra só na hora de aplicar, preenchido à mão.

create table if not exists private.painel_donos (
  user_id uuid primary key,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

revoke all on table private.painel_donos from public, anon, authenticated;

-- Exemplo, não executar com um uid inventado:
-- insert into private.painel_donos (user_id)
-- values ('COLOQUE_O_UID_DO_GOOGLE_DO_RICARDO');

create or replace function private.painel_sou_dono()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.painel_donos
    where user_id = auth.uid() and ativo
  );
$$;

create or replace function private.painel_email_sessao()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  bruto text;
  claims text;
begin
  bruto := nullif(pg_catalog.btrim(current_setting('request.jwt.claim.email', true)), '');
  if bruto is null then
    claims := nullif(current_setting('request.jwt.claims', true), '');
    if claims is not null then
      begin
        bruto := nullif(pg_catalog.btrim(claims::jsonb ->> 'email'), '');
      exception when others then
        bruto := null;
      end;
    end if;
  end if;
  if bruto is null then
    return null;
  end if;
  return lower(bruto);
end;
$$;

create or replace function private.painel_exigir_dono()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'sessao_ausente' using errcode = '42501';
  end if;
  if not private.painel_sou_dono() then
    raise exception 'nao_proprietario' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.painel_sou_dono() from public, anon, authenticated;
revoke all on function private.painel_email_sessao() from public, anon, authenticated;
revoke all on function private.painel_exigir_dono() from public, anon, authenticated;
grant execute on function private.painel_sou_dono() to authenticated;
grant execute on function private.painel_email_sessao() to authenticated;
grant execute on function private.painel_exigir_dono() to authenticated;

create table if not exists public.painel_empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  gerente_email text,
  gerente_user_id uuid references auth.users (id),
  status text not null default 'ativo' check (status in ('ativo', 'suspenso', 'revogado')),
  criado_em timestamptz not null default now(),
  constraint painel_empresas_sem_inova check (lower(btrim(nome)) <> 'inova blindagem')
);

create table if not exists public.painel_convites (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  email text not null,
  tipo text not null check (tipo in ('avulso', 'gerente')),
  empresa_id uuid references public.painel_empresas (id),
  status text not null default 'rascunho' check (status in ('rascunho', 'aceito', 'expirado', 'cancelado')),
  criado_por uuid not null references auth.users (id),
  criado_em timestamptz not null default now(),
  aceito_por uuid references auth.users (id),
  aceito_em timestamptz
);

create table if not exists public.painel_pedidos (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  nome text not null default '',
  tipo text not null check (tipo in ('avulso', 'empresa')),
  empresa_id uuid references public.painel_empresas (id),
  user_id uuid references auth.users (id),
  status text not null default 'pendente' check (status in ('pendente', 'aprovado', 'recusado')),
  criado_em timestamptz not null default now(),
  decidido_por uuid references auth.users (id)
);

create table if not exists public.painel_contas (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  nome text not null default '',
  tipo text not null check (tipo in ('avulso', 'gerente')),
  empresa_id uuid references public.painel_empresas (id),
  status text not null default 'ativo' check (status in ('ativo', 'suspenso', 'revogado'))
);

create table if not exists public.painel_degustacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  empresa_id uuid references public.painel_empresas (id) on delete cascade,
  inicio date not null,
  fim date not null,
  status text not null check (status in ('ativa', 'encerrada')),
  check (fim >= inicio)
);

create table if not exists public.painel_licencas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  empresa_id uuid references public.painel_empresas (id) on delete cascade,
  inicio date not null,
  validade date not null,
  status text not null check (status in ('ativa', 'suspensa', 'revogada', 'vencida')),
  check (validade >= inicio)
);

alter table public.painel_empresas enable row level security;
alter table public.painel_convites enable row level security;
alter table public.painel_pedidos enable row level security;
alter table public.painel_contas enable row level security;
alter table public.painel_degustacoes enable row level security;
alter table public.painel_licencas enable row level security;

revoke all on table public.painel_empresas from public, anon, authenticated;
revoke all on table public.painel_convites from public, anon, authenticated;
revoke all on table public.painel_pedidos from public, anon, authenticated;
revoke all on table public.painel_contas from public, anon, authenticated;
revoke all on table public.painel_degustacoes from public, anon, authenticated;
revoke all on table public.painel_licencas from public, anon, authenticated;

create or replace function private.painel_codigo()
returns text
language sql
volatile
set search_path = ''
as $$
  select lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
$$;

revoke all on function private.painel_codigo() from public, anon, authenticated;

create or replace function private.painel_eu()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'sessao_ausente' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'dono', private.painel_sou_dono(),
    'email', private.painel_email_sessao()
  );
end;
$$;

create or replace function private.painel_resumo()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pedidos integer;
  avulsos integer;
  empresas integer;
  vencem integer;
begin
  perform private.painel_exigir_dono();
  select count(*) into pedidos from public.painel_pedidos where status = 'pendente';
  select count(*) into avulsos from public.painel_contas where tipo = 'avulso';
  select count(*) into empresas from public.painel_empresas where lower(btrim(nome)) <> 'inova blindagem';
  select count(*) into vencem from (
    select fim as dia from public.painel_degustacoes
    where status = 'ativa' and fim >= current_date and fim <= current_date + 7
    union all
    select validade from public.painel_licencas
    where status = 'ativa' and validade >= current_date and validade <= current_date + 7
  ) prazos;
  return jsonb_build_object(
    'pedidos', pedidos,
    'avulsos', avulsos,
    'empresas', empresas,
    'vencem_7_dias', vencem
  );
end;
$$;

create or replace function private.painel_listar_pedidos()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.painel_exigir_dono();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', id, 'email', email, 'nome', nome, 'tipo', tipo, 'status', status, 'criado_em', criado_em
    ) order by criado_em)
    from public.painel_pedidos
  ), '[]'::jsonb);
end;
$$;

create or replace function private.painel_listar_avulsos()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.painel_exigir_dono();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', c.user_id,
      'email', c.email,
      'nome', c.nome,
      'status', c.status,
      'degustacao_fim', d.fim,
      'degustacao_status', d.status,
      'licenca_validade', l.validade,
      'licenca_status', l.status,
      'copia_existe', copia.existe,
      'copia_atualizado_em', copia.atualizado_em,
      'copia_bytes', copia.bytes,
      'copia_revisao', copia.revisao
    ) order by c.email)
    from public.painel_contas c
    left join lateral (
      select fim, status from public.painel_degustacoes
      where user_id = c.user_id
      order by fim desc
      limit 1
    ) d on true
    left join lateral (
      select validade, status from public.painel_licencas
      where user_id = c.user_id
      order by validade desc
      limit 1
    ) l on true
    left join lateral (
      select true as existe, atualizado_em, bytes, revisao
      from public.copias_conta
      where owner_id = c.user_id
    ) copia on true
    where c.tipo = 'avulso'
  ), '[]'::jsonb);
end;
$$;

create or replace function private.painel_listar_empresas()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.painel_exigir_dono();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id,
      'nome', e.nome,
      'gerente_email', e.gerente_email,
      'status', e.status,
      'licenca_validade', l.validade,
      'licenca_status', l.status
    ) order by e.nome)
    from public.painel_empresas e
    left join lateral (
      select validade, status from public.painel_licencas
      where empresa_id = e.id
      order by validade desc
      limit 1
    ) l on true
    where lower(btrim(e.nome)) <> 'inova blindagem'
  ), '[]'::jsonb);
end;
$$;

create or replace function private.painel_listar_convites()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.painel_exigir_dono();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', id, 'codigo', codigo, 'email', email, 'tipo', tipo, 'status', status, 'criado_em', criado_em
    ) order by criado_em desc)
    from public.painel_convites
  ), '[]'::jsonb);
end;
$$;

create or replace function private.painel_ficha_copia(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  linha record;
begin
  perform private.painel_exigir_dono();
  select atualizado_em, bytes, revisao
    into linha
  from public.copias_conta
  where owner_id = p_user;
  if not found then
    return jsonb_build_object('existe', false, 'atualizado_em', null, 'bytes', null, 'revisao', null);
  end if;
  return jsonb_build_object(
    'existe', true,
    'atualizado_em', linha.atualizado_em,
    'bytes', linha.bytes,
    'revisao', linha.revisao
  );
end;
$$;

create or replace function private.painel_criar_convite(p_email text, p_tipo text, p_empresa uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  novo text;
  mail text := lower(btrim(coalesce(p_email, '')));
begin
  perform private.painel_exigir_dono();
  if p_tipo not in ('avulso', 'gerente') or mail !~ '^[^@\s]+@[^@\s]+$' then
    raise exception 'convite_invalido' using errcode = '23514';
  end if;
  novo := private.painel_codigo();
  insert into public.painel_convites (codigo, email, tipo, empresa_id, criado_por)
  values (novo, mail, p_tipo, p_empresa, auth.uid());
  return jsonb_build_object('ok', true, 'codigo', novo, 'status', 'rascunho');
end;
$$;

create or replace function private.painel_aceitar_convite(p_codigo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  convite public.painel_convites%rowtype;
  mail text := private.painel_email_sessao();
  alvo text := lower(btrim(coalesce(p_codigo, '')));
  pedido uuid;
begin
  if auth.uid() is null then
    raise exception 'sessao_ausente' using errcode = '42501';
  end if;
  if mail is null then
    raise exception 'sessao_sem_email' using errcode = '42501';
  end if;
  select * into convite
  from public.painel_convites
  where painel_convites.codigo = alvo
  for update;
  if not found or convite.status <> 'rascunho' then
    raise exception 'convite_indisponivel' using errcode = '23514';
  end if;
  if convite.email <> mail then
    raise exception 'email_diferente' using errcode = '42501';
  end if;
  update public.painel_convites
  set status = 'aceito', aceito_por = auth.uid(), aceito_em = now()
  where id = convite.id;
  insert into public.painel_pedidos (email, nome, tipo, empresa_id, user_id)
  values (mail, mail, case when convite.tipo = 'gerente' then 'empresa' else 'avulso' end, convite.empresa_id, auth.uid())
  returning id into pedido;
  return jsonb_build_object('ok', true, 'pedido', pedido, 'status', 'pendente');
end;
$$;

create or replace function private.painel_decidir_pedido(p_pedido uuid, p_aprovar boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pedido public.painel_pedidos%rowtype;
begin
  perform private.painel_exigir_dono();
  select * into pedido from public.painel_pedidos where id = p_pedido for update;
  if not found or pedido.status <> 'pendente' then
    raise exception 'pedido_indisponivel' using errcode = '23514';
  end if;
  if p_aprovar is not true then
    update public.painel_pedidos set status = 'recusado', decidido_por = auth.uid() where id = pedido.id;
    return jsonb_build_object('ok', true, 'status', 'recusado');
  end if;
  update public.painel_pedidos set status = 'aprovado', decidido_por = auth.uid() where id = pedido.id;
  insert into public.painel_contas (user_id, email, nome, tipo, empresa_id, status)
  values (
    pedido.user_id,
    pedido.email,
    pedido.nome,
    case when pedido.tipo = 'empresa' then 'gerente' else 'avulso' end,
    pedido.empresa_id,
    'ativo'
  )
  on conflict (user_id) do update
  set status = 'ativo', tipo = excluded.tipo, empresa_id = excluded.empresa_id;
  if pedido.tipo = 'empresa' and pedido.empresa_id is not null then
    update public.painel_empresas
    set gerente_user_id = pedido.user_id, gerente_email = pedido.email
    where id = pedido.empresa_id;
  end if;
  return jsonb_build_object('ok', true, 'status', 'aprovado');
end;
$$;

create or replace function private.painel_degustar_avulso(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  fim date := current_date + 20;
begin
  perform private.painel_exigir_dono();
  if not exists (select 1 from public.painel_contas where user_id = p_user and tipo = 'avulso') then
    raise exception 'avulso_ausente' using errcode = '23514';
  end if;
  update public.painel_degustacoes set status = 'encerrada' where user_id = p_user and status = 'ativa';
  insert into public.painel_degustacoes (user_id, inicio, fim, status)
  values (p_user, current_date, fim, 'ativa');
  return jsonb_build_object('ok', true, 'fim', fim, 'status', 'ativa');
end;
$$;

create or replace function private.painel_licenciar_avulso(p_user uuid, p_validade date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.painel_exigir_dono();
  if p_validade is null or p_validade < current_date then
    raise exception 'validade_invalida' using errcode = '23514';
  end if;
  if not exists (select 1 from public.painel_contas where user_id = p_user and tipo = 'avulso') then
    raise exception 'avulso_ausente' using errcode = '23514';
  end if;
  update public.painel_licencas set status = 'revogada' where user_id = p_user and status = 'ativa';
  insert into public.painel_licencas (user_id, inicio, validade, status)
  values (p_user, current_date, p_validade, 'ativa');
  return jsonb_build_object('ok', true, 'validade', p_validade, 'status', 'ativa');
end;
$$;

create or replace function private.painel_situacao_avulso(p_user uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.painel_exigir_dono();
  if p_status not in ('ativo', 'suspenso', 'revogado') then
    raise exception 'status_invalido' using errcode = '23514';
  end if;
  update public.painel_contas set status = p_status where user_id = p_user and tipo = 'avulso';
  if not found then
    raise exception 'avulso_ausente' using errcode = '23514';
  end if;
  return jsonb_build_object('ok', true, 'status', p_status);
end;
$$;

create or replace function private.painel_criar_empresa(p_nome text, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  nome text := btrim(coalesce(p_nome, ''));
  mail text := lower(btrim(coalesce(p_email, '')));
  empresa uuid;
  codigo text;
begin
  perform private.painel_exigir_dono();
  if nome = '' or lower(nome) = 'inova blindagem' then
    raise exception 'empresa_de_teste' using errcode = '23514';
  end if;
  if mail !~ '^[^@\s]+@[^@\s]+$' then
    raise exception 'convite_invalido' using errcode = '23514';
  end if;
  insert into public.painel_empresas (nome, gerente_email, status)
  values (nome, mail, 'ativo')
  returning id into empresa;
  codigo := private.painel_codigo();
  insert into public.painel_convites (codigo, email, tipo, empresa_id, criado_por)
  values (codigo, mail, 'gerente', empresa, auth.uid());
  return jsonb_build_object('ok', true, 'empresa', empresa, 'codigo', codigo, 'status', 'ativo');
end;
$$;

create or replace function private.painel_licenciar_empresa(p_empresa uuid, p_validade date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.painel_exigir_dono();
  if p_validade is null or p_validade < current_date then
    raise exception 'validade_invalida' using errcode = '23514';
  end if;
  if not exists (select 1 from public.painel_empresas where id = p_empresa and lower(btrim(nome)) <> 'inova blindagem') then
    raise exception 'empresa_ausente' using errcode = '23514';
  end if;
  update public.painel_licencas set status = 'revogada' where empresa_id = p_empresa and status = 'ativa';
  insert into public.painel_licencas (empresa_id, inicio, validade, status)
  values (p_empresa, current_date, p_validade, 'ativa');
  return jsonb_build_object('ok', true, 'validade', p_validade, 'status', 'ativa');
end;
$$;

create or replace function private.painel_situacao_empresa(p_empresa uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.painel_exigir_dono();
  if p_status not in ('ativo', 'suspenso', 'revogado') then
    raise exception 'status_invalido' using errcode = '23514';
  end if;
  update public.painel_empresas set status = p_status
  where id = p_empresa and lower(btrim(nome)) <> 'inova blindagem';
  if not found then
    raise exception 'empresa_ausente' using errcode = '23514';
  end if;
  return jsonb_build_object('ok', true, 'status', p_status);
end;
$$;

create or replace function private.painel_minha_licenca()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  conta text;
  deg_status text;
  deg_fim date;
  lic_status text;
  lic_fim date;
begin
  if auth.uid() is null then
    raise exception 'sessao_ausente' using errcode = '42501';
  end if;
  select status into conta from public.painel_contas where user_id = auth.uid();
  select status, fim into deg_status, deg_fim
  from public.painel_degustacoes
  where user_id = auth.uid()
  order by fim desc
  limit 1;
  select status, validade into lic_status, lic_fim
  from public.painel_licencas
  where user_id = auth.uid()
  order by validade desc
  limit 1;
  return jsonb_build_object(
    'conta', conta,
    'degustacao', deg_status,
    'degustacao_fim', deg_fim,
    'licenca', lic_status,
    'licenca_validade', lic_fim
  );
end;
$$;

revoke all on function private.painel_eu() from public, anon;
revoke all on function private.painel_resumo() from public, anon;
revoke all on function private.painel_listar_pedidos() from public, anon;
revoke all on function private.painel_listar_avulsos() from public, anon;
revoke all on function private.painel_listar_empresas() from public, anon;
revoke all on function private.painel_listar_convites() from public, anon;
revoke all on function private.painel_ficha_copia(uuid) from public, anon;
revoke all on function private.painel_criar_convite(text, text, uuid) from public, anon;
revoke all on function private.painel_aceitar_convite(text) from public, anon;
revoke all on function private.painel_decidir_pedido(uuid, boolean) from public, anon;
revoke all on function private.painel_degustar_avulso(uuid) from public, anon;
revoke all on function private.painel_licenciar_avulso(uuid, date) from public, anon;
revoke all on function private.painel_situacao_avulso(uuid, text) from public, anon;
revoke all on function private.painel_criar_empresa(text, text) from public, anon;
revoke all on function private.painel_licenciar_empresa(uuid, date) from public, anon;
revoke all on function private.painel_situacao_empresa(uuid, text) from public, anon;
revoke all on function private.painel_minha_licenca() from public, anon;

grant execute on function private.painel_eu() to authenticated;
grant execute on function private.painel_resumo() to authenticated;
grant execute on function private.painel_listar_pedidos() to authenticated;
grant execute on function private.painel_listar_avulsos() to authenticated;
grant execute on function private.painel_listar_empresas() to authenticated;
grant execute on function private.painel_listar_convites() to authenticated;
grant execute on function private.painel_ficha_copia(uuid) to authenticated;
grant execute on function private.painel_criar_convite(text, text, uuid) to authenticated;
grant execute on function private.painel_aceitar_convite(text) to authenticated;
grant execute on function private.painel_decidir_pedido(uuid, boolean) to authenticated;
grant execute on function private.painel_degustar_avulso(uuid) to authenticated;
grant execute on function private.painel_licenciar_avulso(uuid, date) to authenticated;
grant execute on function private.painel_situacao_avulso(uuid, text) to authenticated;
grant execute on function private.painel_criar_empresa(text, text) to authenticated;
grant execute on function private.painel_licenciar_empresa(uuid, date) to authenticated;
grant execute on function private.painel_situacao_empresa(uuid, text) to authenticated;
grant execute on function private.painel_minha_licenca() to authenticated;

create or replace function public.painel_eu()
returns jsonb language plpgsql security invoker set search_path = ''
as $$ begin return private.painel_eu(); end; $$;

create or replace function public.painel_resumo()
returns jsonb language plpgsql security invoker set search_path = ''
as $$ begin return private.painel_resumo(); end; $$;

create or replace function public.painel_listar_pedidos()
returns jsonb language plpgsql security invoker set search_path = ''
as $$ begin return private.painel_listar_pedidos(); end; $$;

create or replace function public.painel_listar_avulsos()
returns jsonb language plpgsql security invoker set search_path = ''
as $$ begin return private.painel_listar_avulsos(); end; $$;

create or replace function public.painel_listar_empresas()
returns jsonb language plpgsql security invoker set search_path = ''
as $$ begin return private.painel_listar_empresas(); end; $$;

create or replace function public.painel_listar_convites()
returns jsonb language plpgsql security invoker set search_path = ''
as $$ begin return private.painel_listar_convites(); end; $$;

create or replace function public.painel_ficha_copia(p_user uuid)
returns jsonb language plpgsql security invoker set search_path = ''
as $$ begin return private.painel_ficha_copia(p_user); end; $$;

create or replace function public.painel_criar_convite(p_email text, p_tipo text, p_empresa uuid)
returns jsonb language plpgsql security invoker set search_path = ''
as $$ begin return private.painel_criar_convite(p_email, p_tipo, p_empresa); end; $$;

create or replace function public.painel_aceitar_convite(p_codigo text)
returns jsonb language plpgsql security invoker set search_path = ''
as $$ begin return private.painel_aceitar_convite(p_codigo); end; $$;

create or replace function public.painel_decidir_pedido(p_pedido uuid, p_aprovar boolean)
returns jsonb language plpgsql security invoker set search_path = ''
as $$ begin return private.painel_decidir_pedido(p_pedido, p_aprovar); end; $$;

create or replace function public.painel_degustar_avulso(p_user uuid)
returns jsonb language plpgsql security invoker set search_path = ''
as $$ begin return private.painel_degustar_avulso(p_user); end; $$;

create or replace function public.painel_licenciar_avulso(p_user uuid, p_validade date)
returns jsonb language plpgsql security invoker set search_path = ''
as $$ begin return private.painel_licenciar_avulso(p_user, p_validade); end; $$;

create or replace function public.painel_situacao_avulso(p_user uuid, p_status text)
returns jsonb language plpgsql security invoker set search_path = ''
as $$ begin return private.painel_situacao_avulso(p_user, p_status); end; $$;

create or replace function public.painel_criar_empresa(p_nome text, p_email text)
returns jsonb language plpgsql security invoker set search_path = ''
as $$ begin return private.painel_criar_empresa(p_nome, p_email); end; $$;

create or replace function public.painel_licenciar_empresa(p_empresa uuid, p_validade date)
returns jsonb language plpgsql security invoker set search_path = ''
as $$ begin return private.painel_licenciar_empresa(p_empresa, p_validade); end; $$;

create or replace function public.painel_situacao_empresa(p_empresa uuid, p_status text)
returns jsonb language plpgsql security invoker set search_path = ''
as $$ begin return private.painel_situacao_empresa(p_empresa, p_status); end; $$;

create or replace function public.painel_minha_licenca()
returns jsonb language plpgsql security invoker set search_path = ''
as $$ begin return private.painel_minha_licenca(); end; $$;

do $$
declare
  nome text;
begin
  foreach nome in array array[
    'painel_eu()',
    'painel_resumo()',
    'painel_listar_pedidos()',
    'painel_listar_avulsos()',
    'painel_listar_empresas()',
    'painel_listar_convites()',
    'painel_ficha_copia(uuid)',
    'painel_criar_convite(text,text,uuid)',
    'painel_aceitar_convite(text)',
    'painel_decidir_pedido(uuid,boolean)',
    'painel_degustar_avulso(uuid)',
    'painel_licenciar_avulso(uuid,date)',
    'painel_situacao_avulso(uuid,text)',
    'painel_criar_empresa(text,text)',
    'painel_licenciar_empresa(uuid,date)',
    'painel_situacao_empresa(uuid,text)',
    'painel_minha_licenca()'
  ]
  loop
    execute format('revoke all on function public.%s from public, anon', nome);
    execute format('grant execute on function public.%s to authenticated', nome);
  end loop;
end $$;
