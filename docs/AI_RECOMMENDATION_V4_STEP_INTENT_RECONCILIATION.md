# V4 Step Intent 스펙 ↔ 현재 코드 조율 애드덤

> 대상 스펙: `DATE_NAVI_AI_RECOMMENDATION_V4_STEP_INTENT_SPEC.md` (V4 Step Intent Integration)
> 작성: 2026-07-19 · 근거: 파이프라인 코드 대조 + GPT 교차검증
> 성격: **스펙 override 패치.** 아래 7개 항목은 스펙 해당 섹션의 지시를 대체/보강한다. breaking 충돌은 0이며 전부 조율 항목이다.
>
> 원칙: 스펙은 그린필드처럼 서술됐으나 현재 코드에 **이미 존재하는 자산**(정규식 파서·캐시 제외 로직·부적합 필터)과 **최근 성능 방향**(AI 호출 제거)이 있다. 이 애드덤은 그 간극만 정리한다.

---

## 이미 정렬됨 (구현 불필요, 확인만)

| 스펙 요구 | 현재 코드 | 상태 |
|---|---|---|
| §4.1 클라 `parsedPreferences` 무시 | `recommend-date-handler.ts:119` strip 후 서버 재계산 | ✅ 이미 함 |
| §10.5 raw `additionalRequest` 크로스유저 캐시 금지 | `kakao-search-cache.ts:124` explicit phase 제외 | ✅ 이미 함(단 §9 갭 참조) |
| §18.1 budget 미검증·슬롯 0 | `recommendation-ranking.ts` budget 상시 0 | ✅ 현실 일치 |
| §12 부적합 장소 ineligible | `recommendation-category.ts:54` `isUnfitDatePlace` + `recommendation-ranking.ts:76` | ✅ 배포 완료(세션 AX) |

---

## 조율 패치 7항목

### 패치 1 — 중복 파서 통합 (스펙 §8 override)

**문제**: 스펙 §8은 "규칙 파서를 새로 만든다"고 하나, **이미 정규식 파서가 존재**한다.
- `recommendation-intent.ts:164` `parseAdditionalRequest(text)` → `excludedCategories`, `quietPreferred`, `photoFriendlyPreferred`, `indoorOnly` 추출.
- `recommendation-intent.ts:17-131` 한/영 긍정·부정 패턴 사전.
- `mergeServerPreferences` (`:181`) 로 구조화 필드와 병합, 핸들러 `recommend-date-handler.ts:120`에서 실행.

**패치**: 새 step-intent 규칙 파서는 **별도 병렬 파서로 두지 말고** 기존 `parseAdditionalRequest`를 **확장/흡수**한다. `ParsedRecommendationIntent`(스펙 §6)가 기존 4필드(`softPreferences`·`globalConstraints`로 매핑)를 **상위 집합**으로 포함하도록 리팩터. 요청당 자유텍스트 파싱은 **정확히 1회**.

- `softPreferences.quiet` ← 기존 `quietPreferred`
- `softPreferences.photoFriendly` ← 기존 `photoFriendlyPreferred`
- `globalConstraints.indoorOnly` ← 기존 `indoorOnly`
- `globalConstraints.excludedCategories` ← 기존 `excludedCategories`
- `stepIntents[]` = **신규**(dish/cuisine/venue_subtype 등)

---

### 패치 2 — AI 파서는 드문 fallback (스펙 §8.2 강화, §24 Phase 순서 고정)

**문제**: 직전 세션(AU)에서 replacement-candidates의 **AI 큐레이션을 의도적으로 완전 제거**(2-3초→0.3-0.6초)했다. 스펙이 초기 추천 경로에 새 AI 호출(`parse_step_intents`)을 추가하는 것은 이 성능 방향과 역행 위험.

