-- Prova local do backup variável. Não apaga as outras tabelas.

do $$
declare n int;
begin
  select count(*) into n
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public'
    and c.relname in ('snapshots_privados', 'copias_fixture_teste')
    and t.tgname = 'backups_teste_app_validar'
    and not t.tgisinternal;
  if n <> 0 then raise exception 'trigger novo vazou para tabela antiga'; end if;
end $$;

do $$
declare definer boolean;
declare args text;
begin
  select p.prosecdef, pg_catalog.pg_get_function_identity_arguments(p.oid)
    into definer, args
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'backup_teste_gravar';
  if definer then raise exception 'wrapper exposto e security definer'; end if;
  if args is distinct from 'p_revisao_esperada integer, p_documento jsonb' then
    raise exception 'assinatura do wrapper: %', args;
  end if;
  select p.prosecdef into definer
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = 'backup_teste_aplicar';
  if definer is distinct from true then raise exception 'aplicar deixou de ser definer'; end if;
  if has_function_privilege('anon', 'public.backup_teste_gravar(integer,jsonb)', 'execute')
     or has_function_privilege('public', 'public.backup_teste_gravar(integer,jsonb)', 'execute') then
    raise exception 'anon ou public executa o wrapper';
  end if;
  if not has_function_privilege('authenticated', 'public.backup_teste_gravar(integer,jsonb)', 'execute') then
    raise exception 'authenticated sem execute no wrapper';
  end if;
  if has_function_privilege('anon', 'private.backup_teste_aplicar(integer,jsonb)', 'execute')
     or has_function_privilege('public', 'private.backup_teste_aplicar(integer,jsonb)', 'execute') then
    raise exception 'anon ou public executa aplicar';
  end if;
  if not has_function_privilege('authenticated', 'private.backup_teste_aplicar(integer,jsonb)', 'execute') then
    raise exception 'cadeia do invoker sem execute em aplicar';
  end if;
  if has_function_privilege('authenticated', 'private.backup_teste_documento_valido(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'private.backup_teste_data_ok(text)', 'execute')
     or has_function_privilege('authenticated', 'private.backup_teste_local_ok(text)', 'execute')
     or has_function_privilege('authenticated', 'private.backup_teste_utc_ok(text)', 'execute')
     or has_function_privilege('authenticated', 'private.backup_teste_inteiro_ok(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'private.backup_teste_validar()', 'execute')
     or has_function_privilege('anon', 'private.backup_teste_documento_valido(jsonb)', 'execute')
     or has_function_privilege('anon', 'private.backup_teste_aplicar(integer,jsonb)', 'execute') then
    raise exception 'helper exposto a anon ou authenticated';
  end if;
  if has_schema_privilege('anon', 'public', 'create')
     or has_schema_privilege('authenticated', 'public', 'create')
     or has_schema_privilege('anon', 'private', 'create')
     or has_schema_privilege('authenticated', 'private', 'create') then
    raise exception 'anon ou authenticated cria no schema';
  end if;
  if has_table_privilege('authenticated', 'public.backups_teste_app', 'insert')
     or has_table_privilege('authenticated', 'public.backups_teste_app', 'update')
     or has_table_privilege('authenticated', 'public.backups_teste_app', 'delete')
     or has_table_privilege('anon', 'public.backups_teste_app', 'select') then
    raise exception 'grant de tabela folgado';
  end if;
end $$;

create temp table doc_variavel (documento jsonb);
insert into doc_variavel (documento) values ($fx$
{
  "version": 2,
  "entries": [
    {
      "id": "fx-aco-01",
      "empresa": "INOVA Blindagem",
      "setor": "Tapeçaria",
      "os": "OS-FIXTURE-01",
      "veiculo": "Veículo fictício",
      "dataInicio": "2026-11-02",
      "horaInicio": "08:15",
      "dataTermino": "2026-11-02",
      "horaTermino": "17:00",
      "situacao": "Finalizado",
      "pausas": [
        {"motivo": "Fim de expediente", "inicio": "2026-11-02T12:00", "fim": "2026-11-02T13:00"},
        {"motivo": "Aço da maçaneta", "inicio": "2026-11-02T15:00", "fim": "2026-11-02T15:20", "outro": true}
      ],
      "valor": 0,
      "ajudante": 0,
      "obs": "Peça de teste com acento",
      "exemplo": true,
      "createdAt": 1762041600000,
      "updatedAt": 1762070400000
    },
    {
      "id": "carro-novo-1",
      "empresa": "Concept Blindados",
      "setor": "Tapeçaria",
      "os": "OS-NOVO-1",
      "veiculo": "Carro novo",
      "dataInicio": "2026-11-08",
      "horaInicio": "10:00",
      "dataTermino": null,
      "horaTermino": null,
      "situacao": "Em processo",
      "pausas": [
        {"motivo": "Faltando peça", "inicio": "2026-11-08T11:00", "fim": null}
      ],
      "valor": null,
      "ajudante": 0,
      "obs": "Observação editada com aço",
      "exemplo": false,
      "createdAt": 1762600000000,
      "updatedAt": 1762601000000
    }
  ],
  "quinzenas": {"INOVA Blindagem|2026-11|1": "Aberta"},
  "descontos": {},
  "settings": {
    "operador": "Pessoa Exemplo",
    "setorOperador": "Tapeçaria",
    "lastBackup": null,
    "valorPadrao": {"INOVA Blindagem": 0},
    "aliquota": {}
  }
}
$fx$::jsonb);
grant select on doc_variavel to authenticated;

do $$
declare base jsonb; ruim jsonb; ok boolean;
begin
  select documento into base from doc_variavel;
  if private.backup_teste_documento_valido(base) is distinct from true then
    raise exception 'documento legitimo recusado';
  end if;
  if private.backup_teste_documento_valido(jsonb_set(base, '{entries,1,dataInicio}', '"2024-02-29"'::jsonb)) is distinct from true then
    raise exception 'bissexto legitimo recusado';
  end if;
  foreach ruim in array array[
    jsonb_set(base, '{entries,0,setor}', 'null'::jsonb),
    jsonb_set(base, '{entries,0,situacao}', 'null'::jsonb),
    jsonb_set(base, '{entries,0,id}', '123'::jsonb),
    jsonb_set(base, '{entries,0,empresa}', 'true'::jsonb),
    jsonb_set(base, '{entries,0,os}', '10'::jsonb),
    jsonb_set(base, '{entries,0,veiculo}', '{"a":1}'::jsonb),
    jsonb_set(base, '{settings,operador}', '7'::jsonb),
    jsonb_set(base, '{settings,setorOperador}', 'null'::jsonb),
    jsonb_set(base, '{entries,0,pausas,0,motivo}', '1'::jsonb),
    jsonb_set(base, '{entries,0,pausas,0,inicio}', '"2026-99-99T12:00"'::jsonb),
    jsonb_set(base, '{entries,0,pausas,0,fim}', '"2026-11-02T11:00"'::jsonb),
    jsonb_set(base, '{entries,1,horaTermino}', '"09:00"'::jsonb),
    jsonb_set(base, '{entries,1,dataInicio}', '"2026-02-29"'::jsonb),
    jsonb_set(base, '{entries,1,dataInicio}', '"2026-02-31"'::jsonb),
    jsonb_set(base, '{entries,0,createdAt}', '1.5'::jsonb),
    jsonb_set(base, '{entries,0,updatedAt}', '1'::jsonb),
    jsonb_set(base, '{quinzenas}', '{"INOVA Blindagem|2026-99|1":"Aberta"}'::jsonb),
    jsonb_set(base, '{settings,lastBackup}', '"2026-99-99Tqualquer"'::jsonb),
    jsonb_set(base, '{settings,trialInicio}', '"qualquer"'::jsonb),
    jsonb_set(base, '{settings,aliquota}', '{"chave-com-mais-de-oitenta-caracteres-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa": 1}'::jsonb)
  ]
  loop
    ok := private.backup_teste_documento_valido(ruim);
    if ok is distinct from false then
      raise exception 'payload impossivel foi aceito';
    end if;
  end loop;
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
select public.backup_teste_gravar(null, documento) from doc_variavel;

do $$
declare lido jsonb; rev int;
begin
  select documento, revisao into lido, rev from public.backups_teste_app;
  if lido is distinct from (select documento from doc_variavel) then
    raise exception 'round-trip alterou o documento';
  end if;
  if rev is distinct from 1 then raise exception 'revisao inicial %', rev; end if;
  if (lido->'entries'->1->>'obs') is distinct from 'Observação editada com aço' then raise exception 'obs perdida'; end if;
  if (lido->'entries'->0->>'valor') is distinct from '0' then raise exception 'zero alterado'; end if;
  if jsonb_typeof((lido->'entries'->1)->'valor') is distinct from 'null' then raise exception 'ausencia preenchida'; end if;
  if (lido->'entries'->1->'pausas'->0->>'motivo') is distinct from 'Faltando peça' then raise exception 'pausa perdida'; end if;
  if (lido->'settings'->>'operador') is distinct from 'Pessoa Exemplo' then raise exception 'settings perdidos'; end if;
end $$;

do $$
begin
  perform public.backup_teste_gravar(null, (select documento from doc_variavel));
  raise exception 'ataque passou: segunda linha';
exception when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
  if sqlerrm not like '%revisao_divergente%' then
    raise exception 'segunda linha com erro inesperado: %', sqlerrm;
  end if;
end $$;

select public.backup_teste_gravar(1, jsonb_set(documento, '{entries,1,obs}', '"Observação editada de novo"'::jsonb))
from doc_variavel;

do $$
declare obs text; rev int;
begin
  select documento->'entries'->1->>'obs', revisao into obs, rev from public.backups_teste_app;
  if obs is distinct from 'Observação editada de novo' then raise exception 'update nao gravou obs'; end if;
  if rev is distinct from 2 then raise exception 'revisao nao avancou: %', rev; end if;
end $$;

select private.backup_teste_aplicar(2, jsonb_set(documento, '{entries,1,obs}', '"Observação pela função privada"'::jsonb))
from doc_variavel;

do $$
declare obs text; rev int; dono uuid;
begin
  select documento->'entries'->1->>'obs', revisao, owner_id into obs, rev, dono
  from public.backups_teste_app;
  if obs is distinct from 'Observação pela função privada' then raise exception 'chamada direta nao gravou'; end if;
  if rev is distinct from 3 then raise exception 'chamada direta nao avancou: %', rev; end if;
  if dono is distinct from '11111111-1111-4111-8111-111111111111'::uuid then
    raise exception 'chamada direta trocou o dono';
  end if;
end $$;

do $$
declare antes text;
begin
  select documento->'entries'->1->>'obs' into antes from public.backups_teste_app;
  begin
    update public.backups_teste_app
    set revisao = revisao + 1
    where owner_id = '11111111-1111-4111-8111-111111111111';
    raise exception 'ataque passou: update direto';
  exception when insufficient_privilege then
    null;
  when others then
    if sqlerrm like 'ataque passou:%' then raise; end if;
    raise exception 'update direto com erro inesperado: %', sqlerrm;
  end;
  if (select documento->'entries'->1->>'obs' from public.backups_teste_app) is distinct from antes then
    raise exception 'update direto alterou o documento';
  end if;
  begin
    perform public.backup_teste_gravar(1, (select documento from doc_variavel));
    raise exception 'ataque passou: revisao velha';
  exception when others then
    if sqlerrm like 'ataque passou:%' then raise; end if;
    if sqlerrm not like '%revisao_divergente%' then
      raise exception 'revisao velha com erro inesperado: %', sqlerrm;
    end if;
  end;
  if (select documento->'entries'->1->>'obs' from public.backups_teste_app) is distinct from antes then
    raise exception 'revisao velha alterou o documento';
  end if;
end $$;

do $$
declare ruim jsonb;
begin
  select documento || '{"marca":"fixture-teste"}'::jsonb into ruim from doc_variavel;
  perform public.backup_teste_gravar(2, ruim);
  raise exception 'ataque passou: extra';
exception when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
  if sqlerrm not like '%carga_invalida%' then raise exception 'extra com erro inesperado: %', sqlerrm; end if;
end $$;

do $$
declare ruim jsonb;
begin
  select documento - 'entries' into ruim from doc_variavel;
  perform public.backup_teste_gravar(2, ruim);
  raise exception 'ataque passou: sem entries';
exception when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
  if sqlerrm not like '%carga_invalida%' then raise exception 'sem entries com erro inesperado: %', sqlerrm; end if;
end $$;

do $$
declare ruim jsonb;
begin
  select jsonb_set(documento, '{entries,1,valor}', '"dez"'::jsonb) into ruim from doc_variavel;
  perform public.backup_teste_gravar(2, ruim);
  raise exception 'ataque passou: valor texto';
exception when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
  if sqlerrm not like '%carga_invalida%' then raise exception 'valor texto com erro inesperado: %', sqlerrm; end if;
end $$;

do $$
declare ruim jsonb;
begin
  select jsonb_set(documento, '{entries,0,valor}', '-1'::jsonb) into ruim from doc_variavel;
  perform public.backup_teste_gravar(2, ruim);
  raise exception 'ataque passou: valor negativo';
exception when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
  if sqlerrm not like '%carga_invalida%' then raise exception 'valor negativo com erro inesperado: %', sqlerrm; end if;
end $$;

do $$
declare ruim jsonb;
begin
  select jsonb_set(documento, '{entries,1,id}', '"fx-aco-01"'::jsonb) into ruim from doc_variavel;
  perform public.backup_teste_gravar(2, ruim);
  raise exception 'ataque passou: id duplicado';
exception when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
  if sqlerrm not like '%carga_invalida%' then raise exception 'id duplicado com erro inesperado: %', sqlerrm; end if;
end $$;

do $$
declare ruim jsonb;
begin
  select jsonb_set(documento, '{entries,1,dataInicio}', '"2026-02-31"'::jsonb) into ruim from doc_variavel;
  perform public.backup_teste_gravar(2, ruim);
  raise exception 'ataque passou: data';
exception when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
  if sqlerrm not like '%carga_invalida%' then raise exception 'data com erro inesperado: %', sqlerrm; end if;
end $$;

do $$
declare grande jsonb;
begin
  select jsonb_set(documento, '{entries,1,obs}', to_jsonb(repeat('x', 70000))) into grande from doc_variavel;
  perform public.backup_teste_gravar(2, grande);
  raise exception 'ataque passou: grande';
exception when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
  if sqlerrm not like '%carga_grande%' and sqlerrm not like '%carga_invalida%' then
    raise exception 'grande com erro inesperado: %', sqlerrm;
  end if;
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
do $$
declare n int;
begin
  select count(*) into n from public.backups_teste_app;
  if n <> 0 then raise exception 'outra conta viu o backup: %', n; end if;
end $$;
do $$
declare antes text;
begin
  select documento->'entries'->1->>'obs' into antes
  from public.backups_teste_app
  where owner_id = '11111111-1111-4111-8111-111111111111';
  begin
    insert into public.backups_teste_app (owner_id, revisao, bytes, documento)
    select '11111111-1111-4111-8111-111111111111', 1, 1, documento from doc_variavel;
    raise exception 'ataque passou: insert direto';
  exception when insufficient_privilege then
    null;
  when others then
    if sqlerrm like 'ataque passou:%' then raise; end if;
    raise exception 'insert direto com erro inesperado: %', sqlerrm;
  end;
  begin
    perform private.backup_teste_documento_valido((select documento from doc_variavel));
    raise exception 'ataque passou: helper';
  exception when insufficient_privilege then
    null;
  when others then
    if sqlerrm like 'ataque passou:%' then raise; end if;
    raise exception 'helper com erro inesperado: %', sqlerrm;
  end;
  begin
    perform private.backup_teste_aplicar(3, (select documento from doc_variavel));
    raise exception 'ataque passou: revisao de outra conta';
  exception when others then
    if sqlerrm like 'ataque passou:%' then raise; end if;
    if sqlerrm not like '%revisao_divergente%' then
      raise exception 'revisao de outra conta com erro inesperado: %', sqlerrm;
    end if;
  end;
  perform private.backup_teste_aplicar(null, (select documento from doc_variavel));
end $$;
reset role;

do $$
declare obs_a text; rev_a int; dono_b uuid; n_b int;
begin
  select documento->'entries'->1->>'obs', revisao into obs_a, rev_a
  from public.backups_teste_app
  where owner_id = '11111111-1111-4111-8111-111111111111';
  if obs_a is distinct from 'Observação pela função privada' or rev_a is distinct from 3 then
    raise exception 'outra conta alterou o original';
  end if;
  select count(*) into n_b
  from public.backups_teste_app
  where owner_id = '22222222-2222-4222-8222-222222222222';
  select owner_id into dono_b
  from public.backups_teste_app
  where owner_id = '22222222-2222-4222-8222-222222222222';
  if n_b is distinct from 1 or dono_b is distinct from '22222222-2222-4222-8222-222222222222'::uuid then
    raise exception 'chamada direta nao ficou na propria conta';
  end if;
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub', '66666666-6666-4666-8666-666666666666', false);
do $$
declare n int;
begin
  select count(*) into n from public.backups_teste_app;
  if n <> 0 then raise exception 'proprietario leu o backup: %', n; end if;
end $$;
reset role;

set role anon;
do $$
begin
  perform 1 from public.backups_teste_app;
  raise exception 'ataque passou: anon';
exception when insufficient_privilege then
  null;
when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
end $$;
do $$
begin
  perform public.backup_teste_gravar(null, (select documento from doc_variavel));
  raise exception 'ataque passou: anon wrapper';
exception when insufficient_privilege then
  null;
when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
  raise exception 'anon wrapper com erro inesperado: %', sqlerrm;
end $$;
do $$
begin
  perform private.backup_teste_aplicar(null, (select documento from doc_variavel));
  raise exception 'ataque passou: anon aplicar';
exception when insufficient_privilege then
  null;
when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
  raise exception 'anon aplicar com erro inesperado: %', sqlerrm;
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '', false);
do $$
begin
  perform public.backup_teste_gravar(null, (select documento from doc_variavel));
  raise exception 'ataque passou: sessao ausente';
exception when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
  if sqlerrm not like '%sessao_ausente%' then
    raise exception 'sessao ausente com erro inesperado: %', sqlerrm;
  end if;
  begin
    perform private.backup_teste_aplicar(null, (select documento from doc_variavel));
    raise exception 'ataque passou: sessao ausente direta';
  exception when others then
    if sqlerrm like 'ataque passou:%' then raise; end if;
    if sqlerrm not like '%sessao_ausente%' then
      raise exception 'sessao ausente direta com erro inesperado: %', sqlerrm;
    end if;
  end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
do $$
declare antes uuid;
begin
  select id into antes from public.backups_teste_app
  where owner_id = '11111111-1111-4111-8111-111111111111';
  begin
    update public.backups_teste_app
    set id = gen_random_uuid()
    where owner_id = '11111111-1111-4111-8111-111111111111';
    raise exception 'ataque passou: id';
  exception when others then
    if sqlerrm like 'ataque passou:%' then raise; end if;
    if sqlerrm not like '%metadado_protegido%' then
      raise exception 'id com erro inesperado: %', sqlerrm;
    end if;
  end;
  if (select id from public.backups_teste_app
      where owner_id = '11111111-1111-4111-8111-111111111111') is distinct from antes then
    raise exception 'id mudou';
  end if;
end $$;
