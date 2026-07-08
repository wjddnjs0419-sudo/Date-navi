# 코스 카드 상세 화면 steps 표시 — 설계

## 배경

`app/mode-flow/course-result.tsx`(코스 추천 직후 화면)는 AI가 만든 실제 단계별 동선(`steps`, 로컬 컴포넌트 `CourseStepList`)을 보여주지만, 카드를 저장(`handleSave`/`handleSendToPartner`)할 때 `date_cards` insert 문에 `steps`를 포함하지 않는다. `date_cards` 테이블에도 `steps` 컬럼이 없다. 그래서 저장된 코스 카드를 나중에 상세 화면(`app/card/[id].tsx`)에서 다시 열면 원본 단계 데이터가 없고, 이 화면은 `card.mode`와 무관하게 항상 일반 카드 템플릿(제목/요약/⏱💰/태그/한줄이유)만 렌더링한다 — `steps`라는 단어 자체가 이 파일에 없다.

`course-result.tsx`에는 이미 `stepsOf()`라는 폴백 로직이 있다: `card.steps`가 비어있으면 저장된 `summary` 텍스트를 `parseStepsFromSummary()`([lib/course.ts](../../../lib/course.ts))로 파싱해 단계를 재구성한다.

## 목표

- 코스 카드를 저장할 때 실제 `steps` 데이터를 DB에 함께 저장한다.
- `app/card/[id].tsx`가 `card.mode === 'make_course'`일 때 코스 전용 UI(단계별 동선)를 보여준다.
- 이미 저장된(이번 수정 전) 코스 카드는 `steps` 컬럼이 비어있으므로, `summary` 텍스트 파싱 폴백으로 최대한 복원해서 보여준다.

## 비목표

- `app/card/confirm.tsx`, `app/share/mutual.tsx`, `app/(tabs)/memories.tsx`는 이번 스코프 밖 — 카드 상세 화면(`card/[id].tsx`)만 고친다.
- 기존 저장된 카드의 `steps` 컬럼을 소급해서 채우는 데이터 마이그레이션은 하지 않는다 — 계속 파싱 폴백으로 표시한다.
- `steps` 안의 `place_name`/`place_address`/`map_url`(장소 단계에 결합된 실제 장소 정보)을 파싱 폴백에서 복원하려 하지 않는다 — 텍스트만으로는 복원 불가능하므로 파싱 폴백은 `label`만 채운다(기존 `parseStepsFromSummary` 동작 그대로).

## DB 마이그레이션

```sql
alter table public.date_cards add column if not exists steps jsonb;
comment on column public.date_cards.steps is
  'make_course 카드의 단계별 동선(CourseStep[]). feeling/next_meet 카드는 null. 이 컬럼 추가 이전에 저장된 코스 카드도 null — 상세 화면에서 summary 파싱 폴백으로 표시.';
```

## 저장 로직

- `app/mode-flow/course-result.tsx`의 `handleSave()`, `handleSendToPartner()` — insert 문에 `steps: card.steps ?? null` 추가.
- `app/card/[id].tsx`의 `handleGenerateAlt()`(조건태그 재추천) — 새로 생성된 카드(`nc: DateCard`)를 insert할 때도 `steps: nc.steps ?? null` 추가.

## 공용 헬퍼: `resolveDisplaySteps()`

`lib/course.ts`에 추가:

```ts
// steps가 있으면 그대로, 없으면 summary 텍스트 파싱으로 최대한 복원한다.
// place_name 등 장소 결합 정보는 텍스트 파싱으로 복원 불가 — 파싱 폴백은 label만 채운다.
export function resolveDisplaySteps(card: { steps?: CourseStep[] | null; summary?: string }): CourseStep[] {
  if (card.steps && card.steps.length > 0) return card.steps;
  return parseStepsFromSummary(card.summary);
}
```

`app/mode-flow/course-result.tsx`의 기존 로컬 `stepsOf()` 함수는 이 헬퍼를 호출하도록 교체(중복 제거).

## 공용 컴포넌트: `CourseStepList`

`app/mode-flow/course-result.tsx`에 로컬로 정의된 `CourseStepList` 컴포넌트를 `components/ui.tsx`로 이동(export). `course-result.tsx`와 `app/card/[id].tsx` 양쪽에서 import해서 쓴다.

## `app/card/[id].tsx` 표시 로직

- `CardDetail` 타입에 `steps?: CourseStep[] | null` 추가.
- Supabase select 쿼리에 `steps` 컬럼 추가.
- `card.mode === 'make_course'`일 때: 현재 있는 일반 요약(`card.summary`) 텍스트 표시 대신, `resolveDisplaySteps(card)` 결과로 `CourseStepList`를 렌더링(place_name/장소 관련 UI는 기존 `PlaceRow`를 그대로 재사용 — steps 안의 place_name이 있으면 각 단계에서, 카드 전체 place_name은 기존처럼 상단에).
- `feeling`/`next_meet` 카드는 기존 UI 그대로(변경 없음).

## 에러 처리

- `steps` 컬럼이 `null`이고 `summary`도 파싱 불가능한 형식이면 `parseStepsFromSummary`가 빈 배열을 반환 — `CourseStepList`는 빈 배열이어도 크래시 없이 빈 상태로 렌더링(기존 `course-result.tsx` 동작과 동일하게 처리).

## 테스트 범위 (TDD)

- `lib/course.ts`의 `resolveDisplaySteps()` — 순수 함수라 유닛 테스트 가능. `__tests__/course.test.ts`에 케이스 추가: steps 있으면 그대로 반환, steps 없고 summary 파싱 가능하면 파싱 결과 반환, 둘 다 없으면 빈 배열.
- `app/card/[id].tsx`/`app/mode-flow/course-result.tsx`의 실제 렌더링은 RN 컴포넌트 테스트 하네스가 없어([2026-07-04-gps-location-design.md](2026-07-04-gps-location-design.md) 참고, 기존 관례) 자동 테스트 대상에서 제외 — 시뮬레이터에서 수동 확인.