**패치**:
- **Phase 1은 규칙 파서 전용**으로 완결(스펙 §24 Phase 1 유지). AI 파서 없이 흔한 dish/activity 키워드가 동작해야 함.
- AI 파서(`parse_step_intents`)는 **Phase 2**에서만, 그리고 스펙 §8.2 조건(규칙 미검출·다중 타깃·복합 패러프레이즈·부정/조건문·저신뢰·미등재 영어) 충족 시에만 호출.
- **성공 기준(스펙 §25 비용): 사전 등재 요청은 AI 호출 0.** 규칙 파서 사전 커버리지를 넓혀 AI 호출률을 낮게 유지.

---

### 패치 3 — 캐시 제외에 step_intent 추가 (스펙 §10.5 구체화, **보안**)

**문제**: 현재 `isCacheable`은 `phase !== 'explicit'`만 검사(`kakao-search-cache.ts:124-126`). 스펙이 만드는 새 `step_intent` phase는 **additionalRequest에서 파생**됐는데 현재 로직으로는 **캐시된다** → 개인 요청 유래 쿼리가 크로스유저 캐시에 유입.

**패치**: `isCacheable`을 아래로 수정.
```ts
const isCacheable = (item: { phase?: string }): boolean =>
  item.phase !== 'explicit' && item.phase !== 'step_intent';
```
스펙 §10.5 "step_intent 검색 크로스유저 캐시 금지"를 코드로 강제. 향후 allowlist된 canonical term만 캐시하는 최적화는 별도 프라이버시 리뷰 후.

---

### 패치 4 — category는 string 유지 후 내부 정규화 (스펙 §5 override)

**문제**: 스펙 §5는 `courseSteps.category`를 엄격한 union 타입으로 전제. 현실은 자유 문자열이며 인식 사전이 3곳에 산재.
- 스키마: `shared/recommendation/schemas.ts:19` `category: boundedText(80)` (검증 없는 자유 텍스트)
- 서버 카테고리 집합: `recommendation-intent.ts:6` `SERVER_COURSE_CATEGORIES`
- 검색 매핑: `recommendation-search.ts:96` `CATEGORY_SEARCH` (별칭 restaurant/bar/attraction 포함)
- 정규화: `recommendation-category.ts:62` `normalizeRecommendationCategory`

**패치**: 외부 계약(요청 스키마)은 **string 유지**(breaking change 회피). StepIntent를 step에 바인딩할 때는 `normalizeRecommendationCategory`로 얻은 **내부 canonical category**를 기준으로 삼는다. 스펙 §5의 union 타입은 **내부 표현으로만** 적용하고, 산재된 3개 사전을 이 정규화 함수로 수렴시킨다.

---

### 패치 5 — evidence에 phase/intent 필드 실제 보존 (스펙 §11 정정)

**문제**: 스펙 §11은 evidence에 phase가 이미 있다고 전제하나, 현재 `SearchEvidence`(`recommendation-search.ts:6-12`)에는 `source`(category/keyword/fallback 3값)만 있고 **phase는 저장 안 됨**. `evidenceFromQuery`(`:137`)가 phase를 버린다.

**패치**: `SearchEvidence`에 스펙 §11 필드를 실제로 추가하고 `evidenceFromQuery`에서 보존.
```ts
type SearchEvidence = {
  queryId: string; queryText?: string;
  source: 'category' | 'keyword' | 'fallback';
  page: number; categoryCode?: string;
  // 신규 (스펙 §11):
  phase?: 'category' | 'step_intent' | 'reinforcement' | 'fallback';
  stepId?: string; intentType?: string;
  canonicalTerm?: string;
  strength?: 'required' | 'preferred';
  expansionLevel?: 0 | 1 | 2;
};
```
병합(`mergeKakaoSearchEvidence` `:207`)은 유니크 레코드 전부 보존(스펙 §11).

---

### 패치 6 — 로마자 alias 정규화 (스펙 §9 보강)

