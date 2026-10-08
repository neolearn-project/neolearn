-- Persistent, atomically claimed AI textbook-mapping proposals. Apply manually; this file does not run itself.
begin;

create table public.textbook_ai_mapping_proposals (
  id uuid primary key default gen_random_uuid(), source_id uuid not null references public.textbook_sources(id) on delete cascade,
  source_version integer not null, source_sha256 text not null check(source_sha256~'^[0-9a-f]{64}$'), processing_revision integer not null,
  subject_id bigint not null references public.subjects(id) on delete restrict, catalog_fingerprint text not null check(catalog_fingerprint~'^[0-9a-f]{64}$'), model text not null, contract_version text not null,
  status text not null check(status in('claimed','succeeded','failed')), claim_token uuid, claimed_at timestamptz,
  proposals jsonb, unresolved jsonb, error_message text, completed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(source_id,source_version,source_sha256,processing_revision,catalog_fingerprint,model,contract_version),
  check((status='claimed' and claim_token is not null and claimed_at is not null and proposals is null and unresolved is null)
    or (status='succeeded' and claim_token is null and proposals is not null and unresolved is not null and error_message is null)
    or (status='failed' and claim_token is null and proposals is null and unresolved is null and error_message is not null))
);
alter table public.textbook_ai_mapping_proposals enable row level security;
revoke all on table public.textbook_ai_mapping_proposals from public,anon,authenticated;

create function public.textbook_catalog_fingerprint(p_subject_id bigint)
returns text language sql stable security definer set search_path=public as $$
 select encode(extensions.digest(string_agg(v.line,E'\n' order by v.kind,v.entity_id),'sha256'),'hex') from (
  select 0 kind,s.id entity_id,concat('subject:',s.id,':',octet_length(s.board),':',s.board,':',s.class_number,':',octet_length(s.subject_name),':',s.subject_name) line from subjects s where s.id=p_subject_id
  union all select 1,c.id,concat('chapter:',c.id,':',octet_length(c.chapter_name),':',c.chapter_name) from chapters c where c.subject_id=p_subject_id
  union all select 2,t.id,concat('topic:',t.id,':',t.chapter_id,':',octet_length(t.topic_name),':',t.topic_name) from topics t join chapters c on c.id=t.chapter_id where c.subject_id=p_subject_id and t.is_active=true
 ) v
$$;

create function public.lock_textbook_catalog_identity(p_subject_id bigint)
returns void language plpgsql security invoker set search_path=public as $$begin
 perform pg_advisory_xact_lock(hashtextextended('textbook-catalog:'||p_subject_id::text,0));
end$$;

create function public.lock_textbook_catalog_mutation()
returns trigger language plpgsql security invoker set search_path=public as $$
declare v_old_subject_id bigint;v_new_subject_id bigint;
begin
 if tg_table_name='subjects' then
  if tg_op<>'INSERT' then v_old_subject_id=old.id;end if;if tg_op<>'DELETE' then v_new_subject_id=new.id;end if;
 elsif tg_table_name='chapters' then
  if tg_op<>'INSERT' then v_old_subject_id=old.subject_id;end if;if tg_op<>'DELETE' then v_new_subject_id=new.subject_id;end if;
 else
  if tg_op<>'INSERT' then select subject_id into v_old_subject_id from chapters where id=old.chapter_id;end if;
  if tg_op<>'DELETE' then select subject_id into v_new_subject_id from chapters where id=new.chapter_id;end if;
 end if;
 if least(v_old_subject_id,v_new_subject_id) is not null then perform lock_textbook_catalog_identity(least(v_old_subject_id,v_new_subject_id));end if;
 if greatest(v_old_subject_id,v_new_subject_id) is not null and greatest(v_old_subject_id,v_new_subject_id) is distinct from least(v_old_subject_id,v_new_subject_id) then perform lock_textbook_catalog_identity(greatest(v_old_subject_id,v_new_subject_id));end if;
 if tg_op='DELETE' then return old;end if;return new;
end$$;
create trigger lock_textbook_subject_catalog before insert or update or delete on public.subjects for each row execute function public.lock_textbook_catalog_mutation();
create trigger lock_textbook_chapter_catalog before insert or update or delete on public.chapters for each row execute function public.lock_textbook_catalog_mutation();
create trigger lock_textbook_topic_catalog before insert or update or delete on public.topics for each row execute function public.lock_textbook_catalog_mutation();

