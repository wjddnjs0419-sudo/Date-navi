# 실제 푸시 알림 발송 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `notifications` 테이블에 row가 생기면(reaction/new_card/soft_message) 실제 iOS 푸시 알림이 도착하고, 탭하면 관련 화면으로 이동한다.

**Architecture:** `notifications` AFTER INSERT 트리거 → `pg_net`으로 edge function `send-push` 호출 → Expo Push API로 발송. 클라이언트는 로그인 시 Expo 푸시 토큰을 발급받아 `push_tokens`에 저장하고, 알림 탭 이벤트를 받아 라우팅한다.

**Tech Stack:** Supabase (Postgres trigger, `pg_net`, Vault, Edge Function/Deno), `expo-notifications`, `expo-router`.

**참고 문서:** [docs/superpowers/specs/2026-07-08-push-notifications-design.md](../specs/2026-07-08-push-notifications-design.md)

---

## Task 1: DB — `push_tokens` 테이블 + 발송 트리거

**Files:**
- Create: `supabase/migrations/20260708120000_push_notifications.sql`

이 저장소에는 SQL 마이그레이션용 자동 테스트 하네스가 없다(`place-search`, `notify_on_soft_message` 등 기존 DB 로직도 동일 — 코드 리뷰 + 수동 SQL 확인으로 검증하는 관례). 이 태스크는 TDD RED/GREEN 대신 마이그레이션 적용 후 수동 SELECT로 검증한다.

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- 실제 푸시 알림(APNs) 발송 인프라: push_tokens 테이블 + notifications insert 시 자동 발송 트리거.

create extension if not exists pg_net with schema extensions;

create table if not exists public.push_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  expo_push_token text not null,
  platform text not null default 'ios',
  updated_at timestamptz not null default now()
);

alter table public.push_tokens enable row level security;

drop policy if exists "push_tokens_upsert_self" on public.push_tokens;
create policy "push_tokens_upsert_self" on public.push_tokens
  for insert with check (user_id = auth.uid());

drop policy if exists "push_tokens_update_self" on public.push_tokens;
create policy "push_tokens_update_self" on public.push_tokens
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "push_tokens_select_self" on public.push_tokens;
create policy "push_tokens_select_self" on public.push_tokens
  for select using (user_id = auth.uid());

create or replace function public.trigger_send_push() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
declare
  v_secret text;
  v_function_url text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'internal_push_secret';
  select decrypted_secret into v_function_url
  from vault.decrypted_secrets where name = 'send_push_function_url';

  -- Vault 시크릿이 아직 등록 안 됐으면(로컬 개발 등) 조용히 스킵 — insert 자체를 막지 않는다.
  if v_secret is null or v_function_url is null then
    return NEW;
  end if;

  perform net.http_post(
    url := v_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Internal-Secret', v_secret
    ),
    body := jsonb_build_object(
      'notification_id', NEW.id,
      'user_id', NEW.user_id,
      'type', NEW.type,
      'payload', NEW.payload
    )
  );
  return NEW;
end;
$$;

alter function public.trigger_send_push() owner to postgres;
revoke all on function public.trigger_send_push() from public;
grant all on function public.trigger_send_push() to service_role;

drop trigger if exists trg_send_push on public.notifications;
create trigger trg_send_push
  after insert on public.notifications
  for each row execute function public.trigger_send_push();
