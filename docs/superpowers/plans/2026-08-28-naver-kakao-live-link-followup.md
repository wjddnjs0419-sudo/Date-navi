# Naver-Kakao 실서비스 링크·중복 회귀 추적 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 마지막 두 실서비스 추천 요청에서 확인된 `Naver 후보는 정상 생성되지만 Kakao 연결 ID가 0개인 문제`의 실제 탈락 원인을 로그로 확정하고, Naver-first·Kakao link·동일 장소 중복 제거를 실데이터 기준으로 완성한다.

**Architecture:** 추천 후보 생성과 Kakao link 보강을 별도 단계로 유지한다. 먼저 요청 ID가 포함된 비식별 진단 로그로 Kakao 후보별 주소·거리·이름·ID 탈락 이유를 관측한 뒤, 실제 데이터에서 확인된 주소 정규화 문제만 수정한다. 후보 provider identity는 Naver를 대표로 유지하고, Kakao ID는 선택된 Naver 장소에 붙는 선택적 지도·리뷰 메타데이터로만 저장한다.

**Tech Stack:** TypeScript, Jest, Supabase Edge Functions(Deno), Supabase Management Logs/Database Query, Expo React Native.

**Spec:** `docs/superpowers/specs/2026-07-31-course-keyword-hard-constraint-design.md`; 기존 provider-neutral 설계와 키워드 계획은 `docs/superpowers/plans/2026-08-28-course-keyword-final-enforcement.md`를 함께 읽는다.

## Global Constraints

- 현재 위치가 아닌 신규 요청에서는 무키워드·키워드 요청 모두 Naver-first provider-neutral discovery를 사용한다.
- 현재 위치 요청은 기존 Kakao 중심 동작을 유지한다. 현재 위치 예외를 일반 장소 요청의 기준으로 사용하지 않는다.
- Naver 장소의 Kakao ID는 선택적 편의 메타데이터다. ID를 못 얻어도 Naver 장소와 provider identity를 성공 응답에서 조용히 제거하지 않는다.
- Kakao API 호출 성공과 장소 연결 성공을 구분한다. HTTP 200/유효 JSON이어도 후보 매칭 조건을 통과하지 못하면 `no_eligible_candidate`다.
- 동일 장소 판정은 이름 하나 또는 주소 하나만 사용하지 않는다. 정규화 주소·좌표 거리·정규화 상호명을 함께 사용하고, 다른 지점은 보존한다.
- 무키워드 요청에서 일반 후보가 부족하더라도 키워드 강제 조건을 완화하지 않는다. 키워드가 없을 때만 기존 카테고리·거리·예산·동선 규칙을 적용한다.
- 키워드가 다른 카테고리에 잘못 입력된 경우를 조용히 삭제하는 UX는 이번 문서 범위에 넣지 않는다.
- 사용자 자유 입력(`additionalRequest`) 원문은 운영 로그에 기록하지 않는다. 진단 로그에는 요청 ID, 후보 ID, 공개 장소 메타데이터와 비식별 매칭 결과만 기록한다.
- 서버·Edge 수정만으로 해결되는 동안 새 iOS 빌드를 만들지 않는다. UI binary가 `currentKakaoLinkPlaceId`를 아직 포함하지 않는 경우에만 별도로 native build를 만든다.
- 원격 프로젝트는 `wqjguifsmtblgrhdfnji`다. Edge 배포는 인라인 업로드 대신 CLI를 사용한다.

---

## 현재 운영 증거

### 마지막 2개 attestation

| KST 시각 | 요청 | 입력 | 최종 후보 | Kakao link |
|---|---|---|---|---|
| 2026-08-28 02:02:37 | `req_d79fd269-aa16-4192-afcb-0fece1f0e629` | 키워드 `삼겹살`, `vegan cafe` | 4개 모두 Naver, `쟁반집8292 홍대점`·`마뽀즈 비건케이크` 선택 | `selectedNaverCount=2`, `linkedCount=0`, `no_eligible_candidate=2` |
| 2026-08-28 02:01:16 | `req_bd5a6b3d-1c89-499e-a795-00700c4b9619` | 무키워드, `courseSteps[].intentTags` 없음 | 10개 모두 Naver, `빌라 더 다이닝 홍대본점`·`베이글랜드 홍대점` 선택 | `selectedNaverCount=2`, `linkedCount=0`, `no_eligible_candidate=2` |

