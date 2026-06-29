# 코스 모드 전용 결과 화면 (동선 트레일) — 설계

> 작성일: 2026-06-29
> 대상 모드: `make_course` ("코스로 정리해줘")

## 1. 배경 / 목적

현재 모든 모드(`pick_for_me`, `feeling`, `light`, `make_course`)가 공유 화면
`app/mode-flow/result.tsx`로 결과를 렌더링한다. `make_course`는 단계별 동선(코스)을
다루므로 다른 모드와 시각적으로 차별화된 결과 화면이 필요하다.

목표 UX:
- 코스 동선을 **둥근 핑크 곡선**(메인 핑크 `#F26B7A`)으로 표현
- **한 화면 = 후보 1개**, 좌우로 카드 밀어서 후보 3개 전환
- 한 코스 안의 단계(1단계→2단계→3단계…)를 곡선 위의 노드로 연결 (첨부 레퍼런스 스타일)

## 2. 결정 사항 (확정)

- 화면 구조: **전용 화면 신규** — `make_course`만 신규 `course-result.tsx`로 라우팅, 기존
  `result.tsx`는 그대로 둔다.
- 입력 화면: **필드 유지 + 공용 패턴 정렬** — `course.tsx`를 다른 모드(pick/feeling/light)와
  통일(크림 배경, `BackBar`/`BigButton`, `C` 토큰, `lib/modeForm`).
- 트레일 방향: **가로 S자 serpentine** — 행이 화면 폭을 채우고 끝에서 U턴하며 아래로 감김
  (첨부 레퍼런스 스타일). 세로 지그재그 아님.
- 동선 의미: **한 코스의 단계들** — 후보 1개 = 코스 1개, 그 안의 단계를 곡선으로 연결.
  좌우 스와이프로 후보 3개 전환.
- 데이터: **구조화 `steps` 필드 추가** — `summary` 문자열 파싱 대신 AI가 구조화된
  `steps` 배열을 직접 출력.

## 3. 아키텍처

### 3-1. 데이터 모델 (`lib/ai.ts`)

`DateCard`에 옵셔널 필드 추가:

```ts
export type CourseStep = { label: string; desc?: string };

export type DateCard = {
  title: string;
  summary: string;
  estimated_time: string;
  estimated_budget: string;
  tags: string[];
  why_recommended: string;
  steps?: CourseStep[];   // make_course 전용 동선 단계 (3~4개)
};
```

- 옵셔널이므로 다른 모드 카드는 영향 없음.
- `make_course` 폴백 카드(현재 `light`/공용 폴백 사용)는 `steps`를 채운 별도 폴백을
  제공하거나, 폴백 시 `summary`의 `"1단계: … → 2단계: …"` 문자열을 split 하여 steps로
  보정한다. (구현 단계에서 폴백 보정 헬퍼 `parseStepsFromSummary` 추가.)

### 3-2. 프롬프트 (`lib/prompt.ts`)

- `make_course` 모드 지침에 `steps` 배열 출력 요구 추가 (ko/en 동일).
- 결과 JSON 스키마(`cards[]` 항목)에 `steps` 추가:

```jsonc
"steps": [
  { "label": "단계 장소/행동 (12자 이내)", "desc": "한 줄 보충 (20자 이내)" }
]
```

- 지침: 3~4단계, 시간 순서대로. `summary`는 기존처럼 한 줄 요약 유지.

### 3-3. 라우팅

- `app/(tabs)/mode.tsx`: `make_course` → `/mode-flow/course` (입력 화면, 변경 없음).
- `app/mode-flow/course.tsx`: 생성 버튼 → 기존 `/mode-flow/result` 대신
  **`/mode-flow/course-result`** 로 push. params(`mode`, `input`)는 동일.
- 다른 모드는 계속 `/mode-flow/result` 사용.

### 3-3b. 입력 화면 정렬 (`app/mode-flow/course.tsx`)

필드(아이디어 자유텍스트·예산 칩·시간 칩)는 유지하되 다른 모드와 통일:
- 배경 크림 `#FFF8F3`, 헤더 `BackBar`, 생성 버튼 `BigButton` (공용 `components/ui`).
- 하드코딩 색(`#FF4F6D`) 제거 → `C.pink` 등 토큰 사용 (CLAUDE.md No-Hardcoding).
- 입력 조립을 `lib/modeForm`의 신규 `buildCourseInput({ idea, budget, duration })`로
  일원화 (기존 `FeelingInput` 직접 조립 제거). 반환 타입은 기존 `FeelingInput` 유지.

