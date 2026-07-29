# AI Rate Limits Implementation Plan

> **Execution:** Use a single agent by default. Delegate only genuinely independent work; select verification and TDD according to risk.

**Goal:** 활성 코스 생성의 사용자별 동시 실행·5분·일일 한도를 서버에서 원자적으로 강제하고, 내부 Claude action을 보호하며, 사용하지 않는 초대 문구 AI를 제거한다.

**Architecture:** Postgres의 service-role 전용 RPC가 quota bucket과 TTL lock의 유일한 변경 경계가 된다. `recommend-date` handler는 인증·입력 검증 후 lock을 획득하고, Kakao 후보 검증을 통과해 실제 Claude selection을 시작하기 직전에만 quota를 소비한다. `generate-ai`는 내부 비밀 헤더를 가진 `recommend_date_select`와 `estimate_place_price`만 허용한다.

**Tech Stack:** Expo 54, React Native 0.81, TypeScript 5.9, Supabase Edge Functions/Deno, PostgreSQL RPC/RLS, Jest 29

## Global Constraints

- 사용자 quota action은 `course_generate` 하나다.
- `course_generate` 동시 실행은 사용자당 1개, lock TTL은 정확히 2분이다.
- burst는 고정 5분 창당 3회, daily는 `Asia/Seoul` 달력 날짜당 20회다.
- 인증·입력·Kakao 검색 실패는 미차감이고, Claude 호출 직전 소비한 quota는 이후 실패해도 되돌리지 않는다.
- 전량 지정·사용자 선택 교체처럼 Claude selection을 실행하지 않는 요청은 quota를 소비하지 않는다.
- `soft_message` AI와 문구 추천 버튼은 제거하되 사용자가 직접 편집한 문구의 `soft_messages` 저장·전송은 유지한다.
- `cards`, `feeling_select`, `course_select`, `soft_message`, `replacement_select`, `parse_step_intents`는 `generate-ai`에서 허용하지 않는다.
- 내부 action은 `recommend_date_select`, `estimate_place_price`만 허용하며 `INTERNAL_AI_TOKEN` secret을 요구한다.
- 가격 추정은 사용자 quota에서 제외하고 장소별 원자적 claim으로 중복 호출만 막는다.
- 스키마 변경은 새 migration과 `docs/supabase-schema.sql`에 함께 반영한다.

---

### Task 1: 초대 문구 AI 제거

**Files:**
- Modify: `app/share/send.tsx`
- Modify: `lib/ai.ts`
- Modify: `__tests__/mvp-mode-visibility.test.ts`

**Interfaces:**
- Consumes: 기존 `share.send.defaultMessage`와 `soft_messages.generated_text` 저장 흐름
- Produces: AI 호출 없이 초기 문구를 직접 편집·전송하는 `SendScreen`

- [ ] **Step 1: 문구 추천 제거 회귀 테스트를 먼저 변경한다**

`__tests__/mvp-mode-visibility.test.ts`의 기존 “공유 invite 경로 유지” 기대를 아래처럼 교체한다.

```ts
it('공유 화면과 AI 모듈에 초대 문구 AI가 없다', () => {
  const send = read('app/share/send.tsx');
  const ai = read('lib/ai.ts');
  expect(send).not.toContain('generateInviteMessage');
  expect(send).not.toContain('handleSuggestMessage');
  expect(send).not.toContain('share.send.suggestCta');
  expect(ai).not.toContain('generateInviteMessage');
  expect(ai).not.toContain("'soft_message'");
});

it('공유 화면은 직접 편집한 message를 계속 저장한다', () => {
  const send = read('app/share/send.tsx');
  expect(send).toContain('value={message}');
  expect(send).toContain('onChangeText={setMessage}');
  expect(send).toContain('generated_text: message');
});
```

- [ ] **Step 2: 대상 테스트가 현재 실패하는지 확인한다**

Run: `npx jest __tests__/mvp-mode-visibility.test.ts --runInBand`

Expected: `generateInviteMessage`와 `share.send.suggestCta`가 남아 있어 FAIL.

- [ ] **Step 3: 화면과 AI helper에서 초대 문구 생성 코드를 제거한다**

`app/share/send.tsx`에서 `generateInviteMessage`, `Sparkles`, `generating`, `handleSuggestMessage`, 추천 버튼을 제거한다. `lib/ai.ts`에서는 `AIAction`의 `soft_message`, `InviteCard`, `buildInviteMessagePrompt`, `INVITE_FALLBACKS`, `generateInviteMessage`를 제거한다. `message` 초기값과 TextInput 및 `handleSend`는 유지한다.

