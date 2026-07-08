# 홈 화면 "파트너 반응" 위젯 — 확정/추억 완료 후에도 안 사라지는 문제 — 설계

## 배경

홈 화면의 "파트너 반응" 카드([app/(tabs)/index.tsx:105-138](../../../app/(tabs)/index.tsx))는 파트너가 남긴 가장 최근 반응 1건을 보여준다. 사용자가 다음 두 케이스에서 문제를 발견했다.

1. 데이트 후보를 확정해도 위젯이 계속 남는다 — "다가오는 데이트" 섹션과 내용이 중복된다.
2. 데이트가 끝나고 "우리 추억"으로 넘어가도 위젯이 계속 남는다.

(참고로 후보 자체를 삭제하는 케이스는 이미 정상 동작 — `reactions` 테이블이 `date_cards`에 `ON DELETE CASCADE`로 걸려있어 삭제 시 반응도 함께 지워지고, 위젯은 매번 살아있는 카드 목록만 조회하므로 삭제된 카드의 반응은 애초에 후보 풀에 들어오지 않는다.)

## 원인

`app/(tabs)/index.tsx`의 `allCards` 조회가 `date_cards.status`를 필터링하지 않는다. `status`는 `active → confirmed → done`(추억 기록 완료, [app/card/review.tsx:120](../../../app/card/review.tsx#L120)) 순서로 바뀌는데, 이 셋을 구분하지 않고 커플의 모든 카드를 대상으로 "파트너의 가장 최근 반응"을 뽑아온다. 그래서 확정되거나 추억으로 넘어간 카드에 대한 반응도 계속 후보로 잡힌다.

## 설계

`app/(tabs)/index.tsx`의 `allCards` 쿼리에 `.eq('status', 'active')` 한 줄을 추가한다.

```ts
const { data: allCards } = await supabase
  .from('date_cards')
  .select('id, title')
  .eq('couple_id', myProfile.couple_id)
  .eq('status', 'active');
```

- 파트너가 반응 남긴 카드가 `confirmed`나 `done`으로 바뀌면 다음 홈 로드 시 `allCards`에서 빠지고, 그 카드의 반응도 자동으로 후보 풀에서 제외된다.
- 다른 active 후보에 더 최근 반응이 있으면 그게 대신 뜨고, 없으면 `partnerReaction`이 `null`이 되어 위젯 섹션 자체가 안 뜬다([index.tsx:394](../../../app/(tabs)/index.tsx#L394) `{partner && partnerReaction && (...)}` 가드가 이미 존재).
- 스키마 변경, 새 상태(읽음/안읽음) 저장 없음. 기존 `pickLatestReaction`/`formatReactionText`/`relativeTime` 로직은 그대로 재사용.

## 범위 밖

- "탭해서 읽으면 즉시 사라지는" 옵션(active 상태에서도 열람 즉시 dismiss)은 이번엔 넣지 않는다 — 사용자가 A안(상태 필터만)으로 확정.
- 알림(벨) 리스트(`app/account/notifications.tsx`)의 별도 이슈(삭제된 카드의 알림이 FK 없이 영구 잔존하는 것)는 이번 요청 범위 밖. 별도로 다룰 문제.

## 에러 처리

기존과 동일 — 조회 실패 시 `allCards`가 `undefined`/빈 배열이 되어 `if (allCards?.length)` 분기를 안 타고 `setPartnerReaction(null)`로 안전하게 빠진다. 추가 에러 처리 불필요.

## 테스트

쿼리 필터 한 줄 추가라 순수 함수 변경이 없다. 기존 컨벤션대로 `.tsx` 화면 변경은 시뮬레이터 수동 검증으로 확인한다.

## 수동 검증 체크리스트 (구현 후 사용자가 확인)

1. 파트너가 활성 후보에 반응 남기기 → 홈 화면에 위젯 뜨는지(회귀 확인, 기존 동작 유지).
2. 그 후보를 확정하기 → 홈으로 돌아왔을 때 위젯이 사라지는지(다른 active 후보 반응이 없다는 전제).
3. 확정된 데이트를 "추억 기록 완료(done)"까지 진행 → 홈에서 위젯이 계속 안 뜨는지.
4. 다른 active 후보에 새 반응이 있으면 그 반응이 위젯에 뜨는지(교체 확인).
