# 커플 연결 — 초대자 자동 이동 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 초대자(코드 생성자)가 커플 연결 화면에 머무는 동안 파트너가 연결을 완료하면, 피초대자와 대칭으로 자동으로 `connected` → `preferences`로 진행하고, 온보딩 중에는 실수로 스택을 벗어나지 못하게 막는다.

**Architecture:** 결정 로직을 `lib/couple-invite.ts`의 순수 함수 2개(`resolveCoupleConnectDestination`, `shouldBlockLeaving`)로 분리해 TDD로 검증한다. `couple-connect.tsx`는 이 함수들을 사용해 (①) Supabase Realtime 구독 + 최초 로드 시 자동 이동, (②) AppState 포그라운드 재진입 재조회, (③) `gestureEnabled`/`BackHandler`로 waiting 중 이탈 차단을 배선한다. 모든 동작은 `onboarding_completed = false`(온보딩 중)일 때만 작동한다. Realtime 수신을 위해 `date_planner_couples`를 `supabase_realtime` publication에 추가하는 마이그레이션 1줄이 필요하다.

**Tech Stack:** React Native, Expo Router, Supabase (Realtime postgres_changes), Jest/ts-jest, TypeScript.

---

## File Structure

- **Modify: `lib/couple-invite.ts`** — 순수 결정 함수 2개 추가. 기존 `isCoupleRowLinked`와 동일 패턴.
- **Modify: `__tests__/coupleLink.test.ts`** — 두 함수의 단위 테스트 추가.
- **Modify: `app/onboarding/couple-connect.tsx`** — `onboardingCompleted` 조회, 최초 로드 자동 이동, Realtime 구독, AppState 리스너, `gestureEnabled`/`BackHandler` 차단 배선.
- **Migration (Supabase, 적용 직전 재확인):** `alter publication supabase_realtime add table public.date_planner_couples;`

신규 i18n 문구 없음 — 기존 `t.backBlockedTitle`/`t.backBlockedBody` 모달을 재사용한다.

---

## Task 1: 순수 결정 함수 + 테스트

**Files:**
- Modify: `lib/couple-invite.ts` (파일 끝에 함수 2개 추가)
- Test: `__tests__/coupleLink.test.ts` (describe 블록 2개 추가)

- [ ] **Step 1: 실패하는 테스트 작성**

`__tests__/coupleLink.test.ts` 상단 import를 확장하고, 파일 끝에 두 describe를 추가한다.

```ts
import {
  isCoupleRowLinked,
  resolveCoupleConnectDestination,
  shouldBlockLeaving,
} from '../lib/couple-invite';
```

```ts
describe('resolveCoupleConnectDestination', () => {
  it('온보딩 중 + linked + 파트너 있으면 connected로 이동', () => {
    expect(resolveCoupleConnectDestination({
      status: 'linked', partnerUserId: 'partner-1', onboardingCompleted: false,
    })).toBe('connected');
  });

  it('온보딩 완료 유저는 linked여도 이동하지 않음(null)', () => {
    expect(resolveCoupleConnectDestination({
      status: 'linked', partnerUserId: 'partner-1', onboardingCompleted: true,
    })).toBeNull();
  });

  it('linked인데 partnerUserId가 없으면 이동하지 않음(null)', () => {
    expect(resolveCoupleConnectDestination({
      status: 'linked', partnerUserId: null, onboardingCompleted: false,
    })).toBeNull();
  });

  it('waiting 상태면 이동하지 않음(null)', () => {
    expect(resolveCoupleConnectDestination({
      status: 'waiting', partnerUserId: null, onboardingCompleted: false,
    })).toBeNull();
  });

  it('none 상태면 이동하지 않음(null)', () => {
    expect(resolveCoupleConnectDestination({
      status: 'none', partnerUserId: null, onboardingCompleted: false,
    })).toBeNull();
  });
});

describe('shouldBlockLeaving', () => {
  it('온보딩 중 + none이면 차단(true)', () => {
    expect(shouldBlockLeaving({ status: 'none', onboardingCompleted: false })).toBe(true);
  });

  it('온보딩 중 + waiting이면 차단(true)', () => {
    expect(shouldBlockLeaving({ status: 'waiting', onboardingCompleted: false })).toBe(true);
  });

  it('온보딩 중 + linked면 차단하지 않음(false)', () => {
    expect(shouldBlockLeaving({ status: 'linked', onboardingCompleted: false })).toBe(false);
  });

  it('온보딩 완료 유저는 waiting이어도 차단하지 않음(false)', () => {
    expect(shouldBlockLeaving({ status: 'waiting', onboardingCompleted: true })).toBe(false);
  });

  it('온보딩 완료 유저는 none이어도 차단하지 않음(false)', () => {
    expect(shouldBlockLeaving({ status: 'none', onboardingCompleted: true })).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx jest __tests__/coupleLink.test.ts`