두 요청의 location은 모두 현재 GPS가 아니라 `홍대입구역 2호선`이라는 Kakao 장소 선택이다. 따라서 두 번째 요청은 일반 위치 무키워드 회귀 사례다.

두 요청 모두 `recommend-date` v73에서 다음이 확인됐다.

```json
{
  "strategy": "naver_primary_with_kakao_fallback",
  "fallbackUsed": false,
  "qualifiedByProvider": { "naver": 10 },
  "searchOutcomes": ["success", "success", "success", "success", "success", "success", "success", "success", "success", "success"],
  "linkedCount": 0,
  "failureReasons": { "no_eligible_candidate": 2 }
}
```

해석:

1. Naver-first 분기와 runtime strategy는 정상이다. `fallbackUsed=false`이고 후보 provider가 Naver뿐이다.
2. Kakao key·네트워크·HTTP 응답도 정상이다. 선택된 두 장소에 대해 총 10개의 Kakao link 검색이 모두 성공했다.
3. 문제는 응답 저장/UI가 아니라 Kakao 후보가 `eligibleCandidates`에서 모두 탈락한 것이다. 실제 attestation의 선택 step은 `mapUrl: ""`이고 `kakaoPlaceId`가 없다.
4. 키워드 요청도 같은 방식으로 실패했으므로 현재 현상은 무키워드 전용 분기가 아니다.
5. 이 두 요청의 최종 선택 장소 이름은 서로 다르고 provider fallback도 실행되지 않았다. 따라서 “Kakao fallback이 같은 장소를 재추가했다”는 중복 원인은 이 두 로그만으로 확인되지 않는다. Naver 내부 중복 또는 다른 요청/클라이언트 재사용 경로를 별도 계측해야 한다.

### 배포·검증 상태

- 원격 `recommend-date`는 v73이며, 원격 다운로드 소스와 로컬 Edge 소스가 일치했다.
- 다음 runtime 값을 원하는 동작으로 명시 설정했다. 이전 값을 읽어 확인한 것이 아니라, 동일 값이면 무해한 재설정이다.
  - `RECOMMENDATION_DISCOVERY_STRATEGY=naver_primary_with_kakao_fallback`
  - `RECOMMENDATION_PROVIDER_SESSION_PERSISTENCE=enabled`
- 최근 로컬 변경은 `kakao-place-link.ts`의 도로명/지번 양식 비교와 `place-dedup.ts`의 양쪽 주소 비교, Kakao `place_url` 누락 시 ID URL 생성이다.
- 전체 Jest `255 suites / 1762 tests` 통과, `npm run validate` 통과, `git diff --check` 통과 상태다.
- 위 변경은 실서비스 마지막 두 요청에서 여전히 `linkedCount=0`이어서 충분하지 않음이 확인됐다. 앞서 “해결됐다”고 판단한 결론은 폐기한다.

## 파일 경계

- `supabase/functions/_shared/kakao-place-link.ts`: 선택된 Naver 장소의 Kakao 후보 검색·매칭·탈락 이유.
- `supabase/functions/_shared/place-dedup.ts`: provider 내·provider 간 동일 물리 장소 판정.
- `supabase/functions/_shared/recommend-date-handler.ts`: 요청 ID 전달, provider-neutral discovery와 후처리 연결.
- `supabase/functions/recommend-date/index.ts`: Edge 의존성 주입, Kakao API 결과 telemetry, 실제 함수 번들 진입점.
- `supabase/functions/_shared/provider-neutral-discovery-pipeline.ts`: discovery 후보 dedupe와 provider-neutral 후보 생성.
- `__tests__/kakao-place-link.test.ts`: Kakao link 매칭·주소 정규화·실패 분류.
- `__tests__/place-dedup.test.ts`: 동일 장소 중복 제거.
- `__tests__/provider-neutral-discovery-pipeline.test.ts`: Naver-first·Kakao fallback·provider 중복.
- `__tests__/recommend-date-server.test.ts`, `__tests__/recommend-date-phase7-handler.test.ts`: Edge 응답과 후처리 통합 계약.
- `lib/recommendation-session-repository.ts`, `app/mode-flow/course-result.tsx`: Kakao link 저장·버튼 표시 계약을 read-only로 확인하고 필요한 경우에만 테스트를 보강한다.

