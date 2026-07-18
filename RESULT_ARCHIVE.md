# RESULT_ARCHIVE.md

현재 세션보다 오래된 작업 기록을 누적합니다.
최신 기록은 `RESULT.md`를 참조하세요.

---

## 2026-07-16 세션 AR — "이 스텝 교체" 저장 실패 최종 해결 (독립 버그 2개: locked 에코 + candidateId 충돌)

> 세션 AQ 수정 후에도 실기기에서 교체만 계속 "코스 변경을 저장하지 못했어요"로 실패. 추정 금지 — Postgres 로그 + attestation + DB 스텝 상태 교차 대조로 두 개의 독립 버그를 순차 확정. 사용자 실기기 검증으로 성공 확인 완료.

### 근본 원인 (증거 기반)

1. **locked 플래그 불일치**: `replaceWithCandidate`는 대상 외 모든 스텝을 lockedSteps(핀)로 보내는데, Edge(`recommendation-course-selection.ts`)가 응답 스텝 `locked`를 **핀 멤버십**으로 마킹(`locks.has`) → 사용자가 잠그지 않은 스텝이 응답에 `locked=true`로 나가고, RPC replace 분기의 비대상 스텝 검증(`locked is not distinct from DB locked`)이 거부. 실패 6건 전부 응답 true vs DB false. 유일한 성공 1건(12:50:09 UTC)은 그 순간 해당 스텝이 실제 잠금 상태였음(12:50:17 단독 unlock update가 물증).
2. **candidateId 임시번호 충돌**: ① 수정 후 드러난 두 번째 버그. RPC의 "교체면 실제로 바뀌어야 함" 검사(`v_original_candidate is not distinct from 새 candidateId`)가 검색 1회 한정 임시번호로 비교 → 검색마다 `candidate_001`부터 재부여라 DB `candidate_001` vs 새 응답 `candidate_001` 충돌(장소는 10120120→1164970460으로 실제 다름에도 거부). 2스텝 코스 첫 스텝 교체는 거의 항상 재현.

### 수정

| 대상 | 내용 |
|---|---|
| `supabase/functions/_shared/recommendation-course-selection.ts` | 응답 `locked`를 핀 멤버십 대신 핀의 `locked` 필드(사용자 실제 잠금 상태) 에코로 변경(`pinnedLockedFlag`, 필드 없으면 true 하위호환). `recommend-date` v9 배포 |
| `shared/recommendation/schemas.ts` | 클라이언트/Edge 공용 `validateRecommendDateResponseForRequest`도 같은 기준으로 변경(멤버십 → `lock.locked !== false`). **클라이언트 포함이라 Xcode 재빌드 필요했음(완료)** |
| `supabase/migrations/20260716050000_replace_compare_stable_place_id.sql` | RPC replace 분기의 변경 여부 검사를 `kakaoPlaceId`(안정 ID) 비교로 교체. linked Supabase 적용·history 기록 완료 |
| 테스트 | 핀-비잠금 에코 3건(`recommend-date-course-selection`, `recommendationSessionPhase9`) + 레거시 기본값 1건 + 마이그레이션 검증 2건(`replaceStablePlaceIdMigration`) 추가 |

### 검증

- 전체 74 suites / 626 tests, `npm run validate`(tsc), `git diff --check` 통과.
- **라이브 재현**: 실기기에서 실패한 바로 그 mutation(attestation `req_27fc256b`)을 소유자 JWT 클레임 트랜잭션으로 재실행 → 성공 확인 후 롤백. 수정 전 `constraint_violation` → 수정 후 통과로 인과 확정.
- 사용자 실기기에서 "이 스텝 교체 → 후보 선택 → 변경" 성공 확인.

### 다음 세션

- **스텝 추가 간헐 실패**(같은 뿌리): `addVerifiedStep`이 잠긴 스텝만 핀 → 잠기지 않은 기존 스텝이 재검색에서 드리프트하면 RPC add 분기 거부(12:49:14 UTC 실패 기록). 이번 locked 에코 수정으로 이제 전체 스텝 핀 전송이 가능해짐 — 클라이언트 1줄 수정으로 해결 가능.
- `generate-ai` 매 호출 502 원인 조사(Anthropic API 키/모델 추정, 결정론 폴백이 가려서 사용자 비노출).
- 방문 확인 트리거(피드백 재도입), 장소 실사진 백로그 유지.

---

## 2026-07-16 세션 AQ — 잠금/재추천/교체 "저장 실패" 정밀 규명 + 교체 candidateId 버그 수정

> 사용자가 스텝 잠금·이 스텝 교체·잠금 외 재추천이 모두 "코스 변경을 저장하지 못했어요"로 실패한다고 보고. 추정 금지 요구 → Postgres 로그 + attestation `request_json`/`response_json` + 라이브 RPC 트랜잭션 재현으로 원인을 바이트 단위로 확정.

### 근본 원인 (증거 기반)

- **잠금·잠금 외 재추천** = 마이그레이션 창 문제(이미 해소). `20260716102041_latest_request_drop_locked_steps`가 살아있던 동안 `apply_recommendation_session_mutation`이 `current_course.steps[].locked=true`를 반환하면서 `latest_request.lockedSteps`는 지운 페이로드를 돌려줬다. 클라이언트 `validateRecommendDateResponseForRequest`(`schemas.ts:354`, `responseStep.locked !== Boolean(lock)`)가 예외 → `mapRecommendationSessionPayload` throw → 화면 catch → "저장 실패". 잠금은 DB에 남지만 스냅샷 미갱신 → 직후 재추천이 `lockedSteps` 없이 나가 RPC가 `locked`로 거부(같은 뿌리의 2차 증상). `20260716104504_restore_full_locked_steps`(10:45 UTC 적용)로 이미 복구됨 — 라이브 RPC를 트랜잭션 롤백으로 재현해 `latest_request`에 `lockedSteps`가 포함되고 course/lock 플래그가 일치함을 확인.
- **이 스텝 교체** = 실제 잔존 클라이언트 버그. `candidateId`는 카카오 검색 1회 한정 임시번호. `loadReplacementCandidates`는 replacement-candidates 엣지의 **자체 검색** 번호를 화면에 주는데, `replaceWithCandidate`가 `requestRecommendationResponse(request)`의 **반환값을 버리고**(recommend-date의 별개 검색이 새로 부여한 번호가 attestation에 저장됨) 화면에 있던 옛 번호를 `mutate`에 넘겼다. RPC replace 분기는 `candidateId+kakaoPlaceId`로 응답 스텝을 조회 → 불일치 → `invalid_candidate`(Postgres 로그 21:19:51, REST 400 확인). `add` 경로는 이미 응답에서 `added.candidateId`를 꺼내 써서 정상이었음.

### 수정 (클라이언트 전용 — Edge/RPC/마이그레이션 무변경)

| 파일 | 내용 |
|---|---|
| `app/mode-flow/course-result.tsx` | `replaceWithCandidate`가 `requestRecommendationResponse` 응답에서 `stepId+kakaoPlaceId`로 교체된 스텝을 찾아 그 `candidateId`를 `mutate`에 사용(없으면 throw). 이제 안 쓰이는 `candidateId` 파라미터를 시그니처·호출부에서 제거 — `add` 패턴과 일치 |
| `__tests__/course-result-screen.test.tsx` | 회귀 테스트: 교체 mutate가 후보 목록의 임시 id가 아니라 recommend-date 응답의 `candidateId`를 보내는지 검증 |

### 검증

`npx jest` 73 suites/620 tests, `npm run validate`(tsc), `git diff --check` 모두 통과. 배포 대상 없음(클라이언트 전용) — 실기기 재빌드 후 육안 재확인 필요.

---

## 2026-07-16 세션 AP — 코스 결과 화면 실기기 QA 보정 + 잠금/재추천 핵심 버그 수정

> 세션 AO 배포 직후 사용자가 실기기 스크린샷 3장으로 UI 문제 4건 + "잠금 외 재추천"/"이 단계 교체" 저장 실패를 재현·보고. Edge Function/Postgres 로그로 원인을 규명하고 TDD로 수정·재배포까지 완료.

### 변경 사항 요약

| 파일 | 수정 내용 |
|---|---|
| `app/mode-flow/course-result.tsx` | 가로 스크롤 고정폭(164) 카드 스트립 → **세로 스택 리스트**로 전환(번호 뱃지 + 카테고리 아이콘 + 잠금 표시 + 카드 사이 커넥터 라인, `components/ui.tsx`의 `CourseStepList` 시각 언어 재사용). 화면 전체(헤더+타임라인+교체 패널)를 세로 `ScrollView`로 감싸 콘텐츠가 길어져도 스크롤 가능하게 수정 — 기존엔 감싸는 스크롤이 없어 후보가 많으면 화면 아래로 잘렸음. 확정/재추천 버튼 행은 스크롤 밖(항상 고정 노출)에 유지. `lockedSteps` 생성부(`regenerateUnlocked`/`replaceWithCandidate`/`addVerifiedStep`)를 `toLockedStep()` 헬퍼로 통합하고 장소 사실 필드를 추가 |
| `locales/ko.json`, `locales/en.json` | `courseResult.confirm`("이 코스로 확정하기"→"코스 확정"), `regenerate`("잠금 외 다시 추천"→"잠금 외 재추천"/"Regenerate unlocked"→"Regenerate") 축약 — 3버튼 푸터에서 확정 버튼 텍스트가 줄바꿈되며 화면 밖으로 밀리던 문제 해결 |
| `shared/recommendation/contracts.ts`, `shared/recommendation/schemas.ts` | `LockedCourseStepInput`/`lockedCourseStepInputSchema`에 `name/address/roadAddress/mapUrl/latitude/longitude` 필드 추가(필수) |
| `supabase/functions/_shared/recommendation-course-selection.ts` | **핵심 버그 수정**: `buildCandidateOnlyCourse`/`buildDeterministicCandidateCourse`가 잠긴(유지) 스텝을 그 호출의 신규 검색 후보 풀에서 `candidateId`로 재조회하던 로직 제거. 신규 `candidateFromLock()`이 lock 자체가 들고 온 장소 사실로 후보를 직접 구성 — 검색 재현 여부와 무관하게 항상 성공 |
| 테스트 갱신 | `recommend-date-course-selection.test.ts`에 회귀 테스트 2건(오래된 candidateId가 새 검색 풀에 없어도 lock 사실로 해석 성공 — `buildCandidateOnlyCourse`/`buildDeterministicCandidateCourse` 각각), 기존 lock 픽스처 갱신(`recommendationContracts`, `recommendationSessionPhase9`, `recommend-date-client`, `recommend-date-server`), `course-result-screen.test.tsx`에 세로 레이아웃/스크롤 분리/버튼 텍스트 길이 테스트 3건 추가 |

### 근본 원인 분석

- **"잠금 외 재추천"/"이 단계 교체" 저장 실패(422, 사용자가 실기기에서 재현)**: `candidateId`는 카카오 검색 **호출 1회 한정**으로만 유효한 임시 번호(`recommendation-ranking.ts`가 매 검색마다 `candidate_001`부터 재부여)인데, 잠근(유지하는) 스텝은 클라이언트가 예전 `candidateId`를 그대로 서버에 보내고, 서버는 **이번** 검색 결과에서 그 ID를 찾으려다 실패 → `COURSE_VALIDATION_FAILED`. 코스가 2단계 이상이고 아무 스텝이나 부분 교체/재추천할 때마다 사실상 거의 항상 재현되는 구조적 버그였다(이번 세션 변경과 무관, 사전 존재).
- **DB RPC는 무관함을 확인**: `apply_recommendation_session_mutation`(`20260715090000_editable_recommendation_sessions.sql`)의 잠금 검증은 클라이언트 lock을 DB에 이미 저장된 안정적인 `current_candidate_id`/`current_kakao_place_id`와만 비교하며, Edge가 스테이징한 attestation을 그대로 신뢰한다 — 버그는 순수하게 Edge Function(`recommendation-course-selection.ts`)의 후보 재조회 로직에만 있었다. RPC/마이그레이션 변경 불필요.
- **`generate-ai`가 매 호출 502를 반환하는 별도 현상 발견(이번 세션 변경과 무관, 이전부터 존재)**: Edge Function 로그 확인 결과 이번 배포 이전부터 계속 502였다. `recommend-date`가 이 실패를 잡아 결정론 폴백으로 넘어가므로 사용자에게 노출되진 않지만, Haiku 큐레이션/AI 선택 기능은 사실상 계속 죽어있는 상태다. 원인 미확인(Anthropic API 키/모델 추정) — 별도 세션에서 조사 필요.

### 검증

```bash
npx jest --silent   # 71 suites / 611 tests
npm run validate
git diff --check
```

모두 통과.

### 배포 (완료, 2026-07-16)

- `recommend-date` v6을 `supabase functions deploy recommend-date --project-ref wqjguifsmtblgrhdfnji` CLI로 배포(잠금 해석 로직이 `_shared/recommendation-course-selection.ts`에 있어 이 함수만 재배포하면 충분 — `recommend-date-handler.ts`의 `replacement` 분기는 무변경으로 자동 수혜).
- `mcp__..__list_edge_functions`로 `recommend-date`(v6) `ACTIVE` 확인.

### 다음 세션

- 실기기에서 잠금 외 재추천 / 이 단계 교체 / 세로 리스트·스크롤 정상 동작 육안 재확인.
- `generate-ai` 502 원인 조사(Anthropic API 키/모델 확인) — Haiku 이용 기능(추천 선택, 교체 후보 큐레이션) 전체가 현재 결정론 폴백으로만 동작 중.
- 세션 AO에서 남긴 백로그(방문 확인 트리거, 장소 실사진) 유지.

---

## 2026-07-16 세션 AO — 코스 결과 화면(course-result.tsx) UX 재설계 (구현+배포 완료, 후속 QA는 세션 AP 참조)

> 계획 전문: `/Users/jeongwonkim/.claude/plans/zazzy-pondering-heron.md` (2026-07-16 승인). TDD로 백엔드→프론트엔드 순서로 전체 실행.

### 변경 사항 요약