### 3-4. 신규 화면 `app/mode-flow/course-result.tsx`

데이터 흐름은 `result.tsx`와 동일:
- `generateDateCards(parsedInput, 'make_course', prefs, language)`
- loading / error 상태 동일 패턴 재사용
- `handleSave`(date_cards insert) 로직 재사용 — 단, 저장 row에 `steps`가 DB 컬럼에
  없으면 `input_json`/기존 컬럼만 저장 (DB 스키마 변경 없음, steps는 화면 표시 전용).

레이아웃:
- 상단: `BackBar` + 제목("이런 코스는 어때요?") + 후보 인디케이터(●○○, 현재 페이지).
- 본문: 가로 페이저 — `ScrollView horizontal pagingEnabled`, 각 페이지 너비 = 화면 폭.
  - 페이지마다: 카드 제목 / 시간·예산 메타 / **CourseTrail**(동선 곡선) / 저장·보내기 버튼.
- 페이지 스크롤 시 `onMomentumScrollEnd`로 현재 인덱스 갱신 → 인디케이터 반영.

### 3-5. 컴포넌트 `CourseTrail`

독립 컴포넌트(같은 파일 하단 또는 `components/`):
- 입력: `steps: CourseStep[]`, `width`(페이지 폭).
- **가로 S자 serpentine**: 노드를 행(row)으로 배치, 행마다 화면 폭을 좌→우 / 우→좌 번갈아
  진행하고 행 끝에서 U턴해 아래 행으로. `react-native-svg` `Path`의 베지어(`C`/`Q`)로 굽이를
  둥글게. stroke = 핑크 `#F26B7A`, strokeWidth ~4, strokeLinecap round.
- 노드 좌표 규칙: 한 행에 노드 N개 균등 배치, 행 index 홀수면 x 순서 반전(우→좌). 행당 노드
  수(예: 2)는 상수로 두고 `nodesPerRow`로 조정 가능.
- 각 노드: 원(흰 배경 + 핑크 테두리) + 단계 번호, 옆/아래 `label`(굵게) / `desc`(보조).
- **단계 증가 처리**: 행이 아래로 추가됨 → `trailHeight = ceil(stepCount / nodesPerRow) × 행높이`.
  svg viewBox 높이도 동일. 페이지 본문은 세로 스크롤(가로 페이저 안에 세로 ScrollView 중첩).
- steps 없거나 1개면 곡선 없이 단순 리스트로 폴백.

#### 좌표 계산 분리 (`computeTrailNodes`)
순수 함수로 분리해 단위 테스트:
```ts
computeTrailNodes(stepCount, width, opts): { x: number; y: number }[]
```
- 입력 stepCount·폭 → 각 노드의 (x, y). serpentine 행 반전 로직 포함.
- `CourseTrail`은 이 결과로 Path d 문자열과 노드 View를 렌더만.

## 4. 단위 경계 / 테스트 용이성

- `parseStepsFromSummary(summary): CourseStep[]` — 순수 함수, 문자열→steps. 단위 테스트
  대상(RED 먼저).
- `computeTrailNodes(stepCount, width, opts)` — 순수 함수, serpentine 좌표 계산. 단위 테스트
  대상(RED 먼저): 행 반전·노드 수 증가 검증.
- `buildCourseInput(...)` — 순수 함수, 입력 조립. 단위 테스트 가능.
- `CourseTrail` — props만으로 렌더, 좌표 계산은 위 함수에 위임.
- 화면(`course-result.tsx`) — 데이터/저장은 기존 검증된 경로 재사용.

## 5. 에러 처리

- 생성 실패: 기존 `result.tsx`와 동일한 에러 화면 패턴.
- `steps` 누락 카드: `summary` 파싱 폴백 → 그래도 없으면 trail 숨기고 요약만 표시.

## 6. 범위 밖 (YAGNI)

- DB 스키마(`date_cards`)에 `steps` 컬럼 추가 — 이번엔 안 함(표시 전용).
- 지도/실제 위치 연동 — 안 함.
- 곡선 애니메이션 — 1차에선 정적, 추후 backlog.

## 7. 검증

- `npm run validate` (tsc --noEmit) 통과.
- `parseStepsFromSummary` 단위 테스트 통과.