---

### Task 1: 마지막 요청과 연결되는 Kakao link 진단 telemetry 추가

**Files:**
- Modify: `supabase/functions/_shared/kakao-place-link.ts`
- Modify: `supabase/functions/_shared/recommend-date-handler.ts:86-87,458`
- Modify: `supabase/functions/recommend-date/index.ts:219-260`
- Test: `__tests__/kakao-place-link.test.ts`
- Test: `__tests__/recommend-date-server.test.ts`

**Interfaces:**
- `resolveKakaoPlaceLinkDetailed()`의 기본 2-인자 호출 결과 계약은 유지한다. 기존 테스트의 `{ reason }` exact assertion이 깨지지 않도록 진단 정보는 `includeDiagnostics: true` 옵션을 준 호출에서만 반환한다.
- provider callback은 다음 입력 형태로 요청 ID를 함께 받는다.

```ts
resolveProviderNeutralKakaoLinks?: (input: {
  requestId: string;
  candidates: readonly ProviderNeutralCandidate[];
}) => Promise<ReadonlyMap<string, { kakaoPlaceId: string; mapUrl: string }>>;
```

- 진단 정보는 다음 필드를 사용한다. `additionalRequest`나 사용자 키워드 원문은 포함하지 않는다.

```ts
type KakaoPlaceLinkDiagnostics = {
  queryCount: number;
  queryResults: Array<{ resultCount: number; outcome: string; statusCode?: number }>;
  candidateCount: number;
  eligibleCount: number;
  namedMatchCount: number;
  rejectionCounts: {
    nonKakao: number;
    missingCoordinates: number;
    addressMismatch: number;
    distanceExceeded: number;
    missingKakaoId: number;
    missingMapUrl: number;
  };
};
```

- 운영 로그는 다음처럼 요청 ID와 후보별 결과를 묶는다.

```json
{
  "event": "recommend_date_kakao_link_resolution",
  "requestId": "req_...",
  "selectedNaverCount": 2,
  "linkedCount": 0,
  "perCandidate": [
    { "candidateId": "provider_candidate_001", "name": "공개 장소명", "diagnostics": { "eligibleCount": 0, "rejectionCounts": {} } }
  ]
}
```

- [x] **Step 1: 후보별 탈락 필드 assertion을 먼저 추가한다.**

  `resolveKakaoPlaceLinkDetailed(naverPlace, searchKakao, { includeDiagnostics: true })`의 결과에 `candidateCount`, `eligibleCount`, `rejectionCounts`가 포함되는 테스트를 추가한다. Kakao API가 정상 응답하지만 주소가 다르면 `addressMismatch`가 증가하고, ID가 없으면 `missingKakaoId`가 증가해야 한다.

- [x] **Step 2: 진단 테스트가 현재 구현에서 실패하는지 확인한다.**

  Run: `npx jest __tests__/kakao-place-link.test.ts -t "rejectionCounts|diagnostics" --runInBand`

  Expected: FAIL because current resolver returns only `reason`/`link` and does not expose per-candidate rejection counts.

- [x] **Step 3: resolver·handler·Edge 로그를 연결한다.**

  `eligibleCandidates`의 boolean 조건을 개별 rejection counter로 분해한다. `recommend-date-handler.ts`는 `serverRequest.requestId`를 callback에 전달한다. `recommend-date/index.ts`는 각 Kakao 검색의 `resultCount`와 각 selected Naver candidate의 diagnostics를 함께 `console.error(JSON.stringify(...))`로 기록한다.

- [x] **Step 4: 단위·통합 진단 테스트를 통과시킨다.**

  Run:

  ```bash
  npx jest __tests__/kakao-place-link.test.ts __tests__/recommend-date-server.test.ts --runInBand
  ```

  Expected: PASS. 기존 link 성공·실패 결과와 `recommend-date` HTTP 응답은 바뀌지 않고, 로그에만 후보별 탈락 이유가 추가된다.

### Task 2: 실제 마지막 두 장소 주소 형태를 재현하고 canonical address matching을 수정한다

