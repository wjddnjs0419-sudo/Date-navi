# Plan Generation Architecture V2

> **문서 성격**: 계획/데이트 추천 생성 로직을 V2 구조로 개선하기 위한 아키텍처 설계 문서.
> **아직 코드는 수정하지 않는다.** 이 문서는 구현 착수 전의 설계 합의를 목적으로 한다.
> 현재 구현 사실은 `PLAN_GENERATION_LOGIC_ANALYSIS.md`를 근거로 하며, 파일:라인으로 표기한다.

## 0. 문서 표기 규칙

- **[현재 사실]** — 실제 코드에 존재하는 동작. 파일 경로/함수명으로 근거를 표시한다.
- **[V2 제안]** — 아직 구현되지 않은 설계. "이미 구현된 것처럼" 쓰지 않는다.
- **[Needs Decision]** — 코드만으로 결정할 수 없어 사람이 정해야 하는 항목.
- **[Needs Runtime Verification]** — 실행/외부 콘솔 확인이 필요한 항목.
- **[Future]** — V2 범위 밖. 구조만 열어두고 구현하지 않는다.

---

## 1. 배경과 V2 목표

### [현재 사실] 현재 파이프라인

```
사용자 입력 (mode-flow/*.tsx)
→ FeelingInput 정규화 (lib/modeForm.ts)
→ (위치 있을 때만) Kakao Local 검색 (place-search Edge Function)
     - geocode 1회 + 카테고리 4종 + 키워드 1종 (focus 있으면 1종)
     - 이름 기준 중복 제거, 최대 20개
→ 프롬프트 조립 (lib/prompt.ts buildPrompt)
→ Claude Haiku 4.5 단일 호출 (generate-ai Edge Function)
→ 카드 3개 (data.cards.slice(0,3)) / 실패 시 정적 FALLBACK
```

근거: `lib/ai.ts:236-265`(`generateDateCards`), `supabase/functions/place-search/index.ts`, `supabase/functions/generate-ai/index.ts:67`(`MODEL='claude-haiku-4-5'`).

### V2 목표

Claude 모델을 더 큰 모델로 교체하지 않는다. **Haiku 4.5 단일 호출 구조를 유지**하면서 다음을 개선한다.

1. Candidate Retrieval Recall 향상 (Query Expansion + Adaptive Retrieval)
2. 사용자 의도 기반 Intent Resolution (freeText뿐 아니라 mode+UI 종합)
3. 결정론적 Candidate Scoring / Ranking 도입
4. Claude 역할 축소 및 명확화 (선택 + 설명 생성만)
5. 장소 Hallucination 방지 (candidate_id 제약 + Validation)
6. 재추천 품질 개선 (Stable placeId 기반 제외)
7. API 호출/토큰/Latency 계측 구조 확보
8. 향후 A/B Test가 가능하도록 Config/Analytics 구조만 확장 (실제 실험은 [Future])

### V2가 하지 않는 것 (Non-Goals)

- 완벽한 장소 추천 AI를 만드는 것이 아니다.
- 실제 가격/소음/혼잡도/Wi-Fi를 알아내는 것이 아니다.
- Claude 다회 호출, Sonnet 승격, ML Ranking, Persistent Cache는 [Future]다.

---

## 2. V2 핵심 설계 원칙 — 역할 분리

각 시스템의 책임을 명확히 나눈다.

### Kakao Local API — Candidate Retrieval

실제로 존재하는 장소 후보를 넓게 검색하는 역할만 한다. Kakao는 다음을 **판단하지 않는다** (데이터 자체가 없다): 조용한지 / 공부하기 좋은지 / 데이트하기 좋은지 / 편안한지 / 실제로 저렴한지.

### Application Logic — 결정론 영역

Intent 분석, Query Expansion, Deduplication, Scoring, Ranking, Validation, Deterministic Fallback, Config, Analytics를 담당한다. Recommendation Pipeline의 재현 가능한(deterministic) 영역 전부.

### Claude Haiku 4.5 — Reranker + Explanation Generator

Application이 제공한 **상위 Candidate 중에서만** 선택하고, 사용자 친화적 title/summary/why_recommended/tags를 생성한다. Claude는 장소를 검색·생성하지 않으며, 후보 집합에 없는 장소를 낼 수 없다.

---

## 3. V2 전체 Pipeline

```text
User Input (mode + freeText + UI selections + location/coords)
        ↓
Input Normalization                 [현재: lib/modeForm.ts 재사용]
        ↓
Intent Resolution                   [V2 신규] mode + freeText + UI → PlanIntent
        ↓
Query Expansion                     [V2 신규] PlanIntent → searchQueries[]
        ↓
Adaptive Kakao Retrieval            [V2 신규] min/max + pagination + early stop + partial failure
        ↓
Candidate Pool (placeId 보존)        [Phase 0 선행 필수]
        ↓
Deduplication (by placeId)          [V2 신규]
        ↓
Evidence-based Scoring              [V2 신규]
        ↓
Ranking → Top N (haikuCandidateLimit)
        ↓
Claude Haiku 4.5 (candidate_id 선택 + 설명)
        ↓
Candidate Validation                [V2 신규] candidate_id 실재/중복/previousPlaceIds 검증
        ↓
Deterministic Field Merge           [V2 신규] estimated_time/budget = 앱이 채움
        ↓
(부족 시) Deterministic Fallback     [V2 신규] Claude 재호출 없음
        ↓
Result → RecommendationSession 저장  [V2 신규]
        ↓
Analytics Logging                   [V2 신규]
```

---

## 4. Data Model

### PlanIntent [V2 제안]

```ts
type PlanIntent = {
  purpose:
    | 'study' | 'date' | 'meal' | 'drink' | 'walk'
    | 'activity' | 'culture' | 'rest'
    | 'general_date';   // freeText가 비어있는 feeling의 폴백 (mood 기반)
  placeTypes: PlaceType[];
  atmosphere: AtmosphereType[];    // 표현 힌트일 뿐, 사실 단정 금지 (§10)
  budgetLevel: 'low' | 'medium' | 'high';
  duration: '1h' | '2-3h' | 'half_day' | 'full_day';
  searchQueries: string[];
  positiveSignals: string[];
  negativeSignals: string[];
};
```

> **[폐기]** 기존 초안의 `confidence: number` 필드는 제거한다. 이유는 §6.

### Candidate [V2 제안] — placeId / candidateId 2-ID 전략

```ts
type Candidate = {
  placeId: string;        // Kakao doc.id. 요청 간 안정 식별용 (Phase 0에서 보존)
  candidateId: string;    // 'candidate_001' 요청 내 임시 ID. Claude 전달/검증 전용
  name: string;
  category: string;
  address: string;
  x: number;
  y: number;
  mapUrl: string;
  distance?: number;
  matchedQueries: string[];
  matchedIntentSignals: string[];
  score: number;
};
```

