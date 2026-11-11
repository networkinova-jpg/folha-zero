-- Ataques na cópia privada. Roda depois da migração incremental.

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
insert into public.snapshots_privados (owner_id, sha256, bytes, documento)
values ('11111111-1111-4111-8111-111111111111', 'abc123', 12, '{"entries":[{"id":"fixture-1","os":"OS-FIXTURE"}]}'::jsonb);
do $$
declare n int;
begin
  select count(*) into n from public.snapshots_privados;
  if n <> 1 then raise exception 'dona nao viu a propria copia: %', n; end if;
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
do $$
declare n int;
begin
  select count(*) into n from public.snapshots_privados;
  if n <> 0 then raise exception 'outro usuario viu snapshot: %', n; end if;
end $$;
do $$
begin
  insert into public.snapshots_privados (owner_id, sha256, bytes, documento)
  values ('11111111-1111-4111-8111-111111111111', 'zzz', 1, '{}'::jsonb);
  raise exception 'ataque passou: snapshot com dono alheio';
exception when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '66666666-6666-4666-8666-666666666666', false);
do $$
declare n int;
begin
  select count(*) into n from public.snapshots_privados;
  if n <> 0 then raise exception 'proprietario viu snapshot: %', n; end if;
end $$;
reset role;

set role anon;
do $$
begin
  perform 1 from public.snapshots_privados;
  raise exception 'ataque passou: anon leu snapshot';
exception when insufficient_privilege then
  null;
when others then
  if sqlerrm like 'ataque passou:%' then raise; end if;
end $$;
reset role;