- [ ] **Step 4: 공유 화면 회귀 테스트를 통과시킨다**

Run: `npx jest __tests__/mvp-mode-visibility.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 5: 변경을 커밋한다**

```bash
git add app/share/send.tsx lib/ai.ts __tests__/mvp-mode-visibility.test.ts
git commit -m "refactor: remove invite message AI"
```

### Task 2: 원자적 quota·lock·이벤트 스키마

**Files:**
- Create: `supabase/migrations/20260729120000_ai_rate_limits.sql`
- Modify: `docs/supabase-schema.sql`
- Create: `__tests__/aiRateLimitMigration.test.ts`

**Interfaces:**
- Consumes: Edge에서 검증한 `user_id`, 요청 `request_id`, 서버 현재 시각
- Produces: `acquire_ai_request_lock`, `release_ai_request_lock`, `consume_ai_quota`, `record_ai_rate_limit_event`

- [ ] **Step 1: migration 계약 테스트를 작성한다**

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260729120000_ai_rate_limits.sql'),
  'utf8',
).toLowerCase();

describe('AI rate-limit migration', () => {
  it('quota, lock, event 테이블을 private으로 만든다', () => {
    for (const table of ['ai_quota_buckets', 'ai_request_locks', 'ai_rate_limit_events']) {
      expect(sql).toContain(`create table if not exists public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }
    expect(sql).toContain('revoke all on public.ai_quota_buckets from anon, authenticated');
    expect(sql).toContain('revoke all on public.ai_request_locks from anon, authenticated');
    expect(sql).toContain('revoke all on public.ai_rate_limit_events from anon, authenticated');
  });

  it('5분/서울 일일 경계와 한도를 SQL에서 고정한다', () => {
    expect(sql).toContain("interval '5 minutes'");
    expect(sql).toContain("timezone('asia/seoul'");
    expect(sql).toContain('v_burst_limit constant integer := 3');
    expect(sql).toContain('v_daily_limit constant integer := 20');
  });

  it('RPC를 public과 authenticated에서 철회한다', () => {
    for (const fn of ['acquire_ai_request_lock', 'release_ai_request_lock', 'consume_ai_quota', 'record_ai_rate_limit_event']) {
      expect(sql).toContain(`revoke all on function public.${fn}`);
    }
  });
});
```

- [ ] **Step 2: 테스트가 migration 부재로 실패하는지 확인한다**

Run: `npx jest __tests__/aiRateLimitMigration.test.ts --runInBand`

Expected: migration 파일을 읽지 못해 FAIL.

- [ ] **Step 3: quota·lock 테이블과 RPC migration을 작성한다**

Migration에는 다음 계약을 그대로 구현한다.

```sql
create table if not exists public.ai_quota_buckets (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action = 'course_generate'),
  bucket_type text not null check (bucket_type in ('burst', 'daily')),
  bucket_start timestamptz not null,
  used_count integer not null default 0 check (used_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, action, bucket_type, bucket_start)
);

create table if not exists public.ai_request_locks (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action = 'course_generate'),
  request_id text not null check (length(btrim(request_id)) between 1 and 120),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (user_id, action)
);

create table if not exists public.ai_rate_limit_events (
  id bigint generated by default as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action = 'course_generate'),
  event_type text not null check (event_type in ('lock_conflict', 'burst_rejected', 'daily_rejected')),
  created_at timestamptz not null default now()
);
```

`acquire_ai_request_lock`은 `INSERT ... ON CONFLICT ... DO UPDATE ... WHERE ai_request_locks.expires_at <= p_now RETURNING`으로 획득 여부를 결정하고, TTL을 `p_now + interval '2 minutes'`로 설정한다. `release_ai_request_lock`은 세 식별자가 모두 맞는 행만 삭제한다.

`consume_ai_quota`는 `pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_action, 0))`을 먼저 잡는다. burst 시작은 Unix epoch 기준 300초 floor, daily 시작은 Seoul 날짜의 자정을 timestamptz로 환산한다. 두 현재 count를 읽고 burst 3회와 daily 20회를 모두 통과할 때만 두 행을 UPSERT 증가시킨다. 반환 타입은 다음으로 고정한다.

```sql
returns table (
  allowed boolean,
  limit_type text,
  retry_after_seconds integer,
  resets_at timestamptz
)
```

`record_ai_rate_limit_event`는 허용된 action/event 조합만 insert하며 프롬프트나 IP를 받지 않는다.

- [ ] **Step 4: canonical schema에 migration 내용을 동일하게 추가한다**

`docs/supabase-schema.sql` 끝에 migration 전체를 순서 그대로 붙이고 migration 파일명을 주석으로 기록한다.

- [ ] **Step 5: migration 계약 테스트를 통과시킨다**

Run: `npx jest __tests__/aiRateLimitMigration.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 6: 로컬 DB 또는 SQL Editor에서 원자성을 검증한다**

