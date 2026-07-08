# 예산 제거 · 시간 옵셔널화 · 후보 검색 매칭 개선 — 설계

## 배경

AI 추천 로깅 파이프라인([2026-07-08-ai-recommendation-logging-design.md](2026-07-08-ai-recommendation-logging-design.md))으로 실제 `feeling_select` 호출 5건을 채점해보니 뚜렷한 패턴이 드러났다:

- 예산(`budget`)은 `feeling_select`/`course_select` 프롬프트([lib/recommendation.ts](../../../lib/recommendation.ts))에 애초에 전달되지 않는다. `resolveIntent()`가 계산하는 `budgetLevel`([lib/intent.ts](../../../lib/intent.ts))도 검색·스코어링 어디에도 쓰이지 않는 죽은 값이다. 게다가 후보 장소 데이터(`KakaoPlace`, [lib/place.ts](../../../lib/place.ts))에는 가격 필드가 아예 없다 — Kakao·네이버 무료 지역 검색 API 둘 다 가격 정보를 제공하지 않는다(확인됨). 즉 예산은 UI에서 물어보기만 하고 AI 추천 품질에 전혀 기여하지 못하는 장식용 입력이었다.
- 시간(`duration`)도 마찬가지로 프롬프트에 전달되지 않는다. 하지만 이건 "장소가 실제로 그 시간 안에 끝나는지"를 검증할 필요 없이 코스 단계 수를 조절하는 구조적 지침으로 쓸 수 있어 예산과 상황이 다르다.
- 채점된 5건 중 3건(fail 2건, borderline 1건)의 근본 원인은 프롬프트가 아니라 **후보 검색 단계**였다: "영화보러 가고싶어"는 `lib/intent.ts`의 `activity` 규칙에 `영화`가 잘못 묶여 있어 영화관이 아니라 액티비티(방탈출 등)가 검색됐고, "성수동에서 일식 데이트"/"기념일 양식 데이트"는 `meal` 규칙 키워드 목록에 없는 음식 종류라 매칭 자체가 안 돼 카페 위주 폴백으로 빠졌다.

## 목표

- 예산을 AI 추천 경로(프롬프트·후보 검색)에서 완전히 제거하고, 입력 화면에서도 질문하지 않는다.
- 시간을 옵셔널 입력으로 바꾸되, `course_select`의 코스 단계 수 조절에 실제로 반영한다.
- 후보 검색이 사용자가 자유 입력에 적은 구체적인 카테고리(음식 종류, 액티비티 등)를 훨씬 더 잘 찾아내게 한다 — 특히 하드코딩된 키워드 목록을 무한정 늘리지 않아도 되는 방식으로.

## 비목표

- 예산 데이터를 다른 데이터 소스(유료 API 등)로 그라운딩하지 않는다 — 이번엔 정직하게 포기한다.
- 수동 카드 작성/편집(`app/card/new.tsx`, `app/card/edit/[id].tsx`)의 예산·시간 필드는 건드리지 않는다. AI와 무관한 개인 메모 성격이라 그대로 둔다.
- `condition_tag` DB CHECK 제약에서 `budget_adjust` 값을 빼는 마이그레이션은 하지 않는다 — UI에서만 제거하고 제약은 그대로 둬서(무해) 기존 데이터 마이그레이션 리스크를 없앤다.
- freeText → Kakao 키워드 추출에 LLM(Haiku 등)을 추가로 호출하는 방식은 이번엔 하지 않는다. 먼저 freeText 원문을 그대로 추가 키워드로 보내는 저비용 방식을 적용하고, 로깅·채점 파이프라인으로 효과를 실측한 뒤 부족하면 다음 단계로 고려한다.
- `app/card/[id].tsx`가 코스 카드를 일반 카드 UI로 표시하는 별도 버그는 이 스펙 범위 밖(뒤이어 별도로 조사).

## 예산 제거

### 타입/로직

