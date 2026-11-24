-- Prova local da cópia real. Não apaga as tabelas de teste.

do $$
declare definer boolean;
begin
  if to_regclass('public.copias_conta') is null then
    raise exception 'tabela ausente';
  end if;
  select p.prosecdef into definer
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'copia_conta_gravar';
  if definer then raise exception 'wrapper exposto e security definer'; end if;
  select p.prosecdef into definer
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = 'copia_conta_aplicar';
  if definer is distinct from true then raise exception 'aplicar deixou de ser definer'; end if;
  if has_function_privilege('anon', 'public.copia_conta_gravar(integer,jsonb)', 'execute')
     or has_function_privilege('public', 'public.copia_conta_gravar(integer,jsonb)', 'execute')
     or has_function_privilege('anon', 'private.copia_conta_aplicar(integer,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'private.copia_conta_documento_ok(jsonb)', 'execute') then
    raise exception 'grant folgado';
  end if;
  if not has_function_privilege('authenticated', 'public.copia_conta_gravar(integer,jsonb)', 'execute')
     or not has_function_privilege('authenticated', 'private.copia_conta_aplicar(integer,jsonb)', 'execute') then
    raise exception 'cadeia sem execute';
  end if;
  if has_table_privilege('authenticated', 'public.copias_conta', 'insert')
     or has_table_privilege('authenticated', 'public.copias_conta', 'update')
     or has_table_privilege('authenticated', 'public.copias_conta', 'delete')
     or has_table_privilege('anon', 'public.copias_conta', 'select') then
    raise exception 'dml direto permitido';
  end if;
end $$;

create temp table doc_real (documento jsonb);
insert into doc_real (documento) values ($fx$
{
  "version": 2,
  "campoLegado": "não apagar",
  "entries": [
    {
      "id": "carro-real-1",
      "empresa": "Concept Blindados",
      "os": "OS-1",
      "veiculo": "Carro com acento",
      "valor": 510,
      "obs": "Observação real fictícia",
      "pausas": [{"motivo": "Fim de expediente", "inicio": "2026-11-02T12:00", "fim": "2026-11-02T13:00", "nota": "campo extra"}],
      "etiquetaAntiga": true
    }
  ],
  "quinzenas": {"Concept Blindados|2026|11|1": "Aberta"},
  "descontos": {},
  "settings": {"operador": "Pessoa Exemplo", "setorOperador": "Tapeçaria", "lastBackup": null}
}
$fx$::jsonb);
grant select on doc_real to authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
select public.copia_conta_gravar(null, documento) from doc_real;

do $$
declare lido jsonb;
begin
  select documento into lido from public.copias_conta;
  if lido ->> 'campoLegado' is distinct from 'não apagar' then raise exception 'campo legado sumiu'; end if;
  if lido -> 'entries' -> 0 ->> 'etiquetaAntiga' is distinct from 'true' then raise exception 'etiqueta sumiu'; end if;
  if lido -> 'entries' -> 0 -> 'pausas' -> 0 ->> 'nota' is distinct from 'campo extra' then raise exception 'pausa alterada'; end if;
  if lido -> 'quinzenas' ->> 'Concept Blindados|2026|11|1' is distinct from 'Aberta' then raise exception 'quinzena reescrita'; end if;
end $$;

do $$
begin
  perform public.copia_conta_gravar(9, '{"version":2,"entries":[]}'::jsonb);
  raise exception 'ataque passou: revisao velha';
exception when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
  if sqlerrm not like '%revisao_divergente%' then raise exception 'revisao velha: %', sqlerrm; end if;
end $$;

do $$
begin
  update public.copias_conta set revisao = revisao + 1;
  raise exception 'ataque passou: update direto';
exception when insufficient_privilege then null;
when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
  raise exception 'update direto: %', sqlerrm;
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '', false);
do $$
begin
  perform public.copia_conta_gravar(null, '{"version":2,"entries":[]}'::jsonb);
  raise exception 'ataque passou: sessao ausente';
exception when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
  if sqlerrm not like '%sessao_ausente%' then raise exception 'sessao: %', sqlerrm; end if;
end $$;
reset role;

set role anon;
do $$
begin
  perform public.copia_conta_gravar(null, '{"version":2,"entries":[]}'::jsonb);
  raise exception 'ataque passou: anon';
exception when insufficient_privilege then null;
when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
  raise exception 'anon: %', sqlerrm;
end $$;
reset role;

do $$
begin
  if not private.copia_conta_documento_ok('{"version":2,"entries":[],"campoLegado":1}'::jsonb) then
    raise exception 'campo extra recusado';
  end if;
  if private.copia_conta_documento_ok('{"version":"2","entries":[]}'::jsonb) then
    raise exception 'versao texto aceita';
  end if;
  if private.copia_conta_documento_ok('{"version":21,"entries":[]}'::jsonb) then
    raise exception 'versao alta aceita';
  end if;
  if private.copia_conta_documento_ok('{"version":2,"entries":null}'::jsonb) then
    raise exception 'entries nulo aceito';
  end if;
end $$;
