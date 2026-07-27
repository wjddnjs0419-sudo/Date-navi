-- AI 로그 30일 삭제 전에 아키텍처 지표 추세를 영구 보존하는 일별 집계.
-- 삭제 스케줄(pg_cron)보다 반드시 먼저 배포되어야 한다 — 반대면 첫 실행에서 이력이 사라진다.
begin;

create table if not exists public.ai_recommendation_log_daily_stats (
  stat_date date not null,
  action text not null,
  call_count integer not null check (call_count >= 0),
  error_count integer not null check (error_count >= 0),
  avg_latency_ms integer,
  p95_latency_ms integer,
  avg_input_tokens integer,
  avg_output_tokens integer,
  aggregated_at timestamptz not null default now(),
  primary key (stat_date, action)
);
comment on table public.ai_recommendation_log_daily_stats is
  'ai_recommendation_logs 삭제 전 일별 집계. 개인정보 없음, 영구 보존. service_role 전용.';

alter table public.ai_recommendation_log_daily_stats enable row level security;
revoke all on public.ai_recommendation_log_daily_stats from authenticated;
revoke all on public.ai_recommendation_log_daily_stats from anon;

-- 멱등: 원본에 아직 남아 있는 날짜만 다시 계산해 upsert. 이미 삭제된 날짜의 집계는 건드리지 않는다.
create or replace function public.aggregate_ai_recommendation_log_daily_stats()
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.ai_recommendation_log_daily_stats
    (stat_date, action, call_count, error_count, avg_latency_ms, p95_latency_ms, avg_input_tokens, avg_output_tokens, aggregated_at)
  select
    created_at::date,
    action,
    count(*),
    count(*) filter (where status = 'error'),
    round(avg(latency_ms))::integer,
    round((percentile_cont(0.95) within group (order by latency_ms))::numeric)::integer,
    round(avg(input_tokens))::integer,
    round(avg(output_tokens))::integer,
    now()
  from public.ai_recommendation_logs
  group by 1, 2
  on conflict (stat_date, action) do update set
    call_count = excluded.call_count,
    error_count = excluded.error_count,
    avg_latency_ms = excluded.avg_latency_ms,
    p95_latency_ms = excluded.p95_latency_ms,
    avg_input_tokens = excluded.avg_input_tokens,
    avg_output_tokens = excluded.avg_output_tokens,
    aggregated_at = excluded.aggregated_at;
$$;
revoke all on function public.aggregate_ai_recommendation_log_daily_stats() from public;

commit;