```

- [ ] **Step 2: 마이그레이션 적용**

Supabase MCP `apply_migration` 툴 사용 (또는 `supabase db push` CLI). **주의: 원격 프로덕션 DB에 스키마 변경이 반영되는 되돌리기 어려운 작업 — 실행 전 사용자에게 확인받는다.**

- [ ] **Step 3: Vault 시크릿 2개 수동 등록 (SQL 에디터에서 1회)**

```sql
select vault.create_secret('<32자 이상 임의 문자열, 예: openssl rand -hex 32 결과>', 'internal_push_secret');
select vault.create_secret('https://wqjguifsmtblgrhdfnji.supabase.co/functions/v1/send-push', 'send_push_function_url');
```

이 값들은 마이그레이션 파일에 들어가지 않으므로 git에 남지 않는다.

- [ ] **Step 4: 적용 확인**

```sql
select column_name from information_schema.columns where table_name = 'push_tokens';
select tgname from pg_trigger where tgname = 'trg_send_push';
select name from vault.decrypted_secrets where name in ('internal_push_secret', 'send_push_function_url');
```

Expected: `push_tokens` 컬럼 4개(user_id, expo_push_token, platform, updated_at), 트리거 1개, 시크릿 2개 모두 조회됨.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260708120000_push_notifications.sql
git commit -m "feat: add push_tokens table and send-push trigger"
```

---

## Task 2: Edge function `send-push`

**Files:**
- Create: `supabase/functions/send-push/index.ts`

Deno 함수용 자동 테스트 하네스가 이 저장소에 없다(`place-search`와 동일 관례) — 배포 후 curl로 수동 검증한다.

- [ ] **Step 1: 함수 작성**

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

type NotifType = 'reaction' | 'new_card' | 'soft_message';

const REACTION_LABELS: Record<string, string> = {
  love: '완전 끌려',
  like: '느낌은 좋아',
  burden: '오늘은 부담돼',
  next_time: '다음에',
};

function buildMessage(type: NotifType, payload: Record<string, unknown>): { title: string; body: string } {
  if (type === 'new_card') {
    return { title: '새 데이트 추천이 도착했어요', body: String(payload.card_title ?? '') };
  }
  if (type === 'reaction') {
    const label = REACTION_LABELS[String(payload.reaction_type)] ?? '';
    const cardTitle = String(payload.card_title ?? '');
    return { title: '상대가 반응을 남겼어요', body: [label, cardTitle].filter(Boolean).join(' · ') };
  }
  const preview = String(payload.message ?? '').slice(0, 60);
  return { title: '다정한 문장이 도착했어요', body: preview };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const secret = req.headers.get('X-Internal-Secret');
    if (!secret || secret !== Deno.env.get('INTERNAL_PUSH_SECRET')) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const { user_id, type, payload } = await req.json();
    if (!user_id || !type) return json({ error: 'Invalid request' }, 400);

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: tokenRow } = await adminClient
      .from('push_tokens')
      .select('expo_push_token')
      .eq('user_id', user_id)
      .maybeSingle();

    if (!tokenRow?.expo_push_token) return json({ skipped: true });

    const { title, body } = buildMessage(type as NotifType, (payload ?? {}) as Record<string, unknown>);

    const pushRes = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        to: tokenRow.expo_push_token,
        title,
        body,
        data: { type, card_id: (payload as Record<string, unknown> | null)?.card_id },
      }),
    });

    const pushResult = await pushRes.json();
    const ticket = pushResult?.data;
    if (ticket?.details?.error === 'DeviceNotRegistered') {
      await adminClient.from('push_tokens').delete().eq('user_id', user_id);
    }

    return json({ success: true });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
```

- [ ] **Step 2: 배포**

```bash
supabase functions deploy send-push --no-verify-jwt
supabase secrets set INTERNAL_PUSH_SECRET=<Task 1 Step 3에서 등록한 것과 동일한 값>
```

**주의: 원격 프로젝트에 함수를 배포하고 시크릿을 등록하는 작업 — 실행 전 사용자에게 확인받는다.**

- [ ] **Step 3: 수동 curl 검증**

```bash
curl -i -X POST 'https://wqjguifsmtblgrhdfnji.supabase.co/functions/v1/send-push' \
  -H 'Content-Type: application/json' \
  -H 'X-Internal-Secret: <실제 시크릿 값>' \
  -d '{"user_id":"<테스트용 실제 user id>","type":"new_card","payload":{"card_title":"테스트 카드"}}'