create function public.claim_textbook_ai_mapping(p_source_id uuid,p_source_version integer,p_source_sha256 text,p_processing_revision integer,p_subject_id bigint,p_catalog_fingerprint text,p_model text,p_contract_version text,p_claim_token uuid,p_claim_ttl_seconds integer default 120)
returns table(outcome text,proposals jsonb,unresolved jsonb) language plpgsql security definer set search_path=public as $$
declare v_row public.textbook_ai_mapping_proposals%rowtype;v_source public.textbook_sources%rowtype;v_latest integer;
begin
 if p_claim_ttl_seconds not between 30 and 600 then raise exception 'Invalid AI mapping claim TTL';end if;
 select * into v_source from textbook_sources where id=p_source_id;if not found then raise exception 'AI mapping source is stale';end if;
 perform lock_textbook_book_identity(v_source.board,v_source.class_number,v_source.subject,v_source.book_name,v_source.edition);
 perform lock_textbook_catalog_identity(p_subject_id);
 select * into v_source from textbook_sources where id=p_source_id for update;
 select max(version) into v_latest from textbook_sources where board=v_source.board and class_number=v_source.class_number and subject=v_source.subject and book_name=v_source.book_name and edition=v_source.edition;
 if v_source.status<>'review' or v_source.published_at is not null or v_source.version<>p_source_version or v_source.sha256<>p_source_sha256 or v_source.processing_revision<>p_processing_revision or v_latest<>v_source.version
   or not exists(select 1 from subjects s where s.id=p_subject_id and s.class_number=v_source.class_number and lower(trim(s.board))=lower(trim(v_source.board)) and lower(trim(s.subject_name))=lower(trim(v_source.subject)))
   or textbook_catalog_fingerprint(p_subject_id) is distinct from p_catalog_fingerprint then raise exception 'AI mapping source or catalog is stale';end if;
 insert into textbook_ai_mapping_proposals(source_id,source_version,source_sha256,processing_revision,subject_id,catalog_fingerprint,model,contract_version,status,claim_token,claimed_at)
 values(p_source_id,p_source_version,p_source_sha256,p_processing_revision,p_subject_id,p_catalog_fingerprint,p_model,p_contract_version,'claimed',p_claim_token,now())
 on conflict do nothing;
 select * into v_row from textbook_ai_mapping_proposals where source_id=p_source_id and source_version=p_source_version and source_sha256=p_source_sha256
  and processing_revision=p_processing_revision and catalog_fingerprint=p_catalog_fingerprint and model=p_model and contract_version=p_contract_version for update;
 if v_row.status='succeeded' then return query select 'cached'::text,v_row.proposals,v_row.unresolved;return;end if;
 if v_row.status='claimed' and v_row.claim_token=p_claim_token then return query select 'claimed'::text,null::jsonb,null::jsonb;return;end if;
 if v_row.status='failed' or (v_row.status='claimed' and v_row.claimed_at<now()-make_interval(secs=>p_claim_ttl_seconds)) then
  update textbook_ai_mapping_proposals set status='claimed',claim_token=p_claim_token,claimed_at=now(),proposals=null,unresolved=null,error_message=null,completed_at=null,updated_at=now() where id=v_row.id;
  return query select 'claimed'::text,null::jsonb,null::jsonb;return;
 end if;
 return query select 'in_progress'::text,null::jsonb,null::jsonb;
end $$;