Expected: FAIL — `resolveCoupleConnectDestination is not a function` / `shouldBlockLeaving is not a function`

- [ ] **Step 3: 최소 구현 작성**

`lib/couple-invite.ts` 파일 끝에 추가:

```ts
type ConnectionStatus = 'none' | 'waiting' | 'linked';

// 연결 완료 감지 시 이동할 목적지. 온보딩 중 + linked + 파트너 있을 때만 이동.
export function resolveCoupleConnectDestination(input: {
  status: ConnectionStatus;
  partnerUserId: string | null;
  onboardingCompleted: boolean;
}): 'connected' | null {
  if (input.onboardingCompleted) return null;
  if (input.status !== 'linked') return null;
  if (!input.partnerUserId) return null;
  return 'connected';
}

// 온보딩 중 아직 미연결이면 화면 이탈(스와이프/하드웨어 백/버튼)을 막는다.
export function shouldBlockLeaving(input: {
  status: ConnectionStatus;
  onboardingCompleted: boolean;
}): boolean {
  return !input.onboardingCompleted && input.status !== 'linked';
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx jest __tests__/coupleLink.test.ts`
Expected: PASS (전체 describe 3개 통과)

- [ ] **Step 5: 커밋**

```bash
git add lib/couple-invite.ts __tests__/coupleLink.test.ts
git commit -m "feat: 커플 연결 이동/이탈차단 결정 순수함수 추가"
```

---

## Task 2: onboardingCompleted 조회 + 최초 로드 자동 이동

`loadConnection()`이 `user_preferences.onboarding_completed`를 함께 조회해 state에 저장하고, 로드 말미에서 `resolveCoupleConnectDestination`이 `'connected'`면 즉시 이동한다. 화면에 이미 linked 상태로 진입(콜드 스타트 fallback, 파트너가 먼저 연결)한 경우를 커버한다.

**Files:**
- Modify: `app/onboarding/couple-connect.tsx`

- [ ] **Step 1: import + state 추가**

`app/onboarding/couple-connect.tsx:20-25`의 import 블록에 두 함수를 추가한다.

```ts
import {
  PENDING_INVITE_CODE_KEY,
  formatInviteCode,
  inviteCodeBody,
  normalizeInviteCode,
  resolveCoupleConnectDestination,
  shouldBlockLeaving,
} from '../../lib/couple-invite';
```

`couple-connect.tsx:84`의 `backBlockedVisible` state 선언 바로 아래에 추가:

```ts
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
```

- [ ] **Step 2: loadConnection에서 onboarding_completed 조회 + 자동 이동**

`couple-connect.tsx:96-98` (userId 세팅 직후, profile 조회 앞)에 prefs 조회를 추가한다. `user` 변수가 이미 스코프에 있으므로 재사용한다.

`setUserId(user.id);` 다음 줄에 삽입:

```ts
      const { data: prefs } = await supabase
        .from('user_preferences')
        .select('onboarding_completed')
        .eq('user_id', user.id)
        .maybeSingle<{ onboarding_completed: boolean | null }>();
      const completed = !!prefs?.onboarding_completed;
      setOnboardingCompleted(completed);
```

그리고 `loadConnection` 안에서 status를 확정한 직후 — `couple-connect.tsx:127`의 `setStatus(isLinked ? 'linked' : 'waiting');` 다음 줄에 자동 이동 가드를 삽입한다:

```ts
      if (resolveCoupleConnectDestination({
        status: isLinked ? 'linked' : 'waiting',
        partnerUserId: coupleRow.partner_user_id,
        onboardingCompleted: completed,
      })) {
        router.replace('/onboarding/connected' as any);
        return;
      }
```

- [ ] **Step 3: 타입 검증**

Run: `npm run validate`
Expected: PASS (에러 없음)

- [ ] **Step 4: 커밋**

```bash
git add app/onboarding/couple-connect.tsx
git commit -m "feat: 커플 연결 최초 로드 시 linked면 자동 이동 + onboarding 상태 조회"
```

