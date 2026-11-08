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

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
insert into public.backups_teste_app (owner_id, revisao, bytes, documento)
select '11111111-1111-4111-8111-111111111111', 9, 1, documento from doc_variavel;

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
  insert into public.backups_teste_app (owner_id, revisao, bytes, documento)
  select '11111111-1111-4111-8111-111111111111', 1, 1, documento from doc_variavel;
  raise exception 'ataque passou: segunda linha';
exception when unique_violation then
  null;
when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
  raise exception 'segunda linha com erro inesperado: %', sqlerrm;
end $$;

update public.backups_teste_app
set documento = jsonb_set(documento, '{entries,1,obs}', '"Observação editada de novo"'::jsonb),
    revisao = revisao + 1
where owner_id = '11111111-1111-4111-8111-111111111111' and revisao = 1;

do $$
declare obs text; rev int;
begin
  select documento->'entries'->1->>'obs', revisao into obs, rev from public.backups_teste_app;
  if obs is distinct from 'Observação editada de novo' then raise exception 'update nao gravou obs'; end if;
  if rev is distinct from 2 then raise exception 'revisao nao avancou: %', rev; end if;
end $$;

do $$
begin
  update public.backups_teste_app
  set revisao = 9
  where owner_id = '11111111-1111-4111-8111-111111111111' and revisao = 2;
  raise exception 'ataque passou: revisao';
exception when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
  if sqlerrm not like '%revisao_divergente%' then
    raise exception 'revisao com erro inesperado: %', sqlerrm;
  end if;
end $$;

do $$
declare ruim jsonb;
begin
  select documento || '{"marca":"fixture-teste"}'::jsonb into ruim from doc_variavel;
  update public.backups_teste_app set documento = ruim, revisao = revisao + 1
  where owner_id = '11111111-1111-4111-8111-111111111111' and revisao = 2;
  raise exception 'ataque passou: extra';
exception when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
  if sqlerrm not like '%carga_invalida%' then raise exception 'extra com erro inesperado: %', sqlerrm; end if;
end $$;

do $$
declare ruim jsonb;
begin
  select documento - 'entries' into ruim from doc_variavel;
  update public.backups_teste_app set documento = ruim, revisao = revisao + 1
  where owner_id = '11111111-1111-4111-8111-111111111111' and revisao = 2;
  raise exception 'ataque passou: sem entries';
exception when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
  if sqlerrm not like '%carga_invalida%' then raise exception 'sem entries com erro inesperado: %', sqlerrm; end if;
end $$;

do $$
declare ruim jsonb;
begin
  select jsonb_set(documento, '{entries,1,valor}', '"dez"'::jsonb) into ruim from doc_variavel;
  update public.backups_teste_app set documento = ruim, revisao = revisao + 1
  where owner_id = '11111111-1111-4111-8111-111111111111' and revisao = 2;
  raise exception 'ataque passou: valor texto';
exception when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
  if sqlerrm not like '%carga_invalida%' then raise exception 'valor texto com erro inesperado: %', sqlerrm; end if;
end $$;

do $$
declare ruim jsonb;
begin
  select jsonb_set(documento, '{entries,0,valor}', '-1'::jsonb) into ruim from doc_variavel;
  update public.backups_teste_app set documento = ruim, revisao = revisao + 1
  where owner_id = '11111111-1111-4111-8111-111111111111' and revisao = 2;
  raise exception 'ataque passou: valor negativo';
exception when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
  if sqlerrm not like '%carga_invalida%' then raise exception 'valor negativo com erro inesperado: %', sqlerrm; end if;
end $$;

do $$
declare ruim jsonb;
begin
  select jsonb_set(documento, '{entries,1,id}', '"fx-aco-01"'::jsonb) into ruim from doc_variavel;
  update public.backups_teste_app set documento = ruim, revisao = revisao + 1
  where owner_id = '11111111-1111-4111-8111-111111111111' and revisao = 2;
  raise exception 'ataque passou: id duplicado';
exception when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
  if sqlerrm not like '%carga_invalida%' then raise exception 'id duplicado com erro inesperado: %', sqlerrm; end if;
end $$;

do $$
declare ruim jsonb;
begin
  select jsonb_set(documento, '{entries,1,dataInicio}', '"2026-02-31"'::jsonb) into ruim from doc_variavel;
  update public.backups_teste_app set documento = ruim, revisao = revisao + 1
  where owner_id = '11111111-1111-4111-8111-111111111111' and revisao = 2;
  raise exception 'ataque passou: data';
exception when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
  if sqlerrm not like '%carga_invalida%' then raise exception 'data com erro inesperado: %', sqlerrm; end if;
end $$;

do $$
declare grande jsonb;
begin
  select jsonb_set(documento, '{entries,1,obs}', to_jsonb(repeat('x', 70000))) into grande from doc_variavel;
  update public.backups_teste_app set documento = grande, revisao = revisao + 1
  where owner_id = '11111111-1111-4111-8111-111111111111' and revisao = 2;
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
begin
  insert into public.backups_teste_app (owner_id, revisao, bytes, documento)
  select '11111111-1111-4111-8111-111111111111', 1, 1, documento from doc_variavel;
  raise exception 'ataque passou: spoof';
exception when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
  if sqlerrm not like '%dono_alterado%' and sqlerrm not like '%row-level security%' then
    raise exception 'spoof com erro inesperado: %', sqlerrm;
  end if;
end $$;
reset role;

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
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '', false);
do $$
begin
  insert into public.backups_teste_app (owner_id, revisao, bytes, documento)
  select '11111111-1111-4111-8111-111111111111', 1, 1, documento from doc_variavel;
  raise exception 'ataque passou: sessao ausente';
exception when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
  if sqlerrm not like '%sessao_ausente%' and sqlerrm not like '%row-level security%' then
    raise exception 'sessao ausente com erro inesperado: %', sqlerrm;
  end if;
end $$;
reset role;