동일 `user_id/action`에 병렬 `acquire_ai_request_lock` 두 건을 보내 정확히 하나만 `acquired=true`인지 확인한다. 동일 시각의 `consume_ai_quota` 4건에서 3건만 허용되는지, `2026-07-29 14:59:59+00`와 `15:00:00+00`가 서로 다른 Seoul daily bucket인지 확인한다.

- [ ] **Step 7: 변경을 커밋한다**

```bash
git add supabase/migrations/20260729120000_ai_rate_limits.sql docs/supabase-schema.sql __tests__/aiRateLimitMigration.test.ts
git commit -m "feat: add atomic AI quota RPCs"
```

### Task 3: Edge용 quota/lock adapter

**Files:**
- Create: `supabase/functions/_shared/ai-rate-limit.ts`
- Create: `__tests__/ai-rate-limit-adapter.test.ts`

**Interfaces:**
- Consumes: Supabase service-role client의 `rpc(name, params)`
- Produces: `acquireCourseGenerationLock`, `releaseCourseGenerationLock`, `consumeCourseGenerationQuota`, `recordAiRateLimitEvent`

- [ ] **Step 1: adapter의 결과 정규화 테스트를 작성한다**

```ts
import {
  acquireCourseGenerationLock,
  consumeCourseGenerationQuota,
} from '../supabase/functions/_shared/ai-rate-limit';

const client = (rows: Record<string, unknown>[]) => ({
  rpc: jest.fn(async () => ({ data: rows, error: null })),
});

it('lock RPC의 snake_case 응답을 handler 계약으로 바꾼다', async () => {
  const db = client([{ acquired: false, retry_after_seconds: 37 }]);
  await expect(acquireCourseGenerationLock(db as never, {
    userId: 'user-1', requestId: 'req-1', now: '2026-07-29T10:00:00.000Z',
  })).resolves.toEqual({ acquired: false, retryAfterSeconds: 37 });
});

it('daily 거절의 reset 시간을 보존한다', async () => {
  const db = client([{ allowed: false, limit_type: 'daily', retry_after_seconds: null, resets_at: '2026-07-30T15:00:00.000Z' }]);
  await expect(consumeCourseGenerationQuota(db as never, {
    userId: 'user-1', now: '2026-07-29T10:00:00.000Z',
  })).resolves.toEqual({ allowed: false, limitType: 'daily', resetsAt: '2026-07-30T15:00:00.000Z' });
});

it('RPC 오류는 제한 허용으로 오인하지 않고 throw한다', async () => {
  const db = { rpc: jest.fn(async () => ({ data: null, error: new Error('db down') })) };
  await expect(consumeCourseGenerationQuota(db as never, { userId: 'user-1' })).rejects.toThrow('db down');
});
```

- [ ] **Step 2: adapter 테스트가 모듈 부재로 실패하는지 확인한다**

Run: `npx jest __tests__/ai-rate-limit-adapter.test.ts --runInBand`

Expected: module not found로 FAIL.

- [ ] **Step 3: 네 RPC만 감싸는 작은 adapter를 구현한다**

공개 타입은 아래로 고정한다.

```ts
export type LockResult = { acquired: true } | { acquired: false; retryAfterSeconds: number };
export type QuotaResult =
  | { allowed: true }
  | { allowed: false; limitType: 'burst'; retryAfterSeconds: number }
  | { allowed: false; limitType: 'daily'; resetsAt: string };
```

각 함수는 action을 외부 인자로 받지 않고 항상 `course_generate`를 RPC에 전달한다. data가 없거나 예상 필드 타입이 다르면 throw해 제한 장치 장애가 AI 비용 허용으로 바뀌지 않게 fail closed 한다.

- [ ] **Step 4: adapter 테스트를 통과시킨다**

