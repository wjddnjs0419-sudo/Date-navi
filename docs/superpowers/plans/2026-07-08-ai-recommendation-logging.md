# AI 추천 프롬프트/응답 로깅 + 평가 파이프라인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **이 프로젝트 실행 방식 관련 사용자 지시:** 단계별로 subagent를 불러 리뷰하지 말 것. 모든 태스크가 끝난 뒤 한 번에 리뷰한다 (executing-plans의 inline 방식으로, 태스크마다 멈추지 않고 끝까지 진행 후 최종 리뷰).

**Goal:** `generate-ai` Edge Function이 처리하는 `cards`/`feeling_select`/`course_select` 호출의 프롬프트·응답 원문을 Supabase에 기록하고, 로컬 스크립트로 LLM-as-judge 채점을 온디맨드 실행해 추천 품질을 추적·개선할 수 있게 한다.

**Architecture:** 신규 테이블 `ai_recommendation_logs`(원문 로그)와 `ai_recommendation_log_evals`(채점 결과)를 추가한다. `generate-ai`는 Claude 호출 직후 service-role 클라이언트로 로그를 insert하되, insert 실패가 원래 응답을 막지 않게 한다. 클라이언트는 `lib/prompt.ts`의 `PROMPT_VERSION` 상수를 모든 요청에 태깅한다. 채점은 배포되지 않는 로컬 스크립트(`scripts/eval-ai-logs.ts`)가 미채점 로그를 조회해 다른(더 강한) Claude 모델로 채점하고 결과를 저장한다.

**Tech Stack:** Supabase (Postgres + Edge Functions/Deno), TypeScript/React Native(Expo), Jest, `tsx`(신규 devDependency, 로컬 스크립트 실행용), Anthropic Messages API(구조화 출력).

**참고 스펙:** [docs/superpowers/specs/2026-07-08-ai-recommendation-logging-design.md](../specs/2026-07-08-ai-recommendation-logging-design.md)

**Supabase 프로젝트:** `wqjguifsmtblgrhdfnji` (Date-Navi, ap-northeast-2)

---

### Task 1: DB 마이그레이션 — 로그/평가 테이블 생성

**Files:**
- Create: `supabase/migrations/20260708130000_ai_recommendation_logs.sql`

- [ ] **Step 1: 마이그레이션 SQL 파일 작성**

```sql
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
```

- [ ] **Step 2: 원격 프로젝트에 마이그레이션 적용**

`mcp__plugin_supabase_supabase__apply_migration` 도구를 다음 인자로 호출:
- `project_id`: `wqjguifsmtblgrhdfnji`
- `name`: `ai_recommendation_logs`
- `query`: Step 1에서 작성한 SQL 전체

- [ ] **Step 3: 테이블 생성 확인**

`mcp__plugin_supabase_supabase__list_tables` (`project_id: wqjguifsmtblgrhdfnji`, `schemas: ["public"]`, `verbose: true`)를 호출해 `ai_recommendation_logs`, `ai_recommendation_log_evals`가 목록에 있고 컬럼이 위 정의와 일치하는지 확인.

Expected: 두 테이블 모두 존재, `rls_enabled: true`, policy 없음.

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/20260708130000_ai_recommendation_logs.sql
git commit -m "feat(db): add ai_recommendation_logs / ai_recommendation_log_evals tables"
```

---

### Task 2: `PROMPT_VERSION` 상수 추가 (TDD)

**Files:**
- Modify: `lib/prompt.ts:1-3`
- Test: `__tests__/prompt.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`__tests__/prompt.test.ts` 끝(68번째 줄 뒤)에 추가:

```ts
import { PROMPT_VERSION } from '../lib/prompt';

describe('PROMPT_VERSION', () => {
  it('vN 형식의 문자열이다', () => {
    expect(PROMPT_VERSION).toMatch(/^v\d+$/);
  });
});
```

