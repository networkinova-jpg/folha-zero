-- Prova local do painel. Não lê o documento da cópia.

insert into private.painel_donos (user_id)
values ('66666666-6666-4666-8666-666666666666')
on conflict (user_id) do update set ativo = true;

do $$
declare definer boolean;
begin
  select p.prosecdef into definer
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'painel_eu';
  if definer then raise exception 'wrapper exposto e security definer'; end if;
  select p.prosecdef into definer
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = 'painel_ficha_copia';
  if definer is distinct from true then raise exception 'ficha deixou de ser definer'; end if;
  if has_function_privilege('anon', 'public.painel_resumo()', 'execute')
     or has_function_privilege('anon', 'public.painel_aceitar_convite(text)', 'execute')
     or has_table_privilege('authenticated', 'public.painel_contas', 'select')
     or has_table_privilege('anon', 'public.painel_pedidos', 'select')
     or has_table_privilege('authenticated', 'private.painel_donos', 'select') then
    raise exception 'grant folgado';
  end if;
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
select set_config('request.jwt.claim.email', 'ana.teste@example.invalid', false);
do $$
begin
  perform public.painel_resumo();
  raise exception 'ataque passou: nao dono listou';
exception when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
  if sqlerrm not like '%nao_proprietario%' then raise exception 'nao dono: %', sqlerrm; end if;
end $$;
do $$
begin
  insert into public.painel_contas (user_id, email, nome, tipo) values (auth.uid(), 'ana.teste@example.invalid', 'Ana', 'avulso');
  raise exception 'ataque passou: insert direto';
exception when insufficient_privilege then null;
when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
  raise exception 'insert direto: %', sqlerrm;
end $$;
reset role;

set role anon;
do $$
begin
  perform public.painel_eu();
  raise exception 'ataque passou: anon';
exception when insufficient_privilege then null;
when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
  raise exception 'anon: %', sqlerrm;
end $$;
reset role;

create temp table painel_prova (codigo text, pedido uuid);
grant all on painel_prova to authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub', '66666666-6666-4666-8666-666666666666', false);
select set_config('request.jwt.claim.email', 'prop.teste@example.invalid', false);
insert into painel_prova (codigo)
select public.painel_criar_convite('bruno.teste@example.invalid', 'avulso', null) ->> 'codigo';
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
select set_config('request.jwt.claim.email', 'ana.teste@example.invalid', false);
do $$
declare codigo text;
begin
  select painel_prova.codigo into codigo from painel_prova;
  perform public.painel_aceitar_convite(codigo);
  raise exception 'ataque passou: email trocado';
exception when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
  if sqlerrm not like '%email_diferente%' then raise exception 'email trocado: %', sqlerrm; end if;
end $$;
reset role;

do $$
declare situacao text;
begin
  select status into situacao
  from public.painel_convites
  where codigo = (select codigo from painel_prova);
  if situacao is distinct from 'rascunho' then
    raise exception 'convite mudou sem o e-mail certo: %', situacao;
  end if;
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
select set_config('request.jwt.claim.email', 'bruno.teste@example.invalid', false);
update painel_prova
set pedido = (public.painel_aceitar_convite((select codigo from painel_prova)) ->> 'pedido')::uuid;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '66666666-6666-4666-8666-666666666666', false);
select set_config('request.jwt.claim.email', 'prop.teste@example.invalid', false);
select public.painel_decidir_pedido((select pedido from painel_prova), true);
select public.painel_degustar_avulso('22222222-2222-4222-8222-222222222222');
select public.painel_licenciar_avulso('22222222-2222-4222-8222-222222222222', current_date + 30);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
select set_config('request.jwt.claim.email', 'ana.teste@example.invalid', false);
do $$
declare lic jsonb;
begin
  lic := public.painel_minha_licenca();
  if lic ->> 'licenca_validade' is not null or lic ->> 'conta' is not null then
    raise exception 'ana viu licenca de outro: %', lic;
  end if;
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
select set_config('request.jwt.claim.email', 'bruno.teste@example.invalid', false);
do $$
declare lic jsonb;
begin
  lic := public.painel_minha_licenca();
  if lic ->> 'conta' is distinct from 'ativo' then
    raise exception 'bruno nao viu a propria conta: %', lic;
  end if;
  if (lic ->> 'licenca_validade')::date is distinct from current_date + 30 then
    raise exception 'bruno nao viu a propria validade: %', lic;
  end if;
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
select set_config('request.jwt.claim.email', 'bruno.teste@example.invalid', false);
select public.copia_conta_gravar(null, '{"version":2,"entries":[],"segredo":"nao mostrar"}'::jsonb);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '66666666-6666-4666-8666-666666666666', false);
select set_config('request.jwt.claim.email', 'prop.teste@example.invalid', false);
do $$
declare ficha jsonb;
declare lidos int;
begin
  ficha := public.painel_ficha_copia('22222222-2222-4222-8222-222222222222');
  if ficha ? 'documento' or ficha::text like '%nao mostrar%' then
    raise exception 'dono leu documento: %', ficha;
  end if;
  if (ficha ->> 'existe')::boolean is distinct from true or (ficha ->> 'revisao')::int is distinct from 1 then
    raise exception 'ficha incompleta: %', ficha;
  end if;
  select count(*) into lidos from public.copias_conta where documento::text like '%nao mostrar%';
  if lidos <> 0 then
    raise exception 'dono leu a linha da copia';
  end if;
end $$;
do $$
begin
  perform public.painel_criar_empresa('INOVA Blindagem', 'gerente@example.invalid');
  raise exception 'ataque passou: inova';
exception when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
  if sqlerrm not like '%empresa_de_teste%' then raise exception 'inova: %', sqlerrm; end if;
end $$;
reset role;
