-- Gestão de Produção. Arquivo só para revisão. Não aplicar nesta etapa.
-- Não altera copias_conta, painel_* nem o documento dos lançamentos.
-- Decisões de 23/11/2026: ficha sem valor; histórico encerrado na revogação;
-- um vínculo ativo por prestador; SLA de 8 horas úteis, editável pelo gerente.

create or replace function private.gestao_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(pg_catalog.btrim(email))
  from auth.users
  where id = auth.uid()
    and email_confirmed_at is not null
    and nullif(pg_catalog.btrim(email), '') is not null;
$$;

create or replace function private.gestao_exigir_sessao()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'sessao_ausente' using errcode = '42501';
  end if;
  if private.gestao_email() is null then
    raise exception 'email_nao_confirmado' using errcode = '42501';
  end if;
  return uid;
end;
$$;

create or replace function private.gestao_codigo()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
$$;

create or replace function private.gestao_setores()
returns text[]
language sql
immutable
security definer
set search_path = ''
as $$
  select array[
    'Desmontagem', 'Manta', 'Aço', 'Overlap', 'Tampa', 'Vidro',
    'Montagem', 'Tapeçaria', 'Aço de retrovisor', 'Churrasqueira'
  ];
$$;

create or replace function private.gestao_sou_gerente(p_empresa uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.painel_empresas e
    where e.id = p_empresa
      and e.gerente_user_id = auth.uid()
  );
$$;

create or replace function private.gestao_gerente_unico()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  select count(*) into n
  from public.painel_empresas
  where gerente_user_id = auth.uid()
    and status = 'ativo';
  if n > 1 then
    raise exception 'gerente_varias_empresas' using errcode = '23514';
  end if;
end;
$$;

create or replace function private.gestao_envio_liberado(p_empresa uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.painel_empresas e
    where e.id = p_empresa and e.status = 'ativo'
  )
  and (
    not exists (
      select 1 from public.painel_licencas l
      where l.empresa_id = p_empresa
    )
    or exists (
      select 1 from public.painel_licencas l
      where l.empresa_id = p_empresa
        and l.status = 'ativa'
        and l.validade >= current_date
    )
  );
$$;

create or replace function private.gestao_exigir_gerente(p_empresa uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
begin
  uid := private.gestao_exigir_sessao();
  perform private.gestao_gerente_unico();
  if not private.gestao_sou_gerente(p_empresa) then
    raise exception 'nao_gerente' using errcode = '42501';
  end if;
  return uid;
end;
$$;

create or replace function private.gestao_exigir_escrita(p_empresa uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
begin
  uid := private.gestao_exigir_gerente(p_empresa);
  if not private.gestao_envio_liberado(p_empresa) then
    raise exception 'envio_bloqueado' using errcode = '42501';
  end if;
  return uid;
end;
$$;

revoke all on function private.gestao_email() from public, anon, authenticated;
revoke all on function private.gestao_exigir_sessao() from public, anon, authenticated;
revoke all on function private.gestao_codigo() from public, anon, authenticated;
revoke all on function private.gestao_setores() from public, anon, authenticated;
revoke all on function private.gestao_sou_gerente(uuid) from public, anon, authenticated;
revoke all on function private.gestao_gerente_unico() from public, anon, authenticated;
revoke all on function private.gestao_envio_liberado(uuid) from public, anon, authenticated;
revoke all on function private.gestao_exigir_gerente(uuid) from public, anon, authenticated;
revoke all on function private.gestao_exigir_escrita(uuid) from public, anon, authenticated;

create table if not exists public.gestao_equipes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.painel_empresas (id),
  nome text not null check (char_length(btrim(nome)) between 1 and 80),
  status text not null default 'ativa' check (status in ('ativa', 'arquivada')),
  criado_por uuid not null references auth.users (id),
  criado_em timestamptz not null default now()
);

create table if not exists public.gestao_convites (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  email text not null,
  empresa_id uuid not null references public.painel_empresas (id),
  equipe_id uuid references public.gestao_equipes (id),
  status text not null default 'rascunho' check (status in ('rascunho', 'aceito', 'expirado', 'cancelado')),
  criado_por uuid not null references auth.users (id),
  criado_em timestamptz not null default now(),
  aceito_por uuid references auth.users (id),
  aceito_em timestamptz,
  expira_em timestamptz not null default (now() + interval '14 days')
);

create table if not exists public.gestao_vinculos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.painel_empresas (id),
  user_id uuid not null references auth.users (id),
  equipe_id uuid references public.gestao_equipes (id),
  papel text not null default 'equipe' check (papel = 'equipe'),
  status text not null check (status in ('pendente_consentimento', 'ativo', 'revogado')),
  consentimento_em timestamptz,
  consentimento_texto text,
  revogado_em timestamptz,
  revogado_por uuid references auth.users (id),
  check (status <> 'ativo' or (consentimento_em is not null and nullif(btrim(consentimento_texto), '') is not null))
);

