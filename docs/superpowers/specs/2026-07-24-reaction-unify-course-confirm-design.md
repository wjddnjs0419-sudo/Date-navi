# 반응 UI 통일 + 코스 확정 흐름 연결 — 설계 문서

- 날짜: 2026-07-24
- 상태: 승인됨 (사용자 확정)
- 범위: 순수 클라이언트 UI/네비게이션. DB 스키마 변경 없음.

## 배경

출시 전 실기기 점검 중 두 가지 UX 불일치를 발견했다.

1. **share/reaction 화면의 반응 UI가 옛 버전**이다. 8개 버튼(`완전 끌려`·`좋아`·`느낌은 좋아`·`가까우면 좋아`·`오늘은 조금 부담돼`·`다음에 하고 싶어`·`돈 들어오면 하자`·`오래 걷지 않으면 좋아`)이 모두 기존 4종 `reaction_type`(`love`/`like`/`burden`/`next_time`)으로 접혀 저장된다. 문제: (a) "완전 끌려"와 "좋아"가 둘 다 `love`로 저장돼 버튼이 중복이고, (b) 조건풍 라벨(가까우면·돈 들어오면·오래 걷지)이 조건 정보를 버린 채 `like`/`next_time`으로 뭉개진다. 메인 후보 화면(`card/[id].tsx`)은 이미 깔끔한 4종 그리드로 정리됐고 `condition_tag` 흐름은 앱에서 완전히 제거됐다(`__tests__/burden-condition-removal.test.ts`). 이 화면만 옛 체계가 남았다.

2. **candidates의 "코스 확정 가기" 배너가 실제 확정으로 이어지지 않는다.** `onPress`가 `handleFilterChange('mutual')` — 필터 탭만 바꾼다. 라벨은 "코스 확정 가기"인데 동작은 필터 변경이라 무반응처럼 느껴진다. 진짜 코스 확정 흐름(`share/mutual` → `/card/confirm`)은 이미 존재하나 배너가 거기에 연결돼 있지 않다.

부차적으로, share/reaction의 "한마디(선택)" 입력란은 **저장 자체가 안 된다** — `handleSubmit`이 `reaction_type`만 upsert하고 `note` state는 버린다. mutual 화면의 `note`는 사용자 입력이 아니라 섹션별 고정 문구다.

## 목표

- share/reaction의 반응 UI를 `card/[id].tsx`와 동일한 4종으로 통일하고, 그 그리드를 공유 컴포넌트로 추출해 재분기를 영구 차단한다.
- "코스 확정 가기" 배너를 실제 코스 확정 흐름(`share/mutual`)으로 연결한다.
- `share/mutual`에서 mutual 카드가 2개 이상일 때 어떤 카드를 확정하는지 사용자가 선택할 수 있게 한다(현재는 무조건 맨 위 카드).

## 비목표

- DB 스키마 변경(`reactions` 테이블 컬럼 추가/삭제 없음).
- `condition_tag` 재도입.
- "한마디" 입력을 실제로 저장/표시하는 기능(입력란은 제거).
- 복수 카드 동시 확정(단일 선택만).
- 조건부/다음에 섹션 카드의 확정.

## 작업 A — share/reaction 반응 UI 통일

### A-1. 신규 공유 컴포넌트 `ReactionPicker`

- 위치: `components/`의 신규 파일 또는 `components/ui.tsx`(기존 UI 프리미티브 관례에 맞춰 결정).
- 책임: 4종 반응(`love`/`like`/`burden`/`next_time`)을 2×2 그리드로 렌더하고 선택 상태를 시각화한다. 진실의 원천은 `card/[id].tsx`의 `REACTIONS` 배열·`REACTION_ICONS`·i18n 라벨(`card.reactionLabels[type].label`)이다.
- Props:
  - `selected: ReactionType | null`
  - `onSelect: (type: ReactionType) => void`
- 의존: 색상 토큰(`constants/colors`), lucide 아이콘, i18n. 내부 상태 없음(제어 컴포넌트).
- `card/[id].tsx`는 기존 인라인 그리드를 이 컴포넌트 사용으로 교체한다. 시각/동작 회귀가 없어야 한다(토글 해제 포함 — `card/[id]`는 같은 반응 재탭 시 해제됨. `ReactionPicker`는 `onSelect`만 알리고 해제 판단은 호출부가 유지).

> 참고: `card/[id].tsx`의 재탭 해제(`shouldUnreactOnTap`)는 호출부 로직으로 남긴다. `ReactionPicker`는 순수하게 "탭된 타입"만 콜백으로 넘긴다. share/reaction은 해제가 필요 없으면 단순히 `setSelected(type)`만 해도 된다.

### A-2. `share/reaction.tsx` 변경

