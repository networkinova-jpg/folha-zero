-- Prova local da Gestão. Não lê copias_conta e não grava valor.

do $$
declare
  definer boolean;
  n integer;
begin
  select p.prosecdef into definer
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'gestao_enviar_carro';
  if definer then raise exception 'envio exposto e security definer'; end if;
  select p.prosecdef into definer
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = 'gestao_enviar_carro';
  if definer is distinct from true then raise exception 'envio privado sem definer'; end if;
  if has_function_privilege('anon', 'public.gestao_enviar_carro(uuid,text,text,text,text,text,text,date,text,date,text,jsonb)', 'execute')
     or has_function_privilege('public', 'public.gestao_consentir(uuid,text,boolean)', 'execute')
     or has_table_privilege('authenticated', 'public.gestao_carros', 'select')
     or has_table_privilege('anon', 'public.gestao_vinculos', 'select')
     or has_function_privilege('authenticated', 'private.gestao_exigir_sessao()', 'execute') then
    raise exception 'grant folgado na gestao';
  end if;
  select count(*) into n from information_schema.columns
  where table_schema = 'public' and table_name = 'gestao_carros'
    and column_name in ('valor', 'ajudante', 'desconto', 'quinzena', 'observacao', 'documento');
  if n <> 0 then raise exception 'ficha com coluna proibida'; end if;
  select count(*) into n
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname like 'gestao\_%' and c.relkind = 'r' and c.relrowsecurity;
  if n <> 8 then raise exception 'rls incompleta %', n; end if;
  select count(*) into n
  from pg_catalog.pg_policy pol
  join pg_catalog.pg_class c on c.oid = pol.polrelid
  join pg_catalog.pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname like 'gestao\_%';
  if n <> 0 then raise exception 'politica aberta'; end if;
end $$;

insert into auth.users (id, email, email_confirmed_at)
values
  ('a1000000-0000-4000-8000-000000000001', 'gestao.gerente@example.invalid', now()),
  ('a1000000-0000-4000-8000-000000000002', 'gestao.prestador@example.invalid', now())
on conflict (id) do update set email = excluded.email, email_confirmed_at = excluded.email_confirmed_at;

insert into public.painel_empresas (id, nome, gerente_email, gerente_user_id, status)
values ('a2000000-0000-4000-8000-000000000001', 'Oficina Norte Gestao', 'gestao.gerente@example.invalid', 'a1000000-0000-4000-8000-000000000001', 'ativo')
on conflict (id) do nothing;

insert into public.painel_contas (user_id, email, nome, tipo, empresa_id, status)
values ('a1000000-0000-4000-8000-000000000001', 'gestao.gerente@example.invalid', 'Gerente Teste', 'gerente', 'a2000000-0000-4000-8000-000000000001', 'ativo')
on conflict (user_id) do update set tipo = 'gerente', empresa_id = excluded.empresa_id, status = 'ativo';

insert into public.painel_licencas (empresa_id, inicio, validade, status)
values ('a2000000-0000-4000-8000-000000000001', current_date, current_date + 30, 'ativa');

set role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', false);
do $$
declare
  equipe uuid;
  codigo text;
  vinculo uuid;
  sla jsonb;
  lista jsonb;
  n integer;
begin
  equipe := (public.gestao_criar_equipe('a2000000-0000-4000-8000-000000000001', 'Time A') ->> 'equipe')::uuid;
  codigo := public.gestao_criar_convite('a2000000-0000-4000-8000-000000000001', 'gestao.prestador@example.invalid', equipe) ->> 'codigo';
  perform set_config('gestao.codigo', codigo, false);
  perform set_config('gestao.equipe', equipe::text, false);
  sla := public.gestao_sla_listar('a2000000-0000-4000-8000-000000000001');
  select count(*) into n from jsonb_array_elements(sla);
  if n <> 10 then raise exception 'sla sem os dez %', n; end if;
  if exists (
    select 1 from jsonb_array_elements(sla) e
    where (e ->> 'prazo_horas_uteis')::numeric <> 8
  ) then
    raise exception 'sla nao comecou em 8';
  end if;
  perform public.gestao_sla_definir('a2000000-0000-4000-8000-000000000001', 'Vidro', 6);
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000002', false);
do $$
declare
  codigo text;
  vinculo uuid;
  aberto jsonb;
  troca jsonb;
  confirmado jsonb;
