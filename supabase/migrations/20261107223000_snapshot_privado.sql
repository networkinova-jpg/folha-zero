-- Incremental. Não aplicar a base de novo.
-- O remoto já tem 20261107210528_base_segura, equivalente ao arquivo
-- 20261107210000_base_segura.sql. Esta migração só acrescenta a cópia privada.
-- Cópia integral do documento do prestador, visível só para auth.uid().
-- Sem linha para o proprietário. Sem e-mail. Banco de teste local pode reaplicar.

create table if not exists public.snapshots_privados (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  sha256 text not null,
  bytes integer not null check (bytes >= 0),
  documento jsonb not null,
  criado_em timestamptz not null default now(),
  unique (owner_id, sha256)
);

create index if not exists snapshots_privados_owner_idx
  on public.snapshots_privados (owner_id, criado_em desc);

alter table public.snapshots_privados enable row level security;

drop policy if exists snapshots_dono on public.snapshots_privados;
create policy snapshots_dono on public.snapshots_privados
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

revoke all on table public.snapshots_privados from public, anon, authenticated;
grant select, insert, delete on table public.snapshots_privados to authenticated;
