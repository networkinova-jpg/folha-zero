-- Pessoas ativas, lista de nomes e total de carros. Não devolve o documento.

do $$
declare definer boolean;
begin
  select p.prosecdef into definer
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'painel_resumo';
  if definer then raise exception 'resumo exposto e security definer'; end if;
  select p.prosecdef into definer
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'painel_listar_pessoas';
  if definer then raise exception 'lista exposta e security definer'; end if;
  select p.prosecdef into definer
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = 'painel_resumo';
  if definer is distinct from true then raise exception 'resumo privado sem definer'; end if;
  if has_function_privilege('anon', 'public.painel_resumo()', 'execute')
     or has_function_privilege('anon', 'public.painel_listar_pessoas()', 'execute')
     or has_function_privilege('public', 'public.painel_listar_pessoas()', 'execute') then
    raise exception 'grant folgado na lista';
  end if;
end $$;

update auth.users
set last_sign_in_at = now() - interval '40 days',
    deleted_at = null,
    banned_until = null,
    email_confirmed_at = coalesce(email_confirmed_at, now());

insert into auth.users (id, email, email_confirmed_at, last_sign_in_at, raw_user_meta_data)
values
  ('aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'ativa.login@example.invalid', now(), now() - interval '1 day', '{"full_name":"Ana Ativa"}'),
  ('aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'ativa.backup@example.invalid', now(), now() - interval '40 days', '{"name":"Bia Backup"}'),
  ('aaaaaaa3-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'parada@example.invalid', now(), now() - interval '40 days', '{"full_name":"Carla Parada"}'),
  ('aaaaaaa4-aaaa-4aaa-8aaa-aaaaaaaaaaa4', 'sem.confirmacao@example.invalid', null, now(), '{"full_name":"Dina Sem Confirmacao"}'),
  ('aaaaaaa5-aaaa-4aaa-8aaa-aaaaaaaaaaa5', 'apagada@example.invalid', now(), now(), '{"full_name":"Eva Apagada"}'),
  ('aaaaaaa6-aaaa-4aaa-8aaa-aaaaaaaaaaa6', 'banida@example.invalid', now(), now(), '{"full_name":"Fabi Banida"}'),
  ('aaaaaaa7-aaaa-4aaa-8aaa-aaaaaaaaaaa7', 'banida.velha@example.invalid', now(), now(), '{"full_name":"Gabi Banida Velha"}'),
  ('aaaaaaa8-aaaa-4aaa-8aaa-aaaaaaaaaaa8', 'Suspensa@Example.Invalid', now(), now(), '{"full_name":"<b>Helena</b>"}'),
  ('aaaaaaa9-aaaa-4aaa-8aaa-aaaaaaaaaaa9', 'revogada@example.invalid', now(), now(), '{"full_name":"Iris Revogada"}')
on conflict (id) do update
set email = excluded.email,
    email_confirmed_at = excluded.email_confirmed_at,
    last_sign_in_at = excluded.last_sign_in_at,
    raw_user_meta_data = excluded.raw_user_meta_data,
    deleted_at = null,
    banned_until = null;

update auth.users set deleted_at = now() where id = 'aaaaaaa5-aaaa-4aaa-8aaa-aaaaaaaaaaa5';
update auth.users set banned_until = now() + interval '2 days' where id = 'aaaaaaa6-aaaa-4aaa-8aaa-aaaaaaaaaaa6';
update auth.users set banned_until = now() - interval '2 days' where id = 'aaaaaaa7-aaaa-4aaa-8aaa-aaaaaaaaaaa7';

insert into public.painel_contas (user_id, email, nome, tipo, status)
values
  ('aaaaaaa8-aaaa-4aaa-8aaa-aaaaaaaaaaa8', 'suspensa@example.invalid', 'Helena', 'avulso', 'suspenso'),
  ('aaaaaaa9-aaaa-4aaa-8aaa-aaaaaaaaaaa9', 'revogada@example.invalid', 'Iris', 'avulso', 'revogado')
on conflict (user_id) do update set status = excluded.status;

delete from public.copias_conta;
alter table public.copias_conta disable trigger copias_conta_validar;
insert into public.copias_conta (owner_id, revisao, bytes, documento, atualizado_em)
values
  ('aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 1, 12, '{"version":2,"entries":[]}'::jsonb, now()),
  ('aaaaaaa3-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 1, 40, '{"version":2,"entries":[{"os":"OS-SEGREDO","veiculo":"Carro secreto","valor":999,"obs":"nota secreta"},{"os":"OS-2"},{"os":"OS-3"}]}'::jsonb, now() - interval '40 days'),
  ('aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 1, 20, '{"version":2}'::jsonb, now() - interval '40 days')
on conflict (owner_id) do update
set documento = excluded.documento, atualizado_em = excluded.atualizado_em, revisao = excluded.revisao;
alter table public.copias_conta enable trigger copias_conta_validar;

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
do $$
begin
  perform public.painel_resumo();
  raise exception 'ataque passou: resumo';
exception when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
  if sqlerrm not like '%nao_proprietario%' then raise exception 'resumo: %', sqlerrm; end if;
end $$;
do $$
begin
  perform public.painel_listar_pessoas();
  raise exception 'ataque passou: lista';
exception when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
  if sqlerrm not like '%nao_proprietario%' then raise exception 'lista: %', sqlerrm; end if;
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '66666666-6666-4666-8666-666666666666', false);
do $$
declare
  resumo jsonb;
  lista jsonb;
  pessoa jsonb;
  chave text;
  ativas integer;
begin
  resumo := public.painel_resumo();
  if resumo ? 'documento' or resumo::text ilike '%os-segredo%' or resumo::text ilike '%carro secreto%' or resumo::text ilike '%nota secreta%' then
    raise exception 'resumo vazou lancamento: %', resumo;
  end if;
  if (resumo ->> 'pessoas_ativas')::int is distinct from 3 then
    raise exception 'pessoas ativas %', resumo ->> 'pessoas_ativas';
  end if;
  if (resumo ->> 'carros_lancados')::int is distinct from 3 then
    raise exception 'carros %', resumo ->> 'carros_lancados';
  end if;
  lista := public.painel_listar_pessoas();
  if lista::text ilike '%aaaaaaa%' or lista::text ilike '%uid%' then
    raise exception 'lista vazou identificador: %', lista;
  end if;
  for pessoa in select value from jsonb_array_elements(lista)
  loop
    for chave in select jsonb_object_keys(pessoa)
    loop
    if chave not in ('nome', 'email', 'ativa', 'ultimo_acesso') then
      raise exception 'coluna indevida %', chave;
    end if;
    if not (pessoa ? 'nome' and pessoa ? 'email' and pessoa ? 'ativa' and pessoa ? 'ultimo_acesso') then
      raise exception 'colunas incompletas %', pessoa;
    end if;
    end loop;
    if pessoa ? 'uid' or pessoa ? 'user_id' or pessoa ? 'telefone' or pessoa ? 'provider' then
      raise exception 'metadado indevido %', pessoa;
    end if;
  end loop;
  if not exists (
    select 1 from jsonb_array_elements(lista) e
    where e ->> 'nome' = '<b>Helena</b>' and e ->> 'email' = 'suspensa@example.invalid' and (e ->> 'ativa')::boolean = false
  ) then
    raise exception 'helena ausente ou ativa';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(lista) e
    where e ->> 'nome' = 'Bia Backup' and e ->> 'email' = 'ativa.backup@example.invalid' and (e ->> 'ativa')::boolean = true
  ) then
    raise exception 'bia ausente';
  end if;
  select count(*) into ativas from jsonb_array_elements(lista) e where (e ->> 'ativa')::boolean;
  if ativas is distinct from 3 then
    raise exception 'lista ativa %', ativas;
  end if;
end $$;
reset role;