(파일 최상단 import 목록에 `PROMPT_VERSION`을 추가하는 형태 — 기존 `import { buildPrompt, MODE_EMPHASIS, MODE_EMPHASIS_EN } from '../lib/prompt';`를 `import { buildPrompt, MODE_EMPHASIS, MODE_EMPHASIS_EN, PROMPT_VERSION } from '../lib/prompt';`로 수정하고, `describe('PROMPT_VERSION', ...)` 블록만 파일 끝에 추가한다.)

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx jest __tests__/prompt.test.ts -t "PROMPT_VERSION"`
Expected: FAIL — `PROMPT_VERSION` is not exported from `lib/prompt.ts` (undefined, `toMatch` 실패 또는 import 에러).

- [ ] **Step 3: `lib/prompt.ts`에 상수 추가**

`lib/prompt.ts:1-3`을 다음으로 교체:

```ts
import type { AppLanguage } from './i18n';
import type { FeelingInput, UserPreferences } from './ai';

// 프롬프트 템플릿을 의미 있게 바꿀 때마다 올린다. ai_recommendation_logs에 태깅되어 버전별 품질 비교에 쓰인다.
export const PROMPT_VERSION = 'v1';
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx jest __tests__/prompt.test.ts -t "PROMPT_VERSION"`
Expected: PASS

- [ ] **Step 5: 타입체크**

Run: `npm run validate`
Expected: 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add lib/prompt.ts __tests__/prompt.test.ts
git commit -m "feat(prompt): add PROMPT_VERSION constant for recommendation log tagging"
```

---

### Task 3: `lib/ai.ts`의 `invokeAI`가 `prompt_version`을 함께 전송

**Files:**
- Modify: `lib/ai.ts:3`, `lib/ai.ts:58-65`

이 파일의 네트워크 호출 함수들(`invokeAI` 및 이를 감싸는 `generateDateCards` 등)은 기존에도 자동 테스트가 없다(`__tests__/adjustSoftMessage.test.ts`는 순수 프롬프트 빌더만 테스트하고 `lib/ai.ts`의 네트워크 함수는 건드리지 않음 — 기존 관례). 설계 문서에서 이미 이 범위는 수동 검증으로 합의했으므로, 이 태스크는 TDD 사이클 없이 진행하고 Task 5에서 실제 앱 호출로 검증한다.

- [ ] **Step 1: import에 `PROMPT_VERSION` 추가**

`lib/ai.ts:3`:

```ts
import { buildPrompt, buildAdjustSoftMessagePrompt, buildSoftMessagePrompt, PROMPT_VERSION, type SoftMessageInput } from './prompt';
```

- [ ] **Step 2: `invokeAI`가 `prompt_version`을 바디에 포함하도록 수정**

`lib/ai.ts:58-65`을 다음으로 교체:

```ts
async function invokeAI(action: AIAction, prompt: string): Promise<{ data: unknown; usage?: AIUsage }> {
  const { data, error } = await supabase.functions.invoke('generate-ai', {
    body: { action, prompt, prompt_version: PROMPT_VERSION },
  });
  if (error) throw error;
  const usage = (data as { _usage?: AIUsage })?._usage;
  return { data, usage };
}
```

- [ ] **Step 3: 타입체크**

