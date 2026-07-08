-- AI 추천(cards/feeling_select/course_select) 프롬프트·응답 로깅 + LLM-as-judge 평가 저장.
-- 자유 입력 텍스트가 프롬프트에 포함되므로 service_role만 접근 가능하게 RLS를 켜고 정책은 두지 않는다
-- (anon/authenticated 전체 차단, service_role은 RLS를 우회하므로 별도 정책 불필요).

create table if not exists public.ai_recommendation_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('cards', 'feeling_select', 'course_select')),
  prompt_version text not null,
  model text not null,
  prompt text not null,
  status text not null check (status in ('success', 'error')),
  response_json jsonb,
  error_message text,
  input_tokens integer,
  output_tokens integer,
  latency_ms integer,
  created_at timestamptz not null default now()
);

comment on table public.ai_recommendation_logs is
  'generate-ai Edge Function이 기록하는 cards/feeling_select/course_select 호출의 프롬프트·응답 원문 로그. service_role 전용.';

alter table public.ai_recommendation_logs enable row level security;

create table if not exists public.ai_recommendation_log_evals (
  id uuid primary key default gen_random_uuid(),
  log_id uuid not null references public.ai_recommendation_logs(id) on delete cascade,
  rubric_version text not null,
  judge_model text not null,
  relevance_score smallint not null check (relevance_score between 1 and 5),
  hallucination_flag boolean not null,
  reasoning_quality_score smallint not null check (reasoning_quality_score between 1 and 5),
  verdict text not null check (verdict in ('pass', 'borderline', 'fail')),
  comment text,
  created_at timestamptz not null default now()
);

comment on table public.ai_recommendation_log_evals is
  'scripts/eval-ai-logs.ts가 기록하는 LLM-as-judge 채점 결과. 같은 log_id가 여러 rubric_version으로 재채점될 수 있음. service_role 전용.';

alter table public.ai_recommendation_log_evals enable row level security;
