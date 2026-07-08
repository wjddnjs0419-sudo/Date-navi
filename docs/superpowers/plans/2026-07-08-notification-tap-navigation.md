# 알림함 탭 시 페이지 이동 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 알림함(`app/account/notifications.tsx`)에서 알림을 탭하면 기존처럼 삭제만 되는 게 아니라, 해당 카드 상세 페이지로도 이동시킨다.

**Architecture:** 새 라우팅 로직을 만들지 않는다. `lib/push.ts`의 기존 `buildPushNavigationTarget(type, {card_id})`(이미 `__tests__/push.test.ts`에서 4케이스 테스트됨, OS 푸시 탭 처리인 `app/_layout.tsx:101-105`에서 쓰는 것과 동일 함수)를 알림함 화면의 탭 핸들러에서도 그대로 호출해 이동 경로를 구하고, `router.push` + 기존 `removeOne`을 함께 실행한다.

**Tech Stack:** React Native, expo-router (`useRouter`), 기존 Supabase 삭제 로직 재사용.

**참고 스펙:** [docs/superpowers/specs/2026-07-08-notification-tap-navigation-design.md](../specs/2026-07-08-notification-tap-navigation-design.md)

---

### Task 1: 알림 탭 시 이동 로직 배선

**Files:**
- Modify: `app/account/notifications.tsx`

이 태스크에 새 순수 로직은 없다 — `buildPushNavigationTarget`은 이미 `__tests__/push.test.ts`에서 아래 4케이스로 검증되어 있고 이번 변경에서 수정하지 않는다:
- `new_card` + `card_id` 있음 → `/card/{id}`
- `reaction` + `card_id` 있음 → `/card/{id}`
- `soft_message` → `/account/notifications`
- `new_card` + `card_id` 없음 → `/account/notifications` 폴백

이 태스크는 이미 테스트된 그 함수를 화면 이벤트 핸들러에서 호출하는 배선(wiring)일 뿐이다. 이 저장소는 화면 컴포넌트 렌더링 테스트 인프라가 없다(`__tests__/`는 순수 함수만 테스트, 예: [2026-07-08-partner-reaction-widget-status-filter-design.md](../specs/2026-07-08-partner-reaction-widget-status-filter-design.md)의 화면 변경도 자동 테스트 없이 시뮬레이터 수동 검증만 함) — 그래서 이 태스크는 "실패하는 테스트 먼저" 대신 기존 테스트가 여전히 통과하는지 확인 → 구현 → 시뮬레이터 수동 검증 순서로 진행한다.

- [ ] **Step 1: 기존 push 테스트가 그대로 통과하는지 확인 (회귀 기준선)**

Run: `npx jest __tests__/push.test.ts`
Expected: PASS (4 tests) — 이번 변경으로 이 파일은 건드리지 않으므로 그대로 통과해야 함.

- [ ] **Step 2: import 추가**

`app/account/notifications.tsx` 상단 import 블록을 다음과 같이 수정한다.

```tsx
import { useFocusEffect, useRouter } from 'expo-router';
```

(기존 `import { useFocusEffect } from 'expo-router';` 를 위 줄로 교체)

그리고 supabase import 아래에 한 줄 추가:

```tsx
import { buildPushNavigationTarget, type PushNotificationType } from '../../lib/push';
```

- [ ] **Step 3: `useRouter()` 훅 추가**

`NotificationsScreen` 컴포넌트 최상단, `const { strings } = useI18n();` 바로 아래에 추가:

```tsx
const router = useRouter();
```

- [ ] **Step 4: `handleRowPress` 수정**

기존 코드(`app/account/notifications.tsx:82-88`):

```tsx
  function handleRowPress(n: Notif) {
    if (n.type === 'soft_message') {
      setSelected(n);
      return;
    }
    removeOne(n.id);
  }
```

다음으로 교체:

```tsx
  function handleRowPress(n: Notif) {
    if (n.type === 'soft_message') {
      setSelected(n);
      return;
    }
    const target = buildPushNavigationTarget(n.type as PushNotificationType, { card_id: n.payload?.card_id });
    removeOne(n.id);
    router.push(target as any);
  }
```

- [ ] **Step 5: 타입체크**

Run: `npm run validate`
Expected: 에러 없음 (프로젝트 CLAUDE.md 규칙 — `tsc --noEmit`)

- [ ] **Step 6: 회귀 테스트 재확인**

Run: `npx jest __tests__/push.test.ts`
Expected: PASS (4 tests, 변경 없음 확인)

- [ ] **Step 7: 커밋**

```bash
git add app/account/notifications.tsx
git commit -m "feat: navigate to card detail when tapping a notification"
```

- [ ] **Step 8: 시뮬레이터 수동 검증 (스펙의 체크리스트)**

1. 반응(`reaction`) 알림 탭 → 해당 카드 상세로 이동하고, 알림함으로 돌아오면 그 알림이 사라져 있는지.
2. 새 추천(`new_card`) 알림 탭 → 카드 상세로 이동 + 알림 삭제.
3. 다정한 문장(`soft_message`) 알림 탭 → 기존처럼 모달 뜨는지(이동 없음), 모달 닫으면 삭제되는지 회귀 확인.
4. `card_id`가 없는 알림(있다면) 탭 시 에러 없이 알림함에 머물고 알림은 삭제되는지.

---

## 범위 밖 (스펙과 동일)

- 삭제된 카드를 가리키는 알림을 탭했을 때 `/card/[id].tsx`의 "카드 없음" 처리 — 기존 이슈, 이번 변경 밖.
- `read`/`unread` 스키마 변경, `clearAll` 컴포넌트 분리 — 불필요로 확인됨.