Run: `npm run validate`
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add lib/ai.ts
git commit -m "feat(ai): tag generate-ai requests with PROMPT_VERSION"
```

---

### Task 4: `generate-ai` Edge Function — 로깅 로직 추가

**Files:**
- Modify: `supabase/functions/generate-ai/index.ts` (전체 파일 교체)

Deno 함수라 이 프로젝트엔 테스트 하네스가 없다(`place-search`도 동일하게 미검증 상태 — 기존 관례). Task 5의 실제 배포 + 수동 호출로 검증한다.

- [ ] **Step 1: 파일 전체를 아래 내용으로 교체**

`supabase/functions/generate-ai/index.ts`:

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const CARDS_SCHEMA = {
  type: 'object',
  properties: {
    cards: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          summary: { type: 'string' },
          // estimated_time/budget은 앱이 결정론적으로 채운다 (V2 §11) — Claude 미생성.
          tags: { type: 'array', items: { type: 'string' } },
          why_recommended: { type: 'string' },
          // 카카오 로컬 실제 장소 (location 입력 시에만 채워짐 — optional)
          place_name: { type: 'string' },
          place_address: { type: 'string' },
          map_url: { type: 'string' },
          // make_course 모드 전용 동선 단계 (optional — required 미포함이라 다른 모드는 생략 가능)
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                desc: { type: 'string' },
              },
              required: ['label'],
              additionalProperties: false,
            },
          },
        },
        required: ['title', 'summary', 'tags', 'why_recommended'],
        additionalProperties: false,
      },
    },
  },
  required: ['cards'],
  additionalProperties: false,
};

const SOFT_MESSAGE_SCHEMA = {
  type: 'object',
  properties: { message: { type: 'string' } },
  required: ['message'],
  additionalProperties: false,
};

// V2 §10 — Claude는 후보 candidate_id를 선택하고 설명만 생성한다. 장소·estimated 미생성.
const FEELING_SELECT_SCHEMA = {
  type: 'object',
  properties: {
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          candidate_id: { type: 'string' },
          title: { type: 'string' },
          summary: { type: 'string' },
          why_recommended: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
        },
        required: ['candidate_id', 'title', 'summary', 'why_recommended', 'tags'],
        additionalProperties: false,
      },
    },
  },
  required: ['recommendations'],
  additionalProperties: false,
};

// make_course — steps[] (순서 보존). 장소 단계는 candidate_id, 행동 단계는 label/desc만 (§16).
const COURSE_SELECT_SCHEMA = {
  type: 'object',
  properties: {
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          summary: { type: 'string' },
          why_recommended: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                candidate_id: { type: 'string' },
                label: { type: 'string' },
                desc: { type: 'string' },
              },
              required: ['label'],
              additionalProperties: false,
            },
          },
        },
        required: ['title', 'summary', 'why_recommended', 'tags', 'steps'],
        additionalProperties: false,
      },
    },
  },
  required: ['recommendations'],
  additionalProperties: false,
};

const ACTION_CONFIG: Record<string, { schema: object; maxTokens: number; temperature: number }> = {
  cards: { schema: CARDS_SCHEMA, maxTokens: 2048, temperature: 0.8 },
  soft_message: { schema: SOFT_MESSAGE_SCHEMA, maxTokens: 256, temperature: 0.9 },
  feeling_select: { schema: FEELING_SELECT_SCHEMA, maxTokens: 1536, temperature: 0.7 },
  course_select: { schema: COURSE_SELECT_SCHEMA, maxTokens: 2048, temperature: 0.7 },
};

const MODEL = 'claude-haiku-4-5';

// 프롬프트/응답 로깅 대상 — soft_message(초대·거절 메시지)는 추천 품질과 무관하므로 제외.
const LOGGED_ACTIONS = new Set(['cards', 'feeling_select', 'course_select']);

type LogParams = {
  userId: string;
  action: string;
  promptVersion: string;
  prompt: string;
  model: string;
  status: 'success' | 'error';
  responseJson?: unknown;
  errorMessage?: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
};

// 로깅 실패가 원래 응답 흐름을 절대 막지 않도록 호출부에서 await하되 에러는 여기서 삼킨다.
async function logRecommendation(adminClient: ReturnType<typeof createClient>, params: LogParams) {
  if (!LOGGED_ACTIONS.has(params.action)) return;
  try {
    const { error } = await adminClient.from('ai_recommendation_logs').insert({
      user_id: params.userId,
      action: params.action,
      prompt_version: params.promptVersion,
      model: params.model,
      prompt: params.prompt,
      status: params.status,
      response_json: params.responseJson ?? null,
      error_message: params.errorMessage ?? null,
      input_tokens: params.inputTokens ?? null,
      output_tokens: params.outputTokens ?? null,
      latency_ms: params.latencyMs,
    });
    if (error) console.error('ai_recommendation_logs insert failed', error);
  } catch (err) {
    console.error('ai_recommendation_logs insert threw', err);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 로그인된 사용자만 호출 가능
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: 'Unauthorized' }, 401);

    // 로깅 전용 admin 클라이언트 — RLS를 우회해 ai_recommendation_logs에 쓰기 위함.
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { action, prompt, prompt_version } = await req.json();
    const config = typeof action === 'string' ? ACTION_CONFIG[action] : undefined;
    if (!config || typeof prompt !== 'string' || !prompt) {
      return json({ error: 'Invalid request' }, 400);
    }
    const promptVersion = typeof prompt_version === 'string' && prompt_version ? prompt_version : 'unknown';

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return json({ error: 'AI key not configured' }, 500);

    const startedAt = Date.now();
    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'structured-outputs-2025-11-13',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: config.maxTokens,
        temperature: config.temperature,
        output_config: { format: { type: 'json_schema', schema: config.schema } },
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!aiResponse.ok) {
      const detail = await aiResponse.text();
      console.error('Anthropic error', aiResponse.status, detail);
      await logRecommendation(adminClient, {
        userId: user.id, action, promptVersion, prompt, model: MODEL,
        status: 'error', errorMessage: `Anthropic ${aiResponse.status}: ${detail.slice(0, 500)}`,
        latencyMs: Date.now() - startedAt,
      });
      return json({ error: 'AI request failed' }, 502);
    }

    const data = await aiResponse.json();
    const textBlock = (data.content ?? []).find((b: { type: string }) => b.type === 'text');
    const text: string = textBlock?.text ?? '';
    if (!text) {
      await logRecommendation(adminClient, {
        userId: user.id, action, promptVersion, prompt, model: MODEL,
        status: 'error', errorMessage: 'Empty AI response',
        latencyMs: Date.now() - startedAt,
      });
      return json({ error: 'Empty AI response' }, 502);
    }

    // 구조화 출력이라 스키마에 맞는 JSON 보장 → 그대로 파싱해 반환. usage는 계측용으로 첨부 (§7·§18).
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (parseErr) {
      await logRecommendation(adminClient, {
        userId: user.id, action, promptVersion, prompt, model: MODEL,
        status: 'error', errorMessage: `JSON parse failed: ${String(parseErr)}`,
        latencyMs: Date.now() - startedAt,
      });
      return json({ error: 'Invalid AI response' }, 502);
    }

    await logRecommendation(adminClient, {
      userId: user.id, action, promptVersion, prompt, model: MODEL,
      status: 'success', responseJson: parsed,
      inputTokens: data.usage?.input_tokens, outputTokens: data.usage?.output_tokens,
      latencyMs: Date.now() - startedAt,
    });

    return json({ ...parsed, _usage: { input_tokens: data.usage?.input_tokens, output_tokens: data.usage?.output_tokens } });
  } catch (err) {
    console.error('generate-ai error', err);
    return json({ error: 'Internal error' }, 500);
  }
});
```

