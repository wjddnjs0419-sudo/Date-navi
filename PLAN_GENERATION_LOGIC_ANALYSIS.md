 Plan Generation Architecture V2

## 1. 문서 목적

본 문서는 현재 프로젝트의 계획/데이트 추천 생성 로직을 V2 구조로 개선하기 위한 아키텍처 설계 문서다.

현재 구현은 다음과 같은 구조를 사용한다.

사용자 입력
→ Kakao Local API 장소 검색
→ 최대 15~20개 후보
→ Claude Haiku 4.5
→ 추천 카드 3개 생성

V2의 핵심 목표는 Claude 모델을 더 큰 모델로 교체하는 것이 아니다.

Claude Haiku 4.5 단일 호출 구조를 유지하면서 다음을 개선한다.

1. Candidate Retrieval Recall 향상
2. 사용자 의도 기반 Query Expansion
3. Candidate Ranking 도입
4. Claude 역할 축소 및 명확화
5. 장소 Hallucination 방지
6. 재추천 품질 개선
7. API 비용 및 Latency 계측
8. 향후 A/B Test가 가능한 구조 확보

---

# 2. V2 핵심 설계 원칙

V2에서는 각 시스템의 역할을 명확하게 분리한다.

## Kakao Local API

역할:

실제로 존재하는 장소 후보를 넓게 검색한다.

Kakao API는 다음을 판단하지 않는다.

- 조용한 장소인지
- 공부하기 좋은지
- 데이트하기 좋은지
- 편안한 장소인지
- 실제 가격이 저렴한지

Kakao API의 역할은 Candidate Retrieval이다.

---

## Application Logic

역할:

- 사용자 Intent 분석
- Query Expansion
- Candidate Deduplication
- Candidate Scoring
- Candidate Ranking
- Candidate Validation
- Experiment Configuration
- Analytics Logging

Application Logic은 Recommendation Pipeline의 결정론적 영역을 담당한다.

---

## Claude Haiku 4.5

역할:

상위 Candidate를 사용자 조건과 비교하고 최종 추천을 생성한다.

Claude는 장소를 생성하거나 검색하지 않는다.

반드시 Application Logic에서 제공한 Candidate 중에서만 선택한다.

---

# 3. V2 전체 Pipeline

