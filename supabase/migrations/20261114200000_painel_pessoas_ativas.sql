-- Incremento do painel. Não reedita 20261111010000.
-- Acrescenta pessoas ativas, carros lançados e a lista de nomes com e-mail.
-- Não devolve uid, telefone, provedor nem o documento dos lançamentos.

create or replace function private.painel_usuario_ativo(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    left join public.copias_conta c on c.owner_id = u.id
    where u.id = p_user
      and u.email_confirmed_at is not null
      and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= pg_catalog.now())
      and (
        u.last_sign_in_at >= pg_catalog.now() - interval '30 days'
        or c.atualizado_em >= pg_catalog.now() - interval '30 days'
      )
      and not exists (
        select 1
        from public.painel_contas pc
        where pc.user_id = u.id
          and pc.status in ('suspenso', 'revogado')
      )
  );
$$;

revoke all on function private.painel_usuario_ativo(uuid) from public, anon, authenticated;

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
  pessoas_ativas integer;
  carros integer;
begin
  perform private.painel_exigir_dono();
  select count(*) into pedidos from public.painel_pedidos where status = 'pendente';
  select count(*) into avulsos from public.painel_contas where tipo = 'avulso';
  select count(*) into empresas from public.painel_empresas
  where private.painel_nome_empresa(nome) <> 'inova blindagem';
  select count(*) into vencem from (
    select fim as dia from public.painel_degustacoes
    where status = 'ativa' and fim >= current_date and fim <= current_date + 7
    union all
    select validade from public.painel_licencas
    where status = 'ativa' and validade >= current_date and validade <= current_date + 7
  ) prazos;
  select count(*) into pessoas_ativas
  from auth.users u
  where private.painel_usuario_ativo(u.id);
  select coalesce(sum(
    case
      when pg_catalog.jsonb_typeof(documento -> 'entries') = 'array'
        then pg_catalog.jsonb_array_length(documento -> 'entries')
      else 0
    end
  ), 0)::integer into carros
  from public.copias_conta;
  return jsonb_build_object(
    'pedidos', pedidos,
    'avulsos', avulsos,
    'empresas', empresas,
    'vencem_7_dias', vencem,
    'pessoas_ativas', pessoas_ativas,
    'carros_lancados', carros
  );
end;
$$;

create or replace function private.painel_listar_pessoas()
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
      'nome', coalesce(
        nullif(pg_catalog.btrim(u.raw_user_meta_data ->> 'full_name'), ''),
        nullif(pg_catalog.btrim(u.raw_user_meta_data ->> 'name'), ''),
        'Sem nome'
      ),
      'email', lower(pg_catalog.btrim(u.email)),
      'ativa', private.painel_usuario_ativo(u.id),
      'ultimo_acesso', case
        when u.last_sign_in_at is null then null
        else to_char(u.last_sign_in_at, 'YYYY-MM-DD')
      end
    ) order by coalesce(
        nullif(pg_catalog.btrim(u.raw_user_meta_data ->> 'full_name'), ''),
        nullif(pg_catalog.btrim(u.raw_user_meta_data ->> 'name'), ''),
        'Sem nome'
      ))
    from auth.users u
    where u.email_confirmed_at is not null
      and u.deleted_at is null
      and nullif(pg_catalog.btrim(u.email), '') is not null
  ), '[]'::jsonb);
end;
$$;

revoke all on function private.painel_resumo() from public, anon;
revoke all on function private.painel_listar_pessoas() from public, anon;
grant execute on function private.painel_resumo() to authenticated;
grant execute on function private.painel_listar_pessoas() to authenticated;

create or replace function public.painel_resumo()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return private.painel_resumo();
end;
$$;

create or replace function public.painel_listar_pessoas()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return private.painel_listar_pessoas();
end;
$$;

revoke all on function public.painel_resumo() from public, anon;
revoke all on function public.painel_listar_pessoas() from public, anon;
grant execute on function public.painel_resumo() to authenticated;
grant execute on function public.painel_listar_pessoas() to authenticated;