**핵심 규칙**:
- `placeId` — Deduplication, `previousPlaceIds`, 재추천 제외, Analytics, [Future] Cache Key.
- `candidateId` — Claude에게 후보를 넘길 때와 Claude 응답 Validation에만 사용. **요청 간 장소 식별에 절대 쓰지 않는다.**

> **[폐기]** 기존 초안의 "candidateId(연번)를 Stable ID로 쓰는 방식"은 완전히 제거한다. 연번은 재검색 시 동일 장소가 다른 값을 받아 재추천 제외가 깨진다.

### RecommendationSession [V2 제안] — §13에서 상세

```ts
type RecommendationSession = {
  sessionId: string;
  input: FeelingInput;
  intent: PlanIntent;
  candidates: Candidate[];
  previousPlaceIds: string[];
  createdAt: number;
};
```

> **[폐기]** 기존 초안의 Persistent Candidate Cache / TTL / Redis / KV / Edge Memory Cache는 V2에서 제거하고 [Future]로 이동. §13 참조.

---

## 5. Intent Resolution [V2 제안]

### [V2 결정] 모드 구조 단순화 — 2개 모드

> **[V2 결정, 사용자 확정]** 기존 5개 모드 중 **`feeling`과 `make_course` 2개만 유지**한다.
> - **삭제**: `pick_for_me`(앱이 골라줘), `light`(가볍게 하고 싶어) — freeText 없이 UI 선택만으로는 `feeling`과 차별성이 없어 통합/삭제.
> - **결과**: 남는 두 모드는 **둘 다 freeText를 가진다.** 따라서 "freeText 없는 모드"를 위한 Default Intent 분기가 **불필요해지고 설계가 단순해진다.**

| 모드 | 사용자 표현 | freeText | 출력 형태 |
|---|---|---|---|
| `feeling` | 느낌만 말할게 | 선택적 (`feeling.tsx:66`, `buildFeelingInput` `norm()`) | **단일 장소 카드 3개** |
| `make_course` | 코스로 정리해줘 | **필수** (`course.tsx:22`에서 비면 진행 차단) | **다지점 코스 카드** |

> **[Needs Decision — 삭제 실행 범위]** `pick_for_me`/`light` 삭제는 아키텍처 결정이며, 실제 코드 제거(라우트 `app/mode-flow/pick.tsx`·`light.tsx`, `lib/modeForm.ts`의 `buildPickInput`/`buildLightInput`, 진입 UI, i18n 키, `MODE_CONTEXT`/`MODE_EMPHASIS` 엔트리)는 별도 정리 작업이다. **본 문서는 코드를 수정하지 않는다.**

### 원칙: Intent는 freeText 분석 결과가 아니다

Intent는 **Mode + freeText + UI Selections + Rule-based Mapping**을 종합한 "Recommendation Search Plan"이다. freeText가 비어 있어도(feeling에서 가능) Mode·UI Selection으로 최소 Intent를 구성한다.

```ts
resolveIntent({ mode, freeText, mood, budget, duration }): PlanIntent
```

### 모드별 Intent 도출

**feeling (freeText 있음)**: Rule-based Keyword Intent + mood + budget/duration 종합.
**feeling (freeText 비어 있음)**: mood 기반 최소 Intent (mood를 atmosphere로 매핑, placeTypes는 폭넓게).
**make_course (freeText 필수)**: Rule-based Keyword Intent + budget/duration 종합. **단, 코스는 단일 카테고리로 좁히지 않는다** — §16 참조.

### Rule-based Intent Mapping (예시)

```ts
const INTENT_RULES = {
  study: {
    keywords: ['공부', '작업', '과제', '노트북', '집중'],
    placeTypes: ['cafe'],
    searchQueries: ['카페', '스터디카페', '북카페', '작업 카페', '조용한 카페'],
    positiveSignals: ['스터디', '북카페', '작업'],
    negativeSignals: ['술집', '포차', '클럽', '라운지'],
  },
  // ...
};
```

> **[현재 사실]** 유사 로직이 이미 `lib/place.ts:49-66`의 `detectPlaceFocus()`(정규식→카테고리)로 부분 존재한다. V2 Intent Rules는 이를 흡수·확장하는 형태가 자연스럽다.

---

## 6. Intent Confidence 제거 [V2 결정]

기존 초안의 `confidence` / `intentConfidenceThreshold` / "Low Confidence 시 Claude Intent Parser 호출"을 **V2 범위에서 완전히 제거**한다.

이유: V2 초기에는 Low Confidence여도 Claude를 추가 호출하지 않는다. 실제로 쓰이지 않는 필드/임계값을 구현하지 않는다.

[Future]로 이동: Intent Confidence Scoring, Claude Intent Parser, Low Confidence Fallback.

---

## 7. Query Expansion [V2 제안]

단일 카카오 검색 대신 Intent 기반 다중 쿼리를 생성한다.

```
입력: "공부하기 좋은 조용한 카페"
Intent: purpose=study, atmosphere=quiet, placeType=cafe
Query Expansion:
  - CE7 카페 카테고리 검색
  - "스터디카페"
  - "북카페"
  - "작업 카페"
  - "조용한 카페"
```

각 쿼리 결과를 하나의 Candidate Pool로 병합한다.

> **[Needs Decision]** Query Expansion을 클라이언트(`lib/ai.ts`)에서 만들지, Edge Function(`place-search`) 내부에서 만들지 → §22 Q4/Q5 참조. **권장: Edge 내부**(레이턴시 이중 홉 회피).

---

## 8. Adaptive Retrieval Flow [V2 제안] — 별도 상세

### [폐기] candidatePoolTarget = 80

"80개를 반드시 채운다"는 개념을 제거한다. 대신 **최소 확보 / 최대 상한 / 호출 예산**으로 바꾼다.

```ts
const DEFAULT_RETRIEVAL_CONFIG = {
  minCandidateCount: 30,     // 이 정도 확보되면 조기 종료 가능
  maxCandidateCount: 80,     // 이 이상 모으지 않음
  initialPageSize: 15,       // Kakao size (카테고리/키워드 max 15)
  maxPagesPerQuery: 2,       // 쿼리당 최대 2페이지
  maxKakaoRequests: 8,       // 추천 1회당 Kakao 호출 상한
};
```

### 흐름

