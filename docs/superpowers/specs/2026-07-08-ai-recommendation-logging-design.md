# AI 추천 프롬프트/응답 로깅 + 평가 파이프라인 — 설계

## 배경

`generate-ai` Edge Function([supabase/functions/generate-ai/index.ts](../../../supabase/functions/generate-ai/index.ts))은 Claude를 호출해 카드/코스 추천, 느낌 기반 추천, 초대 메시지를 생성하지만 프롬프트 원문과 Claude 응답 원문을 어디에도 저장하지 않는다. 저장되는 건 `analytics_events`의 집계 지표(후보 수, latency, 토큰 사용량)와 `date_cards`/`soft_messages`의 최종 가공 결과뿐이라, 추천이 왜 별로였는지 나중에 되짚어볼 방법이 없다. AI 추천 아키텍처를 계속 발전시키려면 실제 입출력을 남기고, 품질을 정량적으로 평가하고, 프롬프트를 바꿀 때 전후 비교할 수 있는 기반이 필요하다.

## 목표

- `cards`/`feeling_select`/`course_select` 3개 액션의 모든 호출(100%)에 대해 프롬프트 원문·응답 원문·성공여부·토큰/레이턴시를 서버에서 기록한다.
- 기록된 로그를 LLM-as-judge로 온디맨드 채점해서 관련성/할루시네이션/추천 근거 품질을 정량화한다.
- 프롬프트 템플릿 버전을 태깅해서, 프롬프트를 고칠 때 전후 점수를 비교할 수 있게 한다.
- 로그/평가 테이블은 `service_role`만 접근 가능해야 한다(자유 입력 텍스트가 포함되므로 개인정보성 고려).

## 비목표

- `soft_message` 액션(초대/거절 메시지 생성)은 로깅 대상에서 제외한다. 추천 품질과 무관하다.
- 실시간/자동 채점(매 호출마다 judge 호출)은 하지 않는다. Claude API 호출이 2배로 늘고 응답 지연이 생기므로, 채점은 항상 로컬 스크립트로 온디맨드 실행한다.
- 로그를 `date_cards`/`soft_messages` row와 FK로 연결하지 않는다. 현재 범위에서는 프롬프트 텍스트 자체가 컨텍스트를 전부 담고 있어 불필요하다.
- 클라이언트에서 로그/평가 테이블을 직접 조회하는 UI는 만들지 않는다. 조회는 SQL 콘솔/스크립트로만 한다.

## 데이터 흐름

```
client(lib/ai.ts invokeAI)
  → generate-ai Edge Function
      → Anthropic API 호출
      → (신규) service-role client로 ai_recommendation_logs insert
      → 응답 반환 (기존과 동일)

scripts/eval-ai-logs.ts (로컬, 온디맨드)
  → ai_recommendation_logs에서 미채점 row 조회
  → judge 프롬프트로 Anthropic 호출(생성 모델과 다른 모델)
  → ai_recommendation_log_evals insert
```

## 스키마

### `ai_recommendation_logs`

```sql
create table public.ai_recommendation_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
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

alter table public.ai_recommendation_logs enable row level security;
-- 정책 없음: anon/authenticated는 전부 차단, service_role은 RLS를 우회하므로 별도 정책 불필요.
```

### `ai_recommendation_log_evals`

```sql
create table public.ai_recommendation_log_evals (
  id uuid primary key default gen_random_uuid(),
  log_id uuid not null references public.ai_recommendation_logs(id),
  rubric_version text not null,
  judge_model text not null,
  relevance_score smallint not null check (relevance_score between 1 and 5),
  hallucination_flag boolean not null,
  reasoning_quality_score smallint not null check (reasoning_quality_score between 1 and 5),
  verdict text not null check (verdict in ('pass', 'borderline', 'fail')),
  comment text,
  created_at timestamptz not null default now()
);

alter table public.ai_recommendation_log_evals enable row level security;
-- 정책 없음: service_role 전용.
```

동일 `log_id`가 여러 eval row를 가질 수 있다(다른 `rubric_version`으로 재채점 시 과거 기록 보존).

## `generate-ai` Edge Function 변경

[supabase/functions/generate-ai/index.ts](../../../supabase/functions/generate-ai/index.ts)에서:

1. `SUPABASE_SERVICE_ROLE_KEY`(Edge Function 환경에 자동 주입)로 `adminClient` 생성. 기존 `userClient`(anon key, 인증 확인용)는 그대로 유지.
2. 요청 바디에 `prompt_version` 필드 추가로 받는다: `const { action, prompt, prompt_version } = await req.json();`
3. Claude 호출 직전 `const startedAt = Date.now();`, 응답 받은 직후 `latency_ms = Date.now() - startedAt`.
4. `action`이 `cards`/`feeling_select`/`course_select`일 때만(즉 `soft_message` 제외) 다음을 시도:
   - 성공 시: `status: 'success'`, `response_json: parsed`, `input_tokens`/`output_tokens` = `data.usage`.
   - 실패 시(Anthropic 비정상 응답, JSON 파싱 실패, 빈 응답): `status: 'error'`, `error_message`에 원인 문자열.
5. insert는 반드시 `try/catch`로 감싸고, 실패해도 원래 응답 흐름을 막지 않는다(`console.error`만 남김). 로깅은 부가 기능이지 핵심 경로가 아니다.
6. 기존 에러 응답 경로(401/400/500/502)와 `soft_message` 처리 경로는 변경하지 않는다.