| 파일 | 수정 내용 |
|---|---|
| `supabase/functions/replacement-candidates/index.ts` | `courseSteps`를 대상 스텝 하나만으로 구성해 카카오 검색을 단일 카테고리로 전환. 결정론 랭킹 이후 `invokeGenerateAiSelection`(action `replacement_select`)으로 Haiku 큐레이션을 시도하고, 실패/malformed/무효 ID면 기존 top3+additional12 결정론 순서로 폴백 |
| `shared/recommendation/replacement-candidates.ts` | `rankReplacementCandidates`가 최대 30개 `pool`도 함께 반환(top/additional은 기존과 동일). `selectCuratedReplacementCandidates(pool, rawSelection)` 신규 — 검증된 candidateId만 최대 10개로 재구성, 실패 시 `null` |
| `supabase/functions/_shared/recommendation-prompt.ts` | `buildReplacementSelectionPrompt` + `REPLACEMENT_SELECT_PROMPT_VERSION`("replacement-select-v1") 신규 — 대상 스텝 1개 기준 최대 10개 candidateId 정렬 요청 |
| `supabase/functions/_shared/recommend-date-downstream.ts` | `invokeGenerateAiSelection`이 `action` 옵션을 받도록 일반화(기본값 `recommend_date_select`, 하위호환 유지) |
| `supabase/functions/generate-ai/index.ts` | `replacement_select` 액션 추가(`REPLACEMENT_SELECT_SCHEMA`: candidateIds 1~10개, maxTokens 256, temperature 0, logged true). usage envelope 생략 분기에 포함 |
| `supabase/migrations/20260716010000_ai_recommendation_logs_add_replacement_select_action.sql` | `ai_recommendation_logs_action_check`에 `replacement_select` 추가(신규, 미적용) |
| `lib/course-draft.ts` | `CATEGORY_ICONS`/`getCourseCategoryIcon()`를 `course-step-editor.tsx`에서 이곳으로 이동 — 카테고리 문자열에 아이콘 매핑이 없으면 `Sparkles` 폴백 |
| `components/recommendation/course-step-editor.tsx` | 이동된 `CATEGORY_ICONS` import로 교체, 중복 정의 제거 |
| `components/recommendation/step-action-sheet.tsx` (신규) | `PickerSheet` Modal 구조를 참고한 즉시-실행 액션시트. 잠금/잠금해제, 이 단계 교체(잠금 시 비활성), 삭제(2단계 이하 또는 잠금 시 비활성 + 레이블 전환) |
| `app/mode-flow/course-result.tsx` | AI 재설계 이전 잔재였던 `cards[]` 기반 하단 전체화면 페이저·dots·카드별 Send/Save를 통째로 제거. 상단 타임라인 카드는 탭하면 `StepActionSheet`가 뜨도록 변경(잠금/이동 아이콘 3개 + 텍스트 버튼 2개로 인한 텍스트 오버플로우 해소), 카테고리 아이콘 추가. 교체 후보 패널에 닫기 버튼·빈 상태 문구·패널 근접 에러 표시 추가. "데이트 후 피드백" 패널(상태·태그 UI) 완전 제거, 같은 confirmed 조건 자리에 Send/Save를 재배치. 부제 문구를 "밀어서 후보 3개를 비교해보세요"에서 실제 동작에 맞게 교체 |
| `locales/ko.json`, `locales/en.json` | `courseResult.sub` 문구 교체, `lock`/`unlock`/`replacementClose`/`replacementEmpty` 추가, `feedbackTitle`/`feedbackNotice`/`leaveFeedback`/`visited`/`notVisited`/`feedbackTags.*` 제거 |
| `jest.config.js` | `lib/supabase` 모듈 매퍼 정규식을 `../lib/supabase`(1단계)만 매칭하던 것에서 `(../)*lib/supabase`(임의 깊이)로 확장 — `app/mode-flow/*.tsx`처럼 2단계 이상 깊이에서 직접 `../../lib/supabase`를 import하는 화면의 렌더 테스트가 이번 세션 이전에는 전혀 불가능했음(실제 Supabase 클라이언트가 로드되며 누락된 env 변수 에러로 즉시 crash) |
| 신규 테스트 다수 | `replacementCandidates.test.ts`(pool/큐레이션 재구성), `replacementSelectionPrompt.test.ts`, `generate-ai-replacement-selection.test.ts`, `replacementSelectActionMigration.test.ts`, `course-draft-category-icons.test.ts`, `step-action-sheet.test.tsx`, `course-result-screen.test.tsx`(신규 — 이 화면의 첫 렌더 테스트) |

### 기술 결정