---

## Task 3: Realtime 구독으로 실시간 자동 이동 (핵심)

초대자 화면이 떠 있는 동안 파트너가 연결(`status: 'linked'`)하면, 자신의 커플 row UPDATE를 Realtime으로 수신해 `resolveCoupleConnectDestination`으로 판단 후 즉시 이동한다.

**Files:**
- Modify: `app/onboarding/couple-connect.tsx`

- [ ] **Step 1: useEffect import 추가**

`couple-connect.tsx:1`의 import를 확장한다.

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
```

- [ ] **Step 2: onboardingCompleted를 ref로 미러링**

Realtime 콜백은 클로저에 최초 값을 캡처하므로, 최신 `onboardingCompleted`를 ref로 읽는다. `onboardingCompleted` state 선언 아래에 추가:

```ts
  const onboardingCompletedRef = useRef(false);
  useEffect(() => { onboardingCompletedRef.current = onboardingCompleted; }, [onboardingCompleted]);
```

- [ ] **Step 3: couple.id 확정 시 Realtime 구독**

`useFocusEffect` 블록(`couple-connect.tsx:160-164`) 아래에 새 `useEffect`를 추가한다. `couple?.id`가 있을 때만 구독하고, 변경/언마운트 시 정리한다.

```ts
  useEffect(() => {
    const coupleId = couple?.id;
    if (!coupleId) return;

    const channel = supabase
      .channel(`couple-connect-${coupleId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'date_planner_couples', filter: `id=eq.${coupleId}` },
        (payload) => {
          const next = payload.new as { status?: ConnectionStatus; partner_user_id?: string | null };
          if (resolveCoupleConnectDestination({
            status: next.status ?? 'waiting',
            partnerUserId: next.partner_user_id ?? null,
            onboardingCompleted: onboardingCompletedRef.current,
          })) {
            router.replace('/onboarding/connected' as any);
          }
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [couple?.id, router]);
```

- [ ] **Step 4: 타입 검증**

Run: `npm run validate`
Expected: PASS (에러 없음)

- [ ] **Step 5: 커밋**

```bash
git add app/onboarding/couple-connect.tsx
git commit -m "feat: 커플 row Realtime 구독으로 초대자 연결 완료 시 자동 이동"
```

---

## Task 4: AppState 포그라운드 재진입 재조회

백그라운드에 있던 동안 Realtime이 놓친 연결 완료를, 포그라운드 복귀 시 `loadConnection()` 재실행으로 보강한다. (자동 이동은 Task 2에서 loadConnection 말미에 이미 배선됨.)

**Files:**
- Modify: `app/onboarding/couple-connect.tsx`

- [ ] **Step 1: AppState import 추가**

`couple-connect.tsx:2-5`의 react-native import 블록에 `AppState`를 추가한다.

```ts
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert,
  ScrollView, Share, ActivityIndicator, AppState,
} from 'react-native';
```

- [ ] **Step 2: AppState 리스너 useEffect 추가**

Task 3의 Realtime `useEffect` 아래에 추가한다.

```ts
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void loadConnection();
    });
    return () => sub.remove();
  }, [loadConnection]);
```

- [ ] **Step 3: 타입 검증**

Run: `npm run validate`
Expected: PASS (에러 없음)

- [ ] **Step 4: 커밋**

```bash
git add app/onboarding/couple-connect.tsx
git commit -m "feat: 포그라운드 복귀 시 커플 연결 상태 재조회"
```

---

## Task 5: waiting 중 스와이프/하드웨어 백 차단

온보딩 중 + 미연결(`shouldBlockLeaving === true`)인 동안 iOS 엣지 스와이프(`gestureEnabled: false`)와 Android 하드웨어 백(`BackHandler`)을 막고, 커스텀 백 버튼도 같은 조건으로 통일한다.

**Files:**
- Modify: `app/onboarding/couple-connect.tsx`

- [ ] **Step 1: import 추가**

`couple-connect.tsx:2-5`의 react-native import에 `BackHandler`를 추가한다(Task 4의 `AppState`와 함께).

```ts
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert,
  ScrollView, Share, ActivityIndicator, AppState, BackHandler,
} from 'react-native';
```

`couple-connect.tsx:7`의 expo-router import에 `useNavigation`을 추가한다.

```ts
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
```

- [ ] **Step 2: blocked 값 계산 + navigation 핸들**

`const navigation = useNavigation();`을 `const router = useRouter();`(`couple-connect.tsx:68`) 아래에 추가한다.

`loading` early-return(`couple-connect.tsx:364`) **위**, 즉 모든 훅 호출 뒤·렌더 분기 전 지점에서 blocked를 계산하기 위해, 아래 두 `useEffect`를 `useFocusEffect` 블록 아래(Task 4 리스너 근처)에 추가한다. `blocked`는 훅 안에서 매번 계산한다.

```ts
  const blocked = shouldBlockLeaving({ status, onboardingCompleted });

  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !blocked });
  }, [navigation, blocked]);

  useEffect(() => {
    if (!blocked) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setBackBlockedVisible(true);
      return true;
    });
    return () => sub.remove();
  }, [blocked]);
```

- [ ] **Step 3: 커스텀 백 버튼을 blocked 기준으로 통일**

`couple-connect.tsx:390`의 BackBar `onPress`를 `status === 'linked'` 대신 `blocked` 기준으로 바꾼다.

```tsx
        <BackBar onPress={blocked ? () => setBackBlockedVisible(true) : undefined} />
```

- [ ] **Step 4: 타입 검증**

Run: `npm run validate`
Expected: PASS (에러 없음)

- [ ] **Step 5: 커밋**

```bash
git add app/onboarding/couple-connect.tsx
git commit -m "feat: waiting 온보딩 중 스와이프/하드웨어 백 이탈 차단"
```

---

## Task 6: Realtime publication 마이그레이션 (적용 직전 재확인)

Realtime UPDATE 수신을 위해 `date_planner_couples`를 `supabase_realtime` publication에 추가한다. **외부 DB 변경이므로 적용 직전 사용자에게 리스크를 다시 보고하고 승인받는다.**

- [ ] **Step 1: 현재 publication 상태 재확인**

`mcp__plugin_supabase_supabase__execute_sql`로 조회:

```sql
select tablename from pg_publication_tables
where pubname = 'supabase_realtime' and tablename = 'date_planner_couples';
```

Expected: 0 rows (미포함 확인)

- [ ] **Step 2: 사용자에게 리스크 보고 후 마이그레이션 적용**

리스크: 추가 전용·무중단·되돌리기 가능(`alter publication supabase_realtime drop table ...`), 데이터/스키마 무변경. RLS(`couples_select_member_or_waiting_code`)가 수신 대상을 계속 게이팅하므로 권한 우회 없음.

승인 후 `mcp__plugin_supabase_supabase__apply_migration` (name: `add_couples_to_realtime`):

```sql
alter publication supabase_realtime add table public.date_planner_couples;
```

- [ ] **Step 3: 적용 확인**

Step 1의 SELECT를 재실행.
Expected: 1 row (`date_planner_couples` 포함됨)

---

## Task 7: 실기기 검증

- [ ] **Step 1: 전체 테스트 + 타입 검증**

```bash
npx jest __tests__/coupleLink.test.ts
npm run validate
```
Expected: 모두 PASS

- [ ] **Step 2: 실기기(iPhone Release) 시나리오 점검**

- 초대자 화면 유지 상태에서 다른 기기로 코드 입력 → 초대자 화면이 자동으로 `connected`로 전환되는지 (Realtime)
- 초대자 앱을 백그라운드로 보냈다가 파트너 연결 후 복귀 → `connected`로 이동하는지 (AppState)
- waiting 중 엣지 스와이프/하드웨어 백 → 이탈 차단 + 모달 표시되는지
- 설정에서 재연결 진입(온보딩 완료 유저) → 뒤로가기가 정상 동작하는지 (차단 안 됨)

---

## Self-Review (작성자 점검 완료)

- **스펙 커버리지**: ①(Task 2 최초로드 + Task 3 Realtime), ②(Task 4 AppState), ③(Task 5 스와이프/백), 순수함수(Task 1), 마이그레이션(Task 6), 게이팅(`onboarding_completed`는 Task 2에서 조회해 세 동작 모두에 전달) — 모두 태스크 존재.
- **플레이스홀더**: 없음. 모든 코드 스텝에 실제 코드 포함.
- **타입 일관성**: `resolveCoupleConnectDestination`/`shouldBlockLeaving` 시그니처가 Task 1 정의와 Task 2/3/5 호출부에서 일치. `ConnectionStatus` 타입은 `couple-connect.tsx:27`에 이미 선언되어 Realtime payload 캐스팅에 재사용.
