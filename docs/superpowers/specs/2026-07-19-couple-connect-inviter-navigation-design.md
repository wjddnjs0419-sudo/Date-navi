# 커플 연결 — 초대자 자동 이동 설계

> 2026-07-19 · 대상 화면: `app/onboarding/couple-connect.tsx`

## 배경 / 문제

커플 연결은 한 명(초대자)이 코드를 생성하고 다른 한 명(피초대자)이 코드를 입력해 연결하는 방식이다.

- **피초대자**: 코드 입력 → `joinWithCode()` → `router.replace('/onboarding/connected')` → `preferences`. 정상 동작.
- **초대자**: 코드 생성 후 `waiting` 상태로 화면에 머문다. 파트너가 연결을 완료(`status: 'linked'`)해도 이를 감지할 실시간 로직이 없어 화면이 갱신되지 않는다. 화면은 `useFocusEffect`(포커스 시)에서만 재조회된다.

### 확인된 버그 3가지

1. **연결 감지 부재**: 초대자 화면이 떠 있는 동안 파트너가 연결해도 자동으로 다음 단계로 넘어가지 않는다. Realtime/polling/pull-to-refresh 전무.
2. **연결 후 뒤로가기 누수**: `linked`가 되면 화면이 "관리" UI로 바뀌고 back-block 가드(`status === 'linked' ? undefined : ...`, `couple-connect.tsx:390`)가 해제된다. 이 상태에서 스와이프/뒤로가기를 하면 온보딩 스택(`nickname→photo→anniversary→type→couple-connect`, 모두 `push`) 바로 아래의 `type.tsx`로 샌다.
3. **waiting 중 스와이프 누수**: back-block은 커스텀 버튼 `onPress`에만 걸려 있고, iOS 엣지 스와이프/Android 하드웨어 백은 이를 우회해 네이티브 pop을 그대로 실행한다. `gestureEnabled`/`BackHandler` 설정 없음.

## 목표

초대자도 피초대자와 대칭으로: **파트너 연결이 완료되면** 자동으로 `connected` → `preferences`로 진행한다. 연결 전에는 지금처럼 대기하며, 실수로 온보딩 스택을 벗어나지 않는다.

**중요 게이팅**: `couple-connect` 라우트는 온보딩(`type.tsx`)과 설정(`settings.tsx:319`) 두 곳에서 재사용된다. 설정에서 진입하는 유저는 이미 온보딩을 마친 상태이므로, 아래 모든 동작은 **`onboarding_completed = false`(온보딩 중)일 때만** 작동해야 한다. 그렇지 않으면 설정에서 재연결하러 들어온 유저가 뒤로가기 못 하고 갇히거나, 관리 화면에서 엉뚱하게 튕겨나간다.

- `onboarding_completed`는 `user_preferences.onboarding_completed`에 저장됨 (`_layout.tsx:53-57` 참고).

## 설계

### 순수 결정 함수 (TDD 단위 테스트 대상)

`lib/couple-invite.ts`에 순수 함수 2개를 추가한다. 기존 `isCoupleRowLinked`(테스트 있음: `__tests__/coupleLink.test.ts`)와 같은 패턴.

```ts
// 연결 완료 감지 시 이동할 목적지. 온보딩 중 + linked일 때만 이동.
export function resolveCoupleConnectDestination(input: {
  status: 'none' | 'waiting' | 'linked';
  partnerUserId: string | null;
  onboardingCompleted: boolean;
}): 'connected' | null;
//  linked && partnerUserId && !onboardingCompleted → 'connected'
//  그 외 → null

// 온보딩 중 아직 미연결이면 화면 이탈(스와이프/하드웨어 백/버튼)을 막는다.
export function shouldBlockLeaving(input: {
  status: 'none' | 'waiting' | 'linked';
  onboardingCompleted: boolean;
}): boolean;
//  !onboardingCompleted && status !== 'linked' → true
//  그 외 → false
```

### ① 실시간 자동 이동 (핵심)

`couple-connect.tsx`:

- `loadConnection()`이 `user_preferences.onboarding_completed`도 함께 조회해 `onboardingCompleted` state에 저장.
- `loadConnection()` 말미에서 `resolveCoupleConnectDestination(...)`이 `'connected'`를 반환하면 `router.replace('/onboarding/connected')`. (focus/최초 로드 경로에서 이미 linked인 경우도 커버)
- **Supabase Realtime 구독** 추가: 자신의 커플 row(`date_planner_couples`, `id = couple_id`)의 `UPDATE`를 구독. `couple_id`가 확정된 뒤(코드 생성 후) 구독을 건다. UPDATE payload에서 `status`/`partner_user_id`를 읽어 `resolveCoupleConnectDestination(...)`로 판단, `'connected'`면 `router.replace('/onboarding/connected')`.
- 화면 언마운트/`couple_id` 변경 시 채널 정리(`supabase.removeChannel`).

이동 경로는 피초대자와 동일(`connected` → 버튼 → `preferences`). 초대자에게는 파트너 이름/기념일이 `connected` 화면 뒤에 이미 채워져 있으므로 자연스럽다.

### ② 포그라운드 재진입 보강

`AppState` 리스너(`change` → `'active'`)를 `couple-connect.tsx`에 추가. 백그라운드에서 포그라운드로 복귀하는 순간 `loadConnection()`을 재실행한다. 다른 앱에 가 있던 동안 Realtime이 놓친 연결 완료를 복귀 시점에 재확인해 ①의 이동 로직으로 넘긴다.

- 콜드 스타트(앱 완전 종료 후 재실행)는 기존 `getDestination()`이 이미 처리하므로 손대지 않음.
- 앱 전체에 `AppState` 사용처가 없음(신규 도입).

### ③ waiting 스와이프/하드웨어 백 차단

`shouldBlockLeaving(...)`가 `true`인 동안(온보딩 중 + 미연결):

- **iOS 엣지 스와이프**: 해당 화면 `gestureEnabled: false`. `useNavigation().setOptions({ gestureEnabled: !blocked })`로 status/onboardingCompleted에 따라 동적 설정.
- **Android 하드웨어 백**: `BackHandler` 리스너로 `true` 반환(기본 pop 차단) + 기존 back-block 모달(`setBackBlockedVisible(true)`) 표시. `blocked`가 false면 리스너 미등록(기본 동작).
- **기존 커스텀 백 버튼**(`BackBar`, line 390): `shouldBlockLeaving` 기준으로 통일. 설정 컨텍스트(온보딩 완료)에서 미연결 상태로 들어온 경우엔 모달 없이 정상 뒤로가기 되도록 정리.

세 경로(스와이프/하드웨어 백/버튼)가 모두 같은 `shouldBlockLeaving` 조건을 따르게 하여 일관성 확보.

## 전제 조건 / 리스크

- **Realtime publication**: `date_planner_couples`가 Supabase Realtime publication(`supabase_realtime`)에 포함되어 있어야 `postgres_changes` 이벤트를 받는다. 미포함이면 마이그레이션 `alter publication supabase_realtime add table date_planner_couples;` 필요. 구현 전 현재 publication 상태를 확인한다. (외부 콘솔/DB 변경이므로 적용 전 사용자에게 리스크 보고 후 진행.)
- **RLS**: 초대자는 `owner_user_id`로서 자신의 커플 row에 select 권한이 있어야 Realtime payload를 수신한다. 기존 정책으로 충분한지 확인.
- Realtime 미동작 시에도 ②(포그라운드 재진입)와 focus 재조회가 fallback으로 작동하므로 완전 실패는 아니나, "화면 떠 있는 동안 즉시 이동"이라는 핵심 UX는 Realtime에 의존한다.

## 범위 밖

- 커플 연결 완료 푸시 알림(`lib/push.ts` 타입 미보유) — 이번 범위 아님.
- `waiting` 중 스와이프를 "확인 후 로그아웃"이 아닌 다른 이탈 옵션으로 바꾸는 것 — 기존 모달 재사용.

## 검증

- 순수 함수 2개: TDD RED→GREEN 단위 테스트(`__tests__`).
- `npm run validate`(tsc).
- 실기기(iPhone Release): 초대자 화면 유지 상태에서 다른 기기로 코드 입력 → 초대자 화면 자동으로 `connected`로 전환되는지. 백그라운드 갔다 복귀 케이스. waiting 중 스와이프가 막히는지. 설정에서 재연결 진입 시 뒤로가기가 정상인지.
