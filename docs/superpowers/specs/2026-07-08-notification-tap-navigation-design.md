# 알림함 탭 시 해당 페이지로 이동 — 설계

## 배경

`app/account/notifications.tsx`의 알림 목록에서 항목을 탭하면 `handleRowPress`가 `removeOne(id)`만 호출해 알림을 지운다([app/account/notifications.tsx:82-88](../../../app/account/notifications.tsx#L82-L88)). 페이지 이동은 없다. 반면 OS 푸시 알림을 탭했을 때는 이미 `lib/push.ts:buildPushNavigationTarget`으로 타입+`card_id`를 보고 `/card/{id}`로 이동시키는 로직이 있다([app/_layout.tsx:101-105](../../../app/_layout.tsx#L101-L105)). 인앱 알림함 탭에도 같은 이동을 추가한다.

## 설계

`handleRowPress`에서 `soft_message`가 아닌 경우, 기존 `buildPushNavigationTarget(n.type, { card_id: n.payload?.card_id })`을 그대로 재사용해 이동 경로를 구하고 `removeOne(n.id)` + `router.push(target)`을 함께 실행한다.

```ts
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

- `useRouter()`를 컴포넌트 상단에 추가.
- `soft_message`는 변경 없음 — 지금처럼 모달을 먼저 보여주고 모달을 닫을 때 `removeOne` 호출.
- `card_id`가 없으면 `buildPushNavigationTarget`이 `/account/notifications`로 폴백한다(제자리 이동, 사실상 no-op). 알림은 그대로 삭제된다. OS 푸시 탭과 동일한 기존 폴백 동작이라 이번 변경에서 별도 처리하지 않는다.
- 삭제 시점: 탭 즉시 `removeOne` + `router.push` — 지금처럼 탭=삭제 확정이며, 이동만 추가되는 것. `read=true`로 남겨뒀다가 나중에 지우는 방식은 채택하지 않음(사용자 확정).
- 새 컴포넌트 분리 없음(사용자 확인 완료) — `clearAll`(모두 지우기) 로직/버튼은 지금 그대로 둔다.

## 범위 밖

- 삭제된 카드를 가리키는 알림(`card_id`가 이미 없어진 카드)을 탭했을 때 `/card/[id].tsx`가 "카드 없음"을 어떻게 보여주는지는 이번 변경 밖. 기존에도 있던 이슈이며 [2026-07-08-partner-reaction-widget-status-filter-design.md](2026-07-08-partner-reaction-widget-status-filter-design.md)에서 이미 별도 이슈로 분리해둔 것과 동일한 사안.
- `read`/`unread` 스키마 변경 없음.

## 에러 처리

기존과 동일 — `removeOne`은 실패해도 로컬 상태는 이미 필터링된 상태로 유지(낙관적 업데이트, 기존 코드 그대로). 이동 실패(라우팅 자체 에러)는 expo-router 기본 동작에 맡긴다.

## 테스트

이동 경로 계산 로직(`buildPushNavigationTarget`)은 이미 `__tests__/push.test.ts`에 4개 케이스로 테스트되어 있고 이번 변경에서 새 로직을 추가하지 않는다 — 화면에서 이미 검증된 순수 함수를 호출만 하는 배선(wiring) 코드이며, `app/_layout.tsx`의 기존 배선과 동일한 패턴. 이 프로젝트는 화면 컴포넌트 렌더링 테스트 인프라가 없어(`__tests__/`는 순수 로직만 테스트) 화면 변경은 기존 컨벤션대로 시뮬레이터 수동 검증으로 확인한다.

## 수동 검증 체크리스트 (구현 후 사용자가 확인)

1. 반응(`reaction`) 알림 탭 → 해당 카드 상세로 이동하고, 알림함으로 돌아오면 그 알림이 사라져 있는지.
2. 새 추천(`new_card`) 알림 탭 → 카드 상세로 이동 + 알림 삭제.
3. 다정한 문장(`soft_message`) 알림 탭 → 기존처럼 모달 뜨는지(이동 없음), 모달 닫으면 삭제되는지 회귀 확인.
4. `card_id`가 없는 알림(있다면) 탭 시 에러 없이 알림함에 머물고 알림은 삭제되는지.