- [ ] **Step 2: 로컬 diff 확인 후 커밋**

```bash
git add supabase/functions/generate-ai/index.ts
git commit -m "feat(generate-ai): log prompt/response for cards/feeling_select/course_select"
```

(배포는 Task 5에서 진행 — 코드 반영과 배포를 분리해 롤백 시 git revert만으로 코드 상태를 되돌릴 수 있게 한다.)

---

### Task 5: Edge Function 배포 + 실제 호출로 검증

**Files:** 없음(배포/검증 전용 태스크)

- [ ] **Step 1: `generate-ai` 배포**

`mcp__plugin_supabase_supabase__deploy_edge_function` 호출:
- `project_id`: `wqjguifsmtblgrhdfnji`
- `name`: `generate-ai`
- `entrypoint_path`: `index.ts`
- `verify_jwt`: `true`
- `files`: `[{ "name": "index.ts", "content": "<Task 4 Step 1의 전체 파일 내용>" }]`

AGENTS.md 경고에 따라 배포 전 소스에 백슬래시(`\`)·이중따옴표(`"`)가 없는지 확인(이 파일은 전부 홑따옴표/템플릿 리터럴이라 해당 없음).

- [ ] **Step 2: 배포본과 로컬 파일 대조**

`mcp__plugin_supabase_supabase__get_edge_function` (`project_id: wqjguifsmtblgrhdfnji`, `function_slug: generate-ai`)로 배포된 내용을 가져와 `supabase/functions/generate-ai/index.ts`와 diff — 완전히 일치해야 함(전사 실수/문자 누락 확인).

- [ ] **Step 3: 실제 앱에서 호출해 로그 row 생성 확인**

iOS 시뮬레이터에서 앱을 실행해 "느낌만 말할게" 또는 "코스로 정리해줘" 플로우로 카드/코스 추천을 1회 생성.

- [ ] **Step 4: DB에서 로그 확인**

`mcp__plugin_supabase_supabase__execute_sql` (`project_id: wqjguifsmtblgrhdfnji`):

```sql
select id, action, prompt_version, status, input_tokens, output_tokens, latency_ms, created_at
from public.ai_recommendation_logs
order by created_at desc
limit 5;
```

Expected: 방금 생성한 호출이 `status = 'success'`, `prompt_version = 'v1'`, `action`이 실제 사용한 모드와 일치하는 row로 나타남.

---

### Task 6: 로컬 채점 스크립트 실행 환경 준비

**Files:**
- Modify: `package.json`
- Create: `.env.eval.local.example`

- [ ] **Step 1: 의존성 추가**

```bash
npm install --save-dev tsx @types/node
```

- [ ] **Step 2: `package.json`에 스크립트 추가**

`package.json`의 `"scripts"` 블록에 추가:

```json
    "eval:ai-logs": "tsx --env-file=.env.eval.local scripts/eval-ai-logs.ts"
```

- [ ] **Step 3: 환경변수 템플릿 작성**

`.env.eval.local.example`:

```
# scripts/eval-ai-logs.ts 전용 로컬 환경변수. 앱 .env와 분리한다 —
# service_role 키는 클라이언트 번들에 절대 들어가면 안 되므로 이 파일에서만 쓴다.
#   cp .env.eval.local.example .env.eval.local
# 실행: npm run eval:ai-logs -- --action=cards --limit=20

# Supabase 프로젝트 URL (.env의 EXPO_PUBLIC_SUPABASE_URL과 동일 값)
SUPABASE_URL=

# Supabase service_role 키 — 대시보드 → Project Settings → API → service_role secret.
# ⚠️ anon 키와 다르다. RLS를 완전히 우회하므로 절대 앱 번들/클라이언트 코드에 넣지 말 것.
#    이 파일은 .gitignore의 .env.*.local 패턴으로 이미 git 추적에서 제외된다.
SUPABASE_SERVICE_ROLE_KEY=

# Anthropic 키 — generate-ai Edge Function 시크릿과 같은 값을 로컬에도 별도로 둔다.
# (채점은 이 스크립트가 직접 Anthropic API를 호출하므로 Edge Function 시크릿을 재사용할 수 없다.)
ANTHROPIC_API_KEY=
```

- [ ] **Step 4: `.env.eval.local`이 git에서 무시되는지 확인**

Run: `git check-ignore -v .env.eval.local`
Expected: `.gitignore:36:.env.*.local	.env.eval.local` 형태로 매치되어 출력됨 (실제 파일이 없어도 `git check-ignore`는 패턴 매치만 확인하므로 동작함).

- [ ] **Step 5: 커밋**

```bash
git add package.json package-lock.json .env.eval.local.example
git commit -m "chore: add tsx + eval:ai-logs script scaffolding"
```

---

### Task 7: 채점 스크립트 구현 (`scripts/eval-ai-logs.ts`)

**Files:**
- Create: `scripts/eval-ai-logs.ts`

로컬 전용 스크립트(Edge Function으로 배포되지 않음)라 자동 테스트 대상에서 제외 — Task 8에서 실제 로그를 채점해보며 수동 검증한다.

- [ ] **Step 1: 스크립트 작성**

`scripts/eval-ai-logs.ts`:

```ts
import { createClient } from '@supabase/supabase-js';

const RUBRIC_VERSION = 'v1';
const JUDGE_MODEL = 'claude-sonnet-4-5'; // 생성 모델(claude-haiku-4-5)과 다른 모델을 써서 자기 편향을 줄인다.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANTHROPIC_API_KEY) {
  console.error('Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY');
  console.error('.env.eval.local.example을 참고해 .env.eval.local을 만든 뒤 npm run eval:ai-logs로 실행하세요.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const EVAL_SCHEMA = {
  type: 'object',
  properties: {
    relevance_score: { type: 'integer', minimum: 1, maximum: 5 },
    hallucination_flag: { type: 'boolean' },
    reasoning_quality_score: { type: 'integer', minimum: 1, maximum: 5 },
    verdict: { type: 'string', enum: ['pass', 'borderline', 'fail'] },
    comment: { type: 'string' },
  },
  required: ['relevance_score', 'hallucination_flag', 'reasoning_quality_score', 'verdict', 'comment'],
  additionalProperties: false,
};

type LogRow = {
  id: string;
  action: string;
  prompt: string;
  response_json: unknown;
  prompt_version: string;
};

type JudgeResult = {
  relevance_score: number;
  hallucination_flag: boolean;
  reasoning_quality_score: number;
  verdict: 'pass' | 'borderline' | 'fail';
  comment: string;
};

function parseArgs(argv: string[]): { action?: string; limit: number } {
  const args: { action?: string; limit: number } = { limit: 50 };
  for (const arg of argv) {
    if (arg.startsWith('--action=')) args.action = arg.slice('--action='.length);
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.slice('--limit='.length));
  }
  return args;
}

async function fetchUnjudgedLogs(action: string | undefined, limit: number): Promise<LogRow[]> {
  const { data: judged, error: judgedError } = await supabase
    .from('ai_recommendation_log_evals')
    .select('log_id')
    .eq('rubric_version', RUBRIC_VERSION);
  if (judgedError) throw judgedError;
  const judgedIds = (judged ?? []).map((row: { log_id: string }) => row.log_id);

  let query = supabase
    .from('ai_recommendation_logs')
    .select('id, action, prompt, response_json, prompt_version')
    .eq('status', 'success')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (action) query = query.eq('action', action);
  if (judgedIds.length > 0) query = query.not('id', 'in', `(${judgedIds.join(',')})`);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as LogRow[];
}

function buildJudgePrompt(row: LogRow): string {
  return `당신은 데이트 추천 AI의 출력을 평가하는 채점자입니다.

[프롬프트]
${row.prompt}

[응답]
${JSON.stringify(row.response_json)}

다음 기준으로 채점하세요:
1. relevance_score (1-5): 프롬프트에 명시된 mood/budget/duration/자유 입력과 추천이 얼마나 맞는가.
2. hallucination_flag (true/false): 프롬프트에 없는 장소명·사실을 응답이 지어냈는가.
3. reasoning_quality_score (1-5): why_recommended가 구체적인가, 뻔한 말인가.
4. verdict: "pass" | "borderline" | "fail"
5. comment: 한 줄 코멘트`;
}

async function judge(row: LogRow): Promise<JudgeResult> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY as string,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'structured-outputs-2025-11-13',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: JUDGE_MODEL,
      max_tokens: 512,
      temperature: 0,
      output_config: { format: { type: 'json_schema', schema: EVAL_SCHEMA } },
      messages: [{ role: 'user', content: buildJudgePrompt(row) }],
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Anthropic ${response.status}: ${detail}`);
  }
  const data = await response.json();
  const textBlock = (data.content ?? []).find((b: { type: string }) => b.type === 'text');
  const text: string = textBlock?.text ?? '';
  if (!text) throw new Error('Empty judge response');
  return JSON.parse(text) as JudgeResult;
}

