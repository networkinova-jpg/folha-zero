-- Prova local da superfície separada. Não apaga public.snapshots_privados.

do $$
declare n int;
begin
  select count(*) into n
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public'
    and c.relname = 'snapshots_privados'
    and not t.tgisinternal;
  if n <> 0 then
    raise exception 'trigger indevido em snapshots reais: %', n;
  end if;
end $$;

update public.snapshots_privados
set documento = documento || '{"livre":true}'::jsonb
where sha256 = 'abc123';

do $$
declare n int;
begin
  select count(*) into n
  from public.snapshots_privados
  where sha256 = 'abc123' and documento ? 'livre';
  if n <> 1 then
    raise exception 'copia real nao aceitou atualizacao livre: %', n;
  end if;
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
insert into public.snapshots_privados (owner_id, sha256, bytes, documento)
values ('11111111-1111-4111-8111-111111111111', repeat('9', 64), 2, '{"entries":[{"id":"real-1"}]}'::jsonb);
reset role;

create temp table canon_local (documento jsonb);
insert into canon_local select private.fixture_canonica();
grant select on canon_local to authenticated;

create temp table variantes (nome text primary key, documento jsonb);
insert into variantes (nome, documento)
select 'sem_entries', documento - 'entries' from canon_local
union all select 'entries_null', jsonb_set(documento, '{entries}', 'null'::jsonb) from canon_local
union all select 'extra_topo', documento || '{"real":true}'::jsonb from canon_local
union all select 'extra_entrada', jsonb_set(documento, '{entries,0,segredo}', '"x"'::jsonb) from canon_local
union all select 'extra_pausa', jsonb_set(documento, '{entries,0,pausas,0,extra}', 'true'::jsonb) from canon_local
union all select 'extra_settings', jsonb_set(documento, '{settings,email}', '"a@b.c"'::jsonb) from canon_local
union all select 'valor_texto', jsonb_set(documento, '{entries,0,valor}', '"dez"'::jsonb) from canon_local
union all select 'valor_negativo', jsonb_set(documento, '{entries,0,valor}', '-1'::jsonb) from canon_local
union all select 'empresa_real', jsonb_set(documento, '{entries,0,empresa}', '"Concept Blindados"'::jsonb) from canon_local
union all select 'sem_inicio_pausa', documento #- '{entries,0,pausas,0,inicio}' from canon_local
union all select 'objeto_vazio', '{}'::jsonb;
grant select on variantes to authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);

insert into public.copias_fixture_teste (owner_id, sha256, bytes, documento)
select '11111111-1111-4111-8111-111111111111',
       '57228492711d49c94d20903583163d3241c7861859d12164a5fdc8ac97b2e365',
       1,
       documento
from canon_local;

do $$
declare lido jsonb;
begin
  select documento into lido from public.copias_fixture_teste;
  if lido is distinct from (select documento from canon_local) then
    raise exception 'round-trip alterou a fixture';
  end if;
  if (lido->'entries'->0->>'id') is distinct from 'fx-aco-01' then raise exception 'id perdido'; end if;
  if (lido->'entries'->1->>'id') is distinct from 'fx-vidro-02' then raise exception 'segundo id perdido'; end if;
  if (lido->'entries'->0->>'dataInicio') is distinct from '2026-11-02' then raise exception 'data perdida'; end if;
  if (lido->'entries'->0->'pausas'->0->>'motivo') is distinct from 'Fim de expediente' then raise exception 'pausa perdida'; end if;
  if (lido->'entries'->0->'pausas'->1->>'motivo') is distinct from 'Aço da maçaneta' then raise exception 'acento perdido'; end if;
  if (lido->'entries'->0->>'veiculo') is distinct from 'Veículo fictício' then raise exception 'acento do veiculo perdido'; end if;
  if (lido->'entries'->0->>'valor') is distinct from '0' then raise exception 'zero alterado'; end if;
  if jsonb_typeof((lido->'entries'->1)->'valor') is distinct from 'null' then raise exception 'ausencia preenchida'; end if;
end $$;