create unique index if not exists gestao_vinculos_um_aberto
  on public.gestao_vinculos (user_id)
  where status in ('pendente_consentimento', 'ativo');

create table if not exists public.gestao_consentimentos (
  id uuid primary key default gen_random_uuid(),
  vinculo_id uuid not null references public.gestao_vinculos (id),
  user_id uuid not null references auth.users (id),
  empresa_id uuid not null references public.painel_empresas (id),
  acao text not null check (acao in ('aceitou', 'revogou')),
  escopo text not null,
  em timestamptz not null default now()
);

create table if not exists public.gestao_carros (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.painel_empresas (id),
  prestador_user_id uuid not null references auth.users (id),
  equipe_id uuid references public.gestao_equipes (id),
  origem_id text not null check (char_length(btrim(origem_id)) between 1 and 80),
  os text not null check (char_length(btrim(os)) between 1 and 80),
  veiculo text not null check (char_length(btrim(veiculo)) between 1 and 80),
  setor text not null check (char_length(btrim(setor)) between 1 and 80),
  situacao text not null check (char_length(btrim(situacao)) between 1 and 80),
  data_inicio date not null,
  hora_inicio text check (hora_inicio is null or hora_inicio ~ '^[0-2][0-9]:[0-5][0-9]$'),
  data_termino date,
  hora_termino text check (hora_termino is null or hora_termino ~ '^[0-2][0-9]:[0-5][0-9]$'),
  compartilhado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  status text not null check (status in ('ativo', 'encerrado')),
  unique (prestador_user_id, origem_id),
  check (data_termino is null or data_termino >= data_inicio),
  check (data_termino is not null or hora_termino is null)
);