Run: `npx jest __tests__/ai-rate-limit-adapter.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 5: 변경을 커밋한다**

```bash
git add supabase/functions/_shared/ai-rate-limit.ts __tests__/ai-rate-limit-adapter.test.ts
git commit -m "feat: add AI rate-limit Edge adapter"
```

### Task 4: recommend-date lock 수명과 Claude 직전 quota 소비

**Files:**
- Modify: `supabase/functions/_shared/recommend-date-handler.ts`
- Modify: `supabase/functions/recommend-date/index.ts`
- Create: `__tests__/recommend-date-rate-limit.test.ts`
- Modify: `shared/recommendation/contracts.ts`

**Interfaces:**
- Consumes: Task 3의 `LockResult`, `QuotaResult`와 adapter 함수
- Produces: 409/429 추천 오류 envelope 및 성공·실패 전 경로 lock release

- [ ] **Step 1: handler 생명주기 테스트 fixture를 작성한다**

기존 handler fixture를 재사용해 아래 네 경우를 만든다.

```ts
it('Kakao 실패는 quota를 소비하지 않고 lock을 해제한다', async () => {
  const consumeCourseQuota = jest.fn();
  const releaseGenerationLock = jest.fn();
  const result = await handleRecommendDate(validInput, deps({
    acquireGenerationLock: jest.fn(async () => ({ acquired: true })),
    releaseGenerationLock,
    consumeCourseQuota,
    searchCandidates: jest.fn(async () => { throw new Error('kakao down'); }),
  }));
  expect(result.status).toBe(504);
  expect(consumeCourseQuota).not.toHaveBeenCalled();
  expect(releaseGenerationLock).toHaveBeenCalledWith(expect.objectContaining({ requestId: validRequest.requestId }));
});

it('Claude selection 직전에 quota를 정확히 한 번 소비한다', async () => {
  const order: string[] = [];
  const result = await handleRecommendDate(validInput, deps({
    consumeCourseQuota: jest.fn(async () => { order.push('quota'); return { allowed: true }; }),
    generateSelection: jest.fn(async () => { order.push('claude'); return validSelection; }),
  }));
  expect(result.status).toBe(200);
  expect(order).toEqual(['quota', 'claude']);
});

it('burst 거절은 429와 retryAfterSeconds를 반환하고 Claude를 호출하지 않는다', async () => {
  const generateSelection = jest.fn();
  const result = await handleRecommendDate(validInput, deps({
    consumeCourseQuota: jest.fn(async () => ({ allowed: false, limitType: 'burst', retryAfterSeconds: 91 })),
    generateSelection,
  }));
  expect(result).toMatchObject({ status: 429, body: { error: { code: 'AI_RATE_LIMITED', limitType: 'burst', retryAfterSeconds: 91 } } });
  expect(generateSelection).not.toHaveBeenCalled();
});

it('전량 지정 결정론 경로는 quota를 소비하지 않는다', async () => {
  const consumeCourseQuota = jest.fn();
  const result = await handleRecommendDate(allPinnedInput, deps({ consumeCourseQuota }));
  expect(result.status).toBe(200);
  expect(consumeCourseQuota).not.toHaveBeenCalled();
});
```

lock 충돌 409와 daily 거절 429도 같은 파일에서 exact payload를 검증한다. quota RPC 자체가 throw하면 503 `AI_LIMIT_UNAVAILABLE`로 fail closed하고 Claude를 호출하지 않는 테스트를 추가한다.

- [ ] **Step 2: 새 테스트가 dependency와 오류 코드 부재로 실패하는지 확인한다**

Run: `npx jest __tests__/recommend-date-rate-limit.test.ts --runInBand`

Expected: 새 dependency 타입과 오류 코드가 없어 FAIL.

- [ ] **Step 3: 추천 오류 계약에 네 코드를 추가한다**

`shared/recommendation/contracts.ts`의 `RecommendationErrorCode` 및 메시지 맵에 아래 코드를 추가한다.

```ts
'AI_REQUEST_ALREADY_RUNNING'
'AI_RATE_LIMITED'
'AI_DAILY_LIMIT_REACHED'
'AI_LIMIT_UNAVAILABLE'
```

- [ ] **Step 4: handler dependency와 lock 범위를 구현한다**

`RecommendDateDependencies`에 아래 함수를 추가한다.

```ts
acquireGenerationLock: (input: { userId: string; requestId: string }) => Promise<LockResult>;
releaseGenerationLock: (input: { userId: string; requestId: string }) => Promise<void>;
consumeCourseQuota: (input: { userId: string }) => Promise<QuotaResult>;
recordRateLimitEvent?: (input: { userId: string; eventType: 'lock_conflict' | 'burst_rejected' | 'daily_rejected' }) => Promise<void>;
```

인증과 `recommendationRequestSchema` 검증 뒤 lock을 획득한다. lock 성공 이후 기존 본문을 private helper로 옮기고 `try { return await ... } finally { await release... }`로 감싼다. release 실패는 구조화 로그를 남기되 원래 응답을 바꾸지 않는다. lock/quota RPC 장애는 AI 호출 없이 503으로 끝낸다.

`dependencies.generateSelection` 직전 quota 결과를 처리한다. pinned/replacement 경로가 이미 `built`를 만들면 이 블록에 들어오지 않으므로 미차감이다. 제한 이벤트 기록 실패는 응답을 바꾸지 않는다.

- [ ] **Step 5: recommend-date index에 service-role adapter를 연결한다**

요청당 service client를 하나 만들고 Task 3의 네 adapter를 dependency에 제공한다. `requestId`는 검증된 body 값만 handler가 전달하며 클라이언트의 user ID를 신뢰하지 않는다.

- [ ] **Step 6: 대상 handler 테스트를 통과시킨다**

Run: `npx jest __tests__/recommend-date-rate-limit.test.ts __tests__/recommend-date-phase7-handler.test.ts __tests__/recommend-date-server.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 7: 변경을 커밋한다**