**Files:**
- Modify: `supabase/functions/_shared/kakao-place-link.ts`
- Test: `__tests__/kakao-place-link.test.ts`

**Interfaces:**
- 주소 비교는 full exact string 하나가 아니라 canonical address key 집합을 비교한다.
- canonical key에는 `서울특별시`/`서울시`와 `서울`, `부산광역시`/`부산시`와 `부산`처럼 행정구역 별칭을 같은 값으로 만드는 규칙을 포함한다.
- 도로명 주소는 도로명과 주 건물번호까지의 key, 지번 주소는 법정동과 본번-부번까지의 key를 추가로 만든다. 건물명·층·호수 suffix 차이는 key에서 제외할 수 있지만, 좌표 100m 이내와 상호명 검증은 계속 요구한다.

- [x] **Step 1: 운영 데이터 기반 RED fixture를 추가한다.**

  다음 두 Naver 장소를 fixture로 사용한다.

  ```ts
  const villaNaver: NormalizedPlace = {
    identity: { provider: 'naver', providerPlaceId: 'live-villa' },
    name: '빌라 더 다이닝 홍대본점',
    category: { normalized: 'meal' },
    address: {
      display: '서울특별시 마포구 동교동 150-9 JnS.Bldg',
      road: '서울특별시 마포구 동교로30길 16 JnS.Bldg',
    },
    coordinates: { latitude: 37.5601583, longitude: 126.9249144 },
    evidence: { provider: 'naver', searchTerms: ['음식점'] },
  };

  const bagelNaver: NormalizedPlace = {
    identity: { provider: 'naver', providerPlaceId: 'live-bagel' },
    name: '베이글랜드 홍대점',
    category: { normalized: 'cafe' },
    address: {
      display: '서울특별시 마포구 서교동 332-15 삼이빌딩 1층',
      road: '서울특별시 마포구 와우산로29바길 19 삼이빌딩 1층',
    },
    coordinates: { latitude: 37.5554909, longitude: 126.9259638 },
    evidence: { provider: 'naver', searchTerms: ['카페'] },
  };
  ```

  Kakao fixture는 각각 `서울 마포구 ...`로 `특별시`를 생략하고, `JnS.Bldg`·`삼이빌딩 1층` suffix를 생략한 같은 도로번호를 사용한다. 상호명은 `빌라 더 다이닝 홍대점`, `베이글랜드 홍대`처럼 지점 suffix가 다른 값을 사용한다. 각 좌표는 Naver에서 20m 이내로 둔다.

  두 장소 모두 `resolveKakaoPlaceLink()`가 Kakao ID와 `https://place.map.kakao.com/{id}`를 반환해야 한다.

- [x] **Step 2: RED를 확인한다.**

  Run: `npx jest __tests__/kakao-place-link.test.ts -t "홍대|특별시|건물" --runInBand`

  Expected: current full-string address comparison rejects at least one fixture with `no_eligible_candidate`.

- [x] **Step 3: canonical address key를 구현한다.**

  `addressValues()`를 `addressMatchKeys()`로 확장한다. exact normalized address와 행정구역 alias-normalized address를 유지하고, 도로명/지번의 핵심 번호 key를 추가한다. `sharesAddress()`는 두 장소의 key 교집합이 있을 때만 true를 반환한다. `eligibleCandidates`의 좌표 거리 100m, Kakao provider, ID 보유 조건과 이름 우선 선택 규칙은 유지한다.

- [x] **Step 4: 실제 데이터 fixture와 기존 안전성 테스트를 함께 통과시킨다.**

  Run:

  ```bash
  npx jest __tests__/kakao-place-link.test.ts --runInBand
  npm run validate
  ```

  Expected: 홍대 fixture는 연결되고, 다른 도로주소·100m 초과·복수 후보 ambiguity 테스트는 계속 거부된다.

### Task 3: Naver 내부 중복과 Naver↔Kakao fallback 중복을 같은 물리 장소 기준으로 제거한다

**Files:**
- Modify: `supabase/functions/_shared/place-dedup.ts`
- Test: `__tests__/place-dedup.test.ts`
- Test: `__tests__/provider-neutral-discovery-pipeline.test.ts`
- Test: `__tests__/provider-neutral-course-selection.test.ts`