create table if not exists public.gestao_pausas (
  id uuid primary key default gen_random_uuid(),
  carro_id uuid not null references public.gestao_carros (id),
  motivo text not null,
  outro boolean not null default false,
  inicio text not null check (inicio ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$'),
  fim text check (fim is null or fim ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$'),
  check (
    (outro = false and motivo in (
      'Faltando peça', 'Faltando vidro', 'Problemas elétricos', 'Problemas com vidro',
      'Aguardando etapa anterior', 'Aguardando vidraceiro', 'Aguardando ajuste da produção',
      'Impasse na resolução de um problema', 'Fim de expediente'
    ))
    or (outro = true and char_length(btrim(motivo)) between 1 and 60)
  )
);

create table if not exists public.gestao_sla (
  empresa_id uuid not null references public.painel_empresas (id),
  setor text not null check (setor in (
    'Desmontagem', 'Manta', 'Aço', 'Overlap', 'Tampa', 'Vidro',
    'Montagem', 'Tapeçaria', 'Aço de retrovisor', 'Churrasqueira'
  )),
  prazo_horas_uteis numeric not null check (prazo_horas_uteis > 0 and prazo_horas_uteis <= 999),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users (id),
  primary key (empresa_id, setor)
);

create table if not exists public.gestao_dispositivos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  dispositivo_id text not null check (char_length(btrim(dispositivo_id)) between 8 and 80),
  rotulo text check (rotulo is null or char_length(rotulo) <= 80),
  ativo boolean not null default false,
  confirmado_em timestamptz,
  visto_em timestamptz
);

create unique index if not exists gestao_dispositivos_um_ativo
  on public.gestao_dispositivos (user_id)
  where ativo;

create unique index if not exists gestao_dispositivos_conta
  on public.gestao_dispositivos (user_id, dispositivo_id);

alter table public.gestao_equipes enable row level security;
alter table public.gestao_convites enable row level security;
alter table public.gestao_vinculos enable row level security;
alter table public.gestao_consentimentos enable row level security;
alter table public.gestao_carros enable row level security;
alter table public.gestao_pausas enable row level security;
alter table public.gestao_sla enable row level security;
alter table public.gestao_dispositivos enable row level security;

revoke all on table public.gestao_equipes from public, anon, authenticated;
revoke all on table public.gestao_convites from public, anon, authenticated;
revoke all on table public.gestao_vinculos from public, anon, authenticated;
revoke all on table public.gestao_consentimentos from public, anon, authenticated;
revoke all on table public.gestao_carros from public, anon, authenticated;
revoke all on table public.gestao_pausas from public, anon, authenticated;
revoke all on table public.gestao_sla from public, anon, authenticated;
revoke all on table public.gestao_dispositivos from public, anon, authenticated;

create or replace function private.gestao_sla_garantir(p_empresa uuid, p_quem uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  nome text;
begin
  foreach nome in array private.gestao_setores()
  loop
    insert into public.gestao_sla (empresa_id, setor, prazo_horas_uteis, atualizado_por)
    values (p_empresa, nome, 8, p_quem)
    on conflict (empresa_id, setor) do nothing;
  end loop;
end;
$$;

create or replace function private.gestao_criar_equipe(p_empresa uuid, p_nome text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  novo uuid;
begin
  uid := private.gestao_exigir_escrita(p_empresa);
  if nullif(btrim(coalesce(p_nome, '')), '') is null then
    raise exception 'nome_ausente' using errcode = '23514';
  end if;
  insert into public.gestao_equipes (empresa_id, nome, criado_por)
  values (p_empresa, btrim(p_nome), uid)
  returning id into novo;
  perform private.gestao_sla_garantir(p_empresa, uid);
  return jsonb_build_object('ok', true, 'equipe', novo, 'status', 'ativa');
end;
$$;

create or replace function private.gestao_arquivar_equipe(p_equipe uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  emp uuid;
begin
  select empresa_id into emp from public.gestao_equipes where id = p_equipe;
  if emp is null then
    raise exception 'equipe_ausente' using errcode = '23514';
  end if;
  perform private.gestao_exigir_escrita(emp);
  update public.gestao_equipes set status = 'arquivada' where id = p_equipe;
  return jsonb_build_object('ok', true, 'status', 'arquivada');
end;
$$;

create or replace function private.gestao_criar_convite(p_empresa uuid, p_email text, p_equipe uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  alvo text;
  codigo text;
begin
  uid := private.gestao_exigir_escrita(p_empresa);
  alvo := lower(btrim(coalesce(p_email, '')));
  if alvo !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'email_invalido' using errcode = '23514';
  end if;
  if p_equipe is not null and not exists (
    select 1 from public.gestao_equipes
    where id = p_equipe and empresa_id = p_empresa and status = 'ativa'
  ) then
    raise exception 'equipe_ausente' using errcode = '23514';
  end if;
  codigo := private.gestao_codigo();
  insert into public.gestao_convites (codigo, email, empresa_id, equipe_id, criado_por)
  values (codigo, alvo, p_empresa, p_equipe, uid);
  return jsonb_build_object('ok', true, 'codigo', codigo, 'status', 'rascunho');
end;
$$;

create or replace function private.gestao_cancelar_convite(p_convite uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  emp uuid;
  sit text;
begin
  select empresa_id, status into emp, sit from public.gestao_convites where id = p_convite;
  if emp is null or sit <> 'rascunho' then
    raise exception 'convite_indisponivel' using errcode = '23514';
  end if;
  perform private.gestao_exigir_escrita(emp);
  update public.gestao_convites set status = 'cancelado' where id = p_convite;
  return jsonb_build_object('ok', true, 'status', 'cancelado');
end;
$$;

create or replace function private.gestao_aceitar_convite(p_codigo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  convite public.gestao_convites%rowtype;
  vinculo uuid;
begin
  uid := private.gestao_exigir_sessao();
  select * into convite from public.gestao_convites where codigo = lower(btrim(coalesce(p_codigo, '')));
  if not found or convite.status <> 'rascunho' then
    raise exception 'convite_indisponivel' using errcode = '23514';
  end if;
  if convite.expira_em < now() then
    update public.gestao_convites set status = 'expirado' where id = convite.id;
    raise exception 'convite_expirado' using errcode = '23514';
  end if;
  if convite.email is distinct from private.gestao_email() then
    raise exception 'email_divergente' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.gestao_vinculos
    where user_id = uid and status in ('pendente_consentimento', 'ativo')
  ) then
    raise exception 'vinculo_aberto' using errcode = '23514';
  end if;
  update public.gestao_convites
  set status = 'aceito', aceito_por = uid, aceito_em = now()
  where id = convite.id;
  insert into public.gestao_vinculos (empresa_id, user_id, equipe_id, status)
  values (convite.empresa_id, uid, convite.equipe_id, 'pendente_consentimento')
  returning id into vinculo;
  return jsonb_build_object('ok', true, 'vinculo', vinculo, 'status', 'pendente_consentimento');
end;
$$;

create or replace function private.gestao_consentir(p_vinculo uuid, p_texto text, p_confirma boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  linha public.gestao_vinculos%rowtype;
  empresa_nome text;
  escopo text;
begin
  uid := private.gestao_exigir_sessao();
  if p_confirma is distinct from true then
    raise exception 'sem_confirmacao' using errcode = '23514';
  end if;
  select * into linha from public.gestao_vinculos where id = p_vinculo and user_id = uid;
  if not found or linha.status <> 'pendente_consentimento' then
    raise exception 'vinculo_indisponivel' using errcode = '23514';
  end if;
  select e.nome into empresa_nome from public.painel_empresas e where e.id = linha.empresa_id;
  if nullif(btrim(coalesce(p_texto, '')), '') is null or position(empresa_nome in p_texto) = 0 then
    raise exception 'texto_invalido' using errcode = '23514';
  end if;
  escopo := 'os, veiculo, setor, situacao, datas, horas, pausas';
  update public.gestao_vinculos
  set status = 'ativo',
      consentimento_em = now(),
      consentimento_texto = btrim(p_texto)
  where id = linha.id;
  insert into public.gestao_consentimentos (vinculo_id, user_id, empresa_id, acao, escopo)
  values (linha.id, uid, linha.empresa_id, 'aceitou', escopo);
  return jsonb_build_object('ok', true, 'status', 'ativo', 'escopo', escopo);
end;
$$;

create or replace function private.gestao_revogar_vinculo(p_vinculo uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  linha public.gestao_vinculos%rowtype;
  n integer;
begin
  uid := private.gestao_exigir_sessao();
  select * into linha from public.gestao_vinculos where id = p_vinculo;
  if not found or linha.status = 'revogado' then
    raise exception 'vinculo_indisponivel' using errcode = '23514';
  end if;
  if linha.user_id is distinct from uid and not private.gestao_sou_gerente(linha.empresa_id) then
    raise exception 'nao_autorizado' using errcode = '42501';
  end if;
  update public.gestao_vinculos
  set status = 'revogado', revogado_em = now(), revogado_por = uid
  where id = linha.id;
  update public.gestao_carros
  set status = 'encerrado', atualizado_em = now()
  where empresa_id = linha.empresa_id
    and prestador_user_id = linha.user_id
    and status = 'ativo';
  get diagnostics n = row_count;
  insert into public.gestao_consentimentos (vinculo_id, user_id, empresa_id, acao, escopo)
  values (linha.id, linha.user_id, linha.empresa_id, 'revogou', 'encerra envios novos e mantem o historico');
  return jsonb_build_object('ok', true, 'status', 'revogado', 'fichas_encerradas', n, 'apagou_local', false);
end;
$$;

create or replace function private.gestao_aparelho_ativo(p_dispositivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
begin
  uid := auth.uid();
  if not exists (
    select 1 from public.gestao_dispositivos
    where user_id = uid and dispositivo_id = p_dispositivo and ativo
  ) then
    raise exception 'aparelho_inativo' using errcode = '42501';
  end if;
  update public.gestao_dispositivos
  set visto_em = now()
  where user_id = uid and dispositivo_id = p_dispositivo and ativo;
end;
$$;

create or replace function private.gestao_enviar_carro(
  p_empresa uuid,
  p_dispositivo text,
  p_origem text,
  p_os text,
  p_veiculo text,
  p_setor text,
  p_situacao text,
  p_data_inicio date,
  p_hora_inicio text,
  p_data_termino date,
  p_hora_termino text,
  p_pausas jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  vinculo public.gestao_vinculos%rowtype;
  carro uuid;
  sit text;
  item jsonb;
  motivo text;
  outro boolean;
  inicio text;
  fim text;
begin
  uid := private.gestao_exigir_sessao();
  if not private.gestao_envio_liberado(p_empresa) then
    raise exception 'envio_bloqueado' using errcode = '42501';
  end if;
  perform private.gestao_aparelho_ativo(p_dispositivo);
  select * into vinculo
  from public.gestao_vinculos
  where user_id = uid and empresa_id = p_empresa and status = 'ativo';
  if not found or vinculo.consentimento_em is null then
    raise exception 'sem_consentimento' using errcode = '42501';
  end if;
  select id, status into carro, sit
  from public.gestao_carros
  where prestador_user_id = uid and origem_id = btrim(p_origem);
  if found and sit = 'encerrado' then
    raise exception 'ficha_encerrada' using errcode = '23514';
  end if;
  if found then
    update public.gestao_carros
    set os = btrim(p_os),
        veiculo = btrim(p_veiculo),
        setor = btrim(p_setor),
        situacao = btrim(p_situacao),
        data_inicio = p_data_inicio,
        hora_inicio = nullif(btrim(coalesce(p_hora_inicio, '')), ''),
        data_termino = p_data_termino,
        hora_termino = nullif(btrim(coalesce(p_hora_termino, '')), ''),
        equipe_id = vinculo.equipe_id,
        atualizado_em = now()
    where id = carro;
  else
    insert into public.gestao_carros (
      empresa_id, prestador_user_id, equipe_id, origem_id, os, veiculo, setor, situacao,
      data_inicio, hora_inicio, data_termino, hora_termino, status
    ) values (
      p_empresa, uid, vinculo.equipe_id, btrim(p_origem), btrim(p_os), btrim(p_veiculo),
      btrim(p_setor), btrim(p_situacao), p_data_inicio,
      nullif(btrim(coalesce(p_hora_inicio, '')), ''),
      p_data_termino, nullif(btrim(coalesce(p_hora_termino, '')), ''), 'ativo'
    ) returning id into carro;
  end if;
  delete from public.gestao_pausas where carro_id = carro;
  if p_pausas is not null and jsonb_typeof(p_pausas) = 'array' then
    for item in select value from jsonb_array_elements(p_pausas)
    loop
      motivo := btrim(coalesce(item ->> 'motivo', ''));
      outro := coalesce((item ->> 'outro')::boolean, false);
      inicio := item ->> 'inicio';
      fim := nullif(item ->> 'fim', '');
      insert into public.gestao_pausas (carro_id, motivo, outro, inicio, fim)
      values (carro, motivo, outro, inicio, fim);
    end loop;
  end if;
  return jsonb_build_object('ok', true, 'carro', carro, 'status', 'ativo');
end;
$$;

create or replace function private.gestao_listar_carros(p_empresa uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid;
begin
  uid := private.gestao_exigir_sessao();
  if not private.gestao_sou_gerente(p_empresa) and not exists (
    select 1 from public.gestao_vinculos
    where user_id = uid and empresa_id = p_empresa and status in ('ativo', 'revogado')
  ) then
    raise exception 'nao_autorizado' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id,
      'os', c.os,
      'veiculo', c.veiculo,
      'setor', c.setor,
      'situacao', c.situacao,
      'data_inicio', c.data_inicio,
      'hora_inicio', c.hora_inicio,
      'data_termino', c.data_termino,
      'hora_termino', c.hora_termino,
      'status', c.status,
      'equipe_id', c.equipe_id,
      'origem_id', c.origem_id,
      'prestador_email', lower(u.email),
      'prestador_nome', coalesce(nullif(btrim(pc.nome), ''), 'Sem nome'),
      'pausas', coalesce((
        select jsonb_agg(jsonb_build_object(
          'motivo', p.motivo,
          'outro', p.outro,
          'inicio', p.inicio,
          'fim', p.fim
        ) order by p.inicio)
        from public.gestao_pausas p
        where p.carro_id = c.id
      ), '[]'::jsonb)
    ) order by c.data_inicio, c.os)
    from public.gestao_carros c
    join auth.users u on u.id = c.prestador_user_id
    left join public.painel_contas pc on pc.user_id = c.prestador_user_id
    where c.empresa_id = p_empresa
      and (private.gestao_sou_gerente(p_empresa) or c.prestador_user_id = uid)
  ), '[]'::jsonb);
end;
$$;

create or replace function private.gestao_listar_vinculos(p_empresa uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid;
begin
  uid := private.gestao_exigir_sessao();
  if not private.gestao_sou_gerente(p_empresa) then
    raise exception 'nao_gerente' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'vinculo', v.id,
      'email', lower(u.email),
      'nome', coalesce(nullif(btrim(pc.nome), ''), 'Sem nome'),
      'equipe_id', v.equipe_id,
      'status', v.status,
      'consentimento_em', v.consentimento_em
    ) order by lower(u.email))
    from public.gestao_vinculos v
    join auth.users u on u.id = v.user_id
    left join public.painel_contas pc on pc.user_id = v.user_id
    where v.empresa_id = p_empresa
  ), '[]'::jsonb);
end;
$$;

create or replace function private.gestao_sla_listar(p_empresa uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
begin
  uid := private.gestao_exigir_gerente(p_empresa);
  perform private.gestao_sla_garantir(p_empresa, uid);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'setor', s.setor,
      'prazo_horas_uteis', s.prazo_horas_uteis
    ) order by array_position(private.gestao_setores(), s.setor))
    from public.gestao_sla s
    where s.empresa_id = p_empresa
  ), '[]'::jsonb);
end;
$$;

create or replace function private.gestao_sla_definir(p_empresa uuid, p_setor text, p_horas numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
begin
  uid := private.gestao_exigir_escrita(p_empresa);
  if p_setor <> all (private.gestao_setores()) then
    raise exception 'setor_invalido' using errcode = '23514';
  end if;
  if p_horas is null or p_horas <= 0 or p_horas > 999 then
    raise exception 'prazo_invalido' using errcode = '23514';
  end if;
  perform private.gestao_sla_garantir(p_empresa, uid);
  update public.gestao_sla
  set prazo_horas_uteis = p_horas, atualizado_em = now(), atualizado_por = uid
  where empresa_id = p_empresa and setor = p_setor;
  return jsonb_build_object('ok', true, 'setor', p_setor, 'prazo_horas_uteis', p_horas);
end;
$$;

create or replace function private.gestao_dispositivo_ver()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid;
  linha public.gestao_dispositivos%rowtype;
begin
  uid := private.gestao_exigir_sessao();
  select * into linha
  from public.gestao_dispositivos
  where user_id = uid and ativo
  order by visto_em desc nulls last
  limit 1;
  if not found then
    return jsonb_build_object('ativo', false);
  end if;
  return jsonb_build_object(
    'ativo', true,
    'dispositivo_id', linha.dispositivo_id,
    'rotulo', linha.rotulo,
    'visto_em', linha.visto_em
  );
end;
$$;

create or replace function private.gestao_dispositivo_abrir(p_dispositivo text, p_rotulo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  atual public.gestao_dispositivos%rowtype;
  alvo text;
begin
  uid := private.gestao_exigir_sessao();
  alvo := btrim(coalesce(p_dispositivo, ''));
  if char_length(alvo) < 8 then
    raise exception 'dispositivo_invalido' using errcode = '23514';
  end if;
  select * into atual from public.gestao_dispositivos where user_id = uid and ativo limit 1;
  if found and atual.dispositivo_id is distinct from alvo then
    return jsonb_build_object('ok', false, 'motivo', 'troca_pendente', 'ativo_id', atual.dispositivo_id);
  end if;
  insert into public.gestao_dispositivos (user_id, dispositivo_id, rotulo, ativo, confirmado_em, visto_em)
  values (uid, alvo, nullif(btrim(coalesce(p_rotulo, '')), ''), true, now(), now())
  on conflict (user_id, dispositivo_id) do update
  set ativo = true,
      rotulo = excluded.rotulo,
      visto_em = now(),
      confirmado_em = coalesce(public.gestao_dispositivos.confirmado_em, now());
  return jsonb_build_object('ok', true, 'acao', 'ativo', 'dispositivo_id', alvo);
end;
$$;

create or replace function private.gestao_dispositivo_confirmar(p_dispositivo text, p_rotulo text, p_confirma boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  alvo text;
begin
  uid := private.gestao_exigir_sessao();
  if p_confirma is distinct from true then
    raise exception 'sem_confirmacao' using errcode = '23514';
  end if;
  alvo := btrim(coalesce(p_dispositivo, ''));
  if char_length(alvo) < 8 then
    raise exception 'dispositivo_invalido' using errcode = '23514';
  end if;
  update public.gestao_dispositivos set ativo = false where user_id = uid and ativo;
  insert into public.gestao_dispositivos (user_id, dispositivo_id, rotulo, ativo, confirmado_em, visto_em)
  values (uid, alvo, nullif(btrim(coalesce(p_rotulo, '')), ''), true, now(), now())
  on conflict (user_id, dispositivo_id) do update
  set ativo = true, rotulo = excluded.rotulo, confirmado_em = now(), visto_em = now();
  return jsonb_build_object('ok', true, 'acao', 'trocou', 'dispositivo_id', alvo);
end;
$$;

revoke all on function private.gestao_sla_garantir(uuid, uuid) from public, anon, authenticated;
revoke all on function private.gestao_aparelho_ativo(text) from public, anon, authenticated;

revoke all on function private.gestao_criar_equipe(uuid, text) from public, anon;
revoke all on function private.gestao_arquivar_equipe(uuid) from public, anon;
revoke all on function private.gestao_criar_convite(uuid, text, uuid) from public, anon;
revoke all on function private.gestao_cancelar_convite(uuid) from public, anon;
revoke all on function private.gestao_aceitar_convite(text) from public, anon;
revoke all on function private.gestao_consentir(uuid, text, boolean) from public, anon;
revoke all on function private.gestao_revogar_vinculo(uuid) from public, anon;
revoke all on function private.gestao_enviar_carro(uuid, text, text, text, text, text, text, date, text, date, text, jsonb) from public, anon;
revoke all on function private.gestao_listar_carros(uuid) from public, anon;
revoke all on function private.gestao_listar_vinculos(uuid) from public, anon;
revoke all on function private.gestao_sla_listar(uuid) from public, anon;
revoke all on function private.gestao_sla_definir(uuid, text, numeric) from public, anon;
revoke all on function private.gestao_dispositivo_ver() from public, anon;
revoke all on function private.gestao_dispositivo_abrir(text, text) from public, anon;
revoke all on function private.gestao_dispositivo_confirmar(text, text, boolean) from public, anon;

grant execute on function private.gestao_criar_equipe(uuid, text) to authenticated;
grant execute on function private.gestao_arquivar_equipe(uuid) to authenticated;
grant execute on function private.gestao_criar_convite(uuid, text, uuid) to authenticated;
grant execute on function private.gestao_cancelar_convite(uuid) to authenticated;
grant execute on function private.gestao_aceitar_convite(text) to authenticated;
grant execute on function private.gestao_consentir(uuid, text, boolean) to authenticated;
grant execute on function private.gestao_revogar_vinculo(uuid) to authenticated;
grant execute on function private.gestao_enviar_carro(uuid, text, text, text, text, text, text, date, text, date, text, jsonb) to authenticated;
grant execute on function private.gestao_listar_carros(uuid) to authenticated;
grant execute on function private.gestao_listar_vinculos(uuid) to authenticated;
grant execute on function private.gestao_sla_listar(uuid) to authenticated;
grant execute on function private.gestao_sla_definir(uuid, text, numeric) to authenticated;
grant execute on function private.gestao_dispositivo_ver() to authenticated;
grant execute on function private.gestao_dispositivo_abrir(text, text) to authenticated;
grant execute on function private.gestao_dispositivo_confirmar(text, text, boolean) to authenticated;

create or replace function public.gestao_criar_equipe(p_empresa uuid, p_nome text)
returns jsonb language plpgsql security invoker set search_path = ''
as $$ begin return private.gestao_criar_equipe(p_empresa, p_nome); end; $$;

create or replace function public.gestao_arquivar_equipe(p_equipe uuid)
returns jsonb language plpgsql security invoker set search_path = ''
as $$ begin return private.gestao_arquivar_equipe(p_equipe); end; $$;

create or replace function public.gestao_criar_convite(p_empresa uuid, p_email text, p_equipe uuid)
returns jsonb language plpgsql security invoker set search_path = ''
as $$ begin return private.gestao_criar_convite(p_empresa, p_email, p_equipe); end; $$;

create or replace function public.gestao_cancelar_convite(p_convite uuid)
returns jsonb language plpgsql security invoker set search_path = ''
as $$ begin return private.gestao_cancelar_convite(p_convite); end; $$;

create or replace function public.gestao_aceitar_convite(p_codigo text)
returns jsonb language plpgsql security invoker set search_path = ''
as $$ begin return private.gestao_aceitar_convite(p_codigo); end; $$;

create or replace function public.gestao_consentir(p_vinculo uuid, p_texto text, p_confirma boolean)
returns jsonb language plpgsql security invoker set search_path = ''
as $$ begin return private.gestao_consentir(p_vinculo, p_texto, p_confirma); end; $$;

create or replace function public.gestao_revogar_vinculo(p_vinculo uuid)
returns jsonb language plpgsql security invoker set search_path = ''
as $$ begin return private.gestao_revogar_vinculo(p_vinculo); end; $$;

create or replace function public.gestao_enviar_carro(
  p_empresa uuid, p_dispositivo text, p_origem text, p_os text, p_veiculo text, p_setor text,
  p_situacao text, p_data_inicio date, p_hora_inicio text, p_data_termino date, p_hora_termino text, p_pausas jsonb
)
returns jsonb language plpgsql security invoker set search_path = ''
as $$ begin return private.gestao_enviar_carro(p_empresa, p_dispositivo, p_origem, p_os, p_veiculo, p_setor, p_situacao, p_data_inicio, p_hora_inicio, p_data_termino, p_hora_termino, p_pausas); end; $$;

create or replace function public.gestao_listar_carros(p_empresa uuid)
returns jsonb language plpgsql security invoker set search_path = ''
as $$ begin return private.gestao_listar_carros(p_empresa); end; $$;

create or replace function public.gestao_listar_vinculos(p_empresa uuid)
returns jsonb language plpgsql security invoker set search_path = ''
as $$ begin return private.gestao_listar_vinculos(p_empresa); end; $$;

create or replace function public.gestao_sla_listar(p_empresa uuid)
returns jsonb language plpgsql security invoker set search_path = ''
as $$ begin return private.gestao_sla_listar(p_empresa); end; $$;

create or replace function public.gestao_sla_definir(p_empresa uuid, p_setor text, p_horas numeric)
returns jsonb language plpgsql security invoker set search_path = ''
as $$ begin return private.gestao_sla_definir(p_empresa, p_setor, p_horas); end; $$;

create or replace function public.gestao_dispositivo_ver()
returns jsonb language plpgsql security invoker set search_path = ''
as $$ begin return private.gestao_dispositivo_ver(); end; $$;

create or replace function public.gestao_dispositivo_abrir(p_dispositivo text, p_rotulo text)
returns jsonb language plpgsql security invoker set search_path = ''
as $$ begin return private.gestao_dispositivo_abrir(p_dispositivo, p_rotulo); end; $$;

create or replace function public.gestao_dispositivo_confirmar(p_dispositivo text, p_rotulo text, p_confirma boolean)
returns jsonb language plpgsql security invoker set search_path = ''
as $$ begin return private.gestao_dispositivo_confirmar(p_dispositivo, p_rotulo, p_confirma); end; $$;

revoke all on function public.gestao_criar_equipe(uuid, text) from public, anon;
revoke all on function public.gestao_arquivar_equipe(uuid) from public, anon;
revoke all on function public.gestao_criar_convite(uuid, text, uuid) from public, anon;
revoke all on function public.gestao_cancelar_convite(uuid) from public, anon;
revoke all on function public.gestao_aceitar_convite(text) from public, anon;
revoke all on function public.gestao_consentir(uuid, text, boolean) from public, anon;
revoke all on function public.gestao_revogar_vinculo(uuid) from public, anon;
revoke all on function public.gestao_enviar_carro(uuid, text, text, text, text, text, text, date, text, date, text, jsonb) from public, anon;
revoke all on function public.gestao_listar_carros(uuid) from public, anon;
revoke all on function public.gestao_listar_vinculos(uuid) from public, anon;
revoke all on function public.gestao_sla_listar(uuid) from public, anon;
revoke all on function public.gestao_sla_definir(uuid, text, numeric) from public, anon;
revoke all on function public.gestao_dispositivo_ver() from public, anon;
revoke all on function public.gestao_dispositivo_abrir(text, text) from public, anon;
revoke all on function public.gestao_dispositivo_confirmar(text, text, boolean) from public, anon;

grant execute on function public.gestao_criar_equipe(uuid, text) to authenticated;
grant execute on function public.gestao_arquivar_equipe(uuid) to authenticated;
grant execute on function public.gestao_criar_convite(uuid, text, uuid) to authenticated;
grant execute on function public.gestao_cancelar_convite(uuid) to authenticated;
grant execute on function public.gestao_aceitar_convite(text) to authenticated;
grant execute on function public.gestao_consentir(uuid, text, boolean) to authenticated;
grant execute on function public.gestao_revogar_vinculo(uuid) to authenticated;
grant execute on function public.gestao_enviar_carro(uuid, text, text, text, text, text, text, date, text, date, text, jsonb) to authenticated;
grant execute on function public.gestao_listar_carros(uuid) to authenticated;
grant execute on function public.gestao_listar_vinculos(uuid) to authenticated;
grant execute on function public.gestao_sla_listar(uuid) to authenticated;
grant execute on function public.gestao_sla_definir(uuid, text, numeric) to authenticated;
grant execute on function public.gestao_dispositivo_ver() to authenticated;
grant execute on function public.gestao_dispositivo_abrir(text, text) to authenticated;
grant execute on function public.gestao_dispositivo_confirmar(text, text, boolean) to authenticated;