```text
Query Expansion → Priority Query 결정
   ↓
각 Query Page 1 검색 (부분 실패 허용, §아래)
   ↓
Merge → Deduplication(by placeId)
   ↓
[종료 판정]  아래 조건 중 하나라도 충족되면 Retrieval 종료:
   (a) minCandidateCount 이상  AND  핵심 intent 쿼리 최소 실행 완료  ← ★재평가 반영
   (b) maxCandidateCount 도달
   (c) maxKakaoRequests 도달
   (d) 검색 결과 소진
   ↓ (미충족 시)
Priority 높은 Query부터 Page 2 검색 → Merge → Dedup → 재판정
```

### ★ Early Stop 개선 (재평가 반영)

**조기 종료 조건을 "건수"만으로 두지 않는다.** 첫 쿼리(예: 카페 카테고리)만으로 30개가 차면, 정작 recall을 올리려던 정밀 쿼리(스터디카페/북카페)를 실행하지 않고 끝나 V2 목적과 자기모순이 된다.

→ 종료 조건 (a)는 **`minCandidateCount 충족` + `핵심 intent 쿼리(positiveSignals 대응 쿼리) 최소 1~N개 실행 완료`** 를 함께 만족해야 한다. "핵심 intent 쿼리 최소 실행 수"도 Config로 관리한다.

### Kakao Pagination [V2 신규]

- **[현재 사실]** 현재 `place-search`는 `size`만 쓰고 `page` 파라미터를 쓰지 않는다(단일 페이지). 근거: `place-search/index.ts:60,68`.
- **[V2 제안]** Kakao Local API `page` 파라미터 도입. 쿼리당 `maxPagesPerQuery`까지만. Page 2는 후보 부족 시에만.
- **Trade-off (명시)**: pagination/다중 쿼리 도입으로 Kakao 호출 수가 **현재 최대 6회 → 최대 8회(maxKakaoRequests)** 로 늘고 Latency가 증가한다. 그래서 early stop과 호출 예산으로 상한을 건다.

### 부분 실패 정책 [V2 제안]

- **[현재 사실]** 현재 `searchPlaces()`는 전체를 try/catch로 감싸 하나라도 실패하면 빈 배열로 폴백. 근거: `lib/ai.ts:16-26`.
- **[V2 제안]** 각 쿼리를 독립 처리(`Promise.allSettled` 또는 동등). 5쿼리 중 3성공/2실패면 성공한 3개로 Merge → Dedup → 부족하면 남은 예산 내에서 pagination/fallback query. **개별 쿼리 실패가 전체 추천 실패로 이어지지 않는다.**
- Analytics에 `successfulQueryCount`, `failedQueryCount`, `kakaoRequestCount` 기록.

---

## 9. Candidate Processing [V2 제안]

### Deduplication (by placeId)

중복 제거 우선순위: **① Kakao Place ID(placeId) → ② mapUrl → ③ name+address**.
동일 장소가 여러 쿼리에서 발견되면 **삭제하지 않고 `matchedQueries`를 병합**한다. 다중 쿼리 매칭은 Ranking Signal이 된다.

> **[현재 사실]** 현재는 `name` 문자열 Set으로만 중복 제거(`place-search/index.ts:125-132`). placeId 기반이 아니다 → Phase 0 선행 필수.

### Evidence-based Scoring

**사용 가능한 근거만** 점수화한다.

| Signal | 근거 | 점수(예시) |
|---|---|---|
| Base Category Match | Kakao category | +3 |
| Intent Keyword Match | name/category 문자열 | +3 |
| Positive Signal Match | name/category 문자열 | +2 |
| Multiple Query Match | matchedQueries 수 | 추가 쿼리당 +1 |
| Distance Score | Kakao distance | 0~3 |
| Negative Signal Match | name/category 문자열 | -5 |

**사용 금지 (Kakao에 데이터 없음)**: 실제 소음, 콘센트, Wi-Fi, 좌석 편안함, 실제 가격, 실제 혼잡도, 영업시간. 없는 정보를 사실로 간주하지 않는다.

**negativeSignals 주의 (명시)**: name/category 문자열에만 적용된다. focus 카테고리 검색이면 이미 해당 카테고리만 나오므로 효과가 이중이 되어 실효가 제한적이다. **효과를 과대평가하지 않는다.**

### Ranking

```
Raw Pool (≤ maxCandidateCount)
  → Dedup (matchedQueries 병합)
  → Score
  → Ranked (rankedCandidateLimit, 예: 20)
  → Claude 전달 (haikuCandidateLimit, 예: 15)
```

Claude에게 **Raw Pool 전체를 넘기지 않는다.**

---

## 10. Claude Integration V2 [V2 제안]

### Prompt Responsibility Boundary

**Claude가 담당**: 상위 Candidate 비교 → 선택 / title / summary / why_recommended / tags.
**Claude가 담당하지 않음**: 장소 검색 / Candidate 생성 / 장소 실재 판단 / estimated_time / estimated_budget.

### Claude에게 전달 / 미전달

전달: User Intent, User Preferences, Mode, Top Candidates(candidateId 포함), previousPlaceIds에 대응하는 "추천 금지 candidate 목록".
미전달: Raw Candidate Pool 전체.

### Output Schema [V2 제안] — 모드별 2종

두 모드는 Claude 단계 전까지 동일한 파이프라인을 쓰고, **출력 스키마만 모드로 분기**한다.

**feeling — 단일 장소 카드 3개**
```json
{
  "recommendations": [
    {
      "candidate_id": "candidate_012",
      "title": "...",
      "summary": "...",
      "why_recommended": "...",
      "tags": []
    }
  ]
}
```

**make_course — 순서 있는 다지점 코스 (§16)**
```json
{
  "recommendations": [
    {
      "title": "...",
      "summary": "...",
      "why_recommended": "...",
      "tags": [],
      "steps": [
        { "candidate_id": "candidate_003", "label": "브런치 카페", "desc": "..." },
        { "label": "한강 산책", "desc": "..." },
        { "candidate_id": "candidate_011", "label": "저녁 식당", "desc": "..." }
      ]
    }
  ]
}
```
- 장소 단계는 `candidate_id`를 가진다(후보 풀에서 선택).
- 순수 행동 단계(산책·영화 등 Kakao 장소가 아닌 것)는 `candidate_id` 없이 label/desc만.

Application이 `candidate_id`로 실제 장소 정보(name/address/mapUrl)를 결합한다.

```
candidate_id → Candidate Map Lookup → name/address/mapUrl → Final Result
```

### 속성 사실 단정 금지 (Prompt Rule)

Kakao에 quiet/comfortable/romantic/crowded/가격 정보가 없으므로 프롬프트에 다음 원칙을 넣는다:
> "Do not claim unsupported venue attributes as facts. When venue atmosphere/price data is unavailable, explain recommendations based only on available signals (category, distance, matched query)."

