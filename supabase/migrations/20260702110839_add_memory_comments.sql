-- 추억 게시물(date_memories)에 달리는 댓글. 순수 텍스트, 평가 없음.
create table if not exists public.date_memory_comments (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references public.date_memories(id) on delete cascade,
  couple_id text not null references public.date_planner_couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.date_memory_comments enable row level security;

drop policy if exists "커플 멤버 comments 조회" on public.date_memory_comments;
create policy "커플 멤버 comments 조회"
on public.date_memory_comments for select
using (
  couple_id in (
    select date_planner_profiles.couple_id
    from date_planner_profiles
    where date_planner_profiles.user_id = auth.uid()
  )
);

drop policy if exists "본인 comments 삽입" on public.date_memory_comments;
create policy "본인 comments 삽입"
on public.date_memory_comments for insert
with check (auth.uid() = user_id);

drop policy if exists "본인 comments 삭제" on public.date_memory_comments;
create policy "본인 comments 삭제"
on public.date_memory_comments for delete
using (auth.uid() = user_id);