```text
User Input

↓

Input Normalization

↓

Rule-based Intent Detection

↓

Query Expansion

↓

Kakao Candidate Retrieval

↓

Candidate Pool
Target: approximately 60~100 candidates

↓

Deduplication

↓

Candidate Scoring

↓

Candidate Ranking

↓

Top 15~20 Candidates

↓

Claude Haiku 4.5

↓

Final 3 Recommendations

↓

Candidate Validation

↓

Result

↓

Analytics Logging
4. Intent Model

사용자의 자연어와 UI 입력을 다음과 같은 구조로 변환한다.

type PlanIntent = {
  purpose:
    | 'study'
    | 'date'
    | 'meal'
    | 'drink'
    | 'walk'
    | 'activity'
    | 'culture'
    | 'rest'
    | 'unknown';

  placeTypes: PlaceType[];

  atmosphere: AtmosphereType[];

  budgetLevel: 'low' | 'medium' | 'high';

  duration: '1h' | '2-3h' | 'half_day' | 'full_day';

  searchQueries: string[];

  positiveSignals: string[];

  negativeSignals: string[];

  confidence: number;
};
5. Rule-based Intent Detection

V2 초기 버전에서는 추가 Claude API 호출을 사용하지 않는다.

Intent Detection은 Rule-based 방식으로 구현한다.

예시:

const INTENT_RULES = {
  study: {
    keywords: [
      '공부',
      '작업',
      '과제',
      '노트북',
      '집중'
    ],

    placeTypes: [
      'cafe'
    ],

    searchQueries: [
      '카페',
      '스터디카페',
      '북카페',
      '작업 카페',
      '조용한 카페'
    ],

    positiveSignals: [
      '스터디',
      '북카페',
      '작업'
    ],

    negativeSignals: [
      '술집',
      '포차',
      '클럽',
      '라운지'
    ]
  }
};

Intent Detection 결과 confidence가 낮은 경우에도 V2 초기 버전에서는 Claude를 추가 호출하지 않는다.

향후 V2.1에서 다음 구조를 고려할 수 있다.

Rule-based Intent Detection

↓

confidence >= threshold

YES → continue

NO → Claude Intent Parser
6. Query Expansion

단일 Kakao 검색 대신 사용자 Intent를 기반으로 여러 검색 Query를 생성한다.

예시:

사용자 입력:

"공부하기 좋은 조용한 카페"

Intent:

purpose = study
atmosphere = quiet
placeType = cafe

Query Expansion:

CE7 Cafe Category Search

스터디카페

북카페

작업 카페

조용한 카페

각 Query 결과를 하나의 Candidate Pool로 병합한다.

7. Candidate Retrieval

초기 Configuration:

candidatePoolTarget = 80

권장 범위:

60~100

단일 검색 결과를 80개 가져오는 방식이 아니라 여러 Query의 결과를 병합한다.

예시:

Cafe Category
30 candidates

Study Cafe
15 candidates

Book Cafe
15 candidates

Work Cafe
15 candidates

Quiet Cafe
15 candidates

Raw Result:

90 candidates

Deduplication 이후:

approximately 50~80 candidates
8. Candidate Data Model

각 장소는 다음과 같은 내부 구조를 가진다.

type Candidate = {
  candidateId: string;

  kakaoPlaceId?: string;

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

중요:

Claude에게 장소명을 자유롭게 생성하도록 하지 않는다.

각 Candidate에 candidateId를 부여한다.

예:

candidate_001
candidate_002
candidate_003
9. Deduplication

여러 Query에서 동일 장소가 검색될 수 있다.

중복 제거 우선순위:

Kakao Place ID
Kakao Map URL
Name + Address

중복 장소가 여러 Query에서 발견된 경우 삭제하지 않고 matchedQueries를 병합한다.

예:

{
  "candidateId": "candidate_012",
  "name": "Example Cafe",
  "matchedQueries": [
    "카페",
    "북카페",
    "조용한 카페"
  ]
}

여러 Query에서 발견된 사실은 Ranking Signal로 활용한다.

10. Candidate Scoring

초기 Ranking은 Rule-based 방식으로 구현한다.

예시:

Base Category Match
+3

Intent Keyword Match
+3

Positive Signal Match
+2

Multiple Query Match
+1 per additional query

Distance Score
0~3

Negative Signal Match
-5

중요:

Kakao 데이터가 제공하지 않는 사실을 Scoring에 사용하지 않는다.

사용 금지 예:

실제 소음 수준
콘센트 존재 여부
Wi-Fi 품질
실제 가격
좌석 편안함
실제 혼잡도

해당 데이터가 없는 상태에서 이를 사실로 간주하지 않는다.

11. Candidate Ranking

Deduplication 및 Scoring 이후 Candidate를 정렬한다.

초기 Configuration:

Raw Candidate Pool
60~100

↓

Deduplicated Candidates
40~80

↓

Ranked Candidates
20

↓

Claude Candidates
15

Claude에게 모든 Raw Candidate를 전달하지 않는다.

12. Claude Haiku Role

Claude Haiku 4.5는 최종 Recommendation Reranker 및 Explanation Generator 역할만 담당한다.

Claude에게 전달:

User Intent

User Preferences

Mode

Top Candidates

Previous Recommendations

Claude에게 전달하지 않는 것:

전체 Raw Candidate Pool
13. Claude Output Schema

Claude는 장소명을 직접 생성하지 않는다.

{
  "recommendations": [
    {
      "candidate_id": "candidate_012",
      "title": "...",
      "summary": "...",
      "why_recommended": "...",
      "estimated_time": "...",
      "estimated_budget": "...",
      "tags": []
    }
  ]
}

Application은 candidate_id를 이용해 실제 장소 정보를 결합한다.

candidate_id

↓

Candidate Map Lookup

↓

name
address
mapUrl

↓

Final Result
14. Candidate Validation

Claude 응답 이후 반드시 Validation을 수행한다.

검증:

candidate_id exists?

YES

↓

Final Result
candidate_id exists?

NO

↓

Invalid Recommendation

초기 V2에서는 Invalid Recommendation을 제거한다.

유효한 Recommendation이 부족한 경우:

Ranked Candidate에서 다음 Candidate 사용

Claude API 재호출은 하지 않는다.

15. Budget Handling

Kakao Local API에는 가격 데이터가 없다.

따라서 V2에서는 실제 장소 가격을 알고 있는 것처럼 표현하지 않는다.

금지:

이 카페는 가격이 저렴합니다.

허용:

저예산 조건을 고려한 추천입니다.

estimated_budget는 실제 장소 가격이 아니라 Plan Budget Estimate임을 명확히 정의한다.

16. Atmosphere Handling

Kakao Local API에는 다음 정보가 없다.

quiet
comfortable
romantic
crowded

따라서 해당 속성을 사실로 표현하지 않는다.

Claude Prompt에 다음 원칙을 추가한다.

Do not claim unsupported venue attributes as facts.

When venue atmosphere data is unavailable,
explain recommendations based only on available signals.
17. Regeneration V2

현재:

Same Input

↓

Kakao API Again

↓

Claude API Again

V2:

Same Input

↓

Reuse Candidate Pool when possible

↓

Exclude Previous Candidate IDs

↓

Ranking

↓

Haiku

↓

New Recommendations

previousCandidateIds를 관리한다.

type RecommendationContext = {
  previousCandidateIds: string[];
};

Haiku Prompt:

Do not recommend the following candidates:

candidate_001
candidate_015
candidate_032
18. Configuration Architecture

추천 시스템의 주요 숫자를 코드 곳곳에 하드코딩하지 않는다.

type RecommendationConfig = {
  rawCandidateTarget: number;

  rankedCandidateLimit: number;

  haikuCandidateLimit: number;

  finalRecommendationCount: number;

  intentConfidenceThreshold: number;

  candidateCacheTTL: number;
};

초기값:

const DEFAULT_RECOMMENDATION_CONFIG = {
  rawCandidateTarget: 80,
  rankedCandidateLimit: 20,
  haikuCandidateLimit: 15,
  finalRecommendationCount: 3,
  intentConfidenceThreshold: 0.7,
  candidateCacheTTL: 300
};
19. Experiment Architecture

향후 A/B Test를 위해 RecommendationConfig를 Variant 단위로 관리한다.

type ExperimentVariant =
  | 'control'
  | 'large_pool'
  | 'small_haiku_context';

예:

const EXPERIMENT_CONFIGS = {
  control: {
    rawCandidateTarget: 50,
    rankedCandidateLimit: 20,
    haikuCandidateLimit: 15
  },

  large_pool: {
    rawCandidateTarget: 80,
    rankedCandidateLimit: 20,
    haikuCandidateLimit: 15
  },

  small_haiku_context: {
    rawCandidateTarget: 80,
    rankedCandidateLimit: 15,
    haikuCandidateLimit: 10
  }
};
20. Experiment Assignment

사용자를 무작위 Variant에 배정한다.

중요:

같은 사용자는 매번 다른 Variant에 배정하지 않는다.

Stable Assignment를 사용한다.

예:

user_123

↓

Hash

↓

Variant B

사용자는 실험 기간 동안 동일 Variant를 유지한다.

21. Analytics Logging

각 Recommendation Generation에 다음 정보를 기록한다.

type RecommendationAnalytics = {
  requestId: string;

  userId?: string;

  experimentId?: string;

  experimentVariant?: string;

  intentPurpose: string;

  rawCandidateCount: number;

  deduplicatedCandidateCount: number;

  rankedCandidateCount: number;

  haikuCandidateCount: number;

  finalRecommendationCount: number;

  kakaoRequestCount: number;

  claudeRequestCount: number;

  claudeInputTokens?: number;

  claudeOutputTokens?: number;

  retrievalLatencyMs: number;

  rankingLatencyMs: number;

  claudeLatencyMs: number;

  totalLatencyMs: number;

  validationFailureCount: number;
};
22. User Behavior Events

추천 품질 평가를 위해 다음 Event를 기록한다.

recommendation_generated

recommendation_viewed

recommendation_clicked

recommendation_saved

recommendation_shared

recommendation_regenerated

각 Event에는 다음 정보를 포함한다.

requestId

experimentId

experimentVariant

candidateId

mode

timestamp
23. A/B Test Metrics

향후 실험에서 다음 지표를 비교할 수 있어야 한다.

Primary Metrics:

Recommendation Save Rate

Recommendation Click Rate

Regeneration Rate

Secondary Metrics:

Share Rate

Average Latency

Claude Token Usage

API Cost

Validation Failure Rate

예:

Experiment:

Candidate Pool Size

Control:
50 candidates

Variant:
80 candidates

Measure:

Save Rate
Regeneration Rate
Latency
Cost
24. V2 초기 구현 범위

구현:

Rule-based Intent Detection
Query Expansion
Multi-query Kakao Retrieval
Candidate Deduplication
Candidate Scoring
Candidate Ranking
candidateId
Haiku Candidate Selection
Candidate Validation
Previous Candidate Exclusion
Central Recommendation Config
Analytics Logging
Experiment-ready Architecture

구현하지 않음:

Claude Intent Parser
Sonnet
Kakao Detail Page Scraping
External Review API
Actual Venue Price Verification
Noise Level Prediction
Wi-Fi / Outlet Detection
Machine Learning Ranking Model
25. Implementation Priority

Phase 1:

RecommendationConfig

Intent Rules

Query Expansion

Candidate Model

Phase 2:

Multi-query Kakao Retrieval

Deduplication

Scoring

Ranking

Phase 3:

Claude Prompt V2

candidateId Output

Validation

Phase 4:

Regeneration V2

Candidate Cache

Phase 5:

Analytics

Experiment Assignment

A/B Test Infrastructure
26. V2 Success Criteria

V2는 다음 조건을 만족해야 한다.

Claude API 호출은 기본 추천 생성당 1회를 유지한다.
Claude는 실제 Candidate Pool에 없는 장소를 추천할 수 없다.
Kakao Retrieval은 단일 검색이 아니라 Query Expansion을 사용한다.
Candidate Pool 크기와 Claude 전달 Candidate 수를 Configuration으로 변경할 수 있다.
이전에 추천한 Candidate를 재추천에서 제외할 수 있다.
Kakao 데이터에 없는 장소 속성을 사실처럼 표현하지 않는다.
Recommendation Pipeline의 Latency와 Candidate Count를 측정할 수 있다.
향후 코드 구조를 크게 변경하지 않고 A/B Test를 실행할 수 있다.
27. Non-Goals

V2의 목표는 완벽한 장소 추천 AI를 만드는 것이 아니다.

V2의 목표는 다음과 같다.

Better Retrieval

Better Candidate Selection

Lower Hallucination

Measurable Recommendation Quality

Experiment-ready Architecture

향후 실제 사용자 데이터를 기반으로 V2.1, V3를 개선한다.