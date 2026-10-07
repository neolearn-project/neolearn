-- Atomic processing-revision and book-identity guards for textbook mapping suggestions.
-- Apply manually after 20260929_textbook_teaching_v1.sql. This file does not run itself.
begin;

alter table public.textbook_sources add column if not exists processing_revision integer not null default 0 check (processing_revision >= 0);

create or replace function public.lock_textbook_book_identity(p_board text,p_class_number integer,p_subject text,p_book_name text,p_edition text)
returns void language plpgsql security invoker set search_path=public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(E'\x1f',p_board,p_class_number::text,p_subject,p_book_name,p_edition),0));
end $$;
revoke all on function public.lock_textbook_book_identity(text,integer,text,text,text) from public,anon,authenticated;
grant execute on function public.lock_textbook_book_identity(text,integer,text,text,text) to service_role;

create or replace function public.create_textbook_source(
  p_id uuid,p_board text,p_class_number integer,p_subject text,p_book_name text,p_edition text,
  p_file_name text,p_storage_path text,p_byte_size bigint
) returns public.textbook_sources language plpgsql security definer set search_path=public as $$
declare v_version integer;v_source public.textbook_sources%rowtype;
begin
  if p_id is null or nullif(trim(p_board),'') is null or p_class_number not between 1 and 12
    or nullif(trim(p_subject),'') is null or nullif(trim(p_book_name),'') is null or nullif(trim(p_edition),'') is null
    or nullif(trim(p_file_name),'') is null or nullif(trim(p_storage_path),'') is null or p_byte_size not between 1 and 26214400
  then raise exception 'Invalid textbook source metadata';end if;
  perform lock_textbook_book_identity(p_board,p_class_number,p_subject,p_book_name,p_edition);
  select coalesce(max(version),0)+1 into v_version from textbook_sources
    where board=p_board and class_number=p_class_number and subject=p_subject and book_name=p_book_name and edition=p_edition;
  insert into textbook_sources(id,board,class_number,subject,book_name,edition,file_name,storage_path,byte_size,sha256,version,status)
    values(p_id,p_board,p_class_number,p_subject,p_book_name,p_edition,p_file_name,p_storage_path,p_byte_size,null,v_version,'uploading') returning * into v_source;
  return v_source;
end $$;
revoke all on function public.create_textbook_source(uuid,text,integer,text,text,text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.create_textbook_source(uuid,text,integer,text,text,text,text,text,bigint) to service_role;

create or replace function public.claim_textbook_processing(p_source_id uuid,p_token uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  update textbook_sources set status='failed',processing_token=null,processing_started_at=null,
    processing_error='Processing retry limit reached after interruption',updated_at=now()
    where id=p_source_id and status='processing' and processing_attempts>=5 and processing_started_at<now()-interval '10 minutes';
  delete from textbook_processing_pages where source_id=p_source_id and exists(
    select 1 from textbook_sources where id=p_source_id and status='review' and published_at is null and processing_attempts<5
  );
  update textbook_sources set status='processing',processing_token=p_token,processing_started_at=now(),
    processing_attempts=processing_attempts+1,processing_error=null,updated_at=now()
    where id=p_source_id and processing_attempts<5 and published_at is null
      and (status in ('queued','failed','review') or (status='processing' and processing_started_at<now()-interval '10 minutes'));
  return found;
end $$;
revoke all on function public.claim_textbook_processing(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_textbook_processing(uuid,uuid) to service_role;

create or replace function public.finalize_textbook_processing(p_source_id uuid,p_token uuid,p_page_count integer,p_sha256 text,p_byte_size bigint)
returns void language plpgsql security definer set search_path=public as $$
declare v_updated integer;v_status text;v_current_token uuid;
begin
  if p_source_id is null or p_token is null or p_page_count is null or p_sha256 is null or p_byte_size is null
    or p_page_count not between 1 and 250 or p_byte_size not between 1 and 26214400 or p_sha256!~'^[0-9a-f]{64}$'
  then raise exception 'Invalid processed PDF metadata';end if;
  select status,processing_token into v_status,v_current_token from textbook_sources where id=p_source_id for update;
  if not found or v_status is distinct from 'processing' or v_current_token is distinct from p_token then raise exception 'Processing claim is no longer owned';end if;
  if (select count(*) from textbook_processing_pages where source_id=p_source_id and page_number between 1 and p_page_count)<>p_page_count
    or exists(select 1 from textbook_processing_pages where source_id=p_source_id and page_number>p_page_count)
  then raise exception 'Page checkpoints are incomplete';end if;
  delete from textbook_pages where source_id=p_source_id;
  insert into textbook_pages(source_id,page_number,extracted_text,review_status,extraction_meta)
    select source_id,page_number,extracted_text,review_status,extraction_meta from textbook_processing_pages where source_id=p_source_id order by page_number;
  update textbook_sources set status='review',page_count=p_page_count,sha256=p_sha256,byte_size=p_byte_size,
    processing_revision=processing_revision+1,processing_token=null,processing_started_at=null,processing_error=null,updated_at=now()
    where id=p_source_id and status='processing' and processing_token=p_token;
  get diagnostics v_updated=row_count;
  if v_updated<>1 then raise exception 'Processing claim was lost during finalization';end if;
end $$;
revoke all on function public.finalize_textbook_processing(uuid,uuid,integer,text,bigint) from public,anon,authenticated;
grant execute on function public.finalize_textbook_processing(uuid,uuid,integer,text,bigint) to service_role;

drop function if exists public.save_textbook_mappings(uuid,jsonb,integer,text);
create or replace function public.save_textbook_mappings(
  p_source_id uuid,p_mappings jsonb,p_expected_version integer,p_expected_sha256 text,p_expected_processing_revision integer
) returns void language plpgsql security definer set search_path=public as $$
declare v_source public.textbook_sources%rowtype;v_latest_version integer;
begin
  if p_source_id is null or p_expected_version is null or p_expected_version<1 or p_expected_sha256 is null
    or p_expected_sha256!~'^[0-9a-f]{64}$' or p_expected_processing_revision is null or p_expected_processing_revision<1
  then raise exception 'Invalid suggestion source identity';end if;
  select * into v_source from textbook_sources where id=p_source_id;
  if not found then raise exception 'Mapping suggestion source no longer exists';end if;
  perform lock_textbook_book_identity(v_source.board,v_source.class_number,v_source.subject,v_source.book_name,v_source.edition);
  select * into v_source from textbook_sources where id=p_source_id for update;
  if v_source.status is distinct from 'review' or v_source.published_at is not null or v_source.version is distinct from p_expected_version
    or v_source.sha256 is distinct from p_expected_sha256 or v_source.processing_revision is distinct from p_expected_processing_revision
  then raise exception 'Mapping suggestions are stale for this processed source';end if;
  select max(version) into v_latest_version from textbook_sources where board=v_source.board and class_number=v_source.class_number
    and subject=v_source.subject and book_name=v_source.book_name and edition=v_source.edition;
  if v_latest_version is distinct from v_source.version then raise exception 'Mapping suggestions are stale because a replacement source version exists';end if;
  perform public.save_textbook_mappings(p_source_id,p_mappings);
end $$;
revoke all on function public.save_textbook_mappings(uuid,jsonb,integer,text,integer) from public,anon,authenticated;
grant execute on function public.save_textbook_mappings(uuid,jsonb,integer,text,integer) to service_role;

commit;