**Interfaces:**
- provider ID가 같으면 기존 `same_provider_identity` 중복으로 즉시 제거한다.
- provider ID가 달라도, 같은 provider끼리라도 `canonical address key 교집합 + 100m 이내 + normalizeName 동일`이면 같은 물리 장소로 판정한다. 이로써 Naver 검색어별로 provider ID hash가 달라진 동일 장소도 후보 풀에서 하나만 남긴다.
- 주소 하나만 같거나 이름 하나만 같은 다른 지점은 제거하지 않는다.

- [x] **Step 1: 서로 다른 Naver identity의 동일 장소 RED test를 추가한다.**

  같은 `베이글랜드 홍대점`, 같은 도로번호, 15m 차이 좌표를 `naver-a`·`naver-b` 두 identity로 만들고 `dedupeNormalizedPlaces([a, b])`가 `a`만 남기도록 assertion을 작성한다. 주소가 같지만 이름이 `베이글랜드 합정점`인 fixture는 두 개 모두 남겨야 한다.

- [x] **Step 2: RED를 확인한다.**

  Run: `npx jest __tests__/place-dedup.test.ts -t "Naver identity|같은 물리" --runInBand`

  Expected: current implementation returns both because same-provider IDs differ and same-provider early return is false.

- [x] **Step 3: 동일 물리 장소 판정을 provider 공통으로 바꾼다.**

  same-provider/same-ID fast path 뒤에 좌표·canonical address·normalized name 비교를 적용한다. provider 간 대표 순서는 입력 순서를 유지하므로 Naver-first discovery에서 Naver가 대표로 남는다. `SuppressedPlace.reason`은 같은 provider이면 `same_provider_identity`, provider가 다르면 `cross_provider_match`를 사용한다.

- [x] **Step 4: discovery와 최종 선택 회귀를 통과시킨다.**

  Run:

  ```bash
  npx jest __tests__/place-dedup.test.ts __tests__/provider-neutral-discovery-pipeline.test.ts __tests__/provider-neutral-course-selection.test.ts --runInBand
  ```

  Expected: Naver-only duplicate와 Naver/Kakao fallback duplicate가 한 장소로 합쳐지고, 서로 다른 지점·카테고리 장소는 유지된다.

### Task 4: 무키워드·키워드 Naver-first와 현재 위치 예외를 실제 요청 계약으로 고정한다

**Files:**
- Modify if required: `supabase/functions/_shared/recommend-date-handler.ts`
- Modify if required: `supabase/functions/recommend-date/index.ts`
- Test: `__tests__/recommend-date-server.test.ts`
- Test: `__tests__/provider-neutral-discovery-pipeline.test.ts`
- Test: `__tests__/recommendation-discovery-strategy.test.ts`

**Interfaces:**
- fixed Kakao location(`kind: 'place'`, `source: 'kakao'`) + no `intentTags` → primary Naver attempts, sufficient하면 `fallbackUsed=false`.
- 같은 fixed location + 한 step당 하나의 `intentTags` → 동일한 Naver-first primary path. keyword enforcement는 `resolvedStepIntents`에서 계속 required다.
- current location(`source: 'current'`) → `naverShadowQueries()`가 Naver query를 만들지 않고 기존 Kakao 경로를 유지한다.

- [x] **Step 1: 세 실행 경로 fixture를 작성한다.**

  `searchProviderNeutralCandidates`와 legacy `searchCandidates`를 각각 spy로 두고, fixed/no-keyword·fixed/keyword·current/no-keyword 세 요청을 보낸다. fixed 두 요청에서는 Naver primary spy가 실행되고 legacy Kakao-only spy는 실행되지 않게 한다. current 요청에서는 Naver primary spy가 실행되지 않게 한다.

- [x] **Step 2: 현재 동작의 회귀 결과를 확인한다.**

  Run: `npx jest __tests__/recommendation-discovery-strategy.test.ts __tests__/recommend-date-server.test.ts -t "Naver-first|current|keyword" --runInBand`

  Expected: strategy flag가 정상인 현재 baseline에서 provider 분기 assertion은 PASS한다. 실패하면 다음 코드를 고치기 전에 실제 request shape 또는 environment gate가 로그와 다른지 확인한다.

