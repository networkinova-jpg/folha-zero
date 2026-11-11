-- Ataques reais contra o SQL aplicado. Falha esperada em cada ataque.
-- Papéis: anon, authenticated com auth.uid() de pessoas fictícias.

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'ana.teste@example.invalid'),
  ('22222222-2222-4222-8222-222222222222', 'bruno.teste@example.invalid'),
  ('55555555-5555-4555-8555-555555555555', 'eva.teste@example.invalid'),
  ('33333333-3333-4333-8333-333333333333', 'carla.teste@example.invalid'),
  ('44444444-4444-4444-8444-444444444444', 'diego.teste@example.invalid'),
  ('66666666-6666-4666-8666-666666666666', 'prop.teste@example.invalid');

insert into public.organizacoes (id, nome) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'INOVA Blindagem'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Oficina Exemplo Beta');

insert into public.org_membros (org_id, user_id, papel, setor, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'prestador', 'Tapeçaria', 'ativo'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'equipe', 'Tapeçaria', 'ativo'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '55555555-5555-4555-8555-555555555555', 'equipe', '', 'ativo'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'gerente', '', 'ativo'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '44444444-4444-4444-8444-444444444444', 'gerente', '', 'ativo');

insert into public.proprietarios (user_id, ativo, bootstrap)
values ('66666666-6666-4666-8666-666666666666', true, 'servidor');

insert into public.lancamentos (id, client_id, owner_id, org_id, empresa, setor, os, veiculo)
values
  ('c1111111-1111-4111-8111-111111111111', 'carro-pessoal', '11111111-1111-4111-8111-111111111111', null, 'Cliente Norte Teste', 'Tapeçaria', 'OS-TESTE-001', 'Carro Exemplo'),
  ('c2222222-2222-4222-8222-222222222222', 'carro-vazio', '11111111-1111-4111-8111-111111111111', null, 'Cliente Norte Teste', '', 'OS-TESTE-002', 'Carro Exemplo');