## 클라이언트 변경

- `lib/prompt.ts`에 `export const PROMPT_VERSION = 'v1';` 추가.
- `lib/ai.ts`의 `invokeAI(action, prompt)`가 `invokeAI(action, prompt, promptVersion = PROMPT_VERSION)`로 확장되어 요청 바디에 `prompt_version`을 포함한다. 모든 호출부(`generateDateCards`, `generateFeelingCards` 등 `invokeAI`를 거치는 함수)는 자동으로 현재 버전을 태깅하게 되므로 개별 호출부 수정은 불필요.
- 프롬프트 템플릿(`lib/prompt.ts`, `lib/recommendation.ts`)을 의미 있게 바꿀 때마다 `PROMPT_VERSION`을 수동으로 올린다(`v2`, `v3`, ...). 이 규칙은 `AGENTS.md`에 한 줄로 남긴다.

## 채점 스크립트 (`scripts/eval-ai-logs.ts`)

- Edge Function으로 배포하지 않는 **로컬 전용 스크립트**. `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `ANTHROPIC_API_KEY`를 로컬 환경변수로 읽는다(기존 `.env` 관례, 커밋 금지).
- 실행: `npx tsx scripts/eval-ai-logs.ts [--action=cards] [--limit=50]` 형태의 간단한 CLI.
- 동작:
  1. `ai_recommendation_logs`에서 `status = 'success'`이고, 현재 `RUBRIC_VERSION`으로 이미 채점된 eval row가 없는(`log_id`가 `ai_recommendation_log_evals`에 해당 rubric_version으로 없는) row를 최근순으로 최대 `--limit`개 조회.
  2. 각 row의 `prompt` + `response_json`을 judge 프롬프트에 넣어 Anthropic에 구조화 출력으로 요청. **judge 모델은 생성 모델(`claude-haiku-4-5`)과 다른 모델**(예: `claude-sonnet-4-5`)을 기본값으로 써서 자기 편향을 줄인다.
  3. judge 응답을 파싱해 `ai_recommendation_log_evals`에 insert.
  4. 진행 상황(몇 개 중 몇 개 채점 완료, 평균 점수)을 콘솔에 출력.
- judge 프롬프트 rubric(5개 축): `relevance_score`(입력한 mood/budget/duration/freeText와 추천이 맞는가), `hallucination_flag`(프롬프트에 없는 장소/사실을 지어냈는가 — 특히 카카오 실제 장소 데이터 언급 시 중요), `reasoning_quality_score`(`why_recommended`가 구체적인가), `verdict`, `comment`.

## 개선 워크플로 (사용 가이드)

1. 평소엔 로깅만 조용히 쌓인다(추가 비용 없음).
2. 품질을 확인하고 싶을 때 `npx tsx scripts/eval-ai-logs.ts`로 최근 미채점 로그를 배치 채점.
3. SQL로 `prompt_version`별 평균 점수/`fail` 비율을 비교:
   ```sql
   select l.prompt_version, e.verdict, count(*), avg(e.relevance_score), avg(e.reasoning_quality_score),
          sum(case when e.hallucination_flag then 1 else 0 end) as hallucinations
   from ai_recommendation_log_evals e
   join ai_recommendation_logs l on l.id = e.log_id
   group by l.prompt_version, e.verdict
   order by l.prompt_version;
   ```
4. `fail`/`borderline` verdict인 row를 `comment`와 함께 직접 읽어보며 실패 패턴 파악.
5. `lib/prompt.ts`/`lib/recommendation.ts` 프롬프트 템플릿 수정 + `PROMPT_VERSION` bump.
6. 며칠 사용량이 쌓이면 다시 채점 → 신구 버전 평균 점수/할루시네이션 비율 비교로 개선 여부 판단.
7. rubric 자체를 바꾸고 싶으면 `RUBRIC_VERSION`을 올려서 재채점(과거 rubric 점수와 안 섞이게).

## 에러 처리

- 로그 insert 실패는 `generate-ai`의 정상 응답을 절대 막지 않는다(`try/catch` + `console.error`).
- 채점 스크립트에서 개별 row의 judge 호출이 실패하면 해당 row만 건너뛰고 나머지를 계속 처리(전체 배치를 중단하지 않음), 실패한 row id를 콘솔에 남김.
- `response_json`이 없는(즉 `status = 'error'`인) row는 채점 대상에서 자동 제외(내용이 없으므로).

## 테스트 범위

- `generate-ai`의 로깅 분기: 이 프로젝트에는 Deno 함수용 테스트 하네스가 없고 기존 `place-search` 로직도 미검증 상태라(기존 관례, [2026-07-04-gps-location-design.md](2026-07-04-gps-location-design.md) 참고), 신규 테스트 인프라를 만들지 않고 실제 앱 호출 + Supabase 콘솔에서 row 생성 확인으로 검증한다.
- `lib/ai.ts`의 `invokeAI` prompt_version 전달: 기존 `lib/ai.ts` 관련 유닛 테스트가 있다면 그 패턴을 따라 바디에 `prompt_version`이 포함되는지 확인하는 테스트를 추가한다(없다면 수동 확인).
- `scripts/eval-ai-logs.ts`: 로컬 스크립트이므로 자동 테스트 대상에서 제외, 실제로 몇 개 로그를 채점해보고 `ai_recommendation_log_evals`에 정상 insert되는지 수동 확인.