---

## 11. estimated_time / estimated_budget 결정론 처리 [V2 제안]

Claude Output에서 **제거**하고 Application Logic이 채운다.

- `estimated_time ← DURATION_MAP[input.duration]` (`lib/prompt.ts:26-31`)
- `estimated_budget ← BUDGET_MAP[input.budget]` (`lib/prompt.ts:9-13`)

**정의**: `estimated_budget`은 실제 장소 가격이 아니라 **사용자가 선택한 Plan Budget Range**다. UI/Data Model에서 실제 가격으로 오해되지 않게 명명·표기한다.

`make_course`의 실제 단계별 소요시간 계산은 별개 문제 → V2에서는 사용자 선택 duration을 "Plan Available Time"으로만 쓴다. 실제 Step Time Calculation은 [Future].

---

## 12. Validation & Deterministic Fallback [V2 제안] — Error/Fallback Flow

### Validation (Claude 응답 직후)

**feeling (추천 단위 = candidate_id 1개)**
1. `candidate_id` 존재 여부
2. `candidate_id`가 현재 Claude Candidate Set에 실재하는지
3. 중복 `candidate_id` 제거
4. 대응 placeId가 `previousPlaceIds`에 포함되는지 (재추천 시)
5. 유효 Recommendation 수가 `finalRecommendationCount`에 도달하는지

**make_course (추천 단위 = steps 배열)**
1. **각 장소 단계**(candidate_id 있는 step)의 candidate_id가 Candidate Set에 실재하는지 — 없으면 그 step만 폴백/제거
2. **행동 단계**(candidate_id 없는 step)는 장소 검증을 건너뛴다
3. 코스에 유효 장소 단계가 최소 1개는 남아야 한다(전부 실패 시 정적 FALLBACK)
4. (재추천 시) 코스에 쓰인 placeId가 `previousPlaceIds`와 과도하게 겹치지 않는지

### Fallback (유효 추천 부족 시) — **Claude 재호출 없음**

Ranked Candidate 중 다음을 만족하는 것을 채택:
- Claude가 아직 선택하지 않음
- `previousPlaceIds`에 없음
- Validation 통과

Fallback 카드 문구는 **Application Logic이 생성**하며, **데이터로 확인 가능한 사실만** 쓴다.

```ts
{
  candidateId: c.candidateId,
  title: c.name,
  summary: `${intentLabel} 조건과 위치를 고려한 추천 장소예요.`,
  whyRecommended: `검색 조건, 장소 유형, 거리 기준으로 상위 후보에 선정되었어요.`,
  tags: buildDeterministicTags(c, intent),
}
```

**금지 문구**: "조용한 장소예요 / 저렴한 장소예요 / 공부하기 좋아요 / 분위기가 편안해요" (데이터에 없는 속성 단정).

### Error Flow 요약

```
Kakao 전체 실패        → 후보 0개 → (현재처럼) 장소 없는 프롬프트 폴백 여부는 [Needs Decision] (§21)
Kakao 부분 실패        → 성공 쿼리로 진행 (§8)
Claude 호출 실패       → 정적 FALLBACK_CARDS (현재 lib/ai.ts:262-264 유지)
Claude 유효 추천 부족  → Deterministic Fallback (재호출 없음)
Validation 전부 실패   → 정적 FALLBACK_CARDS
```

---

## 13. RecommendationSession Lifecycle [V2 제안] — 별도 섹션

### 목적

최초 추천 이후 **동일 Recommendation Flow 내에서** Candidate Pool을 재사용한다. Persistent Cache가 아니다.

### 최초 추천

```
Kakao Retrieval → Candidate Pool → Ranking → Haiku → Result
→ session 생성: { sessionId, input, intent, candidates, previousPlaceIds: [선택된 placeId들], createdAt }
```

### 재추천

```
Existing Session → previousPlaceIds 제외 → Reranking → (부족하면 추가 Retrieval) → Haiku → Validation → New Result
→ previousPlaceIds에 새 선택 placeId 추가
```

### 저장 위치 [코드 분석 결과 → 제안]

- **[현재 사실]** 프로젝트에 zustand/redux/jotai/react-query 등 상태관리 라이브러리가 **없다**(`package.json` 확인). 유일한 전역 상태는 React Context(`lib/i18n.ts`의 `I18nProvider`, `app/_layout.tsx:116`에서 최상위 래핑).
- **[현재 사실]** 현재 mode-flow는 화면 간 데이터를 **URL params에 `JSON.stringify`** 로 넘긴다(`generating.tsx` → `result.tsx`, `params.cards`). 근거: `feeling.tsx:49-52`, `generating.tsx:39-42`.
- **[V2 제안]** 대규모 Candidate Pool을 URL params로 직렬화하는 방식은 피한다(payload 비대). 기존 구조와 가장 잘 맞는 것은 **신규 경량 React Context**(`RecommendationProvider`)를 `I18nProvider`와 같은 층에 추가하고, sessionId만 URL params로 넘기는 방식이다.
- **[폐기]** Redis / KV / Edge Memory Cache / Supabase Persistent Candidate Cache는 도입하지 않는다. → [Future].
- 최종 저장 방식은 §22 Q1/Q2에서 영향 파일과 함께 정리. **[Needs Decision]** (Context vs 단순 module-level store).

---

## 14. Regeneration V2 [V2 제안]

재추천은 `previousCandidateIds`(연번)가 아니라 **Stable `previousPlaceIds`** 를 사용한다.

```
최초: … Result → 선택 Candidate의 placeId를 previousPlaceIds에 추가
재추천: Existing Candidate Pool → previousPlaceIds 제외 → Reranking → Top N → Haiku → Validation → Result
        (Candidate Pool 부족 시에만 추가 Retrieval)
```

Haiku 프롬프트에 "다음 candidate는 추천 금지" 목록(현재 세션 candidateId로 매핑)을 전달.

> **[현재 사실]** 현재 result 화면의 "다시 추천받기"는 동일 input으로 generating을 재진입해 Kakao+Claude 전체를 처음부터 재실행한다(`result.tsx:36-41`). 중복 방지 없음. V2는 세션 재사용 + placeId 제외로 개선한다.

---

## 15. handleGenerateAlt() 통합 [V2 제안]

- **[현재 사실]** `app/card/[id].tsx:142-186`의 `handleGenerateAlt()`는 원본 카드의 위치를 재사용하지 않고 `FeelingInput`을 하드코딩으로 새로 만든다. `location`/`coords`가 아예 없어 Kakao가 호출되지 않는다 → "더 가깝게" 조건이 실제로 위치와 무관하게 동작.
- **[V2 제안]**
  - 기존 파이프라인/공통 Regeneration Service와 통합한다.
  - **원본 `input_json` 기반으로 조건 변경분만 override.** location/coords 보존.
  - `closer` → distance만 변경 / `budget_adjust` → budget만 변경 / `indoor` → avoid만 변경.
  - 전체 FeelingInput을 새로 하드코딩하지 않는다.

