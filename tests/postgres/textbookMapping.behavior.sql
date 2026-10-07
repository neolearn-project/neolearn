\set ON_ERROR_STOP on

do $$
declare signature regprocedure;
begin
  foreach signature in array array[
    'public.lock_textbook_book_identity(text,integer,text,text,text)'::regprocedure,
    'public.create_textbook_source(uuid,text,integer,text,text,text,text,text,bigint)'::regprocedure,
    'public.save_textbook_mappings(uuid,jsonb,integer,text,integer)'::regprocedure
  ] loop
    if not has_function_privilege('service_role',signature,'execute')
      or has_function_privilege('anon',signature,'execute')
      or has_function_privilege('authenticated',signature,'execute')
    then raise exception 'RPC ACL mismatch for %',signature;end if;
  end loop;
end $$;

set role service_role;
select public.lock_textbook_book_identity('ACL',1,'Fixture','Callable','2026');
select (public.create_textbook_source(
  '10000000-0000-0000-0000-000000000001','CBSE',7,'English','Fixture Book','2026',
  'fixture.pdf','10000000-0000-0000-0000-000000000001/fixture.pdf',1000
)).id;
reset role;
update public.textbook_sources set status='queued' where id='10000000-0000-0000-0000-000000000001';

set role service_role;
do $$begin
  if not public.claim_textbook_processing('10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001')
  then raise exception 'initial processing claim failed';end if;
end $$;
select public.checkpoint_textbook_page('10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001',1,
  E'The Day the River Spoke\nFixture text','extracted','{"layoutPreserved":true}'::jsonb);
select public.finalize_textbook_processing('10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001',1,
  repeat('a',64),1000);
select public.save_textbook_mappings('10000000-0000-0000-0000-000000000001',
  '[{"subjectId":1,"chapterId":10,"topicId":100,"pageFrom":1,"pageTo":1}]'::jsonb,1,repeat('a',64),1);
reset role;

do $$
declare before_row jsonb;
begin
  select to_jsonb(m) into before_row from public.textbook_topic_mappings m
    where source_id='10000000-0000-0000-0000-000000000001' and topic_id=100;
  begin
    perform public.save_textbook_mappings('10000000-0000-0000-0000-000000000001',
      '[{"subjectId":1,"chapterId":10,"topicId":100,"pageFrom":1,"pageTo":1}]'::jsonb,2,repeat('a',64),1);
    raise exception using errcode='P9998',message='stale version unexpectedly succeeded';
  exception when others then
    if sqlstate<>'P0001' or sqlerrm<>'Mapping suggestions are stale for this processed source'
    then raise exception 'stale version rejection mismatch: SQLSTATE %, message %',sqlstate,sqlerrm;end if;
  end;
  begin
    perform public.save_textbook_mappings('10000000-0000-0000-0000-000000000001',
      '[{"subjectId":1,"chapterId":10,"topicId":100,"pageFrom":1,"pageTo":1}]'::jsonb,1,repeat('b',64),1);
    raise exception using errcode='P9998',message='stale SHA unexpectedly succeeded';
  exception when others then
    if sqlstate<>'P0001' or sqlerrm<>'Mapping suggestions are stale for this processed source'
    then raise exception 'stale SHA rejection mismatch: SQLSTATE %, message %',sqlstate,sqlerrm;end if;
  end;
  begin
    perform public.save_textbook_mappings('10000000-0000-0000-0000-000000000001',
      '[{"subjectId":1,"chapterId":10,"topicId":100,"pageFrom":1,"pageTo":1}]'::jsonb,1,repeat('a',64),2);
    raise exception using errcode='P9998',message='stale processing revision unexpectedly succeeded';
  exception when others then
    if sqlstate<>'P0001' or sqlerrm<>'Mapping suggestions are stale for this processed source'
    then raise exception 'stale processing revision rejection mismatch: SQLSTATE %, message %',sqlstate,sqlerrm;end if;
  end;
  begin
    perform public.save_textbook_mappings('10000000-0000-0000-0000-000000000001',
      '[{"subjectId":1,"chapterId":10,"topicId":101,"pageFrom":1,"pageTo":1},{"subjectId":2,"chapterId":20,"topicId":100,"pageFrom":1,"pageTo":1}]'::jsonb);
    raise exception using errcode='P9998',message='invalid mapping unexpectedly succeeded';
  exception when others then
    if sqlstate<>'P0001' or sqlerrm<>'Invalid curriculum relationship or page range'
    then raise exception 'invalid mapping rejection mismatch: SQLSTATE %, message %',sqlstate,sqlerrm;end if;
  end;
  if before_row is distinct from (select to_jsonb(m) from public.textbook_topic_mappings m
      where source_id='10000000-0000-0000-0000-000000000001' and topic_id=100)
    or (select count(*) from public.textbook_topic_mappings where source_id='10000000-0000-0000-0000-000000000001')<>1
  then raise exception 'rejected operation changed existing mappings';end if;
