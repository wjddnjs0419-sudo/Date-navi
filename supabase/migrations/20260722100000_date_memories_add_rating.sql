-- supabase/migrations/20260722100000_date_memories_add_rating.sql
-- 목업(09_review)의 "전체 별점"(1~5점) 저장용 컬럼.
alter table public.date_memories
  add column if not exists rating integer;

alter table public.date_memories
  drop constraint if exists date_memories_rating_check;

alter table public.date_memories
  add constraint date_memories_rating_check
  check (rating is null or (rating >= 1 and rating <= 5));