```bash
git add supabase/functions/_shared/recommend-date-handler.ts supabase/functions/recommend-date/index.ts shared/recommendation/contracts.ts __tests__/recommend-date-rate-limit.test.ts
git commit -m "feat: enforce course generation limits"
```

### Task 5: generate-ai 내부 action 전용화와 프롬프트 상한

**Files:**
- Modify: `supabase/functions/generate-ai/index.ts`
- Modify: `supabase/functions/_shared/recommend-date-downstream.ts`
- Modify: `supabase/functions/recommend-date/index.ts`
- Modify: `__tests__/recommend-date-downstream.test.ts`
- Modify: `__tests__/generate-ai-recommend-date-selection.test.ts`
- Modify: `__tests__/generate-ai-replacement-selection.test.ts`
- Modify: `__tests__/place-price-prompt.test.ts`

**Interfaces:**
- Consumes: Edge secret `INTERNAL_AI_TOKEN`
- Produces: 내부 헤더가 있는 두 action만 실행하는 `generate-ai`

- [ ] **Step 1: downstream 헤더 전달 테스트를 추가한다**

`GenerateAiSelectionInput` fixture에 `internalAiToken: 'internal-secret'`을 추가하고 아래를 검증한다.

```ts
expect((fetchImpl as jest.Mock).mock.calls[0][1].headers).toMatchObject({
  'X-Internal-AI-Token': 'internal-secret',
});
```

caller-provided `replacement_select` 테스트는 삭제하고 `estimate_place_price` 전달 테스트로 교체한다.

- [ ] **Step 2: generate-ai 소스 계약 테스트를 변경한다**

```ts
expect(source).toContain("const INTERNAL_ACTIONS = new Set(['recommend_date_select', 'estimate_place_price'])");
expect(source).toContain("req.headers.get('X-Internal-AI-Token')");
expect(source).toContain('AI_ACTION_FORBIDDEN');
for (const removed of ['soft_message:', 'cards:', 'feeling_select:', 'course_select:', 'replacement_select:', 'parse_step_intents:']) {
  expect(source).not.toContain(removed);
}
expect(source).toContain("recommend_date_select: 20_000");
expect(source).toContain("estimate_place_price: 1_000");
expect(source).toContain('AI_PROMPT_TOO_LARGE');
```

- [ ] **Step 3: 변경한 테스트가 현재 구현에서 실패하는지 확인한다**

Run: `npx jest __tests__/recommend-date-downstream.test.ts __tests__/generate-ai-recommend-date-selection.test.ts __tests__/generate-ai-replacement-selection.test.ts __tests__/place-price-prompt.test.ts --runInBand`

Expected: 내부 헤더·상한이 없고 제거 action이 남아 있어 FAIL.

- [ ] **Step 4: downstream 입력에 내부 token을 필수화한다**

`GenerateAiSelectionInput`에 `internalAiToken: string`을 추가하고 fetch header에 `X-Internal-AI-Token`을 넣는다. `recommend-date/index.ts`의 selection과 가격 추정 두 호출 모두 `Deno.env.get('INTERNAL_AI_TOKEN')!`을 전달한다.

- [ ] **Step 5: generate-ai action과 비밀 헤더를 강화한다**