- 기존 `REACTION_OPTIONS`(8개) 및 관련 렌더 제거.
- `ReactionPicker`로 4종 반응 렌더. `selected`는 로컬 state, 초기값 `null`(사용자가 골라야 제출).
- "한마디(선택)" 입력란 제거: `note`/`setNote` state, 입력 UI, 관련 스타일, i18n 키(`share.reaction.noteLabel`/`notePlaceholder`)를 ko/en 양쪽에서 삭제. 단, 상대가 이전에 보낸 메시지를 보여주는 `sentMessage` 버블(`share.reaction.*`의 다른 키)은 별개이므로 유지.
- `handleSubmit`: 선택된 반응의 `reaction_type`만 upsert(현행과 동일). 제출 후 `/share/mutual`로 push(현행 유지).
- 미선택 상태에서 "반응 남기기"는 비활성 또는 무동작(현재 기본 선택이 있어 항상 활성이었음 → 기본 선택 제거에 맞춰 미선택 시 제출 차단).

## 작업 B — 코스 확정 흐름 연결 + mutual 카드 선택

### B-1. `candidates.tsx` 배너

- "코스 확정 가기" 배너의 `onPress`를 `handleFilterChange('mutual')` → `router.push('/share/mutual')`로 변경.
- 배너 노출 조건은 현행 유지(`activeFilter !== 'bucket' && !loading && cards.length > 0`).

### B-2. `share/mutual.tsx` 카드 선택

- `selectedId: string | null` state 추가. 초기값 = 첫 번째 mutual 카드 id(현행 `firstMutualId` 계산 재사용). mutual 카드가 0개면 `null`.
- "둘 다 좋아"(mutual) 섹션의 각 카드 **우상단에 라디오** 렌더. 탭 시 `setSelectedId(card.id)`. 선택된 카드만 채워진 라디오.
- 조건부(conditional)·다음에(deferred) 섹션 카드에는 라디오 없음.
- 하단 "코스 확정" CTA: 기존 `firstMutualId` → `selectedId` 기준. `selectedId`가 있으면 `/card/confirm?id=<selectedId>`, 없으면 현행 fallback(`router.replace('/(tabs)/candidates')`) 유지.

## 데이터 흐름

```
[candidates] "코스 확정 가기" 탭
   → router.push('/share/mutual')
       → mutual 카드 목록(둘 다 좋아 섹션)에서 라디오로 1개 선택
           → "코스 확정" 탭
               → /card/confirm?id=<selectedId>
                   → 기존 확정 로직(데이트 계획 생성)

[상대 제안 배너] 탭 → /share/reaction
   → ReactionPicker로 4종 중 1개 선택
       → "반응 남기기" → reactions.reaction_type upsert
           → /share/mutual
```

## 에러/경계 처리

- share/mutual 진입 시 mutual 카드 0개: 라디오 없음, `selectedId=null`, CTA는 fallback 경로.
- share/reaction 미선택 제출: 차단(비활성/무동작).
- 반응 저장 실패: 기존 `try/finally`의 `saving` 가드 유지(현행 동작 변경 없음).

## 테스트 (TDD)

### `ReactionPicker`
- 4종 반응이 모두 렌더된다.
- `selected`에 해당하는 버튼만 선택 스타일이다.
- 버튼 탭 시 해당 타입으로 `onSelect`가 호출된다.

### `card/[id].tsx` (회귀)
- `ReactionPicker` 도입 후에도 반응 선택/해제가 기존과 동일하게 동작한다.

### `share/reaction.tsx`
- 옛 8버튼(`REACTION_OPTIONS`)이 렌더되지 않는다.
- `ReactionPicker`를 사용한다.
- "한마디" 입력란이 없다(관련 i18n 키 부재 포함).
- 반응 선택 후 제출 시 올바른 `reaction_type`이 upsert된다.
- 미선택 시 제출이 차단된다.

### `candidates.tsx`
- "코스 확정 가기" 배너 `onPress`가 `/share/mutual`로 push한다(더 이상 필터만 바꾸지 않는다).

### `share/mutual.tsx`
- mutual 섹션 카드에 라디오가 렌더된다(조건부/다음에엔 없다).
- 진입 시 맨 위 mutual 카드가 기본 선택이다.
- 다른 카드 라디오 탭 시 선택이 바뀐다.
- "코스 확정" CTA가 `selectedId` 기준으로 `/card/confirm`에 push한다.
- mutual 카드 0개일 때 CTA가 fallback 경로를 탄다.

## i18n

- 삭제: `share.reaction.noteLabel`, `share.reaction.notePlaceholder` (ko/en).
- 신규 문자열이 필요하면(라디오 접근성 라벨 등) ko/en 동시 추가.
