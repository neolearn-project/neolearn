-- Private account-owned text checkpoints. No AI source credentials or audio blobs.
create table public.student_classroom_checkpoints (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  revision bigint not null check (revision > 0),
  payload jsonb not null check (octet_length(payload::text) <= 120000),
  updated_at timestamptz not null default now(),
  primary key(owner_id,id)
);
alter table public.student_classroom_checkpoints enable row level security;
revoke all on public.student_classroom_checkpoints from public,anon,authenticated;
grant select,insert,update on public.student_classroom_checkpoints to service_role;
create index student_classroom_checkpoints_owner_updated_idx on public.student_classroom_checkpoints(owner_id,updated_at desc);

create function public.save_student_classroom_checkpoint(p_owner uuid,p_id uuid,p_revision bigint,p_payload jsonb)
returns boolean language plpgsql security invoker set search_path=pg_catalog,public as $$
declare saved_revision bigint;
begin
  if p_revision < 1 or p_payload->>'id' is distinct from p_id::text then raise exception 'invalid_checkpoint'; end if;
  perform pg_advisory_xact_lock(hashtextextended('student_checkpoint:'||p_owner::text,0));
  if not exists(select 1 from public.student_classroom_checkpoints where owner_id=p_owner and id=p_id)
     and (select count(*) from public.student_classroom_checkpoints where owner_id=p_owner) >= 200 then
    raise exception 'checkpoint_capacity_reached';
  end if;
  insert into public.student_classroom_checkpoints(owner_id,id,revision,payload)
  values(p_owner,p_id,p_revision,p_payload)
  on conflict(owner_id,id) do update set revision=excluded.revision,payload=excluded.payload,updated_at=clock_timestamp()
    where student_classroom_checkpoints.revision < excluded.revision;
  select revision into saved_revision from public.student_classroom_checkpoints where owner_id=p_owner and id=p_id;
  return saved_revision = p_revision;
end $$;
revoke all on function public.save_student_classroom_checkpoint(uuid,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.save_student_classroom_checkpoint(uuid,uuid,bigint,jsonb) to service_role;