`ACTION_CONFIG`에는 `recommend_date_select`, `estimate_place_price`만 남긴다. 요청 action이 목록에 없으면 403을 반환한다. 환경 secret이 없으면 500을 반환하고, 제공 token과 secret이 일치하지 않으면 403을 반환한다.

문자열 비교는 길이를 포함한 constant-time loop helper를 사용한다.

```ts
function constantTimeEqual(left: string, right: string): boolean {
  const max = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let i = 0; i < max; i += 1) {
    diff |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }
  return diff === 0;
}
```

action별 `MAX_PROMPT_CHARS`를 적용하고 초과 시 413을 반환한다. action 검사 → token 검사 → prompt 타입/길이 검사 → Anthropic 호출 순서를 유지한다.

- [ ] **Step 6: 내부 action 대상 테스트를 통과시킨다**

Run: `npx jest __tests__/recommend-date-downstream.test.ts __tests__/generate-ai-recommend-date-selection.test.ts __tests__/generate-ai-replacement-selection.test.ts __tests__/place-price-prompt.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 7: 변경을 커밋한다**

```bash
git add supabase/functions/generate-ai/index.ts supabase/functions/_shared/recommend-date-downstream.ts supabase/functions/recommend-date/index.ts __tests__/recommend-date-downstream.test.ts __tests__/generate-ai-recommend-date-selection.test.ts __tests__/generate-ai-replacement-selection.test.ts __tests__/place-price-prompt.test.ts
git commit -m "security: restrict generate-ai to internal actions"
```

### Task 6: 장소 가격 추정 원자적 claim

**Files:**
- Create: `supabase/migrations/20260729130000_place_price_estimation_claim.sql`
- Modify: `docs/supabase-schema.sql`
- Modify: `supabase/functions/_shared/place-ledger.ts`
- Create: `__tests__/placePriceClaimMigration.test.ts`
- Modify: `__tests__/place-price.test.ts`

**Interfaces:**
- Consumes: `places.kakao_place_id`, claim UUID, 2분 stale 기준
- Produces: `claim_place_price_estimation`, `complete_place_price_estimation`, `release_place_price_estimation_claim`

- [ ] **Step 1: claim migration 계약 테스트를 작성한다**

```ts
expect(sql).toContain('price_estimation_status');
expect(sql).toContain('price_estimation_claim_id');
expect(sql).toContain('price_estimation_claimed_at');
expect(sql).toContain("interval '2 minutes'");
expect(sql).toContain('create or replace function public.claim_place_price_estimation');
expect(sql).toContain('create or replace function public.complete_place_price_estimation');
expect(sql).toContain('create or replace function public.release_place_price_estimation_claim');
expect(sql).toContain('revoke all on function public.claim_place_price_estimation');
```

- [ ] **Step 2: place ledger 병렬 claim 동작 테스트를 작성한다**

```ts
it('claim에 성공한 장소만 estimate한다', async () => {
  const claim = jest.fn(async () => new Set(['place-1']));
  const estimate = jest.fn(async () => ({ minKRW: 5000, maxKRW: 9000 }));
  await recordPlaceKnowledge({ client, places: [place1, place2], model: 'model', claim, estimate });
  expect(estimate).toHaveBeenCalledTimes(1);
  expect(estimate).toHaveBeenCalledWith(place1);
});

it('추정 실패 시 본인 claim을 release한다', async () => {
  const release = jest.fn(async () => undefined);
  await recordPlaceKnowledge({ client, places: [place1], model: 'model', claim, release, estimate: jest.fn(async () => null) });
  expect(release).toHaveBeenCalledWith(expect.objectContaining({ kakaoPlaceId: 'place-1' }));
});
```

- [ ] **Step 3: 새 테스트가 현재 구현에서 실패하는지 확인한다**

Run: `npx jest __tests__/placePriceClaimMigration.test.ts __tests__/place-price.test.ts --runInBand`

Expected: claim RPC와 dependency가 없어 FAIL.

- [ ] **Step 4: claim migration과 canonical schema를 작성한다**

`places`에 nullable claim ID/time과 status check를 추가한다. claim RPC는 `estimated_at is null`이고 status가 pending이거나 `claimed_at <= now() - interval '2 minutes'`인 행만 단일 `UPDATE ... RETURNING`으로 획득한다. complete/release RPC는 `kakao_place_id`와 `claim_id`가 모두 일치할 때만 상태를 바꾼다. 세 RPC는 service role 전용으로 revoke한다.

- [ ] **Step 5: place ledger를 claim 기반으로 변경한다**

기존 `estimated_at is null` 조회 후 호출하는 check-then-act 코드를 제거한다. upsert 후 요청별 `crypto.randomUUID()` claim ID를 만들고 claim된 장소만 순차 추정한다. 성공은 complete RPC, null/throw는 release RPC로 마감한다. RPC 오류는 구조화 로그를 남기고 원래 추천 응답에는 영향을 주지 않는다.

- [ ] **Step 6: claim 테스트를 통과시킨다**

Run: `npx jest __tests__/placePriceClaimMigration.test.ts __tests__/place-price.test.ts __tests__/place-price-prompt.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 7: 변경을 커밋한다**