- `FeelingInput`([lib/ai.ts:90-102](../../../lib/ai.ts#L90-L102))에서 `budget: string` 필드 제거.
- `FeelingArgs`/`CourseArgs`([lib/modeForm.ts](../../../lib/modeForm.ts))에서 `budget` 제거, `buildFeelingInput()`/`buildCourseInput()`도 그에 맞춰 수정.
- `ResolveIntentArgs`/`PlanIntent`([lib/intent.ts:14-30](../../../lib/intent.ts#L14-L30))에서 `budget`/`budgetLevel` 제거.
- `lib/prompt.ts`의 `BUDGET_MAP`/`BUDGET_LABEL`(ko/en, [L12-22, L54-63](../../../lib/prompt.ts#L12-L22))과 `buildPrompt()`의 예산 텍스트 삽입 부분([L206, L234](../../../lib/prompt.ts#L206)) 삭제. JSON 스키마 설명 텍스트에 남아있던 `estimated_budget` 언급도 정리.
- `lib/recommendation.ts`의 `deterministicFields()`([L23-33](../../../lib/recommendation.ts#L23-L33))에서 `estimated_budget` 계산 로직 제거 → 이 함수가 반환하는 객체에서 `estimated_budget` 필드 자체를 없애고, 카드 조립부(`assembleFeelingCards`/`assembleCourseCards`/`buildDeterministicFallback`)에서 `estimated_budget: ''`로 저장.
- `lib/ai.ts`의 `runFreeGenFlow()`([L311-334](../../../lib/ai.ts#L311-L334))도 동일하게 정리.

### UI

- `app/mode-flow/feeling.tsx`(L85-90 부근)와 `app/mode-flow/course.tsx`(L52-59 부근)에서 예산 `TriOptionRow` 섹션과 관련 state(`budget`)·스타일(`budgetBlock`) 삭제.
- `app/(tabs)/candidates.tsx`(L212-217 부근, next_meet 확정 시 `budget:'medium'` 하드코딩)와 `app/card/[id].tsx`(L151-163 부근, 재추천 시 `budget:'medium'`/`budget_adjust`→`'low'` 로직)에서 budget 관련 코드 제거.

### "예산 조정되면" 조건태그(budget_adjust)

- 카드 반응 선택지 UI에서 `budget_adjust` 옵션 제거.
- `app/card/[id].tsx`의 `budget_adjust` 태그 처리 로직(위 항목과 동일 지점) 제거.
- i18n(`locales/ko.json`/`en.json`)의 `card.conditionTags.budget_adjust`, `candidates.conditionLabels.budget_adjust` 키 제거.
- **DB는 안 건드림**: `condition_tag` CHECK 제약에 `budget_adjust`가 허용값으로 남아있어도 UI에서 더 이상 그 값을 보내지 않으므로 무해하다. 마이그레이션 불필요.
- `__tests__/partnerReaction.test.ts`에서 `budget_adjust` 라벨을 검증하던 테스트 제거/수정.

### 카드 표시 (6개 화면)

`app/card/[id].tsx`, `app/card/confirm.tsx`, `app/mode-flow/result.tsx`, `app/mode-flow/course-result.tsx`, `app/(tabs)/memories.tsx`, `app/share/mutual.tsx`에서 💰 예산 아이콘/텍스트를 `estimated_budget`이 빈 문자열이 아닐 때만 렌더링하도록 조건부 처리. AI 생성 카드는 자연히 안 보이고, 수동 카드(값이 채워짐)는 계속 보인다.

## 시간(duration) 옵셔널화 + 실제 반영

### 옵셔널 전환

- `FeelingInput.duration`([lib/ai.ts](../../../lib/ai.ts)), `FeelingArgs.duration`/`CourseArgs.duration`([lib/modeForm.ts](../../../lib/modeForm.ts)) 타입을 `string` → `string | undefined`로 변경.
- `feeling.tsx`/`course.tsx`의 시간 선택 UI(`OptionCardPicker`)는 유지하되, `duration` state 초기값을 미리 선택된 값(`'2-3h'` 등)이 아니라 `undefined`로 바꾸고, "선택 안 함"을 유효한 최종 상태로 허용.

### course_select: 단계 수 조절

- `lib/recommendation.ts`의 `buildCourseSelectPrompt()`([L84-106](../../../lib/recommendation.ts#L84-L106))에 duration 기반 지침 추가:
  - `1h` → "2단계로 구성하세요"
  - `2-3h` → "3단계로 구성하세요"
  - `half_day`/`full_day` → "4단계로 구성하세요"
  - duration 없음 → 기존처럼 AI 재량(지침 생략)
- `COURSE_SELECT_SCHEMA`([supabase/functions/generate-ai/index.ts](../../../supabase/functions/generate-ai/index.ts))는 `steps` 배열 길이를 제약하지 않으므로 Edge Function 변경 불필요, 프롬프트 텍스트만으로 유도.

### feeling_select: 참고 문맥

- `buildFeelingSelectPrompt()`([lib/recommendation.ts:61-82](../../../lib/recommendation.ts#L61-L82))에 duration이 있을 때만 "가능 시간: {duration}" 한 줄 추가(구조적 강제 없음). 없으면 이 줄 생략.

### cards(위치 없는 자유생성 폴백)

- `lib/prompt.ts`의 `buildPrompt()`([L209, L237](../../../lib/prompt.ts#L209))도 동일하게, `input.duration`이 있을 때만 `DURATION_MAP` 텍스트 줄을 넣고 없으면 생략하도록 수정(`DURATION_MAP[undefined]` 조회로 깨지는 것 방지). `DURATION_MAP`/`DURATION_MAP_EN` 자체는 유지.

### 표시

- `estimated_time` 카드 표시는 그대로 유지. duration 미선택 시 빈 값 → 예산과 동일하게 조건부 렌더링(6개 화면, 위 항목과 같은 조건부 로직에 시간도 포함).

## 후보 검색 매칭 개선

### "영화" 분리

- `lib/intent.ts`의 `activity` 규칙([L53-60](../../../lib/intent.ts#L53-L60)) 패턴에서 `영화` 제거.
- 새 규칙 추가: `purpose: 'culture'` 계열, `pattern: /영화/`, `placeTypes: ['culture']`, `searchQueries: ['영화관']`.
- `lib/place.ts`의 `FOCUS_KEYWORD_MAP`([L51-60](../../../lib/place.ts#L51-L60))도 동일하게 수정(자유생성 폴백 경로용 — `detectPlaceFocus()`가 이 맵을 씀).

### freeText 원문을 검색어에 추가

- `lib/intent.ts`의 `resolveIntent()`([L133-177](../../../lib/intent.ts#L133-L177))가 반환하는 `searchQueries`에, 규칙 매칭 결과와 무관하게 **freeText 원문 자체**를 항상 추가(중복 제거는 기존 `uniq()` 헬퍼 재사용).
- `meal` 규칙([L77-84](../../../lib/intent.ts#L77-L84))에 일식/양식/한식/중식 키워드도 추가 — `placeTypes`(카테고리 코드 필터링)에는 여전히 필요하므로.
- 이 변경으로 목록에 없는 어떤 키워드("이자카야", "브라질리언 바베큐" 등)든 Kakao가 직접 풀텍스트로 찾아주게 되어, 하드코딩 목록을 무한정 늘릴 필요가 없어진다.

### 입력창 힌트 문구

- `feeling.tsx`/`course.tsx`의 자유 입력 텍스트박스 근처에 "예: 일식, 삼겹살, 방탈출처럼 키워드 위주로 적어주세요" 안내 문구 추가(`locales/ko.json`/`en.json`에 새 키 추가, 두 언어 동시 갱신).

## 에러 처리

- freeText가 없으면(빈 문자열) 기존과 동일하게 `GENERAL_QUERIES`(카페/맛집/관광명소) 폴백 유지 — freeText 원문 추가 로직은 freeText가 있을 때만 동작.
- duration이 예상 밖의 문자열이면(타입 밖 값) 프롬프트 지침 생성 시 매칭 실패 → 지침 생략(기존 AI 재량 경로로 안전하게 폴백), 에러를 던지지 않는다.

## 테스트 범위 (TDD)

이 변경은 대부분 순수 함수(`lib/intent.ts`, `lib/prompt.ts`, `lib/recommendation.ts`, `lib/modeForm.ts`)라 기존 Jest 테스트 하네스로 충분히 커버된다. 영향받는 기존 테스트:

- `__tests__/modeForm.test.ts` — `buildFeelingInput`/`buildCourseInput`에서 budget 관련 assertion 제거, duration optional 케이스 추가.
- `__tests__/intent.test.ts` — `resolveIntent()`의 `budgetLevel` assertion 제거, "영화" 규칙 재배치 검증, freeText 원문이 `searchQueries`에 포함되는지 검증(신규 테스트).
- `__tests__/recommendation.test.ts` — `deterministicFields()`가 더 이상 `estimated_budget`을 채우지 않음을 검증, `buildCourseSelectPrompt()`의 duration별 단계 수 지침 검증(신규 테스트), `buildFeelingSelectPrompt()`의 duration 유무별 텍스트 검증(신규 테스트).
- `__tests__/recommendationSession.test.ts`, `__tests__/prompt.test.ts`, `__tests__/place.test.ts`, `__tests__/candidate.test.ts` — budget 필드를 쓰던 fixture에서 제거.
- `__tests__/partnerReaction.test.ts` — `budget_adjust` 라벨 테스트 제거.

UI(`feeling.tsx`/`course.tsx`의 옵셔널 선택, 힌트 문구, 조건부 렌더링 6개 화면)는 이 프로젝트에 RN 컴포넌트 테스트 하네스가 없어([2026-07-04-gps-location-design.md](2026-07-04-gps-location-design.md) 참고, 기존 관례) 자동 테스트 대상에서 제외 — 시뮬레이터에서 수동 확인.