begin
  select current_setting('gestao.codigo') into codigo;
  vinculo := (public.gestao_aceitar_convite(codigo) ->> 'vinculo')::uuid;
  begin
    perform public.gestao_consentir(vinculo, 'li apenas', false);
    raise exception 'ataque passou: consentimento implicito';
  exception when others then
    if sqlerrm like 'ataque passou:%' then raise; end if;
    if sqlerrm not like '%sem_confirmacao%' then raise exception 'consentimento: %', sqlerrm; end if;
  end;
  perform public.gestao_consentir(vinculo, 'Concordo em compartilhar com Oficina Norte Gestao', true);
  aberto := public.gestao_dispositivo_abrir('aparelho-prestador-1', 'teste');
  if aberto ->> 'acao' is distinct from 'ativo' then raise exception 'aparelho %', aberto; end if;
  troca := public.gestao_dispositivo_abrir('aparelho-prestador-2', 'outro');
  if troca ->> 'motivo' is distinct from 'troca_pendente' then raise exception 'troca %', troca; end if;
  confirmado := public.gestao_dispositivo_confirmar('aparelho-prestador-2', 'outro', true);
  if confirmado ->> 'acao' is distinct from 'trocou' then raise exception 'confirma %', confirmado; end if;
  perform public.gestao_enviar_carro(
    'a2000000-0000-4000-8000-000000000001', 'aparelho-prestador-2', 'origem-1',
    'OS-GESTAO', 'Carro compartilhado', 'Tapeçaria', 'Finalizado',
    current_date, '08:00', current_date, '12:00',
    '[{"motivo":"Faltando peça","outro":false,"inicio":"2026-11-23T09:00","fim":"2026-11-23T09:30"},{"motivo":"Fim de expediente","outro":false,"inicio":"2026-11-23T12:00","fim":"2026-11-23T13:00"}]'::jsonb
  );
  perform set_config('gestao.vinculo', vinculo::text, false);
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', false);
do $$
declare
  lista jsonb;
  carro jsonb;
  chave text;
begin
  lista := public.gestao_listar_carros('a2000000-0000-4000-8000-000000000001');
  if lista::text ilike '%valor%' or lista::text ilike '%ajudante%' or lista::text ilike '%desconto%' or lista::text ilike '%quinzena%' or lista::text ilike '%observacao%' then
    raise exception 'lista vazou dado particular: %', lista;
  end if;
  select value into carro from jsonb_array_elements(lista) limit 1;
  if carro ->> 'os' is distinct from 'OS-GESTAO' then raise exception 'carro %', carro; end if;
  for chave in select jsonb_object_keys(carro)
  loop
    if chave not in ('id', 'os', 'veiculo', 'setor', 'situacao', 'data_inicio', 'hora_inicio', 'data_termino', 'hora_termino', 'status', 'equipe_id', 'origem_id', 'prestador_email', 'prestador_nome', 'pausas') then
      raise exception 'coluna indevida %', chave;
    end if;
  end loop;
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000002', false);
do $$
declare
  vinculo uuid;
  resposta jsonb;
  n integer;
begin
  vinculo := current_setting('gestao.vinculo')::uuid;
  resposta := public.gestao_revogar_vinculo(vinculo);
  if resposta ->> 'apagou_local' is distinct from 'false' then raise exception 'apagou %', resposta; end if;
  if (resposta ->> 'fichas_encerradas')::int < 1 then raise exception 'nao encerrou %', resposta; end if;
  begin
    perform public.gestao_enviar_carro(
      'a2000000-0000-4000-8000-000000000001', 'aparelho-prestador-2', 'origem-2',
      'OS-NOVA', 'Outro carro', 'Vidro', 'Em processo',
      current_date, '08:00', null, null, '[]'::jsonb
    );
    raise exception 'ataque passou: envio depois da revogacao';
  exception when others then
    if sqlerrm like 'ataque passou:%' then raise; end if;
    if sqlerrm not like '%sem_consentimento%' then raise exception 'reenvio: %', sqlerrm; end if;
  end;
end $$;
reset role;

do $$
declare n integer;
begin
  select count(*) into n from public.gestao_carros where origem_id = 'origem-1' and status = 'encerrado';
  if n <> 1 then raise exception 'historico %', n; end if;
  select count(*) into n from public.gestao_pausas p
  join public.gestao_carros c on c.id = p.carro_id
  where c.origem_id = 'origem-1';
  if n <> 2 then raise exception 'pausas %', n; end if;
end $$;

set role anon;
do $$
begin
  perform public.gestao_dispositivo_ver();
  raise exception 'ataque passou: anon';
exception when insufficient_privilege then null;
when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
  raise exception 'anon: %', sqlerrm;
end $$;
reset role;