```bash
git add supabase/migrations/20260729130000_place_price_estimation_claim.sql docs/supabase-schema.sql supabase/functions/_shared/place-ledger.ts __tests__/placePriceClaimMigration.test.ts __tests__/place-price.test.ts
git commit -m "feat: claim place price estimations atomically"
```

### Task 7: 앱 오류 파싱과 제한 안내 UI

**Files:**
- Modify: `lib/recommend-date.ts`
- Modify: `app/mode-flow/generating.tsx`
- Modify: `locales/ko/course.json`
- Modify: `locales/en/course.json`
- Modify: `__tests__/recommend-date-client.test.ts`
- Create: `__tests__/recommend-date-rate-limit-ui.test.tsx`

**Interfaces:**
- Consumes: 409/429 error envelope의 `retryAfterSeconds`, `resetsAt`, `limitType`
- Produces: 제한 메타데이터를 보존하는 `RecommendationRequestError`와 오류별 사용자 안내

- [ ] **Step 1: 클라이언트 오류 metadata 파싱 테스트를 작성한다**

```ts
expect(error).toMatchObject({
  code: 'AI_RATE_LIMITED',
  retryAfterSeconds: 91,
  limitType: 'burst',
});
```

409와 daily payload도 각각 `retryAfterSeconds`, `resetsAt` 보존을 검증한다. 알 수 없는 code는 기존처럼 `NETWORK_ERROR`로 정규화한다.

- [ ] **Step 2: 생성 화면 UI 분기 테스트를 작성한다**

```ts
it.each([
  ['AI_REQUEST_ALREADY_RUNNING', 'course.rateLimit.alreadyRunningTitle'],
  ['AI_RATE_LIMITED', 'course.rateLimit.burstTitle'],
  ['AI_DAILY_LIMIT_REACHED', 'course.rateLimit.dailyTitle'],
])('%s를 일반 실패와 다른 안내로 보여준다', async (code, titleKey) => {
  requestRecommendationResponseMock.mockRejectedValue(new RecommendationRequestError(code as never, { retryAfterSeconds: 90 }));
  render(<GeneratingScreen />);
  await waitFor(() => expect(i18nTMock).toHaveBeenCalledWith(titleKey, expect.anything()));
});
```

- [ ] **Step 3: 대상 테스트가 현재 파서/UI에서 실패하는지 확인한다**

Run: `npx jest __tests__/recommend-date-client.test.ts __tests__/recommend-date-rate-limit-ui.test.tsx --runInBand`

Expected: 새 code와 metadata를 보존하지 않아 FAIL.

- [ ] **Step 4: `RecommendationRequestError`를 확장한다**

constructor의 세 번째 이후 positional 인자를 늘리지 않고 options object를 도입한다.

```ts
type RecommendationErrorDetails = {
  failureStage?: CourseFailureStage;
  unsatisfiedIntents?: UnsatisfiedStepIntent[];
  retryAfterSeconds?: number;
  limitType?: 'burst' | 'daily';
  resetsAt?: string;
};
```

`toRecommendationRequestError`가 유한 양의 retry 초와 유효 ISO reset 시각만 보존하게 한다. 기존 호출부 테스트 fixture를 options object 형태로 함께 갱신한다.

- [ ] **Step 5: 생성 화면에 오류별 안내를 구현한다**

동시 실행은 “코스를 만들고 있어요”, burst는 올림한 분/초 남은 시간, daily는 “자정 이후 다시 이용해 주세요”를 보여 준다. 429 안내 후 자동 재호출은 하지 않는다. 기존 생성 중 상태가 버튼 이중 탭을 계속 막는다.

- [ ] **Step 6: 한·영 카피를 함께 추가한다**

`course.rateLimit` 아래 `alreadyRunningTitle/body`, `burstTitle/body`, `dailyTitle/body`, `confirm`을 ko/en 양쪽에 추가한다. burst body는 `minutes`, `seconds` interpolation을 사용한다.