do $$
begin
  insert into public.copias_fixture_teste (owner_id, sha256, bytes, documento)
  select '11111111-1111-4111-8111-111111111111',
         '57228492711d49c94d20903583163d3241c7861859d12164a5fdc8ac97b2e365',
         1, documento from canon_local;
  raise exception 'ataque passou: segunda copia';
exception when unique_violation then
  null;
when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
  if sqlerrm not like '%unique%' and sqlerrm not like '%duplic%' then
    raise exception 'segunda copia com erro inesperado: %', sqlerrm;
  end if;
end $$;

do $$
declare r record;
begin
  for r in select nome, documento from variantes loop
    begin
      insert into public.copias_fixture_teste (owner_id, sha256, bytes, documento)
      values ('11111111-1111-4111-8111-111111111111',
              '57228492711d49c94d20903583163d3241c7861859d12164a5fdc8ac97b2e365',
              1, r.documento);
      raise exception 'ataque passou: %', r.nome;
    exception when others then
      if sqlerrm like 'ataque passou:%' then raise; end if;
      if sqlerrm not like '%carga_invalida%' then
        raise exception '% com erro inesperado: %', r.nome, sqlerrm;
      end if;
    end;
  end loop;
end $$;

do $$
declare grande jsonb;
begin
  select jsonb_set(documento, '{quinzenas,blob}', to_jsonb(repeat('x', 70000))) into grande from canon_local;
  insert into public.copias_fixture_teste (owner_id, sha256, bytes, documento)
  values ('11111111-1111-4111-8111-111111111111',
          '57228492711d49c94d20903583163d3241c7861859d12164a5fdc8ac97b2e365',
          1, grande);
  raise exception 'ataque passou: carga grande';
exception when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
  if sqlerrm not like '%carga_grande%' then
    raise exception 'carga grande com erro inesperado: %', sqlerrm;
  end if;
end $$;

do $$
begin
  insert into public.copias_fixture_teste (owner_id, sha256, bytes, documento)
  select '11111111-1111-4111-8111-111111111111', repeat('a', 64), 1, documento from canon_local;
  raise exception 'ataque passou: sha errado';
exception when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
  if sqlerrm not like '%carga_invalida%' then
    raise exception 'sha errado com erro inesperado: %', sqlerrm;
  end if;
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
do $$
declare n int;
begin
  select count(*) into n from public.copias_fixture_teste;
  if n <> 0 then raise exception 'outra identidade viu a fixture: %', n; end if;
end $$;
insert into public.copias_fixture_teste (owner_id, sha256, bytes, documento)
select '22222222-2222-4222-8222-222222222222',
       '57228492711d49c94d20903583163d3241c7861859d12164a5fdc8ac97b2e365',
       1, documento from canon_local;
do $$
begin
  insert into public.copias_fixture_teste (owner_id, sha256, bytes, documento)
  select '11111111-1111-4111-8111-111111111111',
         '57228492711d49c94d20903583163d3241c7861859d12164a5fdc8ac97b2e365',
         1, documento from canon_local;
  raise exception 'ataque passou: spoof do dono';
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
  select count(*) into n from public.copias_fixture_teste;
  if n <> 0 then raise exception 'proprietario leu a fixture: %', n; end if;
end $$;
reset role;

set role anon;
do $$
begin
  perform 1 from public.copias_fixture_teste;
  raise exception 'ataque passou: anon leu';
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
  insert into public.copias_fixture_teste (owner_id, sha256, bytes, documento)
  select '11111111-1111-4111-8111-111111111111',
         '57228492711d49c94d20903583163d3241c7861859d12164a5fdc8ac97b2e365',
         1, documento from canon_local;
  raise exception 'ataque passou: sessao ausente';
exception when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
  if sqlerrm not like '%sessao_ausente%' and sqlerrm not like '%row-level security%' then
    raise exception 'sessao ausente com erro inesperado: %', sqlerrm;
  end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
do $$
begin
  update public.copias_fixture_teste
  set documento = documento || '{"extra":true}'::jsonb
  where owner_id = '11111111-1111-4111-8111-111111111111';
  raise exception 'ataque passou: update nao canonico';
exception when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
  if sqlerrm not like '%carga_invalida%' then
    raise exception 'update nao canonico com erro inesperado: %', sqlerrm;
  end if;
end $$;
