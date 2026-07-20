# 수동 장소 지정 — Phase 2 (화면① 입력 핀) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:test-driven-development`. RED→GREEN→REFACTOR per task.

**Goal:** 코스 입력 화면(`course.tsx` / `CourseStepEditor`)에서 각 스텝을 카테고리 대신 **사용자가 직접 검색해 고른 실제 카카오 장소로 지정(핀)**할 수 있게 한다. 첫 생성 시 여러 스텝을 동시에 핀 가능. 저장물은 AI 코스와 동일한 `make_course` 카드.

**설계 문서:** `docs/superpowers/specs/2026-07-20-manual-place-pick-design.md` (§3 화면①-B)
**선행:** Phase 0·1 완료(브랜치 `feat/manual-place-pick`). place-search 화면·`lib/place-pick-bridge.ts`·pipeline `replacement.pickedName` 주입이 이미 존재 → **재사용/일반화**.

## 확정된 제품 결정 (2026-07-20, 사용자)
1. **전량 지정 시 AI(Haiku) 건너뛰기** → 생성 22원→0원. 모든 스텝이 핀이면 결정론 경로(`buildDeterministicCandidateCourse`)로 카드 조립(문구 포함), Haiku 미호출.
2. **지정이 카테고리를 이김** → 핀 스텝은 카테고리 정합 게이트를 우회. 사용자가 고른 장소가 그 스텝을 그대로 정의.

## 핵심 아키텍처
- **핀 = 첫 생성 시점의 예정 장소.** 재추천의 locked step과 구조 동일 → 핸들러가 핀 스텝을 forced candidateId로 고정, AI는 **비핀 스텝만** 선택.
- **세 경우:**
  - 전량 핀 → AI 스킵, 전 스텝 forced selection으로 `buildCandidateOnlyCourse` 직접 조립.
  - 부분 핀 → 프롬프트가 핀 스텝을 "고정"으로 표시 + 핀 후보를 AI 선택 풀에서 제외, AI가 비핀만 선택 → forced와 병합.
  - 핀 0 → 현행 그대로(무회귀).
- **핀 실재 검증:** client 좌표 불신. `pinnedName` 시드로 카카오 재검색해 `pinnedKakaoPlaceId` 매칭 doc을 서버가 확인(Phase 1과 동일). 못 잡으면 신규 422 `STEP_PIN_UNAVAILABLE`.
- **필드 매핑:** place-search 응답 `placeId/x/y` → 도메인 `kakaoPlaceId/longitude/latitude`.

파일 맵:
- Modify: `shared/recommendation/contracts.ts` — `CourseStepInput`에 `pinnedKakaoPlaceId?`,`pinnedName?`
- Modify: `shared/recommendation/schemas.ts` — `courseStepInputSchema` 확장 + 교차검증(핀 id ↔ 핀 name 동반)
- Modify: `shared/recommendation/errors.ts` + zod enum + `lib/recommend-date.ts` client + `locales/*.json` — `STEP_PIN_UNAVAILABLE`
- Modify: `lib/course-draft.ts` — `CourseDraftStep.pin`, 액션 `setStepPin`/`clearStepPin`, `buildStructuredCourseInput` 매핑
- Modify: `supabase/functions/_shared/recommendation-search-pipeline.ts` — per-step 핀 재검색 병합(replacement 블록 일반화)
- Modify: `supabase/functions/_shared/recommend-date-handler.ts` — 핀 forcing/게이트 우회/전량 스킵
- Modify: `supabase/functions/_shared/recommendation-prompt.ts` — 부분 핀 시 핀 스텝 고정 표기
- Create: `components/recommendation/course-step-editor.tsx` 확장(세그먼트+핀 행)
- Modify: `app/mode-flow/course.tsx` — 핀 브리지 구독(스텝 타깃) + place-search 진입
- Modify: `locales/ko.json`,`locales/en.json`

---

## Phase 2A — 계약/스키마/드래프트 (클라 데이터 계층)

### Task 2A.1: `CourseStepInput` 핀 필드 + 스키마 교차검증 (RED→GREEN)
- Test: `shared/recommendation/__tests__/schemas.test.ts`
  - `pinnedKakaoPlaceId`+`pinnedName` 동반 시 accept.
  - `pinnedKakaoPlaceId`만(name 없이) → reject(교차검증).
  - 핀 없는 기존 스텝 → accept(무회귀).
- `contracts.ts` `CourseStepInput`에 `pinnedKakaoPlaceId?: string; pinnedName?: string;`.
- `schemas.ts` `courseStepInputSchema`에 두 필드(`boundedText`) + `.superRefine`(id 있으면 name 필수). `.strict()` 유지.
- Verify: 대상 jest + `npm run validate`.