> **[Needs Runtime Verification]** 원본 카드의 `input_json`에 location/coords가 실제로 저장되어 있는지 확인 필요. 저장 시 `input_json: JSON.parse(input)`으로 통째 저장하므로(`result.tsx`, `course-result.tsx`) 대체로 보존되나, GPS 좌표까지 들어있는지는 실제 레코드 확인 권장. §22 Q8.

---

## 16. make_course 처리 전략 [V2 결정]

> 모드가 `feeling`·`make_course` 2개로 정리되고 **둘이 백본(Phase 0~3)을 공유**하므로, 코스도 실제 장소 기반으로 제대로 처리한다(기존 초안의 잠정 옵션 C에서 **옵션 B-hybrid로 격상**).

### 두 모드의 관계 — 백본 공유, Claude 단계만 분기

```
[공유] Intent → Query Expansion → Kakao Retrieval → Candidate Pool → Dedup → Scoring → Ranking
                                          ↓ 여기서만 모드 분기
   feeling      → Claude가 단일 장소 3개 선택        → 단일 장소 카드 3개
   make_course  → Claude가 순서 있는 장소 N개 선택   → 다지점 코스 카드
```

Phase 0~3은 **완전히 동일**하다. 코스 대응을 위해 새 검색 파이프라인을 만들지 않는다.

### [현재 사실]

`make_course`는 카드 하나가 `steps[]`(3~4개 지점 동선)를 갖고, `course-result.tsx:22-73`의 `CourseTrail`이 다지점 트레일로 렌더한다. 즉 코스는 장소가 여러 곳이다.

### 채택안: 옵션 B-hybrid (순서 있는 candidate_id[] + 행동 단계 혼합)

1. **Intent 차이**: 코스는 focus로 단일 카테고리로 **좁히지 않는다.** 여러 placeType(카페+식당+산책 등)에 걸쳐 Candidate Pool을 모아야 동선이 나온다. → Query Expansion이 다카테고리 후보를 확보(§5, §7).
2. **Claude 출력**: `steps[]` (순서 보존). **장소 단계**는 `candidate_id`를 달고, **순수 행동 단계**(산책·영화 등 Kakao 장소 아님)는 candidate_id 없이 label/desc만 (§10 스키마).
3. **Validation**: 장소 단계의 candidate_id만 후보 풀과 대조 → 없으면 그 step 폴백/제거. 행동 단계는 장소 검증 스킵 (§12).
4. **효과**: 코스의 실제 장소도 feeling과 **동일한 hallucination 방지**를 받는다. 동시에 "산책" 같은 비장소 활동의 유연성은 유지.

### 확정 결정 (품질 기준)

**① 코스 카드 수 = 1개 심화 (최대 2개)** [결정됨]
- 근거: 코스 1개는 이미 3~4개 장소 선택 + 순서 배치 + 동선 일관성을 요구한다. 3개를 내면 9~12개 선택을 단일 Haiku 호출 `max_tokens: 2048`에 우겨넣어 **출력 truncation(깨진 JSON·step 누락) 위험**과 **동선 논리 저하**가 생긴다. 코스는 "잘 짜인 하나의 계획" 산출물이므로 **깊이가 곧 품질**.
- 선택권은 **재추천(placeId 제외)** 으로 시간축에서 확보 → 품질과 다양성 양립.

**② 재추천 placeId 제외 = Soft(부분) 제외, 풀 크기 연동** [결정됨]
- 근거: Hard(모든 이전 placeId 영구 제외)는 유한 풀(V2-core ~20개)에서 코스당 3~4곳을 소비해 **2~3회 재추천이면 고갈** → 약한 후보로 품질 붕괴. 게다가 진짜 좋은 장소까지 막힘.
- 방식: **직전 결과의 핵심(상위) placeId만 제외**하고 그 이전 것은 시간이 지나며 후보로 복귀(decay). 흔한 산책 코스 등 재등장 허용.
- **풀 크기 연동**: Adaptive Retrieval(V2-plus, 풀 60~80)이면 제외 강도를 높여도 버티고, V2-core(풀 ~20)에서는 반드시 soft. `previousPlaceIds` 적용 강도를 Config로 노출한다.

### 코스 결과 UI 재설계 [별도 세션 — Future/UI]

> **[V2 데이터 범위 밖 — 다음 세션에서 진행]**

- **방향(확정)**: `course-result.tsx`의 SVG 곡선 트레일(`CourseTrail`, `computeTrailNodes`/`buildTrailPath`)을 제거하고, **위→아래 세로 단계 나열 + 단계 간 화살표 + 스크롤** 레이아웃으로 교체. feeling 결과 UI와 톤 통일, 구현 단순화.
- **순서 의존성**: 이 UI 재설계는 **Phase 4(코스 steps에 candidate_id·place_name·map_url 결합) 이후**에 해야 한다. 그래야 각 단계에 실제 장소명·지도 링크를 노출하는 새 레이아웃을 한 번에 짤 수 있다. 지금 UI를 먼저 바꾸면 스키마 변경 시 재작업이 발생한다.
- **영향 파일(예상)**: `app/mode-flow/course-result.tsx`(트레일 렌더 교체), `lib/course.ts`(SVG 좌표 계산 `computeTrailNodes`/`buildTrailPath`/`lerpToward` 등 제거 가능), 관련 스타일. `CourseStep` 타입은 place 필드 추가로 확장.
- 순수 표현 변경이라 V2 파이프라인과 독립 → 별도 세션 diff로 분리.

---

## 17. ★ DB / 타입 호환 [재평가 — Phase 4·5 리스크]

Claude Output 스키마 변경(§10·11)이 기존 저장·표시 경로에 미치는 영향을 명시한다.

- **[현재 사실]** `DateCard` 타입(`lib/ai.ts:75-87`)에 `estimated_time`, `estimated_budget: string`이 있고, `date_cards` 테이블 컬럼은 `estimated_time`/`estimated_budget` **`NOT NULL DEFAULT ''`** (`supabase/migrations/20260610063828_remote_schema.sql:250-251`).
- **[현재 사실]** `result.tsx`/`course-result.tsx`의 저장 insert가 이 두 필드를 넘기고, 상세 화면(`card/[id].tsx`)이 이를 읽어 표시한다.
- **[V2 영향]** Claude가 이 두 필드를 더 이상 생성하지 않아도, **앱이 `DURATION_MAP`/`BUDGET_MAP` 값으로 채워 넣으면** 타입·DB 컬럼·기존 저장 카드는 **그대로 하위호환**된다. 컬럼 삭제/마이그레이션 불필요.
- **[결론]** Phase 4에서 Claude 스키마를 바꿀 때, **동시에** DateCard 채우는 지점(generating/result/course-result)이 결정론 값으로 필드를 채우도록 함께 수정해야 한다. 한쪽만 바꾸면 빈 문자열 카드가 저장된다.

