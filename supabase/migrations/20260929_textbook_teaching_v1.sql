-- Textbook Teaching V1. Apply manually after review; this file does not run itself.
begin;
create extension if not exists pgcrypto;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('textbook-pdfs', 'textbook-pdfs', false, 26214400, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists textbook_pdfs_client_deny on storage.objects;
create policy textbook_pdfs_client_deny on storage.objects as restrictive
  for all to anon, authenticated
  using (bucket_id <> 'textbook-pdfs')
  with check (bucket_id <> 'textbook-pdfs');

create table if not exists public.textbook_sources (
  id uuid primary key default gen_random_uuid(),
  board text not null, class_number integer not null check (class_number between 1 and 12),
  subject text not null, book_name text not null, edition text not null,
  file_name text not null, storage_path text not null unique, byte_size bigint not null check (byte_size between 1 and 26214400),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  version integer not null default 1 check (version > 0),
  status text not null default 'uploading' check (status in ('uploading','queued','processing','review','failed','published','unpublished')),
  processing_attempts integer not null default 0 check (processing_attempts between 0 and 5),
  processing_token uuid, processing_started_at timestamptz, processing_error text,
  page_count integer check (page_count between 1 and 250),
  published_at timestamptz, unpublished_at timestamptz,
  created_by text not null default 'admin_password', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(board, class_number, subject, book_name, edition, version)
);

create table if not exists public.textbook_pages (
  id uuid primary key default gen_random_uuid(), source_id uuid not null references public.textbook_sources(id) on delete cascade,
  page_number integer not null check (page_number > 0), extracted_text text not null default '', reviewed_text text,
  review_status text not null default 'extracted' check (review_status in ('extracted','needs_ocr','corrected','approved')),
  extraction_meta jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(source_id, page_number)
);

create table if not exists public.textbook_topic_mappings (
  id uuid primary key default gen_random_uuid(), source_id uuid not null references public.textbook_sources(id) on delete cascade,
  subject_id bigint not null references public.subjects(id) on delete restrict,
  chapter_id bigint not null references public.chapters(id) on delete restrict,
  topic_id bigint not null references public.topics(id) on delete restrict,
  page_from integer not null check (page_from > 0), page_to integer not null check (page_to >= page_from),
  created_at timestamptz not null default now(), unique(source_id, topic_id)
);

create table if not exists public.textbook_processing_pages (
  source_id uuid not null references public.textbook_sources(id) on delete cascade,
  page_number integer not null check (page_number > 0), extracted_text text not null,
  review_status text not null check (review_status in ('extracted','needs_ocr')),
  extraction_meta jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now(),
  primary key(source_id, page_number)
);

create index if not exists textbook_topic_mappings_topic_idx on public.textbook_topic_mappings(topic_id, source_id);
alter table public.textbook_sources enable row level security;
alter table public.textbook_pages enable row level security;
alter table public.textbook_topic_mappings enable row level security;
alter table public.textbook_processing_pages enable row level security;
revoke all on public.textbook_sources, public.textbook_pages, public.textbook_topic_mappings, public.textbook_processing_pages from anon, authenticated;
-- No client policies: access is server-only through the service role. Storage is private.

create or replace function public.claim_textbook_processing(p_source_id uuid, p_token uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update textbook_sources set status='failed', processing_token=null, processing_started_at=null,
    processing_error='Processing retry limit reached after interruption', updated_at=now()
  where id=p_source_id and status='processing' and processing_attempts >= 5
    and processing_started_at < now()-interval '10 minutes';
  update textbook_sources set status='processing', processing_token=p_token,
    processing_started_at=now(), processing_attempts=processing_attempts+1, processing_error=null, updated_at=now()
  where id=p_source_id and processing_attempts < 5 and
    (status in ('queued','failed') or (status='processing' and processing_started_at < now()-interval '10 minutes'));
  return found;
end $$;
revoke all on function public.claim_textbook_processing(uuid,uuid) from public, anon, authenticated;
grant execute on function public.claim_textbook_processing(uuid,uuid) to service_role;

create or replace function public.checkpoint_textbook_page(
  p_source_id uuid, p_token uuid, p_page_number integer, p_text text, p_review_status text, p_meta jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare v_status text; v_token uuid;
begin
  if p_source_id is null or p_token is null or p_page_number is null or p_text is null
    or p_review_status is null or p_meta is null or p_page_number < 1
    or p_review_status not in ('extracted','needs_ocr') or length(p_text) > 50000 or jsonb_typeof(p_meta) <> 'object'
  then raise exception 'Invalid page checkpoint'; end if;
  select status,processing_token into v_status,v_token from textbook_sources where id=p_source_id for update;
  if not found or v_status is distinct from 'processing' or v_token is distinct from p_token
  then raise exception 'Processing claim is no longer owned'; end if;
  insert into textbook_processing_pages(source_id,page_number,extracted_text,review_status,extraction_meta,updated_at)
  values(p_source_id,p_page_number,p_text,p_review_status,p_meta,now())
  on conflict(source_id,page_number) do update set extracted_text=excluded.extracted_text,
    review_status=excluded.review_status, extraction_meta=excluded.extraction_meta, updated_at=now();
end $$;
revoke all on function public.checkpoint_textbook_page(uuid,uuid,integer,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.checkpoint_textbook_page(uuid,uuid,integer,text,text,jsonb) to service_role;

create or replace function public.finalize_textbook_processing(
  p_source_id uuid, p_token uuid, p_page_count integer, p_sha256 text, p_byte_size bigint
) returns void language plpgsql security definer set search_path = public as $$
declare v_updated integer; v_status text; v_current_token uuid;
begin
  if p_source_id is null or p_token is null or p_page_count is null or p_sha256 is null or p_byte_size is null
    or p_page_count not between 1 and 250 or p_byte_size not between 1 and 26214400 or p_sha256 !~ '^[0-9a-f]{64}$'
  then raise exception 'Invalid processed PDF metadata'; end if;
  select status,processing_token into v_status,v_current_token from textbook_sources where id=p_source_id for update;
  if not found or v_status is distinct from 'processing' or v_current_token is distinct from p_token
  then raise exception 'Processing claim is no longer owned'; end if;
  if (select count(*) from textbook_processing_pages where source_id=p_source_id and page_number between 1 and p_page_count) <> p_page_count
    or exists(select 1 from textbook_processing_pages where source_id=p_source_id and page_number > p_page_count)
  then raise exception 'Page checkpoints are incomplete'; end if;
  delete from textbook_pages where source_id=p_source_id;
  insert into textbook_pages(source_id,page_number,extracted_text,review_status,extraction_meta)
    select source_id,page_number,extracted_text,review_status,extraction_meta
    from textbook_processing_pages where source_id=p_source_id order by page_number;
  update textbook_sources set status='review', page_count=p_page_count, sha256=p_sha256, byte_size=p_byte_size,
    processing_token=null, processing_started_at=null, processing_error=null, updated_at=now()
    where id=p_source_id and status='processing' and processing_token=p_token;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then raise exception 'Processing claim was lost during finalization'; end if;
end $$;
revoke all on function public.finalize_textbook_processing(uuid,uuid,integer,text,bigint) from public, anon, authenticated;
grant execute on function public.finalize_textbook_processing(uuid,uuid,integer,text,bigint) to service_role;

create or replace function public.review_textbook_page(
  p_source_id uuid, p_page_number integer, p_reviewed_text text, p_review_status text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_review_status not in ('corrected','approved','needs_ocr') or length(coalesce(p_reviewed_text,'')) > 50000
  then raise exception 'Invalid page review'; end if;
  perform 1 from textbook_sources where id=p_source_id and status='review' and published_at is null for update;
  if not found then raise exception 'Only never-published review drafts can be edited'; end if;
  update textbook_pages set reviewed_text=nullif(trim(p_reviewed_text),''), review_status=p_review_status, updated_at=now()
    where source_id=p_source_id and page_number=p_page_number;
  if not found then raise exception 'Page not found'; end if;
end $$;
revoke all on function public.review_textbook_page(uuid,integer,text,text) from public, anon, authenticated;
grant execute on function public.review_textbook_page(uuid,integer,text,text) to service_role;

create or replace function public.save_textbook_mappings(p_source_id uuid, p_mappings jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare m jsonb; v_subject bigint; v_chapter bigint; v_topic bigint; v_from integer; v_to integer; v_page_count integer;
begin
  select page_count into v_page_count from textbook_sources
    where id=p_source_id and status='review' and published_at is null for update;
  if not found then raise exception 'Only never-published review drafts can be mapped'; end if;
  if p_source_id is null or p_mappings is null or jsonb_typeof(p_mappings) is distinct from 'array' or jsonb_array_length(p_mappings) < 1
  then raise exception 'At least one mapping is required'; end if;
  create temporary table if not exists pg_temp.valid_textbook_mappings(
    subject_id bigint, chapter_id bigint, topic_id bigint primary key, page_from integer, page_to integer
  ) on commit drop;
  truncate pg_temp.valid_textbook_mappings;
  for m in select value from jsonb_array_elements(p_mappings) loop
    v_subject := (m->>'subjectId')::bigint; v_chapter := (m->>'chapterId')::bigint;
    v_topic := (m->>'topicId')::bigint; v_from := (m->>'pageFrom')::integer; v_to := (m->>'pageTo')::integer;
    if v_from < 1 or v_to < v_from or v_to > v_page_count or not exists(
      select 1 from topics t join chapters c on c.id=t.chapter_id
      where t.id=v_topic and t.chapter_id=v_chapter and c.subject_id=v_subject and t.is_active=true
    ) then raise exception 'Invalid curriculum relationship or page range'; end if;
    insert into pg_temp.valid_textbook_mappings values(v_subject,v_chapter,v_topic,v_from,v_to);
  end loop;
  delete from textbook_topic_mappings where source_id=p_source_id;
  insert into textbook_topic_mappings(source_id,subject_id,chapter_id,topic_id,page_from,page_to)
    select p_source_id,subject_id,chapter_id,topic_id,page_from,page_to from pg_temp.valid_textbook_mappings;
end $$;
revoke all on function public.save_textbook_mappings(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.save_textbook_mappings(uuid,jsonb) to service_role;

create or replace function public.publish_textbook_source(p_source_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_now timestamptz := now(); v_topic_id bigint; v_page_count integer; v_locked_topics bigint[]; v_current_topics bigint[];
begin
  if p_source_id is null then raise exception 'Source id is required'; end if;

  -- Acquire topic locks before source row locks. Concurrent replacements of a
  -- shared topic therefore serialize before either can hold the other's source.
  select array_agg(topic_id order by topic_id) into v_locked_topics
    from textbook_topic_mappings where source_id=p_source_id;
  if coalesce(cardinality(v_locked_topics),0)=0 then raise exception 'Source is not ready to publish'; end if;
  foreach v_topic_id in array v_locked_topics loop
    perform pg_advisory_xact_lock(v_topic_id);
  end loop;

  select page_count into v_page_count from textbook_sources
    where id=p_source_id and status in ('review','unpublished') for update;
  if not found or v_page_count is null
  then raise exception 'Source is not ready to publish'; end if;
  select array_agg(topic_id order by topic_id) into v_current_topics
    from textbook_topic_mappings where source_id=p_source_id;
  if v_current_topics is distinct from v_locked_topics then
    raise exception 'Draft mappings changed during publication; retry publish';
  end if;

  if exists (
    select 1 from textbook_topic_mappings m
    left join topics t on t.id=m.topic_id
    left join chapters c on c.id=m.chapter_id
    where m.source_id=p_source_id and (
      t.id is null or c.id is null or t.is_active is distinct from true
      or t.chapter_id is distinct from m.chapter_id or c.subject_id is distinct from m.subject_id
      or m.page_from < 1 or m.page_to < m.page_from or m.page_to > v_page_count
    )
  ) then raise exception 'A mapping no longer matches the active curriculum or PDF page range'; end if;

  if exists (
    select 1 from textbook_topic_mappings m
    cross join lateral generate_series(m.page_from,m.page_to) mapped_page(page_number)
    left join textbook_pages p on p.source_id=m.source_id and p.page_number=mapped_page.page_number
    where m.source_id=p_source_id and (
      p.id is null or p.review_status is distinct from 'approved'
      or length(trim(coalesce(p.reviewed_text,p.extracted_text,'')))=0
    )
  ) then raise exception 'Every page in every mapped range must be present and explicitly approved'; end if;

  -- Lock every published source that overlaps the candidate. Published mappings
  -- are immutable, and ordered row locks keep concurrent replacements consistent.
  perform 1 from textbook_sources s
    where s.status='published' and s.id<>p_source_id and exists (
      select 1 from textbook_topic_mappings old_map join textbook_topic_mappings new_map on new_map.topic_id=old_map.topic_id
      where old_map.source_id=s.id and new_map.source_id=p_source_id
    ) order by s.id for update;

  -- V1 withdraws whole sources. Refuse a partial replacement that would remove
  -- unrelated topics still served by an overlapping published source.
  if exists (
    select 1 from textbook_sources s
    where s.status='published' and s.id<>p_source_id
      and exists (
        select 1 from textbook_topic_mappings old_overlap join textbook_topic_mappings new_overlap on new_overlap.topic_id=old_overlap.topic_id
        where old_overlap.source_id=s.id and new_overlap.source_id=p_source_id
      )
      and exists (
        select 1 from textbook_topic_mappings old_topic
        where old_topic.source_id=s.id and not exists (
          select 1 from textbook_topic_mappings candidate_topic
          where candidate_topic.source_id=p_source_id and candidate_topic.topic_id=old_topic.topic_id
        )
      )
  ) then raise exception 'Partial replacement rejected: candidate must cover every topic served by each source it would withdraw'; end if;

  update textbook_sources s set status='unpublished', unpublished_at=v_now, updated_at=v_now
  where s.status='published' and s.id<>p_source_id and exists (
    select 1 from textbook_topic_mappings old_map join textbook_topic_mappings new_map on new_map.topic_id=old_map.topic_id
    where old_map.source_id=s.id and new_map.source_id=p_source_id
  );
  update textbook_sources set status='published', published_at=v_now, unpublished_at=null, updated_at=v_now where id=p_source_id;
end $$;
revoke all on function public.publish_textbook_source(uuid) from public, anon, authenticated;
grant execute on function public.publish_textbook_source(uuid) to service_role;

create or replace function public.unpublish_textbook_source(p_source_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update textbook_sources set status='unpublished', unpublished_at=now(), updated_at=now()
    where id=p_source_id and status='published';
  return found;
end $$;
revoke all on function public.unpublish_textbook_source(uuid) from public, anon, authenticated;
grant execute on function public.unpublish_textbook_source(uuid) to service_role;

commit;