### Task 2A.2: 드래프트 핀 상태 + 매핑 (RED→GREEN)
- Test: `__tests__/course-draft.test.ts`(또는 기존 위치)
  - `setStepPin` → 스텝에 pin 저장, 카테고리 무관.
  - `clearStepPin` → pin 제거.
  - `buildStructuredCourseInput`: pin 있는 스텝 → `pinnedKakaoPlaceId/pinnedName` 포함, 없는 스텝 → 미포함.
- `CourseDraftStep`에 `pin?: { kakaoPlaceId: string; name: string; address: string }`.
- 액션 `{ type:'setStepPin'; stepId; pin }`, `{ type:'clearStepPin'; stepId }`. reducer 처리.
- `buildStructuredCourseInput`의 step 매핑에 pin 조건부 spread. label은 핀 스텝이면 `pin.name` 사용(표시용).
- Verify: 대상 jest + `npm run validate`.

---

## Phase 2B — 서버(핀 주입·forcing·프롬프트)

### Task 2B.1: 파이프라인 per-step 핀 재검색 병합 (RED→GREEN)
- Test: `supabase/functions/_shared/__tests__/recommendation-search-pipeline.test.ts`(Phase 1 패턴)
  - `courseSteps` 중 `pinnedKakaoPlaceId` 있는 스텝들에 대해, 초기 풀에 없으면 각 `pinnedName` 재검색 → 매칭 doc 병합.
  - 이미 풀에 있으면 재검색 생략.
- `recommendation-search-pipeline.ts`: 기존 `replacement.pickedName` 블록을 **핀 리스트 루프로 일반화**(replacement도 하나의 핀으로 취급). dedup 병합.
- Verify: 대상 jest.

### Task 2B.2: 핸들러 핀 forcing + 게이트 우회 + 전량 스킵 (RED→GREEN)
- Test: `supabase/functions/_shared/__tests__/recommend-date-handler*.test.ts`
  - 전량 핀: `generateSelection` mock이 **호출되지 않음**(AI 스킵) + 응답 스텝 kakaoPlaceId가 지정과 일치.
  - 부분 핀: 핀 스텝은 지정 place, 비핀 스텝은 AI 선택. `generateSelection` 1회 호출.
  - 핀 카테고리 불일치(식사 슬롯에 카페): 그래도 성공(지정이 이김).
  - 핀 재검색 실패(풀에 없음): 422 `STEP_PIN_UNAVAILABLE`.
  - 핀 0: 현행 경로 무회귀.
- 핸들러 변경(160~233 영역):
  - `search` 직후: `pinnedSteps = courseSteps.filter(s=>s.pinnedKakaoPlaceId)`. 각각 `search.candidates`에서 kakaoPlaceId 매칭 → `forcedByStepId`. 하나라도 없으면 `errorResult(422,'STEP_PIN_UNAVAILABLE')`.
  - `hasEveryRequiredCategory` + required-intent 게이트: **핀 스텝 제외**하고 검사.
  - `built` 분기 앞에 핀 처리 추가:
    - 전량 핀(`pinnedSteps.length === courseSteps.length` && `!replacement`): AI 미호출, `buildCandidateOnlyCourse({selection: 전 스텝 forced})`.
    - 부분 핀: `generateSelection` 호출하되 프롬프트에 핀 표기(2B.3), AI 반환 selection에서 핀 스텝 candidateId를 forced로 **덮어씀** → `buildCandidateOnlyCourse`. AI가 핀 place를 비핀 슬롯에 골랐으면 dedup 검증이 fallback 유발(허용).
  - **카테고리 우회:** 핀 스텝은 `candidateMatchesCategory` 검사 대상에서 제외(pin wins). `buildCandidateOnlyCourse` 내 카테고리 검증이 있으면 핀 스텝 스킵 인자 추가(또는 핀 스텝 category를 forced place의 실제 category로 치환해 통과).
- Verify: 대상 jest + `npm run validate` + `deno check`.

### Task 2B.3: 프롬프트 핀 스텝 고정 표기 (RED→GREEN)
- Test: `supabase/functions/_shared/__tests__/recommendation-prompt.test.ts`
  - 핀 스텝이 있으면 프롬프트에 "이 스텝은 고정, 선택하지 말 것" 지시 + 핀 place가 다른 슬롯 후보로 제시되지 않음.
- `recommendation-prompt.ts`: `resolvedStepIntents`/locked 블록과 동일 톤으로 pinned step 고정 지시 추가. 프롬프트 버전 bump(`recommend-date-v5-pinned` 등) — 캐시/로그 추적용.
- Verify: 대상 jest.