insert into public.lancamento_valores (lancamento_id, owner_id, valor)
values ('c1111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 123.45);

insert into public.consentimentos (id, user_id, org_id, finalidade, versao_texto, escopo, aceito_em)
values (
  'd1111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Compartilhar producao sem valores',
  '2026-11-07',
  '{"empresas":["Cliente Norte Teste"],"setores":["Tapeçaria",""]}'::jsonb,
  now()
);

insert into public.compartilhamentos (lancamento_id, owner_id, org_id, consentimento_id, retido)
values
  ('c1111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'd1111111-1111-4111-8111-111111111111', false),
  ('c2222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'd1111111-1111-4111-8111-111111111111', true);

-- Grants e ausência de extensão.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pgcrypto') then
    raise exception 'pgcrypto nao deveria existir';
  end if;
  if has_function_privilege('anon', 'private.folha_sou_membro(uuid)', 'EXECUTE') then
    raise exception 'anon executa helper';
  end if;
  if has_function_privilege('anon', 'private.folha_sou_gerente(uuid)', 'EXECUTE') then
    raise exception 'anon executa gerente';
  end if;
  if has_function_privilege('anon', 'private.folha_sou_proprietario()', 'EXECUTE') then
    raise exception 'anon executa proprietario';
  end if;
  if has_function_privilege('public', 'private.folha_sou_membro(uuid)', 'EXECUTE') then
    raise exception 'public executa helper';
  end if;
  if not has_function_privilege('authenticated', 'private.folha_sou_membro(uuid)', 'EXECUTE') then
    raise exception 'authenticated precisa do helper de policy';
  end if;
  if has_function_privilege('anon', 'public.folha_decidir_solicitacao(uuid,text)', 'EXECUTE') then
    raise exception 'anon executa rpc';
  end if;
  if has_function_privilege('authenticated', 'private.folha_auditar(text,text,uuid)', 'EXECUTE') then
    raise exception 'authenticated nao deve chamar auditoria direto';
  end if;
  if to_regprocedure('public.folha_sou_membro(uuid)') is not null then
    raise exception 'helper exposto em public';
  end if;
end $$;

-- Prestador cria lançamento pessoal sem organização.
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
insert into public.lancamentos (client_id, owner_id, org_id, empresa, setor, os, veiculo)
values ('carro-novo', '11111111-1111-4111-8111-111111111111', null, 'Cliente Sul Teste', 'Qualidade', 'OS-TESTE-003', 'Outro Exemplo');
reset role;

-- Ataques.
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);

do $$
begin
  insert into public.pausas (lancamento_id, owner_id, motivo, outro, inicio)
  values ('c1111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'Faltando peça', false, now());
  raise exception 'ataque passou: pausa no lancamento alheio';
exception when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
end $$;

do $$
begin
  insert into public.lancamento_valores (lancamento_id, owner_id, valor)
  values ('c1111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 1);
  raise exception 'ataque passou: valor no lancamento alheio';
exception when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
end $$;

do $$
begin
  insert into public.lancamentos (client_id, owner_id, org_id, empresa, setor, os, veiculo)
  values ('invasao', '22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Oficina Exemplo Beta', 'Tapeçaria', 'OS-X', 'X');
  raise exception 'ataque passou: insert em org de terceiro';
exception when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
end $$;

do $$
declare n int;
begin
  select count(*) into n from public.lancamentos where setor = '';
  if n <> 0 then
    raise exception 'equipe de setor vazio viu lancamento sem setor: %', n;
  end if;
  select count(*) into n from public.lancamento_valores;
  if n <> 0 then
    raise exception 'equipe viu valor: %', n;
  end if;
  select count(*) into n from public.lancamentos where id = 'c1111111-1111-4111-8111-111111111111';
  if n <> 1 then
    raise exception 'equipe do setor nao viu producao compartilhada: %', n;
  end if;
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '55555555-5555-4555-8555-555555555555', false);
do $$
declare n int;
begin
  select count(*) into n from public.lancamentos;
  if n <> 0 then
    raise exception 'setor vazio nao deveria ver lancamentos: %', n;
  end if;
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', false);
do $$
declare n int;
begin
  select count(*) into n from public.lancamentos where id = 'c1111111-1111-4111-8111-111111111111';
  if n <> 1 then raise exception 'gerente da empresa nao viu o compartilhado'; end if;
  select count(*) into n from public.lancamento_valores;
  if n <> 0 then raise exception 'gerente viu valor'; end if;
end $$;
reset role;

-- Gerente vê o carro de setor vazio porque o compartilhamento está aberto.
-- Equipe de setor vazio não vê. São regras diferentes.
set role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', false);
do $$
declare n int;
begin
  select count(*) into n from public.lancamentos where id = 'c2222222-2222-4222-8222-222222222222';
  if n <> 1 then raise exception 'gerente deveria ver producao compartilhada da propria empresa'; end if;
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', false);
do $$
declare n int;
begin
  select count(*) into n from public.lancamentos;
  if n <> 0 then raise exception 'gerente de outra empresa viu lancamentos: %', n; end if;
  select count(*) into n from public.lancamento_valores;
  if n <> 0 then raise exception 'gerente de outra empresa viu valores'; end if;
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '66666666-6666-4666-8666-666666666666', false);
do $$
declare n int;
begin
  select count(*) into n from public.lancamentos;
  if n <> 0 then raise exception 'proprietario viu lancamentos: %', n; end if;
  select count(*) into n from public.lancamento_valores;
  if n <> 0 then raise exception 'proprietario viu valores'; end if;
  select count(*) into n from public.pausas;
  if n <> 0 then raise exception 'proprietario viu pausas'; end if;
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
do $$
begin
  insert into public.proprietarios (user_id, ativo, bootstrap)
  values ('11111111-1111-4111-8111-111111111111', true, 'servidor');
  raise exception 'ataque passou: virou proprietario';
exception when insufficient_privilege then
  null;
when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
end $$;
reset role;

set role anon;
do $$
begin
  perform 1 from public.lancamentos;
  raise exception 'ataque passou: anon leu lancamentos';
exception when insufficient_privilege then
  null;
when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
end $$;
reset role;

-- Revogar encerra a visão do gerente. O lançamento da Ana continua com ela.
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
select public.folha_revogar_consentimento('d1111111-1111-4111-8111-111111111111');
do $$
declare n int;
begin
  select count(*) into n from public.lancamentos where owner_id = (select auth.uid());
  if n < 2 then raise exception 'revogar apagou lancamentos da dona: %', n; end if;
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', false);
do $$
declare n int;
begin
  select count(*) into n from public.lancamentos;
  if n <> 0 then raise exception 'depois de revogar o gerente ainda ve: %', n; end if;
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '66666666-6666-4666-8666-666666666666', false);
do $$
declare n int;
begin
  select count(*) into n from public.auditoria_acesso where acao = 'revogar_consentimento' and alvo_tipo = 'consentimento';
  if n <> 1 then raise exception 'auditoria minima ausente: %', n; end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'auditoria_acesso'
      and column_name in ('os', 'valor', 'email', 'veiculo')
  ) then
    raise exception 'auditoria com coluna privada';
  end if;
end $$;
reset role;

-- Ana ainda é dona. Gerente não vê valor nem depois.
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
do $$
declare n int;
begin
  select count(*) into n from public.lancamento_valores;
  if n <> 1 then raise exception 'dona perdeu o valor: %', n; end if;
end $$;
reset role;
