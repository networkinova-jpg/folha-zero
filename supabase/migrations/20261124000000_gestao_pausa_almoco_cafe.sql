-- Revisão. Não aplicar no Supabase por esta etapa.
-- Não altera 20261123210000_gestao_producao.sql.
-- Acrescenta o motivo fixo Almoço/café na pausa compartilhada.
-- Ele desconta do tempo útil, como Fim de expediente. Nada é apagado.

do $$
declare
  nome text;
begin
  for nome in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'gestao_pausas'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%Fim de expediente%'
  loop
    execute format('alter table public.gestao_pausas drop constraint %I', nome);
  end loop;

  if not exists (
    select 1 from pg_constraint
    where conname = 'gestao_pausas_motivo_ok'
  ) then
    alter table public.gestao_pausas
      add constraint gestao_pausas_motivo_ok check (
        (outro = false and motivo in (
          'Faltando peça', 'Faltando vidro', 'Problemas elétricos', 'Problemas com vidro',
          'Aguardando etapa anterior', 'Aguardando vidraceiro', 'Aguardando ajuste da produção',
          'Impasse na resolução de um problema', 'Fim de expediente', 'Almoço/café'
        ))
        or (outro = true and char_length(btrim(motivo)) between 1 and 60)
      );
  end if;
end $$;

-- As funções private.gestao_* gravam a pausa e deixam esta constraint validar o motivo.
-- Não há lista de motivos separada no corpo dessas funções.
