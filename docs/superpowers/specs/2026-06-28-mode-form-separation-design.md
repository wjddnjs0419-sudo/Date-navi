# 데이트 모드 폼/프롬프트 분리 설계

> 작성일: 2026-06-28
> 목적: 기획(Proposal.md 5.1~5.3)대로 각 데이트 모드의 입력폼과 AI 프롬프트를 차별화한다.

## 배경 / 문제

기획은 사용자를 고정 유형으로 분류하지 않고, 매번 "오늘 앱이 어떻게 도와줄까?"라는 **현재 상태(state)**를 고르게 한다. 각 모드는 상태별로 입력·도움·결과물이 달라야 한다([Proposal.md 5.3](../../../Super%20plan/Proposal.md), [MVP Spec F-004 "모드별 입력 폼 다르게 노출"](../../../Super%20plan/DateMate_MVP_Function_Spec.md)).

현재 구현의 갭:

1. **mode id 매핑 버그.** `mode.tsx`가 보내는 id(`feeling`, `light`, `next_meet`)와 `lib/ai.ts`의 `MODE_CONTEXT`/`MODE_EMPHASIS` 키(`feeling_only`, `light_date`, `next_time`)가 불일치. 결과적으로 카드형 3모드(`pick_for_me`/`feeling`/`light`)가 프롬프트까지 사실상 동일하게 동작한다. `light`의 저예산/근거리 특별지침도 실제로는 주입되지 않는다.
2. **입력폼 미분화.** `pick_for_me`/`feeling`/`light`가 모두 `app/mode-flow/feeling.tsx` 한 화면을 공유한다. 기획상 "앱이 골라줘"는 조건만 입력(능동 표현 0), "느낌만 말할게"는 분위기/감정 표현이 핵심이라 폼이 달라야 한다.
3. **라우팅 버그.** `mode.tsx`의 `soft_message`가 존재하지 않는 `/share/soft-message`로 push한다(`as any`로 컴파일 우회). 실제 화면은 `app/(tabs)/soft-message.tsx`.

## 스코프

- **포함:** 현재 6개 모드(`pick_for_me`, `feeling`, `make_course`, `soft_message`, `light`, `next_meet`)의 입력폼·프롬프트 차별화, 위 3개 버그 수정.
- **제외:** 기획에만 있는 신규 모드(`특별하게 하고 싶어`, `실패 확률 낮게`) 추가. 별도 작업.

## 재검토 결론 (이미 별도 화면이 있는 3모드)

- **make_course** ([course.tsx](../../../app/mode-flow/course.tsx)): 아이디어+예산+시간 입력, `make_course` 키 정합, emphasis로 단계별 동선 강제. 기획 부합. 변경 없음.
- **soft_message** ([app/(tabs)/soft-message.tsx](../../../app/(tabs)/soft-message.tsx)): 상황 선택+톤+텍스트, 별도 `generateSoftMessage`. 기획 부합. **라우팅 버그만 수정**.
- **next_meet** ([bucketlist.tsx](../../../app/mode-flow/bucketlist.tsx)): 아이디어를 버킷리스트 저장, AI 미사용. 기획 부합. 변경 없음.

## 설계

### A. mode id 통일 (lib/ai.ts)

`MODE_CONTEXT`, `MODE_CONTEXT_EN`, `MODE_EMPHASIS`, `MODE_EMPHASIS_EN`의 키를 DB 저장값(= `mode.tsx`의 id, `result.tsx`가 `date_cards.mode`로 저장)에 맞춘다.

- `feeling_only` → `feeling`
- `light_date` → `light`
- `next_time` → `next_meet`
- 미사용 `special_date`, `low_risk` 항목 제거 (6모드 스코프 밖)
- `pick_for_me`, `make_course` 유지

### B. 입력폼 분리 (mode별 화면 파일)

`pick_for_me`/`feeling`/`light` 각각 별도 화면 파일로 분리한다.

- `app/mode-flow/pick.tsx` — 앱이 골라줘
- `app/mode-flow/feeling.tsx` — 느낌만 말할게 (기존 파일 재구성)
- `app/mode-flow/light.tsx` — 가볍게