- [x] **Step 3: fallback 중복 방지와 response provider를 함께 assertion한다.**

  primary 후보가 충분할 때 Kakao fallback attempt 호출 횟수 0, 결과 후보 provider가 모두 Naver, course step의 provider identity가 Naver인지 확인한다. primary 후보가 부족한 별도 fixture에서는 fallback Kakao 후보가 같은 canonical physical key면 suppressed되는지 확인한다.

### Task 5: Kakao link가 응답·attestation·앱 버튼까지 전달되는지 고정한다

**Files:**
- Test: `__tests__/recommend-date-server.test.ts`
- Test: `__tests__/recommendationSessionRepository.test.ts`
- Test: `__tests__/providerScopedSessionPersistenceMigration.test.ts`
- Read-only verify: `supabase/migrations/20260818030000_kakao_link_metadata.sql`
- Read-only verify: `lib/recommendation-session-repository.ts:78,217`
- Read-only verify: `app/mode-flow/course-result.tsx:606`

**Interfaces:**
- handler가 link map을 받으면 `course.steps[].kakaoPlaceId`와 `course.steps[].mapUrl`, cards의 `kakaoPlaceId`/`map_url`에 같은 값을 넣는다.
- Naver 대표 identity는 `{ provider: 'naver', providerPlaceId }`로 유지한다. Kakao ID는 `current_kakao_link_place_id`에만 기록한다.
- course result UI는 `currentKakaoPlaceId ?? currentKakaoLinkPlaceId`를 사용해 link ID가 있으면 리뷰·지도 버튼을 표시한다.

- [x] **Step 1: link가 붙은 Naver response fixture를 만든다.**

  `resolveProviderNeutralKakaoLinks` mock이 `provider_candidate_001`에 `{ kakaoPlaceId: 'kakao-live-1', mapUrl: 'https://place.map.kakao.com/kakao-live-1' }`를 반환하도록 하고, `handleRecommendDate()` 결과의 course step과 card step 양쪽에 값이 존재하는지 확인한다.

- [x] **Step 2: link가 없는 경우의 의도된 성공을 고정한다.**

  mock이 빈 map을 반환하면 HTTP 200, Naver `placeIdentity` 유지, `kakaoPlaceId`/`mapUrl` 없음이 기대값이다. 이 경우 UI 버튼이 숨겨지는 것은 오류가 아니라 잘못된 Kakao 장소를 열지 않기 위한 의도된 결과다.

- [x] **Step 3: session persistence와 repository mapping을 확인한다.**

  attestation response에 Naver step의 `kakaoPlaceId`를 넣고 `persist_recommendation_session()` migration 계약이 `current_kakao_link_place_id`에 기록하는지 확인한다. repository가 `currentKakaoLinkPlaceId`로 읽고, course result 조건이 해당 값을 fallback으로 사용하는지 테스트한다. 이 단계에서 DB migration이나 앱 UI 수정이 필요 없으면 파일을 수정하지 않는다.

### Task 6: 진단 telemetry가 포함된 Edge를 배포하고 마지막 두 사례를 재검증한다

**Files:**
- Deploy: `supabase/functions/recommend-date/`
- Deploy if `place-dedup.ts` changed: `supabase/functions/provider-neutral-replacements/`
- Verify: `supabase functions list --project-ref wqjguifsmtblgrhdfnji`

- [x] **Step 1: 전체 회귀 검증을 실행한다.**

  Run:

  ```bash
  npx jest __tests__/kakao-place-link.test.ts __tests__/place-dedup.test.ts __tests__/provider-neutral-discovery-pipeline.test.ts __tests__/provider-neutral-course-selection.test.ts __tests__/recommend-date-server.test.ts __tests__/recommend-date-phase7-handler.test.ts __tests__/recommendationSessionRepository.test.ts --runInBand
  npm run validate
  git diff --check
  ```

  Expected: targeted suites PASS, TypeScript error 0, whitespace error 0. Then run `npx jest --runInBand` and record the total suite/test count.

