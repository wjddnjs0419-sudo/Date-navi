alter table public.date_cards add column if not exists steps jsonb;
comment on column public.date_cards.steps is
  'make_course 카드의 단계별 동선(CourseStep[]). feeling/next_meet 카드는 null. 이 컬럼 추가 이전에 저장된 코스 카드도 null — 상세 화면에서 summary 파싱 폴백으로 표시.';
