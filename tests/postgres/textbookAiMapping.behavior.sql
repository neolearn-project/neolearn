\set ON_ERROR_STOP on
do $$declare fp text;claimed text;
begin
 insert into public.chapters(id,subject_id,chapter_name) values(21,2,'States');
 fp:=public.textbook_catalog_fingerprint(2);
 select outcome into claimed from public.claim_textbook_ai_mapping('30000000-0000-0000-0000-000000000001',1,repeat('c',64),1,2,fp,'gpt-5-mini','cache-fixture','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',120);
 if claimed<>'claimed' or not public.finalize_textbook_ai_mapping('30000000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','[]'::jsonb,'[]'::jsonb) then raise exception 'initial proposal was not claimed/finalized';end if;
 select outcome into claimed from public.claim_textbook_ai_mapping('30000000-0000-0000-0000-000000000001',1,repeat('c',64),1,2,fp,'gpt-5-mini','cache-fixture','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',120);
 if claimed<>'cached' then raise exception 'cache was not reused';end if;
 select outcome into claimed from public.claim_textbook_ai_mapping('30000000-0000-0000-0000-000000000001',1,repeat('c',64),1,2,fp,'gpt-5-mini','expiry-fixture','cccccccc-cccc-cccc-cccc-cccccccccccc',120);
 update public.textbook_ai_mapping_proposals set claimed_at=now()-interval '121 seconds' where contract_version='expiry-fixture';
 select outcome into claimed from public.claim_textbook_ai_mapping('30000000-0000-0000-0000-000000000001',1,repeat('c',64),1,2,fp,'gpt-5-mini','expiry-fixture','dddddddd-dddd-dddd-dddd-dddddddddddd',120);
 if claimed<>'claimed' then raise exception 'expired claim was not reclaimed';end if;
 if public.finalize_textbook_ai_mapping('30000000-0000-0000-0000-000000000001','cccccccc-cccc-cccc-cccc-cccccccccccc','[]'::jsonb,'[]'::jsonb) then raise exception 'expired owner finalized';end if;
 if not public.finalize_textbook_ai_mapping('30000000-0000-0000-0000-000000000001','dddddddd-dddd-dddd-dddd-dddddddddddd','[]'::jsonb,'[]'::jsonb) then raise exception 'new owner could not finalize';end if;
 select outcome into claimed from public.claim_textbook_ai_mapping('30000000-0000-0000-0000-000000000001',1,repeat('c',64),1,2,fp,'gpt-5-mini','catalog-stale','eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',120);
 update public.topics set chapter_id=21 where id=200;
 if public.finalize_textbook_ai_mapping('30000000-0000-0000-0000-000000000001','eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','[]'::jsonb,'[]'::jsonb) then raise exception 'same-subject chapter move did not stale finalization';end if;
 begin perform public.claim_textbook_ai_mapping('30000000-0000-0000-0000-000000000001',1,repeat('c',64),1,2,fp,'gpt-5-mini','cache-fixture','ffffffff-ffff-ffff-ffff-ffffffffffff',120);raise exception using errcode='P9998',message='old cache claim succeeded after chapter move';exception when others then if sqlstate='P9998' or sqlerrm not like '%stale%' then raise;end if;end;
 begin perform public.save_textbook_mappings('30000000-0000-0000-0000-000000000001','[{"subjectId":2,"chapterId":20,"topicId":200,"pageFrom":1,"pageTo":1}]'::jsonb,1,repeat('c',64),1,2,fp);raise exception using errcode='P9998',message='old catalog save succeeded';exception when others then if sqlstate='P9998' or sqlerrm not like '%catalog changed%' then raise;end if;end;
 update public.topics set chapter_id=20 where id=200;
 begin perform public.claim_textbook_ai_mapping('10000000-0000-0000-0000-000000000001',1,repeat('a',64),2,1,public.textbook_catalog_fingerprint(1),'gpt-5-mini','replacement-stale','11111111-1111-4111-8111-111111111111',120);raise exception using errcode='P9998',message='superseded claim succeeded';exception when others then if sqlstate='P9998' or sqlerrm not like '%stale%' then raise;end if;end;
end$$;