- [x] **Step 2: 공유 Edge 번들을 CLI로 배포한다.**

  Run:

  ```bash
  supabase functions deploy recommend-date --project-ref wqjguifsmtblgrhdfnji
  supabase functions deploy provider-neutral-replacements --project-ref wqjguifsmtblgrhdfnji
  supabase functions list --project-ref wqjguifsmtblgrhdfnji
  ```

  `provider-neutral-replacements`는 `place-dedup.ts`가 바뀐 경우에만 배포한다. 배포 후 `supabase functions download recommend-date` 결과와 로컬 source diff가 없는지 확인한다.

- [x] **Step 3: 새 요청으로 실제 telemetry를 만든다.**

  TestFlight 또는 개발 앱에서 기존 결과를 재진입하지 말고 새로 생성한다.

  1. 현재 위치가 아닌 `홍대입구역 2호선`을 선택한다.
  2. 무키워드로 한 번 생성한다.
  3. 키워드 한 개가 있는 식사/카페 요청으로 한 번 생성한다.
  4. 두 응답의 `kakaoPlaceId`/`mapUrl`, 같은 장소 중복 여부를 기록한다.

- [x] **Step 4: Management Logs에서 같은 requestId를 추적한다.**

  Supabase Logs Explorer 또는 Management API에서 `function_logs`를 다음처럼 조회한다.

  ```sql
  select timestamp, event_message
  from logs
  where source = 'function_logs'
    and event_message ilike '%recommend_date_kakao_link_resolution%'
  order by timestamp desc
  limit 10
  ```

  확인할 값은 `requestId`, `perCandidate[].diagnostics.rejectionCounts`, `eligibleCount`, `linkedCount`다. 모든 Kakao search outcome이 success인데 `addressMismatch`만 증가하면 Task 2의 canonical key가 실제 응답에 맞지 않는 것이므로 해당 Kakao 후보의 공개 주소 형태를 fixture에 추가한다. `distanceExceeded`면 100m 기준을 임의로 넓히지 말고 Naver/Kakao 좌표가 같은 장소인지 먼저 확인한다. `missingKakaoId`면 Kakao payload normalization을 확인한다.

- [x] **Step 5: attestation에서 최종 저장 결과를 확인한다.**

  Management Database read-only query로 새 request의 `response_json.course.steps`에서 `placeIdentity.provider`, `kakaoPlaceId`, `mapUrl`을 읽는다. link 로그가 성공인데 attestation에 값이 없으면 handler 또는 persistence 계약을 조사하고, link 로그 자체가 0이면 UI·DB를 수정하지 않는다.

### Task 7: 완료 기준과 중단 기준을 적용한다

- [x] **Step 1: 완료 기준을 모두 확인한다.**

  - fixed/no-keyword와 fixed/keyword 모두 provider discovery 로그가 Naver-first다.
  - 실제로 매칭 가능한 Kakao 후보가 있는 selected Naver 장소는 `linkedCount`가 0이 아니고, 새 attestation course step에 Kakao ID와 map URL이 있다.
  - 같은 장소가 Naver/Kakao 또는 서로 다른 Naver identity로 두 번 최종 선택되지 않는다.
  - Kakao 후보가 없거나 ambiguity인 장소는 Naver 성공 응답에서 유지되고 버튼만 숨겨진다.
  - current location 예외는 기존 Kakao 경로를 유지한다.
  - 기존 키워드 강제·후보 없음(`STEP_INTENT_UNSATISFIED`)·핀/잠금 테스트가 깨지지 않는다.

- [x] **Step 2: 아직 탈락 원인이 관측되지 않으면 추가 완화하지 않는다.**

  진단 로그가 `candidateCount=0`이면 Kakao API 검색어/검색 결과 문제이고, `candidateCount>0`·`eligibleCount=0`이면 주소·좌표·이름·ID rejectionCounts 문제다. 이 값 없이 주소·좌표 기준을 더 완화하거나 Kakao 후보를 무조건 연결하지 않는다.

- [x] **Step 3: 서버 수정 완료 후에만 앱 build 필요 여부를 결정한다.**

  현재 소스의 `course-result.tsx`가 `currentKakaoLinkPlaceId`를 표시 경로에 포함하면 server-only fix에는 새 native build가 필요 없다. TestFlight binary가 그 코드보다 오래된 경우에만 UI 변경을 포함한 별도 EAS build를 만든다.