---

## 18. Observability & Analytics [V2 제안]

### V2에서 구현 (Observability)

Recommendation Config 중앙화, Candidate Count 계측, API Call Count 계측, Latency 계측, Claude Token Usage 계측 **가능한 구조**, User Behavior Event Logging, 향후 Experiment 필드 확장 여지.

### V2에서 구현하지 않음 ([Future] Experiment Infrastructure)

실제 Random Variant Assignment, Stable User Experiment Assignment, A/B Dashboard, 통계적 유의성 계산, Experiment Management System.

### RecommendationAnalytics [V2 제안]

```ts
type RecommendationAnalytics = {
  requestId: string;
  sessionId?: string;
  userId?: string;
  intentPurpose: string;
  rawCandidateCount: number;
  deduplicatedCandidateCount: number;
  rankedCandidateCount: number;
  haikuCandidateCount: number;
  finalRecommendationCount: number;
  successfulQueryCount: number;
  failedQueryCount: number;
  kakaoRequestCount: number;
  claudeRequestCount: number;
  claudeInputTokens?: number;    // §20, §22 Q6
  claudeOutputTokens?: number;
  retrievalLatencyMs: number;
  rankingLatencyMs: number;
  claudeLatencyMs: number;
  totalLatencyMs: number;
  validationFailureCount: number;
  fallbackRecommendationCount: number;
  experimentId?: string;         // [Future] optional
  experimentVariant?: string;    // [Future] optional
};
```

> **[현재 사실]** `analytics_events` 테이블은 `params jsonb DEFAULT '{}'`를 가진다(`migrations_backup_20260610/20260523000001_analytics_events.sql`). 따라서 위 필드는 **스키마 변경 없이 `params`에 담을 수 있다.** 단, `logEvent`의 `EventName` union(`lib/analytics.ts:3-11`)에 신규 이벤트명을 추가해야 한다.

### User Behavior Events [V2 제안]

`recommendation_generated / viewed / clicked / saved / shared / regenerated`.
각 이벤트 context: `requestId`, `sessionId`, `placeId`, `mode`, `timestamp`. 향후 `experimentId`/`experimentVariant`.

---

## 19. Central Configuration [V2 제안]

주요 숫자를 코드 곳곳에 하드코딩하지 않는다.

```ts
const DEFAULT_RECOMMENDATION_CONFIG = {
  // retrieval
  minCandidateCount: 30,
  maxCandidateCount: 80,
  initialPageSize: 15,
  maxPagesPerQuery: 2,
  maxKakaoRequests: 8,
  minIntentQueriesExecuted: 2,   // ★ early stop 품질 가드 (§8)
  // ranking / claude
  rankedCandidateLimit: 20,
  haikuCandidateLimit: 15,
  finalRecommendationCount: 3,
};
```

> **[폐기]** `candidatePoolTarget`, `intentConfidenceThreshold`, `candidateCacheTTL`는 제거.

향후 동일 코드에서 Config만 바꿔 Experiment Variant를 만들 수 있어야 한다(구조만, 실행은 [Future]).

---

## 20. ★ Cost / Token 현실 [재평가]

**V2는 비용 절감이 목적이 아니다.**

- Candidate 15개에 `matchedQueries`/`matchedIntentSignals`/`score`까지 실어 보내면 **Claude 입력 토큰은 현재(20개 단순 텍스트) 대비 동등~증가**할 수 있다.
- Output은 장소 텍스트를 candidate_id로 대체하므로 **출력 토큰은 감소**한다.
- Kakao 호출은 **증가**(최대 6 → 최대 8)하고 Latency도 증가한다.
- 순효과: **품질/정합성 개선이 목적이며, 총비용은 동등하거나 소폭 증가**할 수 있다. 그래서 §18 토큰 계측이 필요하다.

이 기대치를 문서에 명시해 "V2 = 저비용"이라는 오해를 방지한다.

---

## 21. Known Limitations [V2 제안]

- Kakao Local API만으로 실제 분위기(조용/편안/로맨틱/혼잡)를 알 수 없다.
- 실제 가격을 알 수 없다.
- Wi-Fi / 콘센트 정보를 알 수 없다.
- 실제 혼잡도를 알 수 없다.
- Opening Hours를 현재 가져오지 않는다.
- 텍스트 Location의 Search Origin은 keyword size=1 좌표라 행정구역 중심점이 아닐 수 있다(§아래).
- Rule-based Intent는 커버리지가 유한하다(정규식/키워드 목록 밖은 미감지).
- **RecommendationSession은 Persistent Cache가 아니다** (앱 재시작/세션 만료 시 소멸).
- Query Expansion 품질은 Rule 정의 품질에 의존한다.
- Candidate Ranking은 ML 모델이 아니라 Rule 기반 스코어다.
- **★ placeId(Kakao doc.id)는 세션 내 안정 식별용이며, 장기(일·주 단위) 영속성은 공식 보장되지 않는다** [Needs Runtime Verification]. 그래서 §13이 세션 내로 재사용을 한정한다.

### Distance Scoring 기준점 (Known Limitation)

- GPS 사용 시: 사용자의 실제 GPS 좌표.
- 텍스트 Location 사용 시: Kakao Geocoding(`geocode()`, `place-search/index.ts:50-57`, keyword size=1)으로 얻은 Search Origin 좌표.
- **주의**: keyword size=1 좌표는 정확한 행정구역 중심이 아닐 수 있다. 개선(Address Search API 등)은 [Future], V2 필수 아님.

---

## 22. Open Questions / Implementation Risks

코드 분석으로 답할 수 있는 것은 답을, 아닌 것은 [Needs Decision]/[Needs Runtime Verification]로 표시한다.

1. **RecommendationSession 저장 위치?**
   → **[답변]** 상태관리 라이브러리 없음. 기존 유일 전역상태는 React Context(i18n). **신규 경량 `RecommendationProvider` Context** 를 `app/_layout.tsx` 최상위에 추가하고 sessionId만 URL로 넘기는 방식이 기존 구조와 가장 일치. 최종 확정은 [Needs Decision].

