\set ON_ERROR_STOP on

create role service_role;
create role anon;
create role authenticated;

create schema storage;
create table storage.buckets(
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects(
  id bigint generated always as identity primary key,
  bucket_id text not null references storage.buckets(id)
);

create table public.subjects(
  id bigint primary key,
  board text not null,
  class_number integer not null,
  subject_name text not null
);
create table public.chapters(
  id bigint primary key,
  subject_id bigint not null references public.subjects(id),
  chapter_name text not null
);
create table public.topics(
  id bigint primary key,
  chapter_id bigint not null references public.chapters(id),
  topic_name text not null,
  is_active boolean not null default true
);

insert into public.subjects values
  (1,'CBSE',7,'English'),
  (2,'CBSE',8,'Science');
insert into public.chapters values
  (10,1,'Learning Together'),
  (20,2,'Materials');
insert into public.topics values
  (100,10,'The Day the River Spoke',true),
  (101,10,'Try Again',true),
  (200,20,'Metals and Non-metals',true);