create function public.finalize_textbook_ai_mapping(p_source_id uuid,p_claim_token uuid,p_proposals jsonb,p_unresolved jsonb)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_row public.textbook_ai_mapping_proposals%rowtype;v_source public.textbook_sources%rowtype;v_latest integer;
begin
 select * into v_source from textbook_sources where id=p_source_id;if not found then return false;end if;
 perform lock_textbook_book_identity(v_source.board,v_source.class_number,v_source.subject,v_source.book_name,v_source.edition);
 select * into v_row from textbook_ai_mapping_proposals where source_id=p_source_id and status='claimed' and claim_token=p_claim_token;if not found then return false;end if;
 perform lock_textbook_catalog_identity(v_row.subject_id);
 select * into v_source from textbook_sources where id=p_source_id for update;
 select * into v_row from textbook_ai_mapping_proposals where source_id=p_source_id and status='claimed' and claim_token=p_claim_token for update;if not found then return false;end if;
 select max(version) into v_latest from textbook_sources where board=v_source.board and class_number=v_source.class_number and subject=v_source.subject and book_name=v_source.book_name and edition=v_source.edition;
 if v_source.status<>'review' or v_source.published_at is not null or v_source.version<>v_row.source_version or v_source.sha256<>v_row.source_sha256 or v_source.processing_revision<>v_row.processing_revision or v_latest<>v_source.version
  or not exists(select 1 from subjects s where s.id=v_row.subject_id and s.class_number=v_source.class_number and lower(trim(s.board))=lower(trim(v_source.board)) and lower(trim(s.subject_name))=lower(trim(v_source.subject)))
  or textbook_catalog_fingerprint(v_row.subject_id) is distinct from v_row.catalog_fingerprint then return false;end if;
 update textbook_ai_mapping_proposals set status='succeeded',claim_token=null,proposals=p_proposals,unresolved=p_unresolved,error_message=null,completed_at=now(),updated_at=now() where id=v_row.id;
 return true;
end $$;

create function public.save_textbook_mappings(p_source_id uuid,p_mappings jsonb,p_expected_version integer,p_expected_sha256 text,p_expected_processing_revision integer,p_expected_subject_id bigint,p_expected_catalog_fingerprint text)
returns void language plpgsql security definer set search_path=public as $$
declare v_source public.textbook_sources%rowtype;
begin
 select * into v_source from textbook_sources where id=p_source_id;if not found then raise exception 'Mapping suggestion source no longer exists';end if;
 perform lock_textbook_book_identity(v_source.board,v_source.class_number,v_source.subject,v_source.book_name,v_source.edition);
 perform lock_textbook_catalog_identity(p_expected_subject_id);
 if not exists(select 1 from subjects s where s.id=p_expected_subject_id and s.class_number=v_source.class_number and lower(trim(s.board))=lower(trim(v_source.board)) and lower(trim(s.subject_name))=lower(trim(v_source.subject))) or textbook_catalog_fingerprint(p_expected_subject_id) is distinct from p_expected_catalog_fingerprint then raise exception 'AI mapping suggestions are stale because the curriculum catalog changed';end if;
 perform public.save_textbook_mappings(p_source_id,p_mappings,p_expected_version,p_expected_sha256,p_expected_processing_revision);
end$$;

create function public.fail_textbook_ai_mapping(p_source_id uuid,p_claim_token uuid,p_error_message text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
 update textbook_ai_mapping_proposals set status='failed',claim_token=null,claimed_at=null,error_message=left(coalesce(nullif(trim(p_error_message),''),'AI mapping failed'),1000),updated_at=now()
 where source_id=p_source_id and status='claimed' and claim_token=p_claim_token;return found;
end $$;

revoke all on function public.textbook_catalog_fingerprint(bigint) from public,anon,authenticated;
revoke all on function public.lock_textbook_catalog_identity(bigint) from public,anon,authenticated;
revoke all on function public.claim_textbook_ai_mapping(uuid,integer,text,integer,bigint,text,text,text,uuid,integer) from public,anon,authenticated;
revoke all on function public.finalize_textbook_ai_mapping(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.fail_textbook_ai_mapping(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.save_textbook_mappings(uuid,jsonb,integer,text,integer,bigint,text) from public,anon,authenticated;
grant execute on function public.textbook_catalog_fingerprint(bigint) to service_role;
grant execute on function public.lock_textbook_catalog_identity(bigint) to service_role;
grant execute on function public.claim_textbook_ai_mapping(uuid,integer,text,integer,bigint,text,text,text,uuid,integer) to service_role;
grant execute on function public.finalize_textbook_ai_mapping(uuid,uuid,jsonb,jsonb) to service_role;
grant execute on function public.fail_textbook_ai_mapping(uuid,uuid,text) to service_role;
grant execute on function public.save_textbook_mappings(uuid,jsonb,integer,text,integer,bigint,text) to service_role;
commit;