### Task 2B.4: `STEP_PIN_UNAVAILABLE` 에러코드 대칭
- `contracts.ts`(union) + `errors.ts`(ko/en 메시지, retry 정책) + zod enum + `lib/recommend-date.ts` client 파싱 + `locales/ko.json`·`en.json`. `STEP_INTENT_UNSATISFIED` 패턴 미러.
- Test: 기존 error 대칭 테스트에 케이스 추가.

---

## Phase 2C — 클라이언트 UI (화면①)

### Task 2C.1: 핀 브리지 스텝 타깃 (RED→GREEN)
- Phase 1 `lib/place-pick-bridge.ts`는 단일 pub/sub. course 화면은 **활성 타깃 스텝**으로 라우팅(course-result의 `replacementTargetId` 패턴 재사용) — 브리지 자체 변경 최소, 구독 측에서 타깃 판정. 필요시 `publishPickedPlace`에 optional `targetId` 추가.
- Test: 타깃 라우팅 계약(있으면).

### Task 2C.2: `CourseStepEditor` 세그먼트 + 핀 행 (RED→GREEN + ss-gate)
- Test: `__tests__/course-step-editor.test.tsx`
  - 세그먼트 [카테고리|직접 지정] 렌더, 토글 시 카테고리 칩/핀 진입 행 전환.
  - 핀 지정 상태: 장소명+주소(중립 텍스트) + "지우기" 표시, `clearStepPin` 호출.
  - 상호배타: 핀 지정 시 카테고리 비활성/무시.
- `course-step-editor.tsx`: 스텝 헤더 아래 세그먼트 토글(중립 스타일, **색뱃지·이모지 금지**, lucide만). "직접 지정" 탭 → "장소 검색" 진입 행 → course.tsx가 place-search로 push. 지정 완료면 name+address 중립 텍스트 + 지우기 텍스트 버튼.
- **디자인 규칙 [[design-no-emoji-no-color-badge]] 준수.** 기존 `category`/`stepAction` 스타일 톤 재사용.
- Verify: jest + `npm run validate` + `/ss-score` ≥80 + `styleseed-design-review`.

### Task 2C.3: course.tsx 배선 + i18n
- `course.tsx`: 활성 핀 타깃 스텝 state, "직접 지정" 진입 시 스텝 좌표(draft.location)·category로 `/mode-flow/place-search` push, `subscribePickedPlace` 구독 → `dispatch({type:'setStepPin', stepId, pin})`.
- i18n `course.steps.pin.*`(ko/en 동시): 세그먼트 라벨, 검색 진입, 지우기, 안내.
- Verify: `npm run validate` + 전체 jest.

---

## Phase 2D — 통합 검증·배포
- 전체 `npx jest` + `npm run validate` + `git diff --check`.
- 종합 리뷰(서브에이전트) — CONFIRMED 반영.
- **배포(승인 후):** `recommend-date` 재배포(shared 프롬프트/핸들러/파이프라인 변경). `generate-ai` 무변경(핀은 프롬프트 조립만 바뀜, action 불변). DB 마이그레이션 없음(요청 스키마만 확장, nullable).
- 실기기 확인 항목: 입력 화면 세그먼트·핀 지정·전량 핀 0원 생성·부분 핀 AI 병합·핀 실재 실패 안내.

## 리스크
- **부분 핀 + AI 중복:** AI가 핀 place를 비핀 슬롯에 고를 수 있음 → dedup 검증이 fallback 유발. 프롬프트에서 핀 후보 제외(2B.3)로 완화, 실패 시 결정론 폴백이 안전망.
- **핀 카테고리 우회의 코스 정합:** 지정이 이기므로 route/walking 검증은 실제 좌표 기반으로 그대로 수행(문제 없음). 다만 사용자가 엉뚱한 지역 장소를 핀하면 도보 초과 → 완화/경고는 기존 relaxedConstraints로 노출.
- **place id 단건조회 부재:** 이름 재검색이 흔한 이름에서 대상 doc 못 잡을 수 있음(Phase 1 스파이크로 keyword 검색 surface 확인됨). 실패 시 `STEP_PIN_UNAVAILABLE` 명확 안내.

## Self-Review
- 스펙 화면① 커버(2C). 서버 다중 핀(2B). 계약/드래프트(2A). 에러(2B.4). ✅
- 확정 결정 2건 반영: 전량 핀 AI 스킵(2B.2), 지정이 카테고리 이김(2B.2 카테고리 우회). ✅
- 무회귀: 핀 0 경로 명시 테스트(2B.2), 기존 스텝 스키마 accept(2A.1). ✅
