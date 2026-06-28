-- 온보딩에서 수집하는 mood 선택을 저장할 컬럼.
-- 기존 클라이언트(app/onboarding/preferences.tsx)가 upsert하던 mood_tags 컬럼이
-- 스키마에 없어 저장이 실패하던 문제를 해결한다.
alter table public.user_preferences
  add column if not exists mood_tags text[] not null default '{}'::text[];