```

Expected: `push_tokens`에 해당 유저 토큰이 없으면 `{"skipped":true}`, 있으면 `{"success":true}`. 시크릿이 틀리면 401.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/send-push/index.ts
git commit -m "feat: add send-push edge function"
```

---

## Task 3: `lib/push.ts` — 탭 시 이동 경로 계산 (TDD)

**Files:**
- Create: `lib/push.ts`
- Test: `__tests__/push.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
import { buildPushNavigationTarget } from '../lib/push';

describe('buildPushNavigationTarget', () => {
  it('new_card 타입이고 card_id 있으면 카드 상세로', () => {
    expect(buildPushNavigationTarget('new_card', { card_id: 'abc' })).toBe('/card/abc');
  });

  it('reaction 타입이고 card_id 있으면 카드 상세로', () => {
    expect(buildPushNavigationTarget('reaction', { card_id: 'xyz' })).toBe('/card/xyz');
  });

  it('soft_message 타입이면 알림함으로', () => {
    expect(buildPushNavigationTarget('soft_message', {})).toBe('/account/notifications');
  });

  it('new_card인데 card_id가 없으면 알림함으로 폴백', () => {
    expect(buildPushNavigationTarget('new_card', {})).toBe('/account/notifications');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx jest __tests__/push.test.ts`
Expected: FAIL — `Cannot find module '../lib/push'`

- [ ] **Step 3: 최소 구현 작성**

```ts
export type PushNotificationType = 'reaction' | 'new_card' | 'soft_message';

export function buildPushNavigationTarget(
  type: PushNotificationType,
  payload: { card_id?: string },
): string {
  if ((type === 'new_card' || type === 'reaction') && payload.card_id) {
    return `/card/${payload.card_id}`;
  }
  return '/account/notifications';
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx jest __tests__/push.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/push.ts __tests__/push.test.ts
git commit -m "feat: add push navigation target mapping"
```

---

## Task 4: `lib/push.ts` — 토큰 등록 (side-effect, 테스트 없음)

**Files:**
- Modify: `lib/push.ts`

이 저장소 관례상 Supabase/네이티브 API를 직접 호출하는 side-effect 함수는 유닛 테스트 대상이 아니다(`lib/couple-invite.ts`, `lib/kakaoAuth.ts` 등도 순수 함수만 테스트되고 API 호출부는 테스트 없음). Task 3의 `buildPushNavigationTarget`처럼 로직을 분리할 수 없는 순수 등록 로직이라 테스트는 생략하고, 실물 기기 수동 확인(Task 6)으로 검증한다.

- [ ] **Step 1: `registerPushToken` 추가**

`lib/push.ts` 맨 아래에 추가:

```ts
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from './supabase';

export async function registerPushToken(): Promise<void> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

  await supabase.from('push_tokens').upsert({
    user_id: user.id,
    expo_push_token: token,
    platform: 'ios',
  });
}
```

- [ ] **Step 2: 기존 테스트 그대로 통과하는지 확인**

Run: `npx jest __tests__/push.test.ts`
Expected: PASS (4 tests, 변경 없음)

- [ ] **Step 3: 타입 체크**

Run: `npm run validate`
Expected: 에러 없음

- [ ] **Step 4: Commit**

```bash
git add lib/push.ts
git commit -m "feat: add registerPushToken"
```

---

## Task 5: `app/_layout.tsx` 연결

**Files:**
- Modify: `app/_layout.tsx:1-10` (imports), `app/_layout.tsx:89-96` (auth 리스너), `app/_layout.tsx:60-102` (탭 리스너 추가)

레이아웃의 side-effect 배선은 기존에도 테스트가 없다(딥링크 처리 등 다른 `useEffect`들도 동일) — 이 태스크는 테스트 없이 진행하고 Task 6에서 실기기로 확인한다.

- [ ] **Step 1: import 추가**

`app/_layout.tsx` 상단(9번째 줄 `I18nProvider` import 다음)에 추가:

```ts
import * as Notifications from 'expo-notifications';
import { registerPushToken, buildPushNavigationTarget, type PushNotificationType } from '../lib/push';
```