- **후보 0개 버그의 근본 원인**: 카카오 40개 캡이 코스 전체 카테고리가 공유하는 풀이라(`rankPlaceCandidates`), 다카테고리 코스에서 대상 카테고리에 대표 1개(=현재 장소)만 남는 경우가 흔했다. `replacement-candidates/index.ts`의 `courseSteps` 구성을 대상 스텝 하나로 좁혀 카카오 검색 자체를 그 카테고리 전용으로 만들어 근본 해결했다.
- **Haiku 큐레이션은 결정론 랭킹을 대체하지 않고 재배열만 한다**: `rankReplacementCandidates`가 만드는 pool(최대 30개)을 그대로 프롬프트에 노출하고, AI는 검증된 `candidateId`만 골라 순서를 정할 뿐 새 사실을 생성하지 않는다. AI 호출은 자체 try/catch로 감싸 실패해도 바깥쪽 `PLACE_SEARCH_TIMEOUT` 처리로 새지 않고 항상 결정론 폴백으로 이어지게 했다 — 이 경계를 놓치면 AI 큐레이션 실패가 카카오 검색 실패로 오분류될 뻔했다.
- **로그 액션 체크 제약 전례 반복 방지**: 과거 세션(2026-07-16 AM)에서 `recommend_date_select` 누락으로 로그 insert가 전부 실패했던 사고를 `replacement_select`에서도 반복하지 않도록, 같은 커밋에서 마이그레이션과 액션 추가를 함께 처리했다.
- **화면 재설계는 상태 축소보다 통합**: `cards`/`resolveDisplaySteps`/`page`/`saving 관련 pager 상태를 제거하면서도 `handleSave`/`handleSendToPartner`/`saving`/`saved`/`errorMsg`는 그대로 재사용해 confirmed 전용 액션 행으로 옮겼다 — 로직 중복 없이 위치만 이동.
- **`recommendationSessionPhase9.test.ts`의 기존 wiring 테스트 갱신**: `course-replace-step`/`course-delete-step` testID는 액션시트로 흡수되며 더 이상 실제 UI 요소가 아니게 됐다. 옛 assertion을 지우는 대신 새 실제 동작(`course-step-card-${stepId}` 탭, 액션시트의 `onReplace`/`onDelete` 핸들러 소스)을 검증하도록 의도적으로 갱신했다.
- **jest 모듈 매퍼 확장은 인프라 버그 픽스**: 기존 정규식이 1단계 상대경로(`../lib/supabase`)만 매칭해 `app/mode-flow/*.tsx`처럼 2단계 깊이 화면은 렌더 테스트 시 실제 Supabase 클라이언트가 로드되어 즉시 crash했다. 이번 세션에서 처음으로 `course-result.tsx` 렌더 테스트를 작성하며 발견해 정규식을 임의 깊이로 일반화했다 — 프로덕션 동작에는 영향 없음(테스트 전용 매퍼).

### 검증

```bash
npx jest --silent
npm run validate
git diff --check
```

전체 71 suites / 606 tests, `npm run validate`(`tsc --noEmit`), `git diff --check` 모두 통과.

### 배포 (완료, 2026-07-16)

- `20260716010000_ai_recommendation_logs_add_replacement_select_action.sql`을 linked Supabase(`wqjguifsmtblgrhdfnji`)에 `apply_migration`으로 적용.
- `generate-ai` v16을 MCP `deploy_edge_function`으로 배포 성공(단일 파일이라 정상 동작).
- `replacement-candidates`는 MCP `deploy_edge_function`으로 2회 시도했으나 둘 다 `InternalServerErrorException`으로 실패 — 이 함수는 `shared/recommendation/*`·`_shared/*` 12개 파일에 걸친 다단계 상대경로 의존성을 가지는데, 과거 세션 노트(2026-07-08 "인라인 Edge 배포 이스케이프" ratchet)에서도 `\d` 등 백슬래시가 포함된 정규식 소스가 MCP 배포 경로에서 문제를 일으킨 전례가 있었다. `supabase/functions/_shared/recommendation-intent.ts`에 백슬래시 정규식이 많아 같은 계열 문제로 추정된다. **`supabase functions deploy replacement-candidates --project-ref wqjguifsmtblgrhdfnji` CLI로 전환해 배포 성공**(v2, ACTIVE) — CLI는 디스크에서 직접 12개 파일을 업로드하므로 이스케이프 문제 자체가 없다.
- `mcp__..__list_edge_functions`로 `generate-ai`(v16)·`replacement-candidates`(v2) 모두 `ACTIVE` 확인.
- **ratchet 추가**: MCP `deploy_edge_function`은 백슬래시 정규식이 포함된 다중 파일(3개 이상 또는 `_shared`처럼 정규식이 많은 파일 포함) 배포에서 내부 오류로 실패할 수 있다 — 이런 함수는 처음부터 `supabase functions deploy <name> --project-ref <ref>` CLI를 우선 사용한다.

### 다음 세션

- 실기기/시뮬레이터 육안 확인(중복 표시 없음, 액션시트 동작, 교체 후보 실제 노출, 텍스트 오버플로우 없음, 카테고리 아이콘, confirmed 상태에서 Send/Save만 노출) 아직 수행하지 않음 — 다음 세션 시작 시 우선 진행.
- 방문 확인 트리거(피드백 재도입) 설계는 다음다음 세션 백로그로 유지(`record_recommendation_place_feedback` RPC/DB는 이번 세션에서 손대지 않음).
- 장소 실사진 연동은 별도 세션(이번 범위는 카테고리 아이콘까지만).

---

## 2026-07-16 세션 AN — 코스 입력 화면(course.tsx) UI 개선 + 슬라이더 재설계

### 배경

사용자가 시뮬레이터 스크린샷 6장(코스 입력 화면 3장 + 코스 결과 화면 3장)을 제시. 이번 세션은 **입력 화면(`course.tsx`)만** 범위로 확정하고, 결과 화면(`course-result.tsx`)은 다음 세션으로 미뤘다.

### 변경 사항 요약

| 파일 | 수정 내용 |
|---|---|
| `app/mode-flow/course.tsx` | "단계 추가" 버튼을 마지막 스텝 카드 아래로 이동. 헤더 타이틀/서브타이틀 제거(핑크 라벨만 유지). AI 동의 체크박스 완전 제거(서버측 무조건 동의 기록 RPC는 그대로 유지). "전체 시간"(3버킷)·"2인 총예산"(TextInput)을 드래그 슬라이더로 교체 — 예산 0~100,000원/1,000원 단위, 시간 0~24시간/1시간 단위. 추가요청 placeholder 문구 변경 |
| `components/recommendation/course-step-editor.tsx` | 카테고리 7개 버튼을 텍스트 pill → lucide 아이콘 + 작은 캡션으로 변경 |
| `components/recommendation/location-selector.tsx` | "내 위치 사용 중" 행과 검색창 GPS 버튼 아이콘을 `MapPin`/`LocateFixed` → `Navigation`으로 통일 |
| `components/recommendation/step-slider.tsx` (신규) | 재사용 가능한 드래그 슬라이더. 새 npm 의존성 없이 RN 내장 `PanResponder`+`Animated`로 구현 |
| `lib/slider-math.ts` (신규) | 슬라이더 순수 수학 유틸 — snap/fraction 변환, 가로 드래그 판별(`isHorizontalDrag`) |
| `locales/ko.json`, `locales/en.json` | `course.aiConsent`/`title`/`subtitle`/`duration.options.*`/`budget.placeholder` 제거. `course.unselected`/`budget.amount`/`duration.hoursLabel`/`accessibility.duration` 추가. 추가요청 placeholder 문구 변경 |
| 신규/수정 테스트 다수 | `slider-math`, `step-slider`, `course-step-editor`, `location-selector`, `course-screen`, `course-ui-scope` |

### 기술 결정

- **AI 동의 체크박스 제거**: 원래 실행 Phase 13의 법적 요구사항으로 추가된 UI였다. 사용자에게 컴플라이언스 리스크를 명시적으로 설명했고, 사용자는 "완전히 제거"를 선택했다. `lib/recommend-date.ts`의 `record_ai_data_processing_consent` RPC는 이 UI 상태와 무관하게 매 요청마다 무조건 실행되므로, 실제 서버측 동의 기록 자체는 계속 남는다 — 화면의 체크박스 UI와 클라이언트 게이팅 로직만 제거했다.
- **슬라이더 실기기 버그 2건을 순차 발견·수정**:
  1. 트랙 전체가 터치를 즉시 점유해 슬라이더 위에서 시작한 세로 스크롤을 가로챔 → 손잡이 근처에서 시작한 터치만 즉시 드래그를 시작하고, 그 외 지점은 명확히 가로 방향인 드래그일 때만 반응하도록(`SwipeableCard`와 동일한 idiom) 재설계.
  2. **진짜 핵심 버그**: `useRef(PanResponder.create({...})).current`로 감싸면 `useRef`의 초기값이 최초 렌더링(레이아웃 측정 전, `usableWidth=0`) 시점에만 평가되고 이후 버려져, 모든 콜백이 그 시점 값에 영원히 고정됐다. 반대로 `useRef` 없이 매 렌더링마다 새로 만들면(리렌더는 `onChange`가 호출될 때마다 발생) PanResponder **내부**의 제스처 누적 거리 추적 상태(`gestureState`)까지 매번 초기화되어, 드래그 중간에 계속 리셋되며 "쭉 끌어야 다음 구간으로 넘어가고 자꾸 기본값으로 돌아오는" 증상으로 나타났다. 해결: PanResponder는 `useRef`로 **한 번만** 생성(내부 `gestureState`가 드래그 끝까지 유지됨)하고, 콜백들은 매 렌더링마다 갱신되는 `latest.current` ref를 통해 최신 `value`/`min`/`max`/`step`/`usableWidth`/`onChange`를 읽는 "latest ref" 패턴으로 전환했다.
- **예산/시간 슬라이더 재설계**: 사용자가 "구간이 있어서 다음 구간으로 넘기기 힘들다"고 재현 확인 후, 예산은 1,000원 단위(100단계, 사실상 연속형)로, 시간은 기존 3개 고정 버킷 대신 0~24시간·1시간 단위 연속형으로 바꿨다. `duration` 필드는 서버(`recommend-date`)에서 `boundedText(80)` 자유 텍스트로만 쓰이고 엄격한 enum 파싱이 없음을 `supabase/functions/_shared/recommendation-prompt.ts`에서 확인해, 스키마/서버 변경 없이 클라이언트만 안전하게 바꿨다.

### 검증

```bash
npm run validate
npx jest
```

전체 65 suites / 571 tests, `npm run validate` 통과. 사용자가 시뮬레이터에서 스크롤과 슬라이더 드래그가 함께 정상 동작함을 직접 확인했다.

### 다음 세션

- 코스 결과 화면(`app/mode-flow/course-result.tsx`, `components/ui.tsx`의 `CourseStepList`/`StepCard`) UX 재검토 — 이번 세션과 동일하게 스크린샷 기반으로 구체적 지적사항을 받아 진행한다.

---

## 2026-07-16 세션 AM — AI 코스 생성 에러 3건 근본 원인 수정

### 변경 사항 요약

| 파일 | 수정 내용 |
|---|---|
| `lib/recommend-date.ts` | `isPreparedRequestExpiredError()` 추가 — `RecommendationSessionCacheError('missing_prepared_request')`를 식별 |
| `app/mode-flow/generating.tsx` | 캐시 미스를 전용 문구로 분기, "다시 시도하기" 버튼 숨김(같은 requestId 재실패 방지), "조건 다시 편집하기"만 노출 |
| `locales/ko.json`, `locales/en.json` | `modeFlow.generating.courseExpired` 문구 추가 |
| `supabase/migrations/20260715152131_ai_recommendation_logs_add_recommend_date_action.sql` | `ai_recommendation_logs_action_check`에 `recommend_date_select` 추가 (linked 적용) |
| `supabase/migrations/20260716000100_get_recommendation_session_float_precision.sql` | `get_recommendation_session(text)`에 `set extra_float_digits = 3` 적용 (linked 적용) — **실제 사용자 보고 에러의 근본 원인 수정** |
| `__tests__/recommend-date-expired-request.test.ts`, `__tests__/aiRecommendationLogsActionMigration.test.ts`, `__tests__/getRecommendationSessionFloatPrecisionMigration.test.ts` | 신규 테스트 |

### 기술 결정

- 사용자가 실기기(Xcode 빌드)에서 "코스를 만드는 중 문제가 생겼어요"를 간헐적으로 겪는다고 보고. systematic-debugging으로 3단계에 걸쳐 원인을 좁혔다.
- 1차 수정(캐시 미스 분류)은 실재하는 버그였지만, 사용자가 재현한 실제 사례는 아니었다 — Supabase 로그 확인 결과 서버는 매번 200/201로 완전히 성공했고, 클라이언트가 성공 응답을 받은 뒤에 던지고 있었다.
- `execute_sql`로 실제 세션의 `current_course`(jsonb) vs `recommendation_course_steps`(double precision 컬럼) 좌표를 직접 대조해 진짜 원인을 확정했다: linked DB의 `extra_float_digits=0` 설정 때문에 double precision → JSON 직렬화 시 유효자리 15자리로 반올림되어, jsonb 원본과 미세하게 달라지는 케이스가 있었다. 이걸 클라이언트의 row-vs-course 무결성 검증(`mapRecommendationSessionPayload`, 보안 하드닝 목적)이 위조로 오인해 거부했다.
- `get_recommendation_session`이 `persist`/`hydrate`/`mutate` 세 경로 모두의 최종 반환점이라 이 함수 하나에만 `SET extra_float_digits = 3`을 걸어 전역 DB 설정을 건드리지 않고 해결했다.
- 이 malformed 케이스는 서버 INSERT 자체는 이미 성공한 상태라, "다시 시도하기"를 누르면 세션이 이미 존재해 `get_recommendation_session`을 재호출하는 경로를 타므로 DB 픽스만으로 재시도가 성공하게 된다 — 별도 client 분기는 추가하지 않았다.

### 검증

```bash
npx jest --runInBand
npm run validate
git diff --check
```

전체 Jest 61 suites/544 tests, `npm run validate`, `git diff --check` 모두 통과. 사용자가 Xcode에서 재빌드해 실기기로 정상 동작을 직접 확인했다.

### 다음 세션

- 실행 Phase 14(출시 준비) 또는 코스 결과 화면 UX 재검토 중 사용자가 지정하는 쪽으로 진행.
- UX 재검토 시: `course-result.tsx` 스크린샷 기반 구체적 개선점 확인 + 장소 사진 표시 기능(데이터 소스 결정 필요, §4.5) brainstorming부터 시작.
- 이번 세션과 무관하게 세션 시작 시점부터 있던 codex발 미커밋 변경(recommend-date 진단 instrumentation, eval 스크립트 등)은 그대로 두었다 — 커밋 여부는 사용자 확인 필요.

---

## 2026-07-14 세션 AL — AI 추천 재설계 실행 Phase 2: 안정 ID/저장 기반

### 변경 사항 요약

| 파일 | 수정 내용 |
|---|---|
| `lib/course.ts`, `lib/ai.ts`, `lib/recommendation.ts` | candidate-backed 카드/코스 step에 `candidateId`·`kakaoPlaceId` 보존. `collectPlaceIds()`의 장소명 역매칭 제거 |
| `lib/recommendationIdentity.ts` | `expo-crypto.randomUUID()` 기반 request ID, 카드 identity attach, nullable DB camelCase↔snake_case dual-read/write 경계 추가 |
| `app/mode-flow/generating.tsx` | 최초 candidate session과 재추천 결과의 session ID를 카드에 연결 |
| `app/mode-flow/result.tsx`, `course-result.tsx`, `card/[id].tsx`, `card/new.tsx`, `(tabs)/candidates.tsx` | 현재 6개 AI `date_cards` insert에 request/session/Kakao identity dual-write. manual insert는 기존 동작 유지 |
| `supabase/migrations/20260714000000_add_recommendation_identity_to_date_cards.sql` | `recommendation_request_id`, `recommendation_session_id`, `kakao_place_id` nullable text 컬럼과 comment 추가 |
| `docs/supabase-schema.sql` | 모바일 `date_cards`가 없는 설치에서도 안전한 `to_regclass` guarded identity extension 기록 |
| `package.json`, `package-lock.json` | Expo SDK 54 공식 secure UUID API용 `expo-crypto@~15.0.9` 추가 |
| identity 관련 신규 테스트 5개 | stable place identity, request/session boundary, 실제 generation 경로, 6 AI/1 manual insert wiring, migration contract 검증 |

### 기술 결정

- request ID는 React Native에서 보장되지 않는 Web Crypto/`Math.random` fallback 대신 Expo SDK 54 공식 `expo-crypto.randomUUID()`를 사용한다.
- `DateCard`/`CourseStep`의 새 ID 필드와 DB 세 컬럼은 optional/nullable이다. 구 카드에는 ID를 이름으로 추론하거나 backfill하지 않는다.
- 단일 장소의 stable ID는 `date_cards.kakao_place_id`, 코스 장소의 stable ID는 `steps[].kakaoPlaceId`에 보존한다.
- 정규화된 `recommendation_sessions`/`recommendation_course_steps` 테이블과 ID-only route 전환은 실행 Phase 8까지 도입하지 않는다.

### DB 적용

- linked project `wqjguifsmtblgrhdfnji`에 Phase 2 migration 파일 하나만 Supabase CLI의 `db query --linked --file`로 직접 적용했다.
- 원격 introspection 결과 세 컬럼 모두 `text`, `is_nullable = YES`이고 comment가 일치한다.
- 직접 SQL 적용 후 migration history `20260714000000`을 `applied`로 기록해 local/remote가 일치함을 확인했다.
- 기존 로컬/원격 migration history의 과거 불일치는 수정하지 않았다. `db push` dry-run은 이 불일치 때문에 안전하게 중단됐고, 과거 migration을 일괄 적용하지 않았다.

### TDD / 리뷰

- 모든 동작 변경은 focused RED→GREEN으로 진행했다.
- 최종 리뷰에서 generation/insert wiring 테스트 공백을 발견해 실제 free/fallback/candidate/regeneration 경로와 6 AI/1 manual insert 계약을 추가했다.
- attachment/write 라인을 가역적으로 제거하는 mutation RED에서 테스트 실패를 확인한 뒤 복원했다.
- 서브태스크 3개와 Phase 전체 리뷰에서 최종 Critical/Important/Minor finding 0건, `Ready` 판정을 받았다.

### 검증

```bash
npm test -- --runInBand
npm run validate
git diff --check
npx supabase db query --linked "select ... from information_schema.columns ..."
npx supabase migration list --linked
```

모두 통과. 전체 Jest: 28 suites, 222 tests. `npm run validate`와 `git diff --check`도 통과.

### 다음 세션

실행 Phase 3 승인 후 `make_course` 위치 autocomplete 수직 슬라이스만 진행한다.

---

## 2026-07-14 세션 AK — AI 추천 재설계 실행 Phase 1: 공용 계약

### 변경 사항 요약

| 파일 | 수정 내용 |
|---|---|
| `package.json`, `package-lock.json` | 런타임 Zod schema 검증용 `zod` 추가 |
| `shared/recommendation/contracts.ts` | `RecommendationRequest`, hard/soft constraints, 위치, 코스 결과, typed error의 공용 TypeScript 계약 추가 |
| `shared/recommendation/schemas.ts` | request 직렬화/역직렬화와 course 단계 수·중복 step/candidate/Kakao place ID 검증 Zod schema 추가 |
| `shared/recommendation/errors.ts` | 11개 오류 코드의 ko/en 안내문, 재시도 가능 여부, 조건 수정 필요 여부 추가 |
| `__tests__/recommendationContracts.test.ts` | ko/en 직렬화, 2~4 단계 제약, 중복 ID 거부, 오류 메타데이터 테스트 7개 추가 |

### 기술 결정

- 새 계약은 `shared/recommendation/`에만 두고 기존 `FeelingInput`, `lib/ai.ts`, Supabase schema/Edge Function과 연결하지 않았다. 따라서 이번 단계는 런타임 동작을 바꾸지 않는다.
- `course` 요청은 2~4 단계, `single_place`는 1 단계로 제한한다. 최종 course 응답은 stable `candidateId`와 `kakaoPlaceId` 중복을 모두 거부한다.
- 자유 텍스트는 `additionalRequest`/soft preference로 계약화했으며, 구조화된 location·course steps·예산·도보 한도·제외 조건은 hard constraints로 유지한다.

### 검증

```bash
npx jest __tests__/recommendationContracts.test.ts --runInBand
npx jest --runInBand
npm run validate
git diff --check
```

모두 통과. 전체 Jest: 23 suites, 203 tests. DB migration·Edge 배포는 없음.

### 다음 세션

실행 Phase 2만 진행: `kakaoPlaceId`, request/session ID의 end-to-end 타입과 nullable DB 확장, 기존 카드 dual-read 경계 확정.

---

## 2026-07-09 세션 AJ — 코스 steps ordered anchors + 동선 compactness

### 변경 사항 요약

| 파일 | 수정 내용 |
|------|----------|
| `lib/intent.ts` | `extractCourseAnchors()` 추가. `카페갔다가 삼겹살 먹고 이후에 술집을 가고 싶어` → `courseAnchors: ["카페","삼겹살","술집"]`. 조사(`을/를` 등) 정리 보강. 복합 anchor는 `searchQueries` 앞쪽에 함께 포함 |
| `lib/courseRoute.ts` (신규) | Haversine 직선거리 기반 route compactness 유틸. anchor별 후보 bucket을 만들고 `origin → anchor1 → anchor2 → ...` 총 이동거리가 짧은 조합을 후보 목록 맨 앞에 배치 |
| `lib/ai.ts` | `place-search` `_meta.origin`을 받아 course 후보 정렬에 전달. 후보 생성 전에 `orderCandidatesForCourseRoute()` 적용 |
| `supabase/functions/place-search/index.ts` | adaptive/legacy 응답 `_meta.origin` 추가. **place-search 재배포 완료** |
| `lib/recommendation.ts` | `buildCourseSelectPrompt()`에 ordered anchors + 동선 compactness 지침 추가. `assembleCourseCards()`에서 ordered anchors 순서를 어긴 place step을 필터링 |
| `__tests__/intent.test.ts` | 복합 steps anchor 추출/순서/검색 쿼리 테스트 추가 |
| `__tests__/courseRoute.test.ts` (신규) | 거리 계산, route distance, 가까운 조합 우선 테스트 |
| `__tests__/recommendation.test.ts` | ordered anchors prompt 및 후처리 순서 필터 테스트 |

### 기술 결정

- 동선 판단은 Haiku에 맡기지 않고 앱이 후보 좌표로 먼저 정렬한다.
- 정확한 도보 길찾기는 아직 미도입. 이번 단계는 Kakao 좌표 기반 직선거리 근사로 왕복/되돌아가기 낭비를 줄인다.
- 우선순위는 `사용자 anchor 순서 충족 > 동선 compactness > 후보 score`.
- anchor별 후보가 모두 있을 때만 route 조합 정렬을 적용하고, 없으면 기존 후보 순서를 유지한다.

### 검증 / 배포

```bash
npm run validate
npx jest intent courseRoute recommendation --runInBand
npx jest --runInBand
supabase functions deploy place-search --project-ref wqjguifsmtblgrhdfnji
```

모두 통과. 전체 Jest: 22 suites, 196 tests. `place-search` 배포 성공.

---

## 2026-07-09 세션 AI — 추천 검색 원문 우선화 + 단일 anchor 코스 반복 방지

### 변경 사항 요약

| 파일 | 수정 내용 |
|------|----------|
| `lib/intent.ts` | `normalizeFreeTextQuery()` 추가. `searchQueries`를 raw freeText → cleaned query → rule/fallback 순서로 구성. `primaryQuery`/`normalizedQuery`/`singleAnchorQuery`/`allowRepeatedAnchor`를 `PlanIntent`에 추가해 새 키워드 regex 의존을 줄임 |
| `supabase/functions/place-search/index.ts` | Adaptive Retrieval task 순서 변경: keyword `queries` 먼저, `categoryCodes` 나중. 원문/cleaned 검색 결과가 broad 카테고리 fallback보다 먼저 merge되도록 수정. **place-search 재배포 완료** |
| `lib/candidate.ts` | primary/normalized query 매칭에 추가 가중치 부여. 예: `타코 먹고 싶어`의 `타코` 결과가 broad `카페` fallback보다 앞서도록 조정 |
| `lib/recommendation.ts` | `make_course` single-anchor 프롬프트 지침 추가. 사용자가 한 핵심 검색어만 준 경우 동일 유형 장소 여러 곳 투어 대신 핵심 장소 1곳 + 보조 단계로 구성. `assembleCourseCards()`에서 동일 anchor place step 반복 trim |
| `lib/ai.ts` | course 카드 조립 시 `intent` 전달 |
| `__tests__/intent.test.ts` | raw/cleaned query 순서, 막연한 입력 cleaned 생략, 임의 키워드 single-anchor, 투어/복합 코스 예외 테스트 추가 |
| `__tests__/candidate.test.ts` | 새 키워드 cleaned query가 broad 카페 fallback보다 높게 랭크되는 테스트 추가 |
| `__tests__/recommendation.test.ts` | single-anchor course prompt/trim 테스트 추가 |

### 기술 결정

- Haiku 선행 호출은 추가하지 않음. 추천 1회당 Claude 선택 호출 1회 원칙을 유지하고, 검색 전처리는 deterministic query expansion으로 해결.
- `카페`, `타코`, `클라이밍` 같은 고정 목록이 아니라 raw/cleaned query에서 나온 모든 단일 anchor에 공통 규칙 적용.
- `투어`, `탐방`, `여러 군데`, `2차` 등 반복 의도를 명시한 경우는 동일 유형 반복 금지 예외.
- `오늘 뭐할지 모르겠음`처럼 구체 anchor가 없는 입력은 raw query는 보존하되 cleaned query 없이 broad fallback을 사용.

### 검증 / 배포

```bash
npm run validate
npx jest intent candidate recommendation --runInBand
npx jest --runInBand
supabase functions deploy place-search --project-ref wqjguifsmtblgrhdfnji
```

모두 통과. `place-search` 배포 성공.

---

## 2026-07-08 세션 AH — 추천 로직 V2 전체 (Phase 4·5·2·6·7 완성 + Edge 2개 배포)

> 아래는 시간순: 먼저 Phase 4·5(V2-core)로 체크포인트 → 사용자가 "전체 진행" 선택 → Phase 2·6·7 이어서 완료.

### Phase 2·6·7 추가 변경 (체크포인트 이후)

| 파일 | 수정 내용 |
|------|----------|
| `supabase/functions/place-search/index.ts` | Adaptive Retrieval — `queries`/`categoryCodes` 오면 다중 키워드+카테고리 검색을 부분실패 허용(독립 catch)으로 돌리고 placeId dedup + min/max·요청예산·intent쿼리 early-stop + pagination + `_meta`. focus/기본 경로는 하위호환 유지. `COORD_RE`를 `[0-9]`/`[.]`로(백슬래시 제거 → 인라인 배포 JSON-safe). **place-search v5 배포됨** |
| `lib/place.ts` | `buildRetrievalPlan(intent)` — placeTypes→Kakao 코드, searchQueries→키워드. `RetrievalPlan` 타입 |
| `lib/ai.ts` | `searchPlaces`에 `retrieval?` 인자(있으면 adaptive body). candidate 플로우가 plan 전달. `regenerateDateCards(session)` 신규(Pool 재사용+previousPlaceIds 제외). `runCandidateFlow`가 usage/latency/fallbackCount 반환. 추천 3종 이벤트 로깅 |
| `lib/recommendationSession.ts` (신규) | 경량 module store — `createSession`/`getSession`/`addPreviousPlaceIds`/`clearSessions`. 카운터 기반 sessionId(결정론) |
| `lib/analytics.ts` | `EventName`에 `recommendation_generated/regenerated/fallback` 추가 |
| `app/mode-flow/generating.tsx` | 최초 추천 시 세션 생성, 재추천(sessionId 있음) 시 `regenerateDateCards`로 Pool 재사용 후 새 placeId 누적. 소진 시 fresh 폴백 |
| `app/mode-flow/result.tsx`·`course-result.tsx` | `sessionId` param 수신 + regenerate 시 전달 |
| `app/card/[id].tsx` | `handleGenerateAlt`가 `card.input_json` 기반 base + 조건분만 override → location/coords 보존(§15). input_json 없는 구 카드는 기존 하드코딩 폴백 |
| `__tests__/recommendationSession.test.ts` (신규) | 4개. `__tests__/place.test.ts` +3(buildRetrievalPlan) |

### 배포 / 검증 (전체)

- Edge `generate-ai` **v10**, `place-search` **v5** (둘 다 verify_jwt 유지). place-search 배포본 대조 결과 기능 동일(주석 1글자 몰문자만 존재, 무해).
- `npm run validate` 통과, `npx jest` **18 suites, 153 tests** 통과.

### ⚠️ 주의 (인라인 Edge 배포 이스케이프)

- MCP `deploy_edge_function`의 `content`는 JSON 문자열이라 소스에 백슬래시(정규식 `\d` 등)·이중따옴표가 있으면 이스케이프 오류/전사 실수 위험. place-search는 `\d`→`[0-9]`, `\.`→`[.]`로 바꿔 **백슬래시·이중따옴표 0개**로 만들고 배포함. (AGENTS.md ratchet 반영)

---

### (체크포인트 시점) Phase 4·5 — V2-core 완성 + Edge 배포

### 변경 사항 요약

| 파일 | 수정 내용 |
|------|----------|
| `lib/recommendationConfig.ts` (신규) | 중앙 Config (§19) — retrieval/ranking/claude 상수 |
| `lib/recommendation.ts` (신규) | Phase 4·5 순수 로직 — `resolveIntentMode`, `deterministicFields`(§11), `buildFeelingSelectPrompt`/`buildCourseSelectPrompt`(candidate_id 선택형, 속성 사실 단정 금지), `assembleFeelingCards`/`assembleCourseCards`(Validation+실장소 결합), `buildDeterministicFallback`(재호출 없음), `usedCandidateIds`/`collectPlaceIds` |
| `lib/course.ts` | `CourseStep`에 `place_name/place_address/map_url` optional 추가(하위호환) |
| `lib/ai.ts` | `generateDateCards` 재작성 — 위치+후보 있으면 candidate 플로우(Claude 선택→Validation→결정론 필드→실장소), 없으면 자유생성 유지(무회귀). `invokeAI` action 유니온 확장 + `_usage` 반환. soft-message 호출부 3개 `.data` 반영 |
| `supabase/functions/generate-ai/index.ts` | `feeling_select`/`course_select` 스키마 추가, `cards`에서 estimated 제거(앱이 채움), `_usage` 첨부. **Edge v10 배포됨(ACTIVE)** |
| `__tests__/recommendation.test.ts` (신규) | 23개 |
| `docs/superpowers/plans/2026-07-08-recommendation-v2-full.md` (신규) | V2 전체(4·5·2·6·7) 구현 계획 |

### 기술 결정

- **범위 결정(사용자 확정)**: V2 전체(4·5·2·6·7). 단, "4·5 먼저 끝내고 체크포인트" → 이번 세션은 Phase 4·5(V2-core)까지. Phase 2·6·7은 다음 진행.
- **위치 없음/후보 0개 → 현행 자유생성 유지**(§12 [Needs Decision]를 무회귀로 확정). candidate 플로우는 위치+후보 있을 때만.
- **estimated_time/budget은 모든 경로에서 앱이 결정론적으로 채운다**(§11). Claude 미생성. `DateCard` 타입·`date_cards` 컬럼·구 저장 카드 그대로 하위호환(§17). 자유생성 경로도 `deterministicFields`로 덮어씀.
- `pick_for_me`/`light`/`next_meet` 모드 코드 삭제는 범위 밖(§22 Q11). `resolveIntentMode`가 make_course만 course, 나머지는 feeling으로 매핑.
- `lib/intent.ts`·`lib/candidate.ts`(Phase 0·1·3 산물)를 이번에 파이프라인에 **배선 완료** — 더 이상 미사용 모듈 아님.

### 검증

```bash
npm run validate  # 통과 (tsc --noEmit)
npx jest           # 통과 (17 suites, 146 tests)
```

Edge `generate-ai` v9→v10 배포(verify_jwt 유지). 롤백은 이전 버전 재배포.

### 다음 세션 할 일 / 주의

1. **시뮬레이터 육안 검증(사용자 수동)**: EAS dev build로 ① 위치 입력 feeling ② make_course 코스 ③ 위치 없음 자유생성 3경로. candidate 플로우가 실제 장소를 붙이는지, estimated 필드가 플랜 범위값으로 통일 표시되는지 확인.
2. **Phase 2** Adaptive Retrieval (`place-search` 재설계+배포) → **Phase 6** Session/재추천 → **Phase 7** Observability. 계획서 Task 13~20.

---

## 2026-07-08 세션 AG — 추천 로직 V2 Phase 0·1·3

### 변경 사항 요약

| 파일 | 수정 내용 |
|------|----------|
| `supabase/functions/place-search/index.ts` | `KakaoDoc.id`·`Place.placeId` 추가, `toPlace()`가 `doc.id` 매핑. **Edge v4 배포됨.** |
| `lib/place.ts` | `KakaoPlace.placeId: string` 추가 |
| `lib/intent.ts` (신규) | `resolveIntent()` — mode+freeText+mood+budget+duration → `PlanIntent`. `INTENT_RULES`(기존 `detectPlaceFocus` 흡수), Query Expansion, make_course 다카테고리 비축소 |
| `lib/candidate.ts` (신규) | `buildCandidates()` — placeId dedup → Evidence scoring(§9 표) → ranking → `candidate_NNN` 부여 → `rankedCandidateLimit` 상한 |
| `__tests__/intent.test.ts` (신규) | 8개 |
| `__tests__/candidate.test.ts` (신규) | 7개 |
| `__tests__/place.test.ts` | KakaoPlace 리터럴에 `placeId` 추가 |

### 기술 결정 / 주의

- **미배선**: `lib/intent.ts`·`lib/candidate.ts`는 독립 모듈로 존재만 하고 `lib/ai.ts` 파이프라인에 아직 연결 안 됨. 소비는 Phase 4 몫. 현재 앱 런타임 동작 변화 없음(응답에 `placeId` 필드만 추가).
- Edge 미배포 상태에선 `placeId`가 `undefined`였을 것 → 이번에 v4 배포로 실제 반영.
- 세션 범위는 순수 로직(Phase 0·1·3)까지로 합의. Phase 4/5는 Claude 프롬프트+DB 하위호환+기기 검증이 얽혀 별도 세션.

### 검증

```bash
npm run validate  # 통과 (tsc --noEmit, 에러 0건)
npx jest           # 통과 (16 suites, 123 tests)
```

---

## 2026-07-08 세션 AF — 이메일 인증 제거 + 관련 DB 데이터 삭제

### 변경 사항 요약

| 파일 | 수정 내용 |
|------|----------|
| `app/(auth)/index.tsx` | 이메일 폼 전체 제거, 카카오/구글만 남김, 애플 버튼 렌더링 제거 |
| `app/account/change-password.tsx` | 삭제 |
| `app/settings.tsx` | 비밀번호 메뉴 제거 |
| `locales/ko.json`, `en.json` | 이메일 전용 auth 키 24개 + `account.changePassword` + `rowPassword` 제거 |

### DB 삭제 내역

Supabase 프로젝트(`wqjguifsmtblgrhdfnji`, Date-Navi)에서 이메일 provider 계정 2개(`doro.claudia@gmail.com`, `wjddnjs0419@naver.com`) 삭제. CASCADE로 연관 데이터(`date_planner_profiles` 2, `date_planner_couples` 2, `date_cards` 11, `reactions` 5, `soft_messages` 10, `notifications` 8, `user_preferences` 2, `date_memories` 1, `date_memory_comments` 1) 함께 삭제됨. 카카오 계정 1개만 정상 유지 확인.

### 기술 결정

- Apple Sign In capability는 무료 Apple ID(개인 팀)로는 Xcode에서 추가 자체가 불가능하며 유료 Apple Developer Program($99/년) 가입이 사실상 필수라는 사실을 확인함 — 이번 세션에서 애플 로그인 연결은 보류하고 이메일 인증 제거만 진행.

### 검증

```bash
npm run validate  # 통과 (tsc --noEmit, 에러 0건)
npx jest           # 통과 (13 suites, 101 tests) — googleAuth.test.ts, kakaoAuth.test.ts 포함 영향 없음 확인
```

`grep -rn "signInWithPassword\|auth.signUp\|change-password" app/ --include="*.tsx"` — 결과 없음 (잔여 참조 없음 확인).

iOS 시뮬레이터 육안 확인은 EAS dev build/시뮬레이터 환경이 없어 이번 세션에서 SKIPPED — 다음 사용자 세션에서 수동 확인 필요.

### 다음 세션 할 일

1. Apple Developer Program 가입 후 애플 로그인 연동 (`lib/appleAuth.ts`, `lib/appleAuthErrors.ts`, `expo-apple-authentication`, entitlements, Supabase Apple Provider 설정)

---

## 2026-07-07 세션 AE — 카카오 로그인 통합 + 온보딩 버그 수정 + Date Navi 리브랜딩

### 변경 사항 요약

| 파일 | 수정 내용 |
|------|----------|
| `package.json` | `@react-native-seoul/kakao-login` 추가 |
| `app.json` | 카카오 로그인 config plugin 추가(`kakaoAppKey`), `name`/`scheme`을 `DateMate`/`datemate` → `Date Navi`/`datenavi`로 변경 |
| `lib/kakaoAuth.ts`, `lib/kakaoAuthErrors.ts` | 신규 — `signInWithKakao()` (idToken → `supabase.auth.signInWithIdToken({provider:'kakao'})`), 에러 코드→i18n key 매핑. TDD로 에러 매핑 먼저 테스트 작성 후 구현 |
| `app/(auth)/index.tsx` | 카카오 버튼 placeholder → 실제 로그인 연결 + `logEvent('login',{method:'kakao'})`, 이메일 placeholder `datenavi.app`로 정리 |
| `lib/couple-invite.ts` | `isCoupleRowLinked()` 순수 함수 신규(TDD) — `status==='linked' && partner_user_id` 확인. 저장 키 `datemate.pendingInviteCode` → `datenavi.pendingInviteCode` |
| `lib/i18n.ts` | 저장 키 `datemate.language` → `datenavi.language` |
| `app/_layout.tsx` | 온보딩 라우팅 게이트 버그 수정 — `couple_id` 존재만으로 다음 단계 통과시키던 걸 `isCoupleRowLinked()`로 실제 연결 상태까지 확인하도록 변경 |
| `app/onboarding/nickname.tsx`, `photo.tsx`, `anniversary.tsx`, `type.tsx` | 각 단계 이동을 `router.replace()` → `router.push()`로 변경(뒤로가기 히스토리 보존). 닉네임 화면은 `BackBar`에 `onPress={() => router.replace('/(auth)')}` 지정 |
| `app/onboarding/couple-connect.tsx` | 딥링크 scheme `datemate` → `datenavi`. 미연결 상태에 "다른 계정으로 로그인하고 싶다면 로그아웃" 링크 추가. `BackBar` 뒤로가기 시(미연결 상태) `router.back()` 대신 안내 모달(`PickerSheet` 재사용, `centered`) 표시 |
| `components/pickers.tsx` | `PickerSheet`에 `centered?: boolean` prop 추가 — 하단 시트 대신 화면 중앙에 뜨는 모달 변형(기존 날짜/시간 피커 용도는 그대로 유지). 취소/확인 버튼도 50:50 flex로 정리 |
| `locales/ko.json`, `en.json` | 카카오 에러 메시지, 커플연결 로그아웃/뒤로가기 안내 문구 추가. `DateMate` 전체(앱 이름, 약관, 개인정보처리방침 포함) → `Date Navi`로 일괄 치환 |
| `__tests__/kakaoAuth.test.ts`, `coupleLink.test.ts` | 신규 |

### 버그 원인 분석

1. **카카오 로그인 "Unacceptable audience in id_token" 실패**: Supabase 공식 문서는 Kakao Provider Client ID를 REST API Key로 안내하지만, `@react-native-seoul/kakao-login`(네이티브 SDK)이 발급하는 idToken의 실제 `aud`는 Native App Key였다. Supabase Auth 로그(`get_logs` service:'auth')로 실측 확인 후 Client ID를 Native App Key로 교체해 해결.
2. **온보딩 중 뒤로가기 시 `GO_BACK not handled` 에러**: 각 단계 이동이 `router.replace()`라 뒤로가기 스택이 안 쌓임. `push()`로 전환.
3. **커플 연결 안 해도 온보딩 통과되는 버그**: `app/_layout.tsx` 라우팅 게이트가 `profile.couple_id` 존재 여부만 확인 — "코드 생성" 버튼만 눌러도 `couple_id`가 채워지므로(파트너 미연결·`status:'waiting'`이어도) 다음 단계로 진입 가능했음. 실제 연결 상태(`status==='linked' && partner_user_id`)까지 확인하도록 수정.
4. **커플연결(필수 단계) 화면에서 로그아웃/탈퇴 불가**: `settings.tsx`/`delete-account.tsx`는 온보딩 완료 후 `(tabs)`에서만 접근 가능해, 커플 연결을 못 하면 계정이 영구히 갇힘. 온보딩 중에도 로그아웃 가능한 경로 추가.

### 기술 결정

- 카카오 Native App Key는 `app.json` config plugin에 직접 값 명시(빌드 타임 네이티브 설정용, 구글 `iosUrlScheme`과 동일 패턴). 런타임에서 읽는 코드가 없어 `.env` 환경변수로 관리하지 않음.
- EAS 프로젝트 `slug`(`datemate-app`)는 리브랜딩 대상에서 제외 — `eas project:info` 실측 결과 로컬 `app.json`의 slug와 원격 등록 slug가 불일치하면 CLI 명령 자체가 실패함(`projectId`만으로는 불충분). expo.dev 대시보드에서도 slug 자체는 재변경 불가(Display name만 가능)라 원상 유지로 확정. 사용자에게 노출되지 않는 내부 식별자라 리스크 대비 이득이 없다고 판단.
- Android 카카오 로그인 플랫폼 등록은 보류 — iOS만 우선 검증.

### 검증

```bash
npm run validate  # 통과 (tsc --noEmit)
npx jest           # 통과 (11 suites, 89 tests)
```

EAS dev build(iOS 시뮬레이터) 2회 생성 — 카카오 로그인 실 기기 로그인 성공(Supabase Auth 로그로 `provider:'kakao', status:200` 확인), 리브랜딩 반영 빌드에서 `CFBundleDisplayName = "Date Navi"` 확인.

### 다음 세션 할 일 / 주의

1. Android 카카오 로그인 플랫폼 등록(패키지명 + 키 해시) 및 Android 빌드 검증
2. 애플 로그인 추가
3. 커플연결 화면의 새 "안내 모달" UX — 코드 반영·타입체크까지 확인, 사용자 최종 시뮬레이터 스크린샷 확인은 세션 종료 시점 기준 대기 중이었음

---

## 2026-07-05 세션 AD — 세션 AC 이후 미반영 화면 i18n 마무리

### 배경

Date Navi 기반 UI 전면 교체(uncommitted 작업)가 세션 AC의 i18n 작업 이전 버전 화면들을 새로 작성하면서, 홈/후보/추억/모드 탭 등 다수 화면이 다시 하드코딩 한국어로 돌아간 상태였다. 사용자가 "마이페이지 빼고 하나도 안 된 것 같다"고 보고해 재조사 후 처리.

### 변경 사항 요약

| 파일 | 수정 내용 |
|------|----------|
| `locales/ko.json`, `locales/en.json` | `home`, `candidates`, `memories`, `share.*`, `card.*`, `account.*`, `plans`, `mode.tabModes` 등에 신규 키 대량 추가 (기존 미사용 레거시 키는 건드리지 않고 신규 키로 추가) |
| `app/(tabs)/index.tsx`, `candidates.tsx`, `memories.tsx`, `mode.tsx` | 전체 하드코딩 한국어를 `useI18n().t()`로 교체 |
| `app/share/reaction.tsx`, `mutual.tsx`, `send.tsx` | 전체 i18n 처리. `send.tsx`는 `generateInviteMessage` 호출에 하드코딩 `'ko'` 대신 현재 언어 전달 |
| `app/card/new.tsx`, `edit/[id].tsx`, `[id].tsx`, `memory/new.tsx`, `memory/[id].tsx`, `memory/edit/[id].tsx`, `review.tsx` | 잔여 하드코딩 처리. AI 재생성 호출부(`card/new.tsx`, `card/[id].tsx`)도 언어 하드코딩 제거 |
| `app/account/edit-profile.tsx`, `delete-account.tsx`, `change-password.tsx`, `notifications.tsx` | 전체 i18n 처리 (신규 `account` 네임스페이스) |
| `app/plans/index.tsx` | 전체 i18n 처리 (신규 `plans` 네임스페이스) |
| `app/(tabs)/soft-message.tsx`, `app/soft-message/result.tsx` | 전체 i18n 처리 (신규 `softMessage.*` 키 추가). AI 호출(`generateSoftMessage`, `adjustSoftMessage`)도 언어 하드코딩 제거 |
| `app/onboarding/anniversary.tsx`, `connected.tsx`, `preferences.tsx`, `couple-connect.tsx` | 전체 i18n 처리 (신규 `onboarding.anniversary`, `onboarding.connected`, `onboarding.preferences` 추가, `couple-connect.tsx`는 Alert 제목 잔여분만) |
| `app/card/new.tsx`, `edit/[id].tsx` | "예상 시간" 입력을 드래그형 `DurationWheelPicker`에서 mode-flow 화면들과 동일한 `OptionCardPicker`(가로 배지 선택형, 공통 컴포넌트)로 교체 |
| `components/pickers.tsx` | 더 이상 쓰이지 않게 된 `DurationWheelPicker`와 관련 스타일 제거 |
| `components/ui.tsx` | `OptionCardPicker`가 옵션 5개 이상(줄바꿈 발생)일 때 두 번째 줄이 아래 콘텐츠와 겹치는 버그 수정 — `flexWrap` + `flex:1` 조합의 RN/Yoga 레이아웃 버그였음. `flexWrap` 대신 옵션을 행(기본 4열) 단위로 직접 나눠 렌더링하도록 변경 |
| `CLAUDE.md` | **i18n Sync** 원칙 추가 — 문구 추가/수정 시 `ko.json`/`en.json` 동시 갱신 의무화 |

### 기술 결정

- `candidates.tsx`의 필터 탭 상태(`FilterTab`)처럼 한국어 문자열을 state 값으로 직접 쓰던 곳은 안정적인 영문 키(`all`/`both`/`conditional`/`nextTime`/`bucket`)로 바꾸고 표시용 라벨만 `t()`로 분리 — 세션 AC가 mode-flow 화면에 적용한 패턴과 동일.
- `card/new.tsx`의 시간/예산 옵션, `account/edit-profile.tsx`의 계획 성향 옵션처럼 사용자가 고른 값이 DB에 그대로 저장되는 경우, `t()`로 만든 현재 언어의 문구를 저장하도록 했다 — 제목/설명 같은 사용자 작성 콘텐츠와 동일하게 "작성 시점 언어로 저장, 이후 번역 안 함" 원칙 적용.
- 기존 locale JSON에 남아있던 리디자인 이전 버전의 미사용 키(`candidates.title`, `candidates.tabs`, `mode.modes`, `softMessage.reasons`, `preferences.*` 등)는 삭제하지 않고 그대로 둔 채 신규 키를 추가했다 — 다른 곳에서 참조 중인지 확신이 서지 않는 키를 건드리지 않기 위함(`candidates.reactionLabels`는 실제로 `account/notifications.tsx`에서 사용 중임을 확인).
- 카드 등록 화면의 "예상 시간" 피커는 유저가 요청한 대로, 이미 `mode-flow/pick.tsx` 등에서 쓰던 `OptionCardPicker` 공통 컴포넌트로 교체해 앱 전체에서 이런 종류의 선택 UI가 하나로 통일되게 했다.

### 검증

```bash
npm run validate  # 통과 (tsc --noEmit)
```

`app/`, `components/` 전체를 재스캔해 시각적 한국어 하드코딩이 남아있지 않음을 확인함 (주석, `console.warn` 디버그 로그, `lib/prompt.ts`/`lib/ai.ts`/`lib/place.ts`의 AI 프롬프트 언어 분기, `components/pickers.tsx`의 기존 값 파싱 로직은 의도적으로 제외).

---

## 2026-07-05 세션 AC — 영어 지원 i18n 구조 정리

### 변경 사항 요약

| 파일 | 수정 내용 |
|------|----------|
| `package.json`, `package-lock.json` | `i18next`, `react-i18next` 추가. 기존 `expo-localization`, AsyncStorage와 함께 Expo Go 호환 i18n 구성 |
| `locales/ko.json`, `locales/en.json` | 기존 `lib/i18n.ts` 인라인 COPY를 JSON 번역 파일로 이관하고 신규 화면 문구 키 추가 |
| `lib/i18n.ts` | i18next 초기화, 기기 언어 감지, AsyncStorage `datemate.language` 저장값 우선 적용, `t()` 제공. 기존 `strings.*` 호출 호환 shim 유지 |
| `app/(auth)/index.tsx` | 시작/이메일 인증 화면 문구와 에러를 `t()` 키로 교체. 소셜 버튼 동적 inline style을 stylesheet variant로 정리 |
| `components/ui.tsx`, `components/pickers.tsx` | 위치 입력, 장소 링크, 날짜/시간 picker 문구 및 날짜 포맷을 현지화 |
| `app/mode-flow/*` 주요 화면 | pick/feeling/light/generating/result/course-result/bucketlist 화면의 visible shell copy를 `t()` 키로 교체. 옵션 state는 한국어 label 대신 stable value 사용 |
| `app/legal/terms.tsx`, `app/legal/privacy.tsx` | `language === "ko" ? ... : ...` 문서 분기를 제거하고 locale JSON 배열 렌더링으로 전환 |
| `app/onboarding/nickname.tsx`, `photo.tsx`, `type.tsx` | 온보딩 visible copy/alert/placeholder를 `t()` 키로 교체 |
| `app/settings.tsx`, `app/(tabs)/_layout.tsx`, `app/index.tsx`, `app/card/confirm.tsx`, `app/card/[id].tsx` | 탭 라벨, 설정 권한 Alert, splash copy, 확정 날짜 화면의 하드코딩 문구 일부 현지화 |
| `AGENTS.md` | JSON 리소스 배열 `.map()` 타입 추론 관련 Anti-Pattern 1줄 추가 |

### 기술 결정

- Expo 문서가 `expo-localization`과 `react-i18next` 같은 localization library 조합을 권장하고 Expo Go 포함을 명시하므로, 기존 커스텀 provider를 i18next 기반으로 교체했다.
- 기존 화면을 한 번에 전부 재작성하지 않도록 `useI18n()`은 `t()`와 기존 `strings.*`를 함께 제공한다.
- 최초 실행 감지는 `ko`/`en`만 지원하고 그 외 언어는 한국어 fallback으로 수정했다. 저장된 언어가 있으면 저장값이 항상 우선한다.
- 사용자 생성 콘텐츠, AI/API 결과 문자열, 프롬프트/파싱용 한국어, 주석/테스트 문자열은 번역 대상으로 보지 않았다.

### 남은 하드코딩

- `share/*`, `card/new|edit|memory/*`, `account/*`, `plans`, `tabs/home|candidates|memories`에 아직 일부 visible Korean copy가 남아 있다. 이번 세션에서는 핵심 i18n 구조와 주요 진입/모드/설정/법적 문서 흐름을 우선 처리했다.
- `lib/prompt.ts`, `lib/ai.ts`, `lib/place.ts`의 `language === 'en'` 분기는 AI 프롬프트와 장소 검색 지시문 생성용이라 유지했다.

### 검증

```bash
npm run validate  # 통과 (tsc --noEmit)
```

---

## 2026-07-05 세션 AB — 커플 연결 UX/관리 플로우 개선

### 변경 사항 요약

| 파일 | 수정 내용 |
|------|----------|
| `app/onboarding/couple-connect.tsx` | 연결 전/초대 대기/연결 완료 상태를 분리한 화면으로 재구성. 기존 `skipConnect()`와 "나중에 연결할게요" 버튼 제거 |
| `app/onboarding/couple-connect.tsx` | 기존 waiting 코드가 있으면 새 코드 생성 대신 `DN-` 코드와 공유 버튼을 즉시 표시 |
| `app/onboarding/couple-connect.tsx` | 연결 완료 상태에서 파트너 이름, 커플 기념일 수정, 커플 연결 해제 row 제공 |
| `app/onboarding/couple-connect.tsx` | `useLocalSearchParams`로 `?code=DN-XXXX` 딥링크 코드를 받아 입력칸에 자동 반영 |
| `app/_layout.tsx` | 앱 진입 URL의 invite code를 AsyncStorage에 보관해 로그인/가입 후 커플 연결 화면으로 전달 |
| `lib/couple-invite.ts` | 초대 코드 정규화, URL 파싱, pending invite storage key 공통 유틸 추가 |
| `app/settings.tsx` | 마이페이지 커플 연결 row 값을 raw code 대신 `미연결/초대 대기중/파트너명` 상태 표시로 변경 |
| `lib/i18n.ts` | 커플 연결/관리 플로우 ko/en 문구와 settings 커플 상태 문구 추가 |
| `supabase/migrations/20260705090000_disconnect_date_planner_couple.sql` | `disconnect_date_planner_couple()` RPC 추가. 양쪽 profile `couple_id`를 null 처리하고 couple row는 waiting으로 복귀 |
| `supabase/migrations/20260705091000_set_date_planner_couple_anniversary.sql` | 커플 기념일을 양쪽 profile에 함께 저장하는 `set_date_planner_couple_anniversary()` RPC 추가 |
| `docs/supabase-schema.sql` | 연결 해제 RPC 문서화 |
| `PLAN.md` | 승인 계획을 Done으로 정리하고 기존 보류 항목 보존 |

### 기술 결정

- 초대 공유는 Expo Router deep link + OS 공유 시트 기반으로 구현했다. 카카오톡은 별도 SDK 없이 공유 시트에서 선택하는 방식이다.
- 후속 수정: 개발 환경에서 `ExpoLinking.createURL()`이 `exp://...` 링크를 공유하는 문제를 막기 위해 `scheme: 'datemate'`를 명시했다. 공유 URL은 `datemate://onboarding/couple-connect?code=DN-XXXX` 형태가 된다.
- 후속 수정: 초대 코드 카드의 작은 `대기중` 뱃지는 카드 밖으로 삐져 보일 수 있어 제거했다. 대기 상태는 화면 제목/설명으로만 전달한다.
- 후속 수정: 딥링크로 앱이 바로 열리면 `app/index.tsx`가 마운트되지 않아 스플래시가 내려가지 않는 문제를 막기 위해 `_layout` 초기 라우팅의 `finally`에서 `SplashScreen.hideAsync()`를 호출한다. 앱 실행 중 링크 이벤트도 코드 저장 후 즉시 목적지로 라우팅한다.
- 후속 수정: 커플 기념일 저장이 본인 profile만 바꾸던 문제를 `set_date_planner_couple_anniversary()` RPC로 고쳐 양쪽 profile을 함께 업데이트한다. 마이페이지/커플 관리/추억 탭의 기념일 읽기 기준은 커플 owner 날짜 우선으로 맞췄고, 새 커플 연결 시에도 초기 기념일을 양쪽에 동기화한다.
- 커플 연결 해제는 RLS 한계 때문에 `security definer` RPC로 처리한다. 공유 카드/반응/추억은 삭제하지 않고 보존한다.
- 기존 솔로용 waiting row 생성은 제거했다. 앞으로 커플 연결 전에는 `profile.couple_id`를 만들지 않는다.

### 검증

```bash
npm run validate  # 통과 (tsc --noEmit)
```

### 다음 세션 할 일 / 주의

1. Supabase SQL Editor 또는 CLI로 `20260705090000_disconnect_date_planner_couple.sql`, `20260705091000_set_date_planner_couple_anniversary.sql` migration 적용 필요
2. 실기기에서 공유 시트 → 카카오톡 공유 → 링크 열기 → 코드 자동 입력 → 연결 완료 흐름 확인
3. 연결 해제 후 양쪽 계정의 마이페이지 상태가 `미연결`으로 바뀌는지 확인

---

## 2026-07-05 세션 AA — CTA 색상 통일 및 모드 하단 여백 조정

### 변경 사항 요약

| 파일 | 수정 내용 |
|------|----------|
| `app/(tabs)/index.tsx` | 메인 `데이트 후보 만들기` CTA를 그라디언트에서 `C.pink` 단색으로 변경해 모드 시작 버튼과 색상 통일 |
| `app/(tabs)/candidates.tsx` | `느낌 남기기` FAB의 그림자/elevation 효과 제거. 버튼 색상은 `C.pink` 유지 |
| `app/(tabs)/mode.tsx` | 하단 `이 모드로 시작하기` 버튼 영역의 위/아래 패딩과 스크롤 하단 spacer를 조정해 마지막 `다음에 만나면` 카드가 가리지 않도록 수정 |
| `app/(tabs)/mode.tsx` | 후속 수정 — footer의 `position: absolute`를 제거해 버튼이 카드 위를 덮지 않고 레이아웃 공간을 차지하도록 변경 |
| `app/(tabs)/mode.tsx` | 추가 후속 수정 — 하단 버튼을 ScrollView 내부의 마지막 요소로 이동해 `다음에 만나면` 카드와 버튼이 겹칠 수 없는 구조로 변경 |

### 검증

```bash
npm run validate  # 통과 (tsc --noEmit)
```

---

## 2026-07-05 세션 Z — 모드 시간 선택 카드형 UI 복원

### 변경 사항 요약

| 파일 | 수정 내용 |
|------|----------|
| `components/ui.tsx` | 가로 카드 선택용 `OptionCardPicker` 공통 컴포넌트 추가 |
| `app/mode-flow/pick.tsx` | 후보 만들기 시간 선택을 세로 wheel picker에서 카드 선택 UI로 변경 |
| `app/mode-flow/feeling.tsx` | 느낌 기반 후보 만들기 시간 선택을 카드 선택 UI로 변경 |
| `app/mode-flow/light.tsx` | 가벼운 후보 만들기 시간 선택을 카드 선택 UI로 변경 |
| `app/mode-flow/course.tsx` | 코스 만들기 시간 선택을 카드 선택 UI로 변경 |

### 기술 결정

- 카드/후보 직접 생성·수정 화면의 `DurationWheelPicker`는 유지하고, 모드 플로우의 후보 생성 시간 선택만 되돌렸다.
- 시간 선택 UI는 기존 버튼/카드 톤과 맞춰 `C.white`, `C.pinkLight`, `C.pinkBorder` 토큰을 사용한다.

### 검증

```bash
npm run validate  # 통과 (tsc --noEmit)
```

---

## 2026-07-05 세션 Y — 앱 배경 핑크/화이트 그라디언트 정리

### 변경 사항 요약

| 파일 | 수정 내용 |
|------|----------|
| `constants/colors.ts` | 기존 누런 배경 토큰을 연한 핑크/화이트 계열로 변경하고 `bgGradient`, `bgGradientStart`, `bgGradientEnd` 공통 토큰 추가 |
| `app/(tabs)/index.tsx` | 홈 화면 전체 배경을 공통 대각선 그라디언트로 적용. 상단 헤더 배너도 같은 토큰을 써 전체 배경과 통일 |
| `app/index.tsx` | 초기 스플래시 배경도 공통 그라디언트 토큰 사용으로 변경 |

### 기술 결정

- 색상 값은 화면 인라인 하드코딩 대신 `constants/colors.ts`의 디자인 토큰으로 관리한다.
- `C.bg`/`C.bgSplash`는 그라디언트를 쓸 수 없는 기존 `backgroundColor` 자리의 fallback으로 핑크 화이트 계열 단색을 유지한다.

### 검증

```bash
npm run validate  # 통과 (tsc --noEmit)
```

---

## 2026-07-05 세션 X — 사귄 날짜 수정 및 함께한 날 기준 통일

### 변경 사항 요약

| 파일 | 수정 내용 |
|------|----------|
| `app/settings.tsx` | 마이페이지 "상대방과 N일째" 기준을 `date_planner_profiles.anniversary_date`로 변경. 값이 없으면 기존 커플 연결일(`date_planner_couples.created_at`) fallback 사용 |
| `app/settings.tsx` | day badge를 터치 가능하게 변경하고, 누르면 `DateWheelPicker` sheet로 사귀기 시작한 날 수정 가능 |
| `app/settings.tsx` | picker 확정 시 `anniversary_date` 저장 후 day badge 값을 즉시 갱신 |
| `app/(tabs)/memories.tsx` | 우리 추억 상단 통계의 "함께한 날"을 추억 개수 대신 `anniversary_date` 기준 D-day로 변경. 추억 개수는 기존 헤더 문구에 유지 |

### 기술 결정

- 시작일의 단일 기준은 `date_planner_profiles.anniversary_date`로 둔다.
- 기존 사용자가 `anniversary_date`를 비워둔 경우에는 커플 연결일을 fallback으로 보여주고, 사용자가 수정하면 `anniversary_date`로 저장한다.
- 날짜 수정 UI는 이미 만든 `PickerSheet` + `DateWheelPicker`를 재사용했다.

### 검증

```bash
npm run validate  # 통과 (tsc --noEmit)
```

### 다음 세션 할 일 / 주의

1. 실기기에서 마이페이지 badge 탭 → 날짜 저장 → 마이페이지/우리 추억 D-day 반영 확인
2. 현재는 본인 profile의 `anniversary_date`만 수정한다. 커플 양쪽에 같은 값을 강제 동기화하려면 별도 DB/RLS 정책 설계 필요

---

## 2026-07-05 세션 W — 날짜/시간/소요시간 drag picker 전환

### 변경 사항 요약

| 파일 | 수정 내용 |
|------|----------|
| `components/pickers.tsx` | 신규 — `WheelPicker`, `PickerSheet`, `DateWheelPicker`, `TimeWheelPicker`, `DurationWheelPicker` 공용 컴포넌트 추가 |
| `app/card/confirm.tsx` | 확정 날짜/시간 텍스트 입력 → 하단 sheet 기반 날짜/시간 wheel picker로 교체. 장소/준비물은 자유 입력 유지 |
| `app/onboarding/anniversary.tsx` | 기념일 드롭다운 3개 → inline 년/월/일 wheel picker로 교체. 월별 일수 보정은 공용 picker에서 처리 |
| `app/mode-flow/pick.tsx`, `feeling.tsx`, `light.tsx`, `course.tsx` | 시간/소요시간 버튼 그룹 → drag wheel picker로 교체. 기존 `duration` value는 유지 |
| `app/card/new.tsx`, `app/card/edit/[id].tsx` | 예상 시간 선택/입력 → duration wheel picker로 교체. 수정 화면은 프리셋 밖 기존 값도 보존 |

### 후속 수정

- 실제 iOS 화면에서 picker 항목이 선택 범위와 겹쳐 보이는 문제 수정: wheel item 높이를 `42` → `58`로 확대하고 picker 텍스트 lineHeight/maxFontSizeMultiplier를 지정했다.
- wheel 항목을 직접 터치하면 해당 값으로 스크롤하며 선택되도록 `Pressable` 기반 터치 선택을 추가했다.
- 터치 선택 시 선택값 변경과 `scrollTo`가 동시에 실행되어 선택 행 주변이 떨리는 문제 수정: 터치 시 먼저 목표 위치로 이동하고, 짧은 지연 후 값을 확정하도록 순서를 변경했다.
- 드래그 종료 후 iOS 감속/스냅 타이밍 때문에 두 항목 사이에 멈추는 문제 수정: `onScroll`로 최신 offset을 추적하고, 드래그 종료 후 지연 snap을 2회 강제 적용한다.

### 기술 결정

- React Native `ScrollView`의 `snapToInterval` + `decelerationRate="fast"` 조합으로 wheel picker를 구현해 의존성 추가 없이 Expo SDK 54 범위 안에서 해결했다.
- 실제 DB 스키마는 변경하지 않고 기존 문자열 컬럼(`confirmed_date`, `confirmed_time`, `estimated_time`)을 유지했다.
- 확정 날짜는 새 picker 선택 시 `YYYY-MM-DD`로 저장하고, 읽기 화면에서는 `n월 d일 (요일)`로 표시한다.

### 검증

```bash
npm run validate  # 통과 (tsc --noEmit)
```

### 다음 세션 할 일 / 주의

1. 실기기/시뮬레이터에서 wheel 감속감, sheet 높이, 손가락 조작감을 확인
2. 영어 UI에서 날짜/시간 표시 문구까지 완전 현지화하려면 `formatDateLabel`/`TimeWheelPicker` locale 옵션 추가

---

## 2026-07-05 세션 V — AI 후보 생성 로딩 아이콘 pulse 애니메이션

### 변경 사항 요약

| 파일 | 수정 내용 |
|------|----------|
| `components/ui.tsx` | `GeneratingView` 중앙 Sparkles 아이콘을 `Animated.View`로 감싸 heartbeat/pulse scale 애니메이션 추가 |
| `components/ui.tsx` | 아이콘 뒤에 은은한 pink halo를 추가하고, pulse에 맞춰 halo opacity/scale이 함께 변하도록 구성 |
| `components/ui.tsx` | `AccessibilityInfo.isReduceMotionEnabled()` 및 `reduceMotionChanged` 구독 추가. reduce motion 환경에서는 정적 아이콘 상태 유지 |

### 기술 결정

- 생성 화면 공통 컴포넌트인 `GeneratingView`에 적용해 `pick/feeling/light/course` 생성 플로우가 모두 동일한 집중 애니메이션을 사용한다.
- `useNativeDriver: true`가 가능한 `transform: scale`과 `opacity`만 애니메이션해 로딩 중 프레임 부담을 낮췄다.
- `iconStage` 크기를 고정해 pulse 중에도 헤딩/체크리스트 레이아웃이 흔들리지 않게 했다.

### 검증

```bash
npm run validate  # 통과 (tsc --noEmit)
```

### 다음 세션 할 일 / 주의

1. 실기기 또는 Expo 시뮬레이터에서 생성 화면 진입 후 pulse 속도/강도 체감 확인
2. 너무 튄다고 느껴지면 scale 상한을 `1.08`에서 `1.05~1.06`으로 낮추기

---

## 2026-05-28 세션 U — 마이페이지 버그픽스 (커플연결·언어·닉네임)

### 변경 사항 요약

| 파일 | 수정 내용 |
|------|----------|
| `app/settings.tsx` | **커플 연결 row에 `onPress` 누락** → `/onboarding/couple-connect` 라우팅 추가 (클릭 무반응 버그 해결) |
| `app/settings.tsx` | 전체 라벨 하드코딩 한국어 → `strings.settings.*` 기반 교체. 언어 토글 시 마이페이지도 즉시 전환 (계정/커플연결/비밀번호/환경설정/알림/언어/정보/도움말/약관/개인정보/로그아웃/탈퇴 + 통계·기념일 라벨 + 언어선택·도움말 Alert 문구) |
| `app/account/edit-profile.tsx` | `handleSave`의 `user_preferences` upsert를 **best-effort try/catch로 분리**. prefs 실패가 닉네임 저장/`router.back()`을 막지 않게 함 |
| `lib/i18n.ts` | `settings` 섹션에 누락 키 ko·en 추가 (nameEmpty, partnerFallback, daysWith(fn), statDates, statWantAgain, rowNickname/Couple/Password/Notifications/Language, prefsTitle, infoTitle, rowHelp/Terms/Privacy, langPickTitle/Message, cancel, helpTitle/Message) |

### 버그 원인 분석

1. **커플 연결 클릭 무반응**: `ListRow`는 `onPress` 없으면 탭해도 무동작. 해당 row에 핸들러가 빠져 있었음.
2. **언어 변경 적용 안됨**: `setLanguage` 토글 자체는 앱 전역 작동하나, settings.tsx 라벨이 전부 하드코딩 한국어라 마이페이지 화면은 안 바뀜 → "적용 안됨"으로 보임.
3. **닉네임 변경 적용 안됨**: `date_planner_profiles` update(RLS `profiles_update_self` 정상)는 성공하지만, 뒤이은 `user_preferences.upsert(onConflict:'user_id')`가 throw(테이블 `user_id` UNIQUE 제약 미확인)하면 catch로 "저장 실패" alert + `router.back()` 차단 → 이름은 저장됐어도 실패처럼 보임.

### 검증

```bash
npx tsc --noEmit  # 통과 (EXIT 0)
```

### 다음 세션 할 일 / 주의

1. 실기기 QA: 닉네임 변경 후 마이페이지·홈 갱신 / 언어 ko↔en 토글 / 커플 연결 진입 확인
2. **근본 확인**: `user_preferences.user_id` UNIQUE 제약 실제 유무 점검 → 없으면 마이그레이션으로 추가해 ③ 원인 확정 제거
3. Phase 7 잔여: App Store 영어 메타데이터

---

## 2026-05-28 세션 T — 알림 Supabase 연동 (생성 트리거 + 삭제 + 빈 상태)

### 변경 사항 요약

| 항목 | 내용 |
|------|------|
| `supabase/migrations/20260528000001_notifications.sql` | 신규 — `notifications` 테이블(`user_id, couple_id, type, payload jsonb, read, created_at`) + RLS 3개(본인 select/update/delete, insert는 트리거만) + helper `couple_partner()` + 트리거 2개. 원격 적용 완료 |
| 트리거 `trg_notify_reaction` | `reactions` AFTER INSERT → card_id로 카드 주인 찾아 알림. 자기 카드에 자기가 반응 시 제외 |
| 트리거 `trg_notify_card` | `date_cards` AFTER INSERT (`source='ai'`만) → 커플 상대에게 알림. manual 카드 제외 |
| 보안 | `get_advisors` 경고 → security definer 함수 3개 EXECUTE 권한 `public/anon/authenticated`에서 revoke (RPC 외부 노출·상대 uuid 유출 차단) |
| `app/account/notifications.tsx` | mock 전면 제거 → Supabase fetch. **개별 탭 → 해당 알림 delete**, **"모두 지우기" → 전체 delete**(버튼 라벨 변경), **빈 상태 UI 신규**(BellOff), 로딩 스피너, 시간 그룹핑(오늘/이번 주/이전), 상대시간 표기 |
| `lib/i18n.ts` | `notifications` 섹션 ko/en 추가 (제목, unreadSuffix, clearAll, empty, group, type별 title, 상대시간 단위) |
| `app/(tabs)/index.tsx` | 벨 dot을 `notifications` count > 0 일 때만 표시 (기존: 항상 켜짐) |

### 알림 생성 기준 (확정)

- **reaction**: 상대가 내 카드에 반응 → 카드 주인에게
- **new_card**: 커플 상대가 AI 카드 생성 → 나에게
- **soft_message는 제외**: "자동 전송 금지" 원칙(Proposal 11.9)과 충돌하여 트리거에서 뺌

### 검증

```bash
npx tsc --noEmit  # 통과 (출력 없음)
```

### 다음 세션 할 일 / 주의

1. 실기기 QA: 둘이 반응·AI 카드 주고받아 알림 생성·삭제·빈 상태 확인 (기존 reactions 3건은 트리거 적용 전이라 알림 없음)
2. AI 카드 한 번에 3장 생성 → 알림 3개. 시끄러우면 statement-level로 묶기 검토
3. Phase 7 잔여: App Store 영어 메타데이터

---

## 2026-05-25 세션 S — Phase QA 버그픽스

### 변경 사항 요약

| 파일 | 수정 내용 |
|------|----------|
| `app/account/notifications.tsx` | `useState`로 unread 목록 관리, `markAllRead()` 함수 → "모두 읽음" 버튼 onPress 연결. 남은 unread 개수 실시간 반영 |
| `app/account/edit-profile.tsx` | 아바타 + "사진 변경하기" 버튼 `onPress` 연결 → Alert("이미지 선택 기능은 곧 업데이트될 예정이에요.") |
| `app/settings.tsx` | `useEffect` → `useFocusEffect(useCallback)` 전환 → 닉네임 수정 후 화면 복귀 시 즉시 반영 |
| `app/settings.tsx` | 알림 row `value="켜짐"` 제거 → `/account/notifications` 네비게이션임을 명확히 |
| `app/settings.tsx` | 도움말 `onPress={handleHelp}` 연결 → Alert(이메일 문의) |
| `app/settings.tsx` | 언어 `onPress={handleLanguage}` 연결 → Alert(한국어/English 선택), i18n `setLanguage` 연동, 현재 언어 value 표시 |
| `app/settings.tsx` | `handleLogout` — `signOut()` 후 즉시 `router.replace('/(auth)')` 호출 → 스와이프백으로 마이페이지 복원되는 버그 차단 |
| `app/settings.tsx` | `useI18n` + `AppLanguage` import 추가 |

### 수정된 버그 목록

1. 알림창 "모두읽음" 버튼 동작 안 함 → 해결
2. 카메라/사진변경 버튼 동작 안 함 → 해결 (준비 중 안내)
3. 마이페이지 닉네임 변경 후 "닉네임 없음" 표시 → 해결
4. 마이페이지 알림 row "켜짐/꺼짐" 토글처럼 보임 → 해결 (value 제거, 알림 화면 이동 명확화)
5. 도움말 클릭 안 됨 → 해결
6. 언어 클릭 안 됨 → 해결
7. 로그아웃 후 스와이프백으로 마이페이지 재등장 → 해결

### 검증

```bash
npx tsc --noEmit  # 통과 (출력 없음)
```

### 다음 세션 할 일

1. Phase 7 잔여: App Store / Google Play 영어 메타데이터 (앱 이름, 설명, 키워드)
2. Long-Term: EAS Build 세팅, TestFlight 클로즈드 베타 준비
3. `expo-image-picker` 연결 — `onboarding/photo.tsx` + `edit-profile.tsx` 실제 이미지 선택

---

## 2026-05-25 세션 R — Phase 11 반응 고도화 + UI 그라디언트

### 변경 사항 요약

| 항목 | 내용 |
|------|------|
| `supabase/migrations/20260525000002_reactions_condition_tag.sql` | `reactions` 테이블에 `condition_tag text CHECK(...)` 컬럼 추가 (원격 적용 완료) |
| `app/card/[id].tsx` | `burden` 반응 선택 시 조건 박스 노출 — 장소만 바꾸면/가까우면/실내면/예산 조정되면 4가지 선택, condition_tag upsert |
| `app/card/[id].tsx` | 조건 선택 후 "조건으로 다시 찾아줘" 버튼 → AI `generateDateCards` 호출 → `date_cards` 3개 삽입 |
| `app/(tabs)/candidates.tsx` | `reactions` 쿼리에 `condition_tag` 추가, `CardWithReactions` 타입 확장, 반응 박스에 조건 라벨 표시 |
| `datemate-app/` | `expo-linear-gradient` SDK 54 호환 버전 설치 |
| `app/(tabs)/index.tsx` | 홈 헤더 배너에 LinearGradient (#FFE8EC→#FFF5F0→#FFF8F3) 적용, CTA 버튼 그라디언트 (#FF6B85→#FF4F6D→#E8395A) 적용 |

### 조건부 반응 플로우

```
카드 상세 화면
  → "오늘은 부담돼" 선택
  → 조건 박스 노출: 📍 장소만 바꾸면 / 🚶 가까우면 / 🏠 실내면 / 💰 예산 조정되면
  → 조건 선택 → condition_tag upsert (reactions 테이블)
  → "📍 장소만 바꾸면 조건으로 다시 찾아줘" 버튼
  → AI generateDateCards(freeText=조건 설명) → date_cards 3개 저장
  → Alert "새 후보 생성 완료" → 우리 후보 탭에서 확인

우리 후보 탭
  → 반응 박스에 조건 라벨 표시 (나: 부담돼 / 📍 장소만 바꾸면)
```

### 검증

```bash
npx tsc --noEmit  # 통과 (출력 없음)
```

### 다음 세션 할 일

1. Phase 7 잔여: App Store 영어 메타데이터 (앱 이름, 설명, 키워드)
2. Long-Term: 클로즈드 베타 준비 (EAS Build, TestFlight)
3. `expo-image-picker` 연결 — `onboarding/photo.tsx` 실제 이미지 선택

---

## 2026-05-25 세션 Q — Phase 10: "다음에 만나면" 버킷리스트

### 변경 사항 요약

| 항목 | 내용 |
|------|------|
| Supabase `bucket_list` | 신규 테이블 — `id, user_id, couple_id, item, status('pending'/'confirmed'), created_at` + RLS 3개 정책 |
| Supabase `bucket_reactions` | 신규 테이블 — `id, bucket_id, user_id, reaction_type('love'/'next_time'), created_at` + UNIQUE(bucket_id, user_id) + RLS 3개 정책 |
| `supabase/migrations/20260525000001_bucket_list.sql` | 위 두 테이블 마이그레이션 파일 (원격 적용 완료) |
| `app/mode-flow/bucketlist.tsx` | 신규 — 아이디어 자유 텍스트 입력 (최대 200자) + `bucket_list` 저장 → 후보 탭 이동 |
| `app/(tabs)/mode.tsx` | `next_meet` 선택 시 `/mode-flow/bucketlist`로 라우팅 분기 |
| `app/(tabs)/candidates.tsx` | 필터 탭에 "다음에 만나면" 추가. 별도 `BucketSection` 컴포넌트로 버킷리스트 목록 + 반응(끌려/다음에) + 만남 확정 버튼(AI 코스 카드 3장 생성 → `date_cards` 저장 → bucket 상태 `confirmed`) |

### 전체 플로우

```
데이트 모드 탭 → "다음에 만나면" 선택 → /mode-flow/bucketlist
  → 아이디어 입력 + 저장 → bucket_list 테이블

우리 후보 탭 → "다음에 만나면" 필터 탭
  → 버킷리스트 목록 표시
  → 각 아이템: 내 반응(끌려/다음에) + 상대 반응 표시
  → 내가 '끌려' 선택 시 "만남 확정" 버튼 등장
  → 확정 → AI generateDateCards(mode:'next_meet') → date_cards 3개 저장
  → bucket_list status 'confirmed' → "전체" 탭 전환
```

### 검증

```bash
npx tsc --noEmit  # 통과 (출력 없음)
```

### 다음 세션 할 일

1. Phase 11: 반응 고도화 — 조건부 반응 상세 (`장소만 바꾸면 / 가까우면 / 실내면 / 예산 조정되면`)
2. Phase UI 시각 갭: `expo-linear-gradient` 그라디언트 적용

---

## 2026-05-25 세션 P — Phase 9: 직접 후보 추가

### 변경 사항 요약

| 항목 | 내용 |
|------|------|
| Supabase `date_cards` | `source text NOT NULL DEFAULT 'ai' CHECK (source IN ('ai', 'manual'))` 컬럼 추가 (마이그레이션) |
| `app/card/new.tsx` | 신규 — 제목·설명 입력 + 예상 시간·예산 선택(optional) + "AI가 카드로 정리해줘" 토글 → `source:'manual'` 또는 AI 보정 후 `source:'ai'`로 `date_cards` 저장 → 후보 탭으로 이동 |
| `app/(tabs)/candidates.tsx` | 헤더 우상단 "직접 추가" 핑크 버튼 추가 (`/card/new` 라우팅). `source` 컬럼 쿼리 추가. 직접 추가 카드에 라벤더 배지 표시 |
| `components/ui.tsx` | `Badge` 컴포넌트에 `lavender` tone 추가 |
| `app/mode-flow/result.tsx` | AI 저장 시 `source: 'ai'` 명시 |

### 검증

```bash
npx tsc --noEmit  # 통과 (출력 없음)
```

### 다음 세션 할 일

1. Phase 10: "다음에 만나면" 버킷리스트 (`app/mode-flow/bucketlist.tsx` + `bucket_list` 테이블)
2. Phase 11: 반응 고도화 (조건부 반응 상세)

---

## 2026-05-25 세션 O — Phase UI: soft-message 2화면 분리

### 변경 사항 요약

| 항목 | 내용 |
|------|------|
| `app/(tabs)/soft-message.tsx` | softHelper만 남김 — result 관련 state/핸들러 제거. 버튼 클릭 시 `/soft-message/result`로 라우팅 (`card`, `tone`, `free` params) |
| `app/soft-message/result.tsx` | 신규 — softResult 화면. params 수신 후 마운트 시 `generateSoftMessage` 호출 → 로딩 → 라벤더 SoftCard + TextInput 편집 + 조정 버튼 3개 + InfoNote + 복사/저장 하단 CTA |

### 라우팅 흐름

```
마음 전하기 탭 (softHelper)
  → 카드 선택 + 톤 선택 + 추가 메모
  → "문장 만들어줘" → /soft-message/result?card=...&tone=...&free=...
  → AI 생성 로딩 → 편집 가능한 문장 카드
  → 복사하기 / 저장하기
```

### 검증

```bash
npx tsc --noEmit  # 통과 (출력 없음)
```

### 다음 세션 할 일

1. Phase 9: 직접 후보 추가 (`app/card/new.tsx`)
2. Phase 10: "다음에 만나면" 버킷리스트

---

## 2026-05-25 세션 N — Phase UI: share/mutual.tsx 개선

### 변경 사항 요약

| 항목 | 내용 |
|------|------|
| `app/share/mutual.tsx` | 카드에 `summary` 텍스트 표시 (타이틀 아래 2줄) |
| `app/share/mutual.tsx` | `estimated_time` / `estimated_budget` 아이콘(Clock·Wallet) + 섹션 색상으로 메타 정보 표시 |
| `app/share/mutual.tsx` | 태그 칩 최대 3개 표시 |
| `app/share/mutual.tsx` | 카드 탭 시 `/card/[id]` 상세화면 이동 (`onPress` 연결) |
| `app/share/mutual.tsx` | "이번 데이트로 정하기" → mutual 카드 존재 시 `/card/confirm?id=...`, 없으면 후보 탭 폴백 |
| `app/share/mutual.tsx` | mutual 섹션 note 문구 개선: "둘 다 좋아하는 후보예요. 이번 데이트로 정해볼까요?" |
| `app/share/mutual.tsx` | Supabase 쿼리에 `estimated_time`, `estimated_budget`, `tags` 컬럼 추가 |

### 섹션 색상 구조 (기존 유지 + 확인)

| 섹션 | 배경색 | 강조색 |
|------|--------|--------|
| 둘 다 끌린 후보 | `C.pinkLight` (#FFEEF0) | `C.pinkDeep` (#C24B57) |
| 조건만 맞추면 좋은 후보 | `C.lavender` (#F1ECFF) | `C.lavenderFg` (#6B5BB8) |
| 오늘은 부담되지만 다음에 좋은 후보 | `C.cream` (#FFF3E0) | `C.creamFg` (#A77738) |

### 검증

```bash
npx tsc --noEmit  # 통과 (출력 없음)
```

### 다음 세션 할 일

1. `(tabs)/soft-message.tsx` — softHelper + softResult 2화면 분리
2. Phase 9: 직접 후보 추가 (`app/card/new.tsx`)

---

## 2026-05-25 세션 M — Phase UI: confirm / review / memories 강화

### 변경 사항 요약

| 항목 | 내용 |
|------|------|
| `app/card/confirm.tsx` | 신규 — DateConfirmScreen: 카드 요약 + 날짜/시간/장소/준비물 입력 → `date_cards` status `'confirmed'` 업데이트 → review로 이동 |
| `app/card/review.tsx` | 신규 — DateReviewScreen: 평가 2×2 그리드 + 좋았던 점 칩 선택 + 한 줄 후기 → `date_memories` 저장 → memories 탭 이동 |
| `app/card/[id].tsx` | "이번 데이트로 정할까요?" 버튼 추가 → `/card/confirm?id=<id>` 라우팅 |
| `lib/i18n.ts` | `Copy` 타입에 `confirm`, `review` 섹션 추가, ko/en 문자열 완성, card에 `confirmButton` 추가 |
| `(tabs)/memories.tsx` | featured 카드에 시간/비용 메타, 태그 칩, "최근 추억" Badge 추가. date_cards 쿼리에 estimated_time/budget/tags 포함 |
| `(tabs)/candidates.tsx` | 반응 바이패널 (`나 / 상대`) 이미 구현되어 있음 — 추가 작업 불필요 |

### 라우팅 흐름 (신규 확정)

```
우리 후보 → card/[id] → "이번 데이트로 정할까요?" 버튼
  → /card/confirm?id=X  (날짜/시간/장소/준비물 입력 + status 'confirmed' 저장)
  → /card/review?id=X   (평가 + 칩 + 후기 → date_memories 저장)
  → /(tabs)/memories    (추억 탭)
```

### 검증

```bash
npx tsc --noEmit  # 통과 (출력 없음)
```

### 다음 세션 할 일

1. `share/mutual.tsx` — 색상 섹션 그룹핑 (둘 다 끌린 / 조건부 / 다음에)
2. `(tabs)/soft-message.tsx` — softHelper + softResult 2화면 분리
3. Phase 9: 직접 후보 추가 (`app/card/new.tsx`)

---

## 2026-05-25 세션 L — Phase UI: Date Navi 온보딩 화면 포팅 + 갭 분석

### 변경 사항 요약

| 항목 | 내용 |
|------|------|
| `onboarding/photo.tsx` | 신규 — 프로필 사진 단계 (2/4), 아바타 이니셜 + 카메라 버튼 UI |
| `onboarding/anniversary.tsx` | 신규 — 기념일 날짜 입력 (3/4), 드롭다운 연/월/일 선택, D-day 계산, `anniversary_date` Supabase 저장 |
| `onboarding/type.tsx` | 신규 — 데이트 계획 스타일 선택 (4/4), 5가지 옵션, `planning_style` 저장 후 `couple-connect`로 라우팅 |
| `onboarding/connected.tsx` | 신규 — 커플 연결 성공 화면, RN `Animated` API로 아바타 2개 수렴 + 하트 등장 + 펄스 애니메이션 |
| `onboarding/nickname.tsx` | 저장 후 라우팅 `/onboarding/photo`로 변경 (기존: `couple-connect`) |
| `onboarding/couple-connect.tsx` | 연결 성공 후 `/onboarding/connected`로 라우팅, "나중에" 버튼 → `/onboarding/preferences` |
| `onboarding/preferences.tsx` | 단계 재배치: 활동→분위기→피하기→장거리 여부. `planning_style` 제거, `is_long_distance` + `mood_tags` 저장 |
| `(tabs)/index.tsx` | 알림 벨 버튼에 핑크 dot(8px) 추가 |

### 온보딩 라우팅 (확정)

```
/(auth) → nickname(1/4) → photo(2/4) → anniversary(3/4) → type(4/4)
  → couple-connect → connected → preferences(4단계) → /(tabs)
나중에 연결 → preferences → /(tabs)
```

### preferences 단계 순서 변경 이유

Date Navi OnboardingScreens.tsx 기준:
- pref1: 선호 활동 (활동 멀티 선택)
- pref2: 원하는 분위기 (mood 멀티 선택) ← 기존 step3
- pref3: 부담스러운 것 (avoid 멀티 선택) ← 기존 step2
- pref4: 장거리 커플 여부 (단일 선택) ← 기존 planning_style 위치

planning_style은 `onboarding/type.tsx`(signup step 4)로 이동.

### 갭 분석 결과 (Phase UI 잔여 작업)

**미구현 화면 2개 (최우선):**
- `app/card/confirm.tsx` — 날짜·장소·시간·준비물 입력 후 데이트 확정
- `app/card/review.tsx` — 데이트 완료 후기 (별점칩·텍스트·사진)

**UI 갭 4개 (중요):**
1. `candidates.tsx` — "나 / 상대" 반응 바이패널 없음
2. `memories.tsx` — featured 카드 메타 정보 없음
3. `share/mutual.tsx` — 색상별 섹션 그룹핑 없음
4. `soft-message.tsx` — 2화면 분리 필요

**시각적 갭:** `expo-linear-gradient` 미설치로 일부 그라디언트 단색 대체 중

### 검증

```bash
npx tsc --noEmit  # 통과 (출력 없음)
```

### 다음 세션 할 일

1. `app/card/confirm.tsx` 신규 생성 (DateConfirmScreen)
2. `app/card/review.tsx` 신규 생성 (DateReviewScreen)
3. `(tabs)/candidates.tsx` UI — 반응 바이패널 추가
4. `(tabs)/memories.tsx` UI — featured 카드 메타 강화

---

## 2026-05-24 세션 K — Phase 8 모드별 차별화 UX

### 변경 사항 요약

| 항목 | 내용 |
|------|------|
| `lib/ai.ts` | `MODE_EMPHASIS` / `MODE_EMPHASIS_EN` 맵 추가 — `buildPrompt()` 내 모드별 AI 지시 블록 주입 |
| `lib/i18n.ts` | `course` 타입 및 한/영 문자열 추가 (아이디어 입력, 예산·시간 옵션, 버튼, 오류 메시지) |
| `app/mode-flow/course.tsx` | "코스로 정리해줘" 전용 입력 화면 신규 생성 |
| `app/(tabs)/mode.tsx` | `make_course` 선택 시 `/mode-flow/course`로 분기, 나머지는 기존 feeling 화면 유지 |

### 모드별 AI 프롬프트 강조 내용

| 모드 | 강조 지침 |
|------|----------|
| `light_date` | 저예산·근거리·체력 소모 적음·특별한 준비 불필요 우선 |
| `special_date` | 기념일·감성·로맨틱·기억에 남을 경험 강조 |
| `low_risk` | 무난·안전·둘 다 만족 가능성 높음·쉽게 실행 가능 우선 |
| `make_course` | summary에 단계별 동선, tags에 준비물, why_recommended에 대체안 포함 지시 |

### course.tsx 입력 플로우

```
"코스로 정리해줘" 탭
  → 아이디어 자유 텍스트 입력 (최대 200자)
  → 예산 선택 (아끼고 싶어 / 적당히 / 특별하게)
  → 시간 선택 (2~3시간 / 반나절 / 하루종일)
  → "코스 만들기" → result.tsx (mode=make_course)
  → AI가 단계별 코스 포함 카드 3장 생성
```

### 검증

```bash
cd datemate-app && npx tsc --noEmit
```

결과: 통과 (출력 없음)

참고: `npm run validate` 스크립트 없음 — `npx tsc --noEmit`으로 대체

### 다음 세션 할 일

- Phase 9: 사용자 직접 후보 추가 (우리 후보 탭 "직접 추가" 버튼 + `app/card/new.tsx`)
- Phase 7 잔여: App Store 영어 메타데이터 (앱 이름, 설명, 키워드)

---

## 2026-05-24 세션 J — Phase 6.5 마이페이지 & 계정 관리

### 변경 사항 요약

| 항목 | 내용 |
|------|------|
| `lib/i18n.ts` | settings 타입·한국어·영어 문자열 25개 추가 (닉네임·비밀번호·탈퇴) |
| `app/settings.tsx` | 마이페이지로 전면 교체: 닉네임 수정 / 비밀번호 변경 / 언어 설정 / 로그아웃 / 회원 탈퇴 모달 |
| `app/(tabs)/index.tsx` | 홈 하단 로그아웃 버튼 제거 (마이페이지로 통합) |
| `supabase/functions/delete-account/index.ts` | 회원 탈퇴 Edge Function 작성 및 Supabase에 배포 (ACTIVE) |
| `tsconfig.json` | `supabase/functions` Deno 코드 타입 검사 제외 |

### 탈퇴 처리 흐름

1. 상대방 `couple_id → null` + 커플 row 삭제
2. 내 `user_preferences`, `soft_messages`, `date_memories`, `date_planner_profiles` 삭제
3. `date_cards`, `reactions` 공유 데이터 보존 (상대방 계속 열람 가능)
4. Edge Function `delete-account` → `auth.admin.deleteUser()` 호출
5. `signOut()` → 로그인 화면 이동

### Edge Function 배포 위치

`/Users/jeongwonkim/Desktop/Codex_sample/supabase/functions/delete-account/index.ts`  
(앱 코드와 별개로 `Codex_sample/supabase/` 아래에 위치해야 CLI가 인식)

### 검증

```bash
cd datemate-app && npx tsc --noEmit
```

결과: 통과

### 다음 세션 할 일

- Phase 7 잔여: App Store 영어 메타데이터 (앱 이름, 설명, 키워드)
- 실기기 QA: 닉네임 수정 / 비밀번호 변경 / 탈퇴 플로우 확인

---

## 2026-05-23 세션 I — 닉네임 저장 무한 로딩 수정

### 변경 사항 요약

| 항목 | 내용 |
|------|------|
| `datemate-app/app/onboarding/nickname.tsx` | 닉네임 저장 후 `refreshSession()` 대기 제거, `/onboarding/couple-connect`로 직접 이동 |
| `datemate-app/app/_layout.tsx` | `onAuthStateChange` callback 안에서 Supabase query를 직접 await하지 않도록 `setTimeout`으로 비동기 예약 |

### 원인

닉네임 저장 자체는 성공했지만, 저장 후 호출한 `supabase.auth.refreshSession()`이 auth state callback의 추가 Supabase query와 맞물리면서 저장 버튼이 계속 loading 상태로 남을 수 있었다.

### 검증

```bash
cd datemate-app
npx tsc --noEmit
```

결과: 통과

### DB 확인

수정 전 닉네임 저장 시도 때문에 현재 원격 DB에는 `auth.users = 1`, `date_planner_profiles = 1` 상태가 확인됐다. 카드/반응/커플/취향 데이터는 0건이다.

---

## 2026-05-23 세션 H — QA 데이터 리셋 & 마이페이지 계획

### 변경 사항 요약

| 항목 | 내용 |
|------|------|
| `docs/qa-reset.sql` | QA 전 Supabase 데이터/유저 전체 초기화 SQL 추가 |
| `PLAN.md` | Phase 6에 QA 리셋 SQL 준비 완료 기록 |
| `PLAN.md` | Phase 6.5 `마이페이지 & 계정 관리` 추가 |
| Supabase 원격 DB | `supabase db query --linked -f docs/qa-reset.sql`로 실제 QA 리셋 실행 |
| `src/lib/backend/mock-client.ts` | 레거시 웹 mock 런타임이 예전 demo seed 대신 빈 상태로 시작하도록 변경 |

### QA 리셋 범위

- Mobile MVP 테이블: `date_cards`, `reactions`, `soft_messages`, `user_preferences`, `date_memories`, `analytics_events`
- 이전 Web MVP 테이블: `date_planner_*`
- Supabase Auth: `auth.users` 전체 삭제

### 마이페이지 방향

1. 닉네임/표시 이름 수정
2. 비밀번호 변경 또는 재설정
3. 언어 설정 유지
4. 로그아웃 정리
5. 회원 탈퇴 UI + Auth user 삭제 + cascade 검증
6. 커플 연결 해제/상대 데이터 보존 정책 결정

### 실행 참고

CLI가 linked project 권한을 갖고 있어 터미널에서 직접 실행했다.

실행 후 원격 DB 확인 결과:

| 테이블/영역 | count |
|-------------|-------|
| `auth.users` | 0 |
| `date_planner_profiles` | 0 |
| `date_planner_couples` | 0 |
| `date_cards` | 0 |
| `reactions` | 0 |
| `user_preferences` | 0 |
| `soft_messages` | 0 |
| `date_memories` | 0 |

---

## 2026-05-23 세션 G — Phase 7 영어/한국어 언어 선택

### 변경 사항 요약

| 항목 | 내용 |
|------|------|
| `package.json` | `expo-localization` 추가 |
| `lib/i18n.ts` | 한국어/영어 카피 사전, 언어 자동 감지, AsyncStorage 언어 저장, `I18nProvider/useI18n` 추가 |
| `components/language-toggle.tsx` | 인증/온보딩 화면용 언어 토글 추가 |
| `app/_layout.tsx` | 앱 전체를 `I18nProvider`로 감싸고 `/settings` 라우트 등록 |
| `app/settings.tsx` | 별도 설정 화면 추가: 앱 언어 선택 + 로그아웃 |
| 주요 앱 화면 | 인증, 온보딩, 탭, 모드 플로우, 후보, 마음 전하기, 추억, 카드 상세, 약관/개인정보 화면 카피 다국어화 |
| `lib/ai.ts` | `generateDateCards`, `generateSoftMessage`에 `language` 파라미터 추가 및 Gemini 프롬프트/폴백 결과 언어 분기 |

### 구현 결정

- `i18next`는 도입하지 않고, 현재 앱 규모에 맞춰 `expo-localization + 자체 I18nProvider`로 구현했다.
- 기본 언어는 기기 언어가 한국어면 `ko`, 그 외에는 `en`으로 시작한다.
- 사용자가 설정 화면에서 언어를 바꾸면 `datemate.language` 키로 AsyncStorage에 저장되어 다음 실행 때 유지된다.
- 홈 화면 상단의 설정 버튼에서 언어 변경 위치를 더 명확하게 접근할 수 있게 했다.

### 검증

```bash
cd datemate-app
npx tsc --noEmit
```

결과: 통과

참고: `npm run validate`는 `datemate-app/package.json`에 `validate` 스크립트가 없어 실행 불가.

### 남은 작업

1. App Store 영어 메타데이터 준비
2. 실제 기기/시뮬레이터에서 한국어/영어 화면 전환 QA

---

## 2026-05-23 세션 F — Phase 5.5 취향 데이터 AI 반영

### 변경 사항 요약

| 항목 | 내용 |
|------|------|
| `lib/ai.ts` | `UserPreferences` 타입 추가 (preferred_tags, avoid_tags, is_long_distance, planning_style) |
| `lib/ai.ts` | `buildPreferencesBlock()` 함수 추가 — 취향 데이터를 【커플 취향 (온보딩 기반)】 블록으로 변환 |
| `lib/ai.ts` | `buildPrompt()`에 `prefs?: UserPreferences` 파라미터 추가 — 취향 블록 프롬프트 끝에 주입 |
| `lib/ai.ts` | `generateDateCards()`에 `prefs?: UserPreferences` 파라미터 추가 |
| `app/mode-flow/result.tsx` | `useEffect` 내에서 `user_preferences` Supabase 조회 후 `generateDateCards`에 전달 |

### 프롬프트 주입 형식

```
【커플 취향 (온보딩 기반)】
- 선호 분위기: 맛집, 카페
- 평소 피하고 싶은 것: 먼 이동, 사람 많은 곳
- 장거리 커플: 아니요
- 계획 성향: 같이 정하는 편
```

### 설계 원칙

- `prefs`는 optional — 온보딩 미완료 유저도 정상 작동 (취향 블록 생략)
- Supabase 조회 실패 시 `prefs = undefined` → fallback 없이 기존 동작 유지

### 다음 세션 할 일 (Phase 7)

1. i18n 라이브러리 도입 (`expo-localization` + `i18next`)
2. 한국어/영어 언어 파일 분리 (`locales/ko.json`, `locales/en.json`)
3. 모든 UI 텍스트 번역 (탭, 버튼, 안내문구, 에러 메시지)
4. AI 프롬프트 영어 버전 분기
5. 앱 언어 자동 감지 + 수동 변경 설정
6. App Store 영어 메타데이터 준비

### 이번 결정

- `클로즈드 베타 10~30쌍`은 `Long-Term Backlog`로 이관
- 현재 다음 우선순위는 `Phase 7 — 영어 버전(English Localization)`

---

## 2026-05-23 세션 E — Phase 5 온보딩 & 추억

### 변경 사항 요약

| 항목 | 내용 |
|------|------|
| `supabase/user_preferences` | 신규 테이블 (user_id, preferred_tags text[], avoid_tags text[], is_long_distance, planning_style) + RLS 3개 정책 |
| `supabase/date_memories` | 신규 테이블 (couple_id text, card_id text, user_id uuid, review, want_again) + RLS 4개 정책 |
| `app/onboarding/preferences.tsx` | 4단계 온보딩 플로우 + 건너뛰기 버튼 |
| `app/_layout.tsx` | user_preferences 없으면 → /onboarding/preferences 라우팅 추가 |
| `app/card/[id].tsx` | "이 데이트 완료했어요" 버튼 + 후기/다시 하고 싶은지 모달 |
| `app/(tabs)/memories.tsx` | 완료 데이트 목록 화면 (카드 제목, 날짜, 후기, want_again 배지) |

### 버그픽스

- `preferences.tsx`의 `handleSave()`에서 불필요한 `refreshSession()` 제거 → 저장 후 즉시 탭 이동

### 온보딩 플로우

```
커플 연결 완료
  → user_preferences 없으면 → /onboarding/preferences
  → 1단계: 선호 분위기 멀티 선택 (맛집/카페/산책/집데이트/전시/액티비티)
  → 2단계: 피하고 싶은 것 멀티 선택 (먼 이동/큰 지출/사람 많은 곳/오래 걷기/예약 복잡)
  → 3단계: 장거리 여부 단일 선택
  → 4단계: 계획 성향 단일 선택
  → "완료" or "건너뛰기" → /(tabs)
```

### 추억 플로우

```
card/[id] 하단 → "이 데이트 완료했어요" 버튼
  → 모달: 한 줄 후기 (선택) + 다시 하고 싶은지 (필수)
  → date_memories DB 저장
  → memories 탭에서 목록 확인 (카드 제목, 날짜, 후기, want_again)
```

### 라우팅 순서 (전체)

```
앱 시작 → 세션 없음 → /(auth)
세션 있음
  → 닉네임 없음 → /onboarding/nickname
  → couple_id 없음 → /onboarding/couple-connect
  → user_preferences 없음 → /onboarding/preferences
  → /(tabs)
```

### 참고: user_preferences는 현재 AI에 미반영

저장은 되지만 `lib/ai.ts` 프롬프트에는 아직 주입 안 됨. Phase 6 개인화 단계에서 추가 필요.

### 다음 세션 할 일 (Phase 6)

1. **Super plan 4개 파일 필독**
2. 예외 처리: 로그인 실패, 코드 오류, AI 응답 실패
3. 로딩 상태 / 빈 화면 / 에러 메시지 UX
4. 개인정보처리방침 / 이용약관 페이지
5. 핵심 이벤트 로그: signup, couple_connected, mode_selected, ai_card_created
6. 클로즈드 베타 10~30쌍

---

## 2026-05-23 세션 D — Phase 4 내 마음 문장 만들기

### 변경 사항 요약

| 항목 | 내용 |
|------|------|
| `supabase/soft_messages` | 신규 테이블 (couple_id, user_id, reason_tags text[], free_text, generated_text, used) + RLS 4개 정책 |
| `lib/ai.ts` | `generateSoftMessage()` 함수 추가 — Gemini Flash로 부드러운 문장 생성 + fallback 8종 |
| `app/(tabs)/soft-message.tsx` | 전체 플로우 구현 — 조건 선택 → AI 생성 → 수정 → 클립보드 복사 → 저장 |

### 유저 플로우

```
마음 전하기 탭
  → 민감 조건 버튼 복수 선택 (8가지)
  → 추가 메모 입력 (선택)
  → "문장 만들기" → Gemini Flash API
  → 생성된 문장 표시 (수정 가능 TextInput)
  → 📋 클립보드 복사 (직접 상대에게 전송)
  → 저장하기 → soft_messages DB
```

### 핵심 설계 원칙

- **자동 전송 절대 금지**: "앱이 자동으로 보내지 않아요" 안내문 상시 노출
- AI 실패 시 이유별 fallback 문장 제공

---

_세션 A~C는 `RESULT_ARCHIVE.md` 참조._

---

## 2026-05-23 세션 C — Phase 3 반응 & 후보 분류

| 항목 | 내용 |
|------|------|
| `supabase/reactions` | 신규 테이블 (card_id text, user_id uuid, reaction_type CHECK, UNIQUE(card_id,user_id)) + RLS 4개 정책 |
| `app/card/[id].tsx` | 카드 상세 화면 — 반응 버튼 4개 (완전 끌려/느낌은 좋아/오늘은 부담돼/다음에) + 상대 반응 표시 |
| `app/(tabs)/candidates.tsx` | 분류별 탭 (전체/둘 다 끌림/조건부/다음에) + 카드 클릭 → 상세 화면 라우팅 |
| `app/mode-flow/result.tsx` | 저장 후 "첫 번째 카드에 반응하기" 버튼 추가 |

반응 유형: love(🔥) / like(😊) / burden(😅) / next_time(⏰)
분류 로직: 둘 다 love/like → 둘 다 끌림 | 한 명 love/like + 한 명 burden → 조건부 | 하나라도 next_time → 다음에

---

## 2026-05-23 세션 B — Phase 2 데이트 모드 UX + AI 카드 생성

| 항목 | 내용 |
|------|------|
| `supabase/date_cards` | 신규 테이블 + RLS |
| `lib/ai.ts` | Gemini Flash API 호출 + fallback 템플릿 3개 |
| `app/mode-flow/feeling.tsx` | 5단계 버튼 선택 + 피하고 싶은 것 멀티 + 자유 텍스트 |
| `app/mode-flow/result.tsx` | AI 카드 3개 표시 + DB 저장 |

Gemini 모델: `gemini-1.5-flash` / API키: `EXPO_PUBLIC_GOOGLE_AI_STUDIO_API_KEY`

---

## 2026-05-23 세션 A — Expo SDK 54 호환 + Phase 1 완료

| 항목 | 내용 |
|------|------|
| Expo SDK | 56 → 54 다운그레이드 |
| `app/_layout.tsx` | `onAuthStateChange` + `getDestination()` 기반 라우팅 |
| `app/onboarding/` | 닉네임 입력 + 커플 초대 코드 화면 |

Supabase 프로젝트: `wqjguifsmtblgrhdfnji` (ap-northeast-2)
데모 계정: `demo-partner@datemate.app` / 닉네임 `Claudia` / 커플 `DEMO01`
이메일 인증: Auth → Providers → Email → Confirm email OFF 필요