- [ ] **Step 7: 클라이언트와 UI 테스트를 통과시킨다**

Run: `npx jest __tests__/recommend-date-client.test.ts __tests__/recommend-date-rate-limit-ui.test.tsx --runInBand`

Expected: PASS.

- [ ] **Step 8: 변경을 커밋한다**

```bash
git add lib/recommend-date.ts app/mode-flow/generating.tsx locales/ko/course.json locales/en/course.json __tests__/recommend-date-client.test.ts __tests__/recommend-date-rate-limit-ui.test.tsx
git commit -m "feat: explain AI generation limits"
```

### Task 8: 통합 검증·배포 순서·운영 확인

**Files:**
- Modify: `docs/superpowers/specs/2026-07-29-ai-rate-limits-design.md` only if implementation reveals a contract correction
- Modify: `RESULT.md` for deployment result and durable follow-up metrics

**Interfaces:**
- Consumes: Tasks 1–7의 migration, Edge functions, app error UI
- Produces: 검증된 release candidate와 재현 가능한 배포 기록

- [ ] **Step 1: 전체 대상 테스트를 실행한다**

Run:

```bash
npx jest __tests__/aiRateLimitMigration.test.ts __tests__/ai-rate-limit-adapter.test.ts __tests__/recommend-date-rate-limit.test.ts __tests__/recommend-date-downstream.test.ts __tests__/generate-ai-recommend-date-selection.test.ts __tests__/generate-ai-replacement-selection.test.ts __tests__/placePriceClaimMigration.test.ts __tests__/place-price.test.ts __tests__/place-price-prompt.test.ts __tests__/recommend-date-client.test.ts __tests__/recommend-date-rate-limit-ui.test.tsx __tests__/mvp-mode-visibility.test.ts --runInBand
```

Expected: 모든 suite PASS.

- [ ] **Step 2: 전체 타입 검사를 실행한다**

Run: `npm run validate`

Expected: TypeScript error 0.

- [ ] **Step 3: 전체 Jest 회귀를 실행한다**

Run: `npm test -- --runInBand`

Expected: 모든 suite PASS. `.worktrees/`와 `.claude/worktrees/` 중복 탐색 경고 없음.

- [ ] **Step 4: migration을 먼저 배포하고 권한을 검증한다**

`20260729120000_ai_rate_limits.sql`과 `20260729130000_place_price_estimation_claim.sql`을 순서대로 적용한다. authenticated JWT로 네 quota/lock RPC와 세 price claim RPC 직접 호출이 permission denied인지 확인한다. service role로는 정상 호출되는지 확인한다.

- [ ] **Step 5: Edge secret과 함수를 배포한다**

충분히 긴 무작위 `INTERNAL_AI_TOKEN`을 Supabase Edge secret으로 설정한 뒤 `generate-ai`, `recommend-date` 순서로 CLI 배포한다. `generate-ai` 직접 호출에서 내부 token 없는 `recommend_date_select`가 403인지 확인하고, 앱의 정상 `recommend-date`는 200인지 확인한다.

- [ ] **Step 6: 제한과 차감 시점을 staging 계정으로 검증한다**

동일 사용자 병렬 코스 생성 두 건에서 하나가 409인지 확인한다. Kakao 검색 실패를 유도한 요청이 bucket count를 늘리지 않는지 확인한다. 성공 가능한 요청을 4회 실행해 4번째 Claude selection이 429 burst인지 확인한다. daily count 20 상태에서 다음 요청이 `AI_DAILY_LIMIT_REACHED`와 다음 Seoul 자정을 반환하는지 확인한다.

- [ ] **Step 7: 가격 claim과 공유 화면을 직접 검증한다**

같은 신규 장소를 포함한 요청 두 건에서 `estimate_place_price` AI log가 장소당 1건만 생기는지 확인한다. 공유 화면에 문구 추천 버튼이 없고 기본 문구 편집·전송·상대방 표시가 유지되는지 확인한다.

- [ ] **Step 8: 배포 결과와 운영 기준을 기록한다**

`RESULT.md`에 migration/Edge 배포 버전, 실행한 검증 명령, 409/429 수동 검증 결과를 남긴다. 출시 후 확인 지표는 `course_generate` 사용자당 일평균, burst/daily rejection 비율, lock conflict 횟수, Anthropic 429 횟수다.

- [ ] **Step 9: 최종 변경을 커밋한다**

```bash
git add RESULT.md docs/superpowers/specs/2026-07-29-ai-rate-limits-design.md
git commit -m "docs: record AI rate-limit verification"
```