- [ ] **Step 2: SIGNED_IN 분기에서 토큰 등록 호출**

`app/_layout.tsx:91`의 기존 블록:

```ts
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        setTimeout(() => {
          void routeForSession(session);
        }, 0);
      }
```

를 아래로 교체:

```ts
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        setTimeout(() => {
          void routeForSession(session);
        }, 0);
        if (event === 'SIGNED_IN') void registerPushToken();
      }
```

- [ ] **Step 3: 알림 탭 리스너 추가**

`app/_layout.tsx`의 기존 `useEffect` 안, `return () => { subscription.unsubscribe(); urlSubscription.remove(); };` 바로 앞에 추가:

```ts
    const notificationSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { type?: PushNotificationType; card_id?: string };
      if (!data?.type) return;
      const target = buildPushNavigationTarget(data.type, { card_id: data.card_id });
      router.push(target as any);
    });
```

그리고 `return` 블록을 아래로 교체:

```ts
    return () => {
      subscription.unsubscribe();
      urlSubscription.remove();
      notificationSubscription.remove();
    };
```

- [ ] **Step 4: 타입 체크**

Run: `npm run validate`
Expected: 에러 없음

- [ ] **Step 5: 기존 테스트 스위트 전체 통과 확인**

Run: `npm test`
Expected: 모든 테스트 PASS (회귀 없음)

- [ ] **Step 6: Commit**

```bash
git add app/_layout.tsx
git commit -m "feat: register push token and handle notification taps"
```

---

## Task 6: 실기기 수동 검증

**Files:** 없음 (설정 변경 + 수동 확인)

- [ ] **Step 1: `eas.json` development 프로필을 실기기용으로 변경**

`eas.json`의 `build.development.ios`:

```json
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": {
        "resourceClass": "m-medium"
      }
    },
```

(`"simulator": true` 제거 — 시뮬레이터는 APNs를 받을 수 없어서 실기기 빌드가 필요함)

- [ ] **Step 2: 실기기용 dev client 빌드 (사용자 확인 후 실행)**

```bash
eas build --profile development --platform ios
```

**주의: EAS 빌드 크레딧을 소모하는 원격 작업 — 실행 전 사용자에게 확인받는다.**

- [ ] **Step 3: 실기기에 설치 후 확인**

1. 빌드 완료 후 실물 아이폰에 설치.
2. 로그인 → `push_tokens` 테이블에 해당 유저 row가 생겼는지 Supabase 대시보드에서 확인.
3. 상대 계정(또는 두 번째 유저)으로 반응 남기기 / AI 카드 생성 / 마음 전하기 중 하나 실행.
4. 알림을 받을 유저의 기기에 배너가 뜨는지 확인.
5. 배너를 탭해서 `new_card`/`reaction`이면 카드 상세로, `soft_message`면 알림함으로 이동하는지 확인.

- [ ] **Step 4: Commit**

```bash
git add eas.json
git commit -m "chore: build development profile for physical device (push testing)"
```

---

## Self-Review 결과

- **Spec coverage:** 설계 문서의 데이터 모델(Task 1) / edge function(Task 2) / 클라이언트 등록+탭 라우팅(Task 3-5) / iOS 실기기 검증(Task 6) 모두 태스크로 커버됨. 범위 밖 후속 작업(Android, 다국어, 다중 기기)은 계획에 포함하지 않음 — 설계 문서와 동일하게 명시적 제외.
- **Placeholder 스캔:** SQL/TS 코드는 전부 완결된 형태. `<32자 이상 임의 문자열...>` 등은 사용자가 직접 채워야 하는 비밀값이라 의도적으로 플레이스홀더 — 코드가 아니라 사용자 실행 명령의 인자이므로 제외 대상 아님.
- **타입 일관성:** `PushNotificationType`은 Task 3에서 정의, Task 5에서 그대로 import해서 사용. `buildPushNavigationTarget(type, payload)` 시그니처가 Task 3~5에서 동일.