async function main() {
  const { action, limit } = parseArgs(process.argv.slice(2));
  const rows = await fetchUnjudgedLogs(action, limit);
  console.log(`${rows.length}개 미채점 로그 발견 (action=${action ?? 'all'}, limit=${limit})`);

  let done = 0;
  let failed = 0;
  const scores: number[] = [];

  for (const row of rows) {
    try {
      const result = await judge(row);
      const { error } = await supabase.from('ai_recommendation_log_evals').insert({
        log_id: row.id,
        rubric_version: RUBRIC_VERSION,
        judge_model: JUDGE_MODEL,
        relevance_score: result.relevance_score,
        hallucination_flag: result.hallucination_flag,
        reasoning_quality_score: result.reasoning_quality_score,
        verdict: result.verdict,
        comment: result.comment,
      });
      if (error) throw error;
      scores.push(result.relevance_score);
      done += 1;
      console.log(`[${done + failed}/${rows.length}] ${row.id} (${row.action}) → ${result.verdict}, relevance=${result.relevance_score}`);
    } catch (err) {
      failed += 1;
      console.error(`[${done + failed}/${rows.length}] ${row.id} 채점 실패:`, err);
    }
  }

  const avg = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : 'N/A';
  console.log(`완료: ${done}개 채점, ${failed}개 실패. 평균 relevance_score=${avg}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: 타입체크**

Run: `npm run validate`
Expected: 에러 없음 (`scripts/`는 루트 tsconfig의 `exclude`에 없어 기본적으로 타입체크 대상에 포함됨)

- [ ] **Step 3: 커밋**

```bash
git add scripts/eval-ai-logs.ts
git commit -m "feat(scripts): add on-demand LLM-as-judge eval script for ai_recommendation_logs"
```

---

### Task 8: 채점 스크립트 실전 실행 검증

**Files:** 없음(검증 전용 태스크)

- [ ] **Step 1: `.env.eval.local` 준비**

```bash
cp .env.eval.local.example .env.eval.local
```

`SUPABASE_URL`(`.env`의 `EXPO_PUBLIC_SUPABASE_URL`과 동일 값), `SUPABASE_SERVICE_ROLE_KEY`(Supabase 대시보드 → Project Settings → API), `ANTHROPIC_API_KEY`(Edge Function 시크릿과 동일 값)를 채운다.

- [ ] **Step 2: 실행**

```bash
npm run eval:ai-logs -- --limit=5
```

Expected: Task 5에서 생성한 로그(및 그 이전 로그가 있다면 함께) 최대 5개가 채점되어 `relevance_score`, `verdict` 등이 콘솔에 출력되고 마지막 줄에 `완료: N개 채점, 0개 실패. 평균 relevance_score=...`가 표시됨.

- [ ] **Step 3: DB에서 결과 확인**

`mcp__plugin_supabase_supabase__execute_sql` (`project_id: wqjguifsmtblgrhdfnji`):

```sql
select l.action, l.prompt_version, e.verdict, e.relevance_score, e.hallucination_flag, e.comment
from public.ai_recommendation_log_evals e
join public.ai_recommendation_logs l on l.id = e.log_id
order by e.created_at desc
limit 5;
```

Expected: Step 2에서 채점한 만큼의 row가 조회됨.

---

### Task 9: 컨벤션 문서화 + 최종 정리

**Files:**
- Modify: `AGENTS.md` (Anti-Patterns & Lessons Learned 섹션 끝)

- [ ] **Step 1: `AGENTS.md`에 한 줄 추가**

`AGENTS.md`의 `## 🚫 Anti-Patterns & Lessons Learned` 섹션 마지막 항목 뒤에 추가:

```markdown
- `lib/prompt.ts`/`lib/recommendation.ts`의 프롬프트 템플릿을 의미 있게 바꾸면 `PROMPT_VERSION`(`lib/prompt.ts`)을 올릴 것 — 안 올리면 `ai_recommendation_logs` 기반 전후 품질 비교에서 신구 버전이 섞여 무의미해짐.
```

- [ ] **Step 2: 전체 타입체크 마지막 확인**

Run: `npm run validate`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add AGENTS.md
git commit -m "docs: note PROMPT_VERSION bump convention in AGENTS.md"
```

---

## 완료 후 리뷰

사용자 지시에 따라 태스크별 subagent 리뷰 없이 Task 1~9를 끝까지 진행한 뒤, 마지막에 한 번 `/code-review`(또는 동등한 코드 리뷰 subagent)로 전체 변경사항을 리뷰한다.