**문제**: 스펙 §9 `ENGLISH_TO_KAKAO_CANONICAL`은 **번역어 전용**("korean pork belly"→"삼겹살"). 영어권 유저의 실제 입력은 **로마자 표기**("samgyupsal", "tteokbokki")가 많고, 표기가 비표준(samgyeopsal/samgyupsal/samgyopsal)이라 규칙 파서가 못 잡음.

**패치**: 사전을 두 종류로 분리.
1. **번역 가능**(일반명사): "pasta"→"파스타", "sushi"→"초밥"
2. **고유어 로마자**(번역 불가): alias 배열로 변형 흡수
```ts
const KOREAN_ROMANIZED = {
  삼겹살: { aliases: ['samgyeopsal','samgyupsal','samgyopsal'], canonicalTerm: '삼겹살' },
  떡볶이: { aliases: ['tteokbokki','ddeokbokki','topokki'],   canonicalTerm: '떡볶이' },
};
```
- **displayLabel** 고유어는 로마자 유지: `{ ko:'삼겹살', en:'Samgyeopsal' }` (스펙 §9의 "Korean pork belly" 대신, 또는 병기).
- alias 미등재/오타 표기는 **AI 파서 fallback**이 로마자→한글 음차 담당(패치 2 조건에 "미등재 로마자" 추가).

---

### 패치 7 — 파싱 성공 시 raw explicit 검색 제거 (스펙 §10 신규 규칙)

**문제**: 현재 `buildKakaoSearchPlan`이 additionalRequest **원문 전체**를 explicit 검색어로 추가(`recommendation-search.ts:126-127`).
```ts
const explicit = request.additionalRequest?.trim();
if (explicit) items.push({ source: 'keyword', phase: 'explicit', queryText: explicit });
```
- 통문장("삼겹살 먹고 싶고 카페는 조용했으면…")을 카카오 키워드 검색에 던지면 **개선 전에도 결과가 거의 없음**(카카오는 짧은 키워드용).
- Step Intent 도입 후 이 로직 유지 시 raw 통문장 + canonical "삼겹살" **둘 다 실행** → 12개 예산(스펙 §10.4/§19.4) 낭비.

**패치**:
```
파싱 성공 → raw explicit 쿼리 제거, canonical step-intent 쿼리만 실행
파싱 실패 → raw explicit를 최후 보조 쿼리로만 사용
```
- 예산 우선순위(스펙 §10.4): canonical intent가 generic `'데이트 코스'`(`:128`)보다 **먼저**. 현재 순서(explicit→intent)가 이미 근접하므로 raw 자리에 canonical을 대체 삽입.
- canonical step_intent 쿼리도 패치 3에 따라 **캐시 제외**.

---

## 파일 계획 보정 (스펙 §23)

스펙 §23 신규 파일은 유효. 단 아래 **기존 파일 수정**을 명시 추가.

| 파일 | 패치 | 변경 |
|---|---|---|
| `recommendation-intent.ts` | 1 | 기존 파서를 step-intent 파서로 확장(중복 제거) |
| `kakao-search-cache.ts` | 3 | `isCacheable`에 step_intent 제외 |
| `recommendation-category.ts` | 4 | 내부 canonical category로 산재 사전 수렴 |
| `recommendation-search.ts` | 5,7 | evidence phase 보존 + raw explicit 조건부 제거 |
| `step-intent-dictionary.ts` (신규) | 6 | 번역 사전 + 로마자 alias 분리 |

---

## Phase 1 착수 시 Acceptance (스펙 §24 Phase 1 + 이 애드덤)

1. "삼겹살 먹고 싶어" → canonical `삼겹살` step-intent 검색, raw 통문장 검색 **미실행**(패치 7).
2. 요청당 자유텍스트 파싱 **1회**, AI 호출 **0**(패치 1·2).
3. step_intent 쿼리가 `kakao_search_cache`에 **미저장**(패치 3, 검증: 캐시 행 0).
4. "samgyupsal" → alias 정규화로 `삼겹살` 매핑(패치 6).
5. i18n: 새 문구 `locales/ko.json`·`en.json` 동시(프로젝트 원칙).