2. **URL params → Session 흐름 변경 시 영향 파일?**
   → **[답변]** `app/mode-flow/generating.tsx`(현재 결과를 params로 넘김), `result.tsx`/`course-result.tsx`(params.cards 파싱), 남는 입력 화면의 `router.replace`(`feeling.tsx`/`course.tsx`), 그리고 `app/_layout.tsx`(Provider 추가). Candidate Pool은 Context로, sessionId만 params로.

3. **Kakao Pagination 시 place-search Request/Response 스키마 변경?**
   → **[답변]** Request에 `page`(또는 adaptive면 서버가 내부 관리), Response에 각 place의 `placeId` 추가 필요. Adaptive 오케스트레이션을 Edge 내부에서 하면(Q5) Request는 intent/queries를 받고 Response는 이미 dedup된 candidates를 반환하는 형태가 깔끔. **[Needs Decision]** (계약 설계).

4. **Query Expansion을 클라이언트 vs Edge?**
   → **권장 Edge 내부**. 이유 Q5.

5. **Adaptive Retrieval Orchestration을 lib/ai.ts vs place-search Edge?**
   → **[답변/권장] Edge 내부.** 클라이언트에서 하면 검색 라운드마다 클라이언트⇄Supabase⇄Kakao 이중 홉이 반복돼 early stop 왕복 지연이 커진다. Edge 내부 완결이 성능상 유리. 대신 Intent Rules를 Edge와 공유해야 하는 부담이 생김 → 룰을 공용 모듈로 분리 [Needs Decision].

6. **Claude Token Usage를 실제로 얻을 수 있나?**
   → **[답변]** Anthropic Messages API 응답에 `usage.input_tokens`/`output_tokens`가 포함된다. **[현재 사실]** 현재 `generate-ai/index.ts:120-126`는 `content`만 파싱하고 usage를 버린다. → Edge Function이 usage를 함께 반환하도록 **구조 변경하면 얻을 수 있다.** [Needs Runtime Verification]로 실제 필드 확인 권장.

7. **기존 analytics_events가 V2 필드를 수용하나?**
   → **[답변] 예.** `params jsonb`라 스키마 변경 없이 수용. 단 `EventName` union 확장 필요(§18).

8. **handleGenerateAlt 통합 시 DB/input_json 변경 필요?**
   → **[답변]** `input_json`은 이미 통째 저장되므로 스키마 변경은 원칙적으로 불필요. 다만 **원본 레코드에 location/coords가 실제 들어있는지** 확인 필요 [Needs Runtime Verification]. 없다면 저장 시점에 포함하도록 보강.

9. **Candidate Pool을 Session Store에 둘 때 메모리/직렬화 문제?**
   → **[답변]** 최대 80개 × (문자열 몇 개 + 좌표)면 수십 KB 수준으로 메모리 문제는 낮음. 다만 **URL params 직렬화는 피한다**(§13). Context 메모리 보관이면 문제없음. [Needs Decision] 정도.

10. **make_course가 다른 Candidate Selection/Validation 전략을 요구하나?**
    → **[답변/결정됨] 예. §16 참조.** 백본(Phase 0~3)은 feeling과 공유하고, **Claude 단계에서만 분기**한다(옵션 B-hybrid: 순서 있는 candidate_id[] + 행동 단계 혼합). 남는 결정거리는 코스 카드 수·재추천 제외 강도 [Needs Decision].

11. **`pick_for_me`/`light` 삭제 실행 범위?**
    → **[답변]** 아키텍처상 삭제 확정(§5). 실제 제거 대상: 라우트 `app/mode-flow/pick.tsx`·`light.tsx`, `lib/modeForm.ts`의 `buildPickInput`/`buildLightInput`, 진입 UI(모드 선택 화면), i18n 키(`modeFlow.pick.*`/`modeFlow.light.*`), `lib/prompt.ts`의 `MODE_CONTEXT`/`MODE_CONTEXT_EN`/`MODE_EMPHASIS`/`MODE_EMPHASIS_EN` 내 `pick_for_me`·`light` 엔트리. **[Needs Decision]** 삭제 시점(V2 착수 전 정리 vs Phase와 병행).

---

## 23. Implementation Priority [V2 제안]

### Phase 0 — Data Foundation (선행 필수)
- `place-search/index.ts`의 `toPlace()`에서 Kakao `doc.id` 보존
- Place / Candidate 타입에 `placeId` 추가, Edge Response에 포함
- `lib/ai.ts`의 Place 타입 및 사용처 호환 확인
> **의존성**: 이후 Stable Dedup / previousPlaceIds / Session / placeId Analytics 전부가 Phase 0에 의존. Phase 0 미완이면 그 기능들을 구현하지 않는다.

### Phase 1 — Intent Resolution
- mode + freeText + UI Selection 기반 `resolveIntent` (feeling / make_course 2개 모드)
- Rule-based Mapping (기존 `detectPlaceFocus` 흡수), Query Expansion
- make_course는 단일 카테고리로 좁히지 않는 다카테고리 Intent (§16)
> 의존성: Phase 0 무관하게 착수 가능(순수 로직). `pick_for_me`/`light` 삭제(§22 Q11)를 선행하면 분기 로직이 단순.

### Phase 2 — Adaptive Retrieval
- Multi-query 검색, Pagination, Partial Failure(allSettled), Retrieval Budget, Early Stop(+intent 쿼리 가드)
> 의존성: Phase 0(placeId), Phase 1(queries).

### Phase 3 — Candidate Processing
- placeId Dedup, matchedQueries 병합, Evidence Scoring, Ranking, Candidate Limit
> 의존성: Phase 0, 2.

### Phase 4 — Claude Integration V2
- Candidate-only 선택, candidate_id Output, estimated_time/budget 제거 + **동시에 앱이 결정론 값 채우기(§17)**, Prompt/Structured Output 수정
> 의존성: Phase 3. **DB/타입 호환(§17) 함께 처리 필수.**

### Phase 5 — Validation & Fallback
- Candidate Validation, 중복 제거, previousPlaceIds 검증, Deterministic Fallback
> 의존성: Phase 4.

### Phase 6 — RecommendationSession & Regeneration
- Session Model, Candidate Pool 재사용, previousPlaceIds, Regeneration, handleGenerateAlt 통합
> 의존성: Phase 0, 3, 5. Session 저장 방식 [Needs Decision] 선결.

### Phase 7 — Observability
- Candidate/API/Latency/Token/Validation/Fallback 계측, User Behavior Events
> 의존성: 파이프라인 존재 시 언제든. analytics_events.params 재사용.

### [Future]
실제 A/B Test, Experiment Assignment, Intent Confidence, Claude Intent Parser, External Review Data, 실제 가격 데이터, Opening Hours, ML Ranking, Persistent Candidate Cache, 코스 단계별 실제 소요시간 계산(Step Time Calculation).