end $$;

set role service_role;
do $$begin
  if not public.claim_textbook_processing('10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000002')
  then raise exception 'reprocessing claim failed';end if;
end $$;
select public.checkpoint_textbook_page('10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000002',1,
  E'The Day the River Spoke\nFixture text','extracted','{"layoutPreserved":true}'::jsonb);
select public.finalize_textbook_processing('10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000002',1,
  repeat('a',64),1000);
reset role;

do $$begin
  if (select processing_revision from public.textbook_sources where id='10000000-0000-0000-0000-000000000001')<>2
  then raise exception 'identical-byte reprocessing did not increment revision';end if;
  begin
    perform public.save_textbook_mappings('10000000-0000-0000-0000-000000000001',
      '[{"subjectId":1,"chapterId":10,"topicId":100,"pageFrom":1,"pageTo":1}]'::jsonb,1,repeat('a',64),1);
    raise exception using errcode='P9998',message='old processing identity unexpectedly succeeded';
  exception when others then
    if sqlstate<>'P0001' or sqlerrm<>'Mapping suggestions are stale for this processed source'
    then raise exception 'old processing identity rejection mismatch: SQLSTATE %, message %',sqlstate,sqlerrm;end if;
  end;
end $$;

set role service_role;
select (public.create_textbook_source(
  '10000000-0000-0000-0000-000000000002','CBSE',7,'English','Fixture Book','2026',
  'replacement.pdf','10000000-0000-0000-0000-000000000002/replacement.pdf',1000
)).id;
reset role;
do $$begin
  begin
    perform public.save_textbook_mappings('10000000-0000-0000-0000-000000000001',
      '[{"subjectId":1,"chapterId":10,"topicId":100,"pageFrom":1,"pageTo":1}]'::jsonb,1,repeat('a',64),2);
    raise exception using errcode='P9998',message='superseded identity unexpectedly succeeded';
  exception when others then
    if sqlstate<>'P0001' or sqlerrm<>'Mapping suggestions are stale because a replacement source version exists'
    then raise exception 'superseded identity rejection mismatch: SQLSTATE %, message %',sqlstate,sqlerrm;end if;
  end;
end $$;

insert into public.textbook_sources(id,board,class_number,subject,book_name,edition,file_name,storage_path,byte_size,sha256,version,status,
  processing_revision,page_count,published_at)
values('20000000-0000-0000-0000-000000000001','CBSE',7,'English','Published Book','2026','published.pdf','published/published.pdf',1000,
  repeat('d',64),1,'published',1,1,now());
insert into public.textbook_pages(source_id,page_number,extracted_text,review_status)
values('20000000-0000-0000-0000-000000000001',1,'Published fixture','approved');
insert into public.textbook_topic_mappings(source_id,subject_id,chapter_id,topic_id,page_from,page_to)
values('20000000-0000-0000-0000-000000000001',1,10,101,1,1);

do $$declare snapshot jsonb;begin
  select jsonb_build_object('source',to_jsonb(s),'page',to_jsonb(p),'mapping',to_jsonb(m)) into snapshot
    from public.textbook_sources s join public.textbook_pages p on p.source_id=s.id
    join public.textbook_topic_mappings m on m.source_id=s.id where s.id='20000000-0000-0000-0000-000000000001';
  begin
    perform public.save_textbook_mappings('20000000-0000-0000-0000-000000000001',
      '[{"subjectId":1,"chapterId":10,"topicId":101,"pageFrom":1,"pageTo":1}]'::jsonb,1,repeat('d',64),1);
    raise exception using errcode='P9998',message='published suggestion save unexpectedly succeeded';
  exception when others then
    if sqlstate<>'P0001' or sqlerrm<>'Mapping suggestions are stale for this processed source'
    then raise exception 'published source rejection mismatch: SQLSTATE %, message %',sqlstate,sqlerrm;end if;
  end;
  if snapshot is distinct from (select jsonb_build_object('source',to_jsonb(s),'page',to_jsonb(p),'mapping',to_jsonb(m))
    from public.textbook_sources s join public.textbook_pages p on p.source_id=s.id
    join public.textbook_topic_mappings m on m.source_id=s.id where s.id='20000000-0000-0000-0000-000000000001')
  then raise exception 'rejected operation changed published data';end if;
end $$;

insert into public.textbook_sources(id,board,class_number,subject,book_name,edition,file_name,storage_path,byte_size,sha256,version,status,
  processing_revision,page_count)
values('30000000-0000-0000-0000-000000000001','CBSE',8,'Science','Concurrency Book','2026','current.pdf','concurrency/current.pdf',1000,
  repeat('c',64),1,'review',1,1);
insert into public.textbook_pages(source_id,page_number,extracted_text,review_status)
values('30000000-0000-0000-0000-000000000001',1,'Metals and Non-metals','extracted');
