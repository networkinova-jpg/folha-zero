-- A pausa Almoço/café entra sem apagar pausa antiga.

do $$
declare
  def text;
  carro uuid;
begin
  select pg_get_constraintdef(oid) into def
  from pg_constraint
  where conname = 'gestao_pausas_motivo_ok';
  if def is null or position('Almoço/café' in def) = 0 or position('Fim de expediente' in def) = 0 then
    raise exception 'constraint sem almoco';
  end if;
  select id into carro from public.gestao_carros limit 1;
  if carro is null then raise exception 'sem carro para provar a pausa'; end if;
  insert into public.gestao_pausas (carro_id, motivo, outro, inicio, fim)
  values (carro, 'Almoço/café', false, '2026-11-23T12:00', '2026-11-23T13:00');
  insert into public.gestao_pausas (carro_id, motivo, outro, inicio, fim)
  values (carro, 'Fim de expediente', false, '2026-11-23T18:00', '2026-11-23T19:00');
  begin
    insert into public.gestao_pausas (carro_id, motivo, outro, inicio, fim)
    values (carro, 'Motivo inventado', false, '2026-11-23T13:00', '2026-11-23T13:10');
    raise exception 'motivo invalido aceito';
  exception when check_violation then
    null;
  end;
end $$;