### ★ MVP 분할 (재평가 — 범위 현실화)

솔로 개발 규모를 고려해 V2를 두 덩어리로 나눈다.

- **V2-core (가치의 대부분)**: Phase 0 · 1 · 3 · 4 · 5 → **hallucination 제거 + placeId + 결정론 필드 + Validation.** Adaptive Retrieval 없이 현재 검색(단일 페이지 다중 카테고리)만으로도 성립.
- **V2-plus**: Phase 2(Adaptive) · 6(Session/Regeneration) · 7(Observability).

V2-core만으로도 현재의 최대 약점(장소 지어냄·예산 허위표현)이 해결된다.

---

## 24. V2 Success Criteria

1. Claude API 호출은 기본 추천 생성당 1회를 유지한다.
2. Kakao `doc.id`가 파이프라인 전체에서 `placeId`로 보존된다.
3. Claude는 현재 Candidate Set에 없는 장소를 최종 결과에 포함할 수 없다.
4. Kakao Retrieval은 Query Expansion과 Adaptive Retrieval을 사용한다. (V2-plus)
5. 후보가 충분하고 핵심 intent 쿼리를 실행했으면 불필요한 Pagination을 하지 않는다.
6. Kakao 호출 수는 `maxKakaoRequests`를 초과하지 않는다.
7. 일부 쿼리 실패가 전체 추천 실패로 이어지지 않는다.
8. Intent는 freeText뿐 아니라 Mode·UI Selection(mood/budget/duration)을 함께 사용한다.
9. 모드는 `feeling`·`make_course` 2개이며, 둘 다 freeText 기반으로 작동한다(feeling은 freeText 비어도 mood로 최소 Intent 구성).
10. Dedup·재추천 제외는 Stable `placeId`를 사용한다.
11. Claude는 `estimated_time`/`estimated_budget`을 생성하지 않고, 앱이 결정론적으로 채운다(§17 하위호환 유지).
12. Validation 실패 시 Claude를 재호출하지 않고 Deterministic Fallback을 쓴다.
13. 재추천 시 가능한 경우 기존 Candidate Pool을 재사용한다. (V2-plus)
14. `handleGenerateAlt()`에서 location/coords가 유실되지 않는다.
15. Candidate Count·API Call Count·Latency를 측정할 수 있다. (V2-plus)
16. 주요 Recommendation Parameter가 중앙 Config로 관리된다.
17. 향후 A/B Test를 도입할 수 있도록 Analytics/Config 구조가 확장 가능하다.
18. **feeling·make_course가 동일 백본(Phase 0~3)을 공유하고, make_course의 다지점 코스는 candidate_id[] 기반으로 실제 장소가 검증된다(§16).**

---

## 25. Implementation Readiness Review

| 항목 | 상태 | 비고 |
|---|---|---|
| Phase 0 placeId 보존 | **Ready to Implement** | `toPlace()`에 `doc.id` 추가. 리스크 낮음 |
| Phase 1 Intent/Query Expansion | **Ready to Implement** | 기존 `detectPlaceFocus` 확장. 순수 로직 |
| Phase 3 Dedup/Scoring/Ranking | **Ready to Implement** | Phase 0 후. Kakao 데이터 범위 내 |
| Phase 4 Claude 스키마 변경 | **Needs Design Decision** | §17 DB/타입 동시 수정, 프롬프트 재작성 범위, 모드별 출력 2종 |
| Phase 5 Validation/Fallback | **Ready to Implement** | Phase 4 후. feeling(단일)·course(steps) Validation 규칙 확정됨 |
| Phase 2 Adaptive Retrieval | **Needs Design Decision** | 오케스트레이션 위치(Edge 권장, Q5), 계약 설계(Q3) |
| Phase 6 RecommendationSession | **Needs Design Decision** | 저장 방식(Context 권장, Q1/Q2) |
| Phase 6 handleGenerateAlt 통합 | **Needs Runtime Verification** | input_json에 location/coords 실재 확인(Q8) |
| Phase 7 Claude Token 계측 | **Needs Runtime Verification** | Anthropic usage 필드 확인 + Edge 반환 구조(Q6) |
| Phase 7 Analytics 필드 | **Ready to Implement** | analytics_events.params(jsonb) 재사용(Q7) |
| make_course 다지점 전략 | **결정됨 (B-hybrid)** | §16. 코스 1개 심화 + soft 제외까지 확정 |
| 코스 결과 UI 재설계 | **Future / 별도 세션** | §16. SVG 트레일 → 세로 화살표+스크롤. Phase 4 이후 |
| `pick_for_me`/`light` 삭제 | **Needs Design Decision** | 삭제 확정, 실행 시점·범위(§22 Q11) |
| placeId 장기 안정성 | **Needs Runtime Verification** | 세션 내 한정으로 리스크 완화(§21) |
| 실제 A/B Test | **Future Scope** | 구조만 열어둠 |
| Persistent Cache / Intent Parser | **Future Scope** | — |

---

## 26. Recommended First Implementation Task

**Phase 0 — Kakao Place ID Preservation** 을 첫 작업으로 권장한다.

- 이유: (1) 리스크 최저(응답 필드 1개 추가), (2) V2의 거의 모든 Stable ID 전략(Dedup·재추천 제외·Session·Analytics)의 **선행 조건**, (3) 이것 없이는 Phase 3·5·6을 시작할 수 없다.
- 범위: `place-search/index.ts`의 `KakaoDoc`/`toPlace()`/`Place` 타입에 `placeId(=doc.id)` 추가, Edge Response 포함, `lib/place.ts`의 `KakaoPlace` 타입 및 `lib/ai.ts` 사용처 호환 확인.
- **코드 분석 결과, Phase 0보다 앞설 더 적절한 선행 작업은 없다.** (Intent/Query는 placeId와 독립이라 병행 가능하나, "가장 먼저 하나"를 꼽으면 Phase 0.)

착수 전 함께 결정하면 좋은 것(병목 해소 순): **① `pick_for_me`/`light` 삭제 실행 시점(§22 Q11) → ② Adaptive 오케스트레이션 위치(Q5) → ③ Session 저장 방식(Q1)**. (make_course 전략은 §16에서 B-hybrid + 코스 1개 심화 + soft 제외로 결정 완료. 코스 결과 UI 재설계는 Phase 4 이후 별도 세션.)

---

*본 문서는 설계 합의용이며 코드는 아직 수정하지 않았다. `PLAN_GENERATION_LOGIC_ANALYSIS.md`(현재 구현 분석)와 함께 읽는다.*