공통 로직은 헬퍼로 추출하여 중복을 줄인다:

- `FeelingInput` 빌더 헬퍼 (선택값 → `FeelingInput` 변환)
- 칩/예산/시간 선택 UI는 기존 `components/ui`의 `Chip` 및 공통 스타일 재사용

`mode.tsx`의 `handleStart` 라우팅을 mode별 경로로 분기:

- `pick_for_me` → `/mode-flow/pick`
- `feeling` → `/mode-flow/feeling`
- `light` → `/mode-flow/light`
- (기존) `make_course` → `/mode-flow/course`, `next_meet` → `/mode-flow/bucketlist`, `soft_message` → `/(tabs)/soft-message`

각 화면은 기존과 동일하게 `/mode-flow/generating`(또는 result)로 `mode`, `input`을 전달한다.

### C. 각 폼 내용 (기획 기반)

| 모드 | 입력 구성 | 비고 |
|---|---|---|
| 앱이 골라줘 (`pick_for_me`) | 컨디션·예산·거리·시간 **조건칩만** | 자유텍스트 제거 (능동 표현 0) |
| 느낌만 말할게 (`feeling`) | **자유텍스트(주) + 분위기칩**(조용한/활기찬/로맨틱/새로운 등) + 예산·시간(보조) | 감정/분위기 표현 중심 |
| 가볍게 (`light`) | **최소 입력.** `budget=low`·`distance=near` 고정, 시간만 짧게 1택 | 즉시 생성 지향 |

분위기칩 → `FeelingInput.mood` 매핑 규칙은 구현 계획에서 확정.

### D. 프롬프트 차별화 (lib/ai.ts)

- `pick_for_me` emphasis 신설: 입력 조건에 충실하고 무난하며 실패 확률 낮은 후보 우선.
- `feeling` emphasis 신설: 러프한 분위기/감정을 감성적인 데이트 카드로 구체화. 자유텍스트의 뉘앙스 반영 강조.
- `light` emphasis: 기존 저예산/근거리/짧은 시간 지침 유지(키만 정합).
- 한글/영문(`_EN`) 동시 반영.

### E. 라우팅 버그 (mode.tsx)

`soft_message` push 경로를 `/share/soft-message` → `/(tabs)/soft-message`로 수정. 가능하면 `as any` 캐스팅 제거하여 타입 안전성 확보.

### F. 테스트 전략 (TDD)

UI 컴포넌트 테스트는 비용이 크므로 **순수 로직 우선**으로 RED→GREEN을 돌린다.

1. `buildPrompt(input, mode)` 가 mode별로 올바른 `MODE_CONTEXT`/`MODE_EMPHASIS`를 포함하는지 검증 (A·D 버그를 잡는 핵심 테스트).
   - `pick_for_me`/`feeling`/`light`/`make_course` 각각에 대해 기대 문구 포함 확인.
   - 매핑 정합 전에는 실패(RED), 정합 후 통과(GREEN).
2. mode별 `FeelingInput` 빌더 헬퍼의 출력 검증 (예: `light` 빌더가 `budget=low`, `distance=near` 고정 산출).

## 영향 파일

- `lib/ai.ts` — mode 키 정합, emphasis 신설 (A, D)
- `app/(tabs)/mode.tsx` — 라우팅 분기, soft_message 경로 수정 (B, E)
- `app/mode-flow/feeling.tsx` — 느낌 전용으로 재구성 (B, C)
- `app/mode-flow/pick.tsx` (신규) — 조건칩 폼 (B, C)
- `app/mode-flow/light.tsx` (신규) — 최소 입력 폼 (B, C)
- `lib/modeForm.ts` (신규) — mode별 `FeelingInput` 빌더 헬퍼
- 테스트 파일 (신규) — `buildPrompt`/빌더 단위 테스트 (F)

## 비목표 (YAGNI)

- 신규 모드 추가
- course/bucketlist/soft-message 화면 재작성
- 폼 스키마 데이터드리븐 추상화
