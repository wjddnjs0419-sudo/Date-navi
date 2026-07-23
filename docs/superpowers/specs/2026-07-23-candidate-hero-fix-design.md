# candidates 상세 히어로 수정 설계 (2026-07-23)

## 배경

make_course("코스로 정리해줘") 카드 상세에서 히어로 SoftCard가 빈 박스로 렌더된다.
원인: `CandidateHeroCard`는 `place_name`이 있을 때만 `PlaceRow`를 그리는데,
make_course 카드는 장소가 전부 `steps` 안에 있고 카드 자체 `place_name`은 null.
또한 하트 버튼(`onToggleLove`)은 이름과 달리 `handleReact('love')`만 호출해 해제가 불가능하다.

대상 파일: `app/card/[id].tsx`(CandidateHeroCard + 화면 본체), `locales/ko/card.json`, `locales/en/card.json`,
`__tests__/card-detail-hero.test.tsx`.

## 범위

포함:
1. 하트(및 반응 그리드) 토글 해제
2. make_course 히어로에 코스 요약 표시

제외 (별도 작업):
- 목업 08 1:1 히어로(사진·D-day·날짜 메타·아바타 반응·합의 배너) — 후보 단계엔 날짜·사진 데이터 없음
- 태그 칩과 스텝 리스트 중복 정리
- 스텝 라벨·장소 불일치 — e1afe4d 수정 이전 생성된 구 데이터 문제, 코드 수정 대상 아님

## 설계

### 1. 반응 토글 해제

- 새 함수 `handleUnreact()`: `reactions`에서 `card_id = id AND user_id = myUserId` row를 delete.
  성공 시 `setMyReaction(null)`, `setMyConditionTag(null)`. 실패 시 기존 `saveError` Alert. `saving` 가드 공유.
- 하트: `myReaction === 'love'`이면 `handleUnreact()`, 아니면 `handleReact('love')`.
- 반응 그리드: 이미 선택된 반응을 재탭하면 `handleUnreact()`, 아니면 기존 `handleReact(type)`.
  (burden 해제 시 조건부 섹션도 함께 사라짐 — `myReaction`이 null이 되므로 자동.)
- 상대방 화면: row가 사라지므로 "반응 없음" 상태로 복귀. 별도 처리 불필요.

### 2. make_course 히어로 코스 요약

`CandidateHeroCard`에 `steps?: CourseStep[]` prop 추가. SoftCard 내용 우선순위:

1. `placeName` 있음 → 기존 `PlaceRow` (단일 장소 카드, 변경 없음)
2. `placeName` 없고 `steps` 1개 이상 → 코스 요약 두 줄:
   - 1줄: MapPin 아이콘 + `t('card.heroCourseCount', { count })` (예: "3곳 코스")
   - 2줄: `steps.map(s => s.label).join(' → ')`, `numberOfLines={1}` 말줄임
3. 둘 다 없음 → SoftCard 미렌더(하트 포함). 파트너 버블·확정 CTA는 유지.

호출부(`CardDetailScreen`)는 `steps={resolveDisplaySteps(card)}` 전달 — summary 파싱 폴백까지 재사용.

i18n (같은 커밋에서 ko/en 동시):
- ko `card.json`: `"heroCourseCount": "{{count}}곳 코스"`
- en `card.json`: `"heroCourseCount": "{{count}}-stop course"`

### 3. 테스트 (TDD, `card-detail-hero.test.tsx` 확장)

- love 상태에서 하트 탭 → reactions delete 호출, 하트 fill 해제
- 미반응 상태에서 하트 탭 → love upsert (회귀)
- 그리드: 선택된 반응 재탭 → delete / 다른 반응 탭 → upsert
- steps만 있는 카드 → 요약 두 줄 렌더, PlaceRow 없음
- steps·place 모두 없음 → SoftCard(하트 포함) 미렌더, CTA는 렌더

## 검증

- `npm run validate` (tsc --noEmit)
- 관련 테스트 통과
- 실기기 확인은 사용자 몫 (JS 변경만 → Xcode Run)
