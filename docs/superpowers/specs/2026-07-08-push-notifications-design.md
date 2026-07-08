# 실제 푸시 알림 발송 — 설계

## 배경

`notifications` 테이블([supabase/migrations_backup_20260610/20260528000001_notifications.sql](../../../supabase/migrations_backup_20260610/20260528000001_notifications.sql))은 이미 `reaction`/`new_card`/`soft_message` 3종 이벤트를 SECURITY DEFINER 트리거로 자동 적재하고 있고([supabase/migrations/20260610063828_remote_schema.sql:80-146](../../../supabase/migrations/20260610063828_remote_schema.sql#L80-L146), [supabase/migrations/20260703120000_notify_on_soft_message.sql](../../../supabase/migrations/20260703120000_notify_on_soft_message.sql)), 앱 내 알림함([app/account/notifications.tsx](../../../app/account/notifications.tsx))에서 조회된다. 다만 실물 기기 알림(iOS 배너/사운드)은 아직 없다 — `settings.tsx`의 알림 메뉴는 권한 요청까지만 구현돼 있고([app/settings.tsx:176-198](../../../app/settings.tsx#L176-L198)) 토큰 발급/발송 로직은 없다.

프로젝트가 Expo Go에서 커스텀 dev client(Xcode 빌드)로 전환되면서 실제 푸시 토큰 발급이 가능해졌다. 이번 설계는 "알림 row 생성 → 실물 기기에 푸시 도착"까지 연결한다.

## 목표

- `notifications` insert 3종(reaction/new_card/soft_message) 모두 실제 푸시로 발송한다.
- 푸시 탭 시 타입별로 적절한 화면으로 딥링크한다.
- iOS만 대상으로 한다 (Android는 별도 FCM 설정이 필요해 이번 범위에서 제외).

## 비목표

- Android 푸시 (FCM 키 설정 별도 작업으로 분리).
- 유저당 다중 기기 지원 (토큰 1개만 저장, 마지막 로그인 기기만 수신).
- 유저별 언어(locale) 분기 — 현재 유저 테이블에 locale 컬럼이 없어 푸시 문구는 한국어 고정.

## 아키텍처

DB 트리거 → `pg_net` → edge function → Expo Push API. 기존 `notify_on_card`/`notify_on_reaction` 패턴과 동일 선상에서, "알림 row가 생기면 무언가 실행된다"는 규칙에 발송을 얹는 방식이다.

폴링(배터리 낭비, 앱 종료 시 무용) / 클라이언트 Realtime 구독(포그라운드에서만 동작)은 기각 — 둘 다 앱이 꺼진 상태를 커버하지 못한다.

## 데이터 모델

```sql
create table public.push_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  expo_push_token text not null,
  platform text not null default 'ios',
  updated_at timestamptz not null default now()
);

alter table public.push_tokens enable row level security;

create policy "push_tokens_upsert_self" on public.push_tokens
  for insert with check (user_id = auth.uid());
create policy "push_tokens_update_self" on public.push_tokens
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "push_tokens_select_self" on public.push_tokens
  for select using (user_id = auth.uid());
```

`user_id`를 PK로 둬서 upsert 시 기존 토큰을 자연히 덮어쓴다(다중 기기 미지원 — 알려진 한계).

`pg_net` extension은 현재 비활성 상태([supabase/migrations/20260610063828_remote_schema.sql:1620](../../../supabase/migrations/20260610063828_remote_schema.sql#L1620)에 `drop extension if exists "pg_net"` 있음) — 신규 마이그레이션에서 `create extension if not exists pg_net;`로 활성화한다.

## DB 트리거

```sql
create or replace function public.trigger_send_push() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'internal_push_secret';

  perform net.http_post(
    url := 'https://wqjguifsmtblgrhdfnji.supabase.co/functions/v1/send-push',
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

create trigger trg_send_push
  after insert on public.notifications
  for each row execute function public.trigger_send_push();
```

시크릿 값은 마이그레이션에 평문으로 넣지 않는다. [Supabase Vault](https://supabase.com/docs/guides/database/vault)에 `internal_push_secret`으로 저장하고, 트리거 함수 안에서 `select decrypted_secret from vault.decrypted_secrets where name = 'internal_push_secret'`로 읽어 헤더에 넣는다. edge function 쪽은 동일 값을 Supabase 프로젝트 환경변수(`INTERNAL_PUSH_SECRET`)로 등록해 헤더값과 대조한다.

## Edge function `send-push`

- `verify_jwt=false` (DB 트리거가 유저 JWT 없이 호출하므로) + `X-Internal-Secret` 헤더를 환경변수와 대조해 내부 호출만 허용.
- `push_tokens`에서 `user_id`로 토큰 조회 → 없으면 조용히 종료(에러 아님, 알림 미설정 유저는 흔한 케이스).
- `type`별 템플릿(한국어 고정):
  - `new_card`: 제목 "새 데이트 카드가 도착했어요", 본문 `payload.card_title`
  - `reaction`: 제목 "상대방이 반응을 남겼어요", 본문 reaction label + card_title
  - `soft_message`: 제목 "마음이 도착했어요", 본문은 미리보기(너무 길면 자르기)
- `https://exp.host/--/api/v2/push/send`에 POST, `data: { type, card_id }` 포함(soft_message는 `card_id` 없음).

## 클라이언트 `lib/push.ts`

```ts
export async function registerPushToken() {
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await supabase.from('push_tokens').upsert({ user_id: user.id, expo_push_token: token, platform: 'ios' });
}
```

- `app/_layout.tsx`의 `SIGNED_IN`/`TOKEN_REFRESHED` 분기([app/_layout.tsx:91](../../../app/_layout.tsx#L91))에서 호출.
- 권한이 이미 거부 상태면 조용히 스킵 — 별도 유도는 기존 `settings.tsx` 알림 메뉴가 담당, 이번 범위 아님.
- `Notifications.addNotificationResponseReceivedListener`를 `app/_layout.tsx`에 등록해 탭 이벤트 처리:
  - `data.type`이 `new_card` 또는 `reaction` → `router.push('/card/[id]', { id: data.card_id })`
  - `data.type`이 `soft_message` → `router.push('/account/notifications')`

## 에러 처리

- 토큰 발급 실패(권한 없음/네트워크 오류): 조용히 무시, 다음 앱 실행 시 재시도.
- `send-push`에서 Expo API가 `DeviceNotRegistered` 에러 반환 → 해당 `push_tokens` row 삭제(토큰 만료 정리). 다른 에러는 로그만 남기고 무시(알림 발송 실패가 앱 핵심 흐름을 막으면 안 됨).
- `pg_net.http_post`는 비동기(fire-and-forget)라 트리거 자체가 실패해 insert가 롤백되는 일은 없음.

## 테스트 범위

- `lib/push.ts`의 토큰 upsert 로직, 탭 이벤트 → 라우팅 매핑: TDD 유닛 테스트 (Supabase/Notifications 모듈 모킹).
- edge function `send-push`: 이 프로젝트에는 Deno 함수용 테스트 하네스가 없음(`place-search`와 동일 관례) — 신규 인프라 만들지 않고 코드 리뷰로 검증.
- 실제 도착 확인: 시뮬레이터 불가(APNs 미지원) — 실물 아이폰에 dev client 재빌드(`eas.json` development 프로필 `simulator: true` → `false`) 후 수동 확인.

## 범위 밖 후속 작업

- Android 푸시 (FCM 키 발급 + `eas.json`/`app.json` 설정).
- 유저 locale 컬럼 추가 후 푸시 문구 다국어화.
- 다중 기기 토큰 지원 (현재 유저당 1개 제한).
