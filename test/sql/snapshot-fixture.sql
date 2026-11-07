-- Isolamento e integridade da cópia fictícia. Banco local descartável.
-- Não usa sessão real. Os UUID abaixo já existem em auth.users neste teste.

reset role;
delete from public.snapshots_privados;

create temp table fixture_esperada (documento jsonb);
grant select on fixture_esperada to authenticated;
insert into fixture_esperada (documento) values (
  $fx${
    "version": 2,
    "marca": "fixture-teste",
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
        "id": "fx-vidro-02",
        "empresa": "INOVA Blindagem",
        "setor": "Vidro",
        "os": "OS-FIXTURE-02",
        "veiculo": "Carro sem valor",
        "dataInicio": "2026-11-03",
        "horaInicio": "09:00",
        "dataTermino": null,
        "horaTermino": null,
        "situacao": "Em processo",
        "pausas": [],
        "valor": null,
        "ajudante": null,
        "obs": "",
        "exemplo": true,
        "createdAt": 1762128000000,
        "updatedAt": 1762128000000
      }
    ],
    "quinzenas": {},
    "descontos": {},
    "settings": {
      "operador": "Pessoa Exemplo",
      "setorOperador": "Tapeçaria",
      "lastBackup": null,
      "valorPadrao": {"INOVA Blindagem": 0},
      "aliquota": {}
    }
  }$fx$::jsonb
);

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
insert into public.snapshots_privados (owner_id, sha256, bytes, documento)
select '11111111-1111-4111-8111-111111111111', repeat('a', 64), 1, documento from fixture_esperada;

do $$
declare
  lido jsonb;
  bytes_lidos int;
begin
  select documento, bytes into lido, bytes_lidos
  from public.snapshots_privados
  where sha256 = repeat('a', 64);
  if lido <> (select documento from fixture_esperada) then
    raise exception 'round-trip alterou o documento';
  end if;
  if (lido->'entries'->0->>'id') <> 'fx-aco-01' then raise exception 'id perdido'; end if;
  if (lido->'entries'->1->>'id') <> 'fx-vidro-02' then raise exception 'id ausente'; end if;
  if (lido->'entries'->0->>'dataInicio') <> '2026-11-02' then raise exception 'data perdida'; end if;
  if (lido->'entries'->0->'pausas'->1->>'motivo') <> 'Aço da maçaneta' then raise exception 'acento perdido'; end if;
  if (lido->'entries'->0->'pausas'->0->>'motivo') <> 'Fim de expediente' then raise exception 'pausa perdida'; end if;
  if (lido->'entries'->0->>'valor') is distinct from '0' then raise exception 'zero virou outro valor'; end if;
  if jsonb_typeof((lido->'entries'->1)->'valor') is distinct from 'null' then
    raise exception 'valor ausente foi preenchido';
  end if;
  if (lido->'entries'->0->>'veiculo') <> 'Veículo fictício' then raise exception 'acento do veiculo perdido'; end if;
  if bytes_lidos <> octet_length(lido::text) or bytes_lidos > 65536 then
    raise exception 'bytes fora do teto medido: %', bytes_lidos;
  end if;
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
do $$
declare n int;
begin
  select count(*) into n from public.snapshots_privados;
  if n <> 0 then raise exception 'outra identidade viu a copia: %', n; end if;
end $$;
do $$
begin
  insert into public.snapshots_privados (owner_id, sha256, bytes, documento)
  select '11111111-1111-4111-8111-111111111111', repeat('b', 64), 1, documento from fixture_esperada;
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
  select count(*) into n from public.snapshots_privados;
  if n <> 0 then raise exception 'proprietario leu a copia: %', n; end if;
end $$;
reset role;

set role anon;
do $$
begin
  perform 1 from public.snapshots_privados;
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
  insert into public.snapshots_privados (owner_id, sha256, bytes, documento)
  select '11111111-1111-4111-8111-111111111111', repeat('c', 64), 1, documento from fixture_esperada;
  raise exception 'ataque passou: sessao ausente';
exception when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
  if sqlerrm not like '%sessao_ausente%' and sqlerrm not like '%row-level security%' then
    raise exception 'sessao ausente com erro inesperado: %', sqlerrm;
  end if;
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
do $$
begin
  insert into public.snapshots_privados (owner_id, sha256, bytes, documento)
  values ('11111111-1111-4111-8111-111111111111', repeat('d', 64), 1, '{"version":2,"entries":[]}'::jsonb);
  raise exception 'ataque passou: carga invalida';
exception when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
  if sqlerrm not like '%carga_invalida%' then
    raise exception 'carga invalida com erro inesperado: %', sqlerrm;
  end if;
end $$;
do $$
declare grande jsonb;
begin
  select jsonb_set(documento, '{quinzenas,blob}', to_jsonb(repeat('x', 70000)))
    into grande from fixture_esperada;
  insert into public.snapshots_privados (owner_id, sha256, bytes, documento)
  values ('11111111-1111-4111-8111-111111111111', repeat('e', 64), 1, grande);
  raise exception 'ataque passou: carga grande';
exception when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
  if sqlerrm not like '%carga_grande%' then
    raise exception 'carga grande com erro inesperado: %', sqlerrm;
  end if;
end $$;
insert into public.snapshots_privados (owner_id, sha256, bytes, documento)
select '11111111-1111-4111-8111-111111111111', repeat('b', 64), 1, documento from fixture_esperada;
insert into public.snapshots_privados (owner_id, sha256, bytes, documento)
select '11111111-1111-4111-8111-111111111111', repeat('c', 64), 1, documento from fixture_esperada;
do $$
begin
  insert into public.snapshots_privados (owner_id, sha256, bytes, documento)
  select '11111111-1111-4111-8111-111111111111', repeat('f', 64), 1, documento from fixture_esperada;
  raise exception 'ataque passou: acima da quota';
exception when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
  if sqlerrm not like '%quota_teste%' then
    raise exception 'quota com erro inesperado: %', sqlerrm;
  end if;
end $$;
reset role;
