# 코스 키워드 최종 강제 보장 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI가 정상 응답한 경우에도 사용자가 선택하거나 직접 추가한 스텝 키워드가 최종 코스 장소에 반드시 반영되도록 한다.

**Architecture:** 현재 검색 전 게이트와 결정론 폴백은 이미 `resolvedStepIntents`를 통해 required 키워드를 검사한다. AI 선택 결과를 검증·조립하는 동일한 경로에도 `intentAwareRequest`를 전달해, AI 성공·실패·폴백 경로가 모두 같은 필수 조건을 사용하도록 수정한다. 키워드 후보가 없을 때의 기존 `STEP_INTENT_UNSATISFIED` 동작과 한 스텝당 한 키워드 계약은 유지한다.

**Tech Stack:** TypeScript, Jest, Supabase Edge Functions (Deno), Expo React Native client.

**Spec:** `docs/superpowers/specs/2026-07-31-course-keyword-hard-constraint-design.md`

## Global Constraints

- 기본 제안 키워드와 직접 추가한 키워드는 동일한 필수 조건으로 처리한다.
- 한 스텝당 키워드 하나라는 기존 계약을 유지한다. `intentTags`의 `max(1)`을 변경하지 않는다.
- 키워드가 없는 스텝의 카테고리·거리·예산·동선 동작은 변경하지 않는다.
- 현재 위치가 아닌 신규 요청에서는 무키워드와 키워드 선택 요청 모두 Naver-first provider-neutral discovery를 사용한다. 현재 위치 요청은 Naver semantic query가 비어 있는 기존 동작을 유지한다.
- 선택된 Naver 장소는 동일한 Kakao link resolver로 Kakao ID 연결을 시도한다. ID를 확보하지 못해도 Naver 장소와 provider identity는 성공 응답에 남길 수 있으며, 실패 원인은 조용히 삼키지 않고 관측 가능하게 남긴다.
- 키워드가 있는 스텝은 키워드 검색 결과 또는 엄격한 장소명·검증 카테고리 근거를 충족한 후보만 선택한다.
- 매칭 후보가 없으면 일반 카테고리 장소로 조용히 완화하지 않고 `STEP_INTENT_UNSATISFIED`를 반환하며 AI를 호출하지 않는다.
- 키워드 검색·랭킹·카카오 검증 규칙, API 계약, DB 스키마, 개인 키워드 저장 방식은 변경하지 않는다. 단, Naver-first 경로에 기존 required 키워드 검증을 연결하기 위한 provider-neutral 검색어·근거·선택 검증 보강은 허용한다.
- 핀 장소와 잠긴 스텝의 기존 우선순위 동작은 유지한다.
- 다른 카테고리에 잘못 입력한 키워드를 조용히 제거하지 않는 UX 케이스는 이번 계획에 포함하지 않는다.
- 현재 작업 트리에 이미 존재하는 UI 변경분과 무관한 파일은 수정하지 않는다.

---

### Task 1: AI 정상 응답 경로의 회귀 테스트 추가

**Files:**
- Modify: `__tests__/recommend-date-phase7-handler.test.ts` — `recommend-date Phase 7 candidate-only recovery and response` 영역
- Preserve: `__tests__/recommend-date-phase7-handler.test.ts`의 기존 `STEP_INTENT_UNSATISFIED` 테스트

**Interfaces:**
- Consumes: `handleRecommendDate`, `RecommendDateDependencies`, `PlaceCandidate`, `CourseStepInput.intentTags`.
- Produces: AI가 카테고리만 맞는 비키워드 장소를 선택해도 해당 선택을 무효화하고 키워드 일치 후보로 결정론 폴백하는 테스트 계약.

- [ ] **Step 1: AI가 비매칭 후보를 선택하는 실패 테스트를 작성한다.**

기존 `candidate()` helper를 사용해 일반 음식점 후보와 `categoryName: '음식점 > 한식 > 육류,고기 > 삼겹살'`인 매칭 후보를 함께 만든다. 검색 결과에는 두 음식점과 카페를 모두 넣고, `generateSelection`은 일반 음식점 후보를 선택하도록 고정한다.

```ts
it('AI가 키워드 불일치 후보를 고르면 키워드 일치 후보로 폴백한다', async () => {
  const taggedCandidates = [
    candidate('meal-generic', 'meal-generic-id', 'FD6', 127),
    {
      ...candidate('meal-pork', 'meal-pork-id', 'FD6', 127.0005),
      categoryName: '음식점 > 한식 > 육류,고기 > 삼겹살',
    },
    candidate('cafe-candidate', 'cafe-id', 'CE7', 127.001),
  ];
  const taggedRequest: RecommendationRequest = {
    ...request(),
    courseSteps: [
      { id: 'meal', category: 'meal', label: '식사', intentTags: ['삼겹살'] },
      { id: 'cafe', category: 'cafe', label: '카페' },
    ],
  };
  const deps = dependencies({
    searchCandidates: jest.fn(async () => ({
      candidates: taggedCandidates,
      recallByCategory: { meal: 2, cafe: 1 },
      searchMetadata: metadata({ requestCount: 3 }),
    })),
    generateSelection: jest.fn(async () => ({
      steps: [
        { stepId: 'meal', candidateId: 'meal-generic' },
        { stepId: 'cafe', candidateId: 'cafe-candidate' },
      ],
    })),
  });

  const result = await handleRecommendDate({
    method: 'POST', authorization: 'Bearer valid', body: taggedRequest,
  }, deps);

  expect(result).toMatchObject({
    status: 200,
    body: {
      course: { steps: [{ kakaoPlaceId: 'meal-pork-id' }, { kakaoPlaceId: 'cafe-id' }] },
      metadata: {
        fallbackUsed: true,
        selectionSource: 'deterministic_fallback',
        selectionReason: 'ai_invalid_selection',
      },
    },
  });
});
```

- [ ] **Step 2: 새 테스트가 현재 버그를 재현하는지 확인한다.**

Run: `npx jest __tests__/recommend-date-phase7-handler.test.ts -t "AI가 키워드 불일치 후보를 고르면" --runInBand`

Expected: FAIL. 현재 구현은 `status: 200`이지만 일반 음식점이 AI 결과로 그대로 남고, `selectionSource`가 `ai`가 된다.

- [ ] **Step 3: 기존 후보 없음 테스트가 요구사항을 계속 고정하는지 확인한다.**

기존 `returns STEP_INTENT_UNSATISFIED ...` 테스트 두 케이스를 수정하지 않고 유지한다. 이 테스트는 키워드 매칭 후보가 없으면 `status: 422`이고 `generateSelection`이 호출되지 않는다는 계약을 보장한다.

Run: `npx jest __tests__/recommend-date-phase7-handler.test.ts -t "STEP_INTENT_UNSATISFIED" --runInBand`

Expected: 현재 기준 PASS.

### Task 2: AI 선택 검증에 서버 해석 키워드 컨텍스트 전달

**Files:**
- Modify: `supabase/functions/_shared/recommend-date-handler.ts:675-682`
- Test: `__tests__/recommend-date-phase7-handler.test.ts`

**Interfaces:**
- Consumes: Task 1의 실패 테스트, `intentAwareRequest`의 `resolvedStepIntents`와 `resolvedExcludedIntents`.
- Produces: `buildCandidateOnlyCourse()`가 AI 선택 결과를 검증할 때 검색 전 게이트·폴백과 동일한 required intent 목록을 사용한다.

- [ ] **Step 1: AI 선택 조립 요청을 `intentAwareRequest`로 교체한다.**

현재 AI 성공 분기의 `serverRequest` spread를 다음처럼 바꾼다.

```ts
built = buildCandidateOnlyCourse({
  request: { ...intentAwareRequest, courseSteps: effectiveCourseSteps },
  candidates: search.candidates,
  history,
  reintroducedPlaceIds: search.reintroducedPlaceIds,
  selection,
  generatedAt,
});
```

이 변경으로 `buildCandidateOnlyCourse()` 내부의 `effectiveStepIntents()`가 `resolvedStepIntents`를 읽고, AI가 비매칭 후보를 고르면 `CourseSelectionError`를 발생시킨다. 기존 catch가 이를 `ai_invalid_selection`으로 분류하고, 이후 `buildDeterministicCandidateCourse()`가 매칭 후보만으로 재조립한다.

- [ ] **Step 2: 새 회귀 테스트가 통과하는지 확인한다.**

Run: `npx jest __tests__/recommend-date-phase7-handler.test.ts -t "AI가 키워드 불일치 후보를 고르면" --runInBand`

Expected: PASS. 일반 음식점은 선택되지 않고 삼겹살 후보가 결정론 폴백으로 선택된다.

- [ ] **Step 3: AI가 이미 매칭 후보를 고르는 정상 경로를 확인한다.**

기존 `selected tags alone are resolved and forwarded to candidate search` 테스트의 후보를 유지하고, 결과가 `selectionSource: 'ai'`일 때 삼겹살 후보가 실제 코스에 들어가는지 assertion을 보강한다.

```ts
expect(result).toMatchObject({
  status: 200,
  body: {
    course: { steps: [{ kakaoPlaceId: 'meal-id' }] },
    metadata: { selectionSource: 'ai', fallbackUsed: false },
  },
});
```

### Task 3: 선택·폴백·후보 없음 경로의 전체 회귀 검증

**Files:**
- Test: `__tests__/recommend-date-phase7-handler.test.ts`
- Test: `__tests__/recommend-date-course-selection.test.ts`
- Test: `__tests__/recommend-date-intent-server.test.ts`
- Test: `__tests__/recommend-date-search-server.test.ts`
- Test: `__tests__/stepIntentResolve.test.ts`

**Interfaces:**
- Consumes: Task 2의 최종 선택 컨텍스트 수정.
- Produces: 기본 키워드·직접 추가 키워드·검색·후보 검증·AI 폴백에 대한 통합 회귀 증거.

- [ ] **Step 1: 영향 범위 테스트를 실행한다.**

Run: `npx jest __tests__/recommend-date-phase7-handler.test.ts __tests__/recommend-date-course-selection.test.ts __tests__/recommend-date-intent-server.test.ts __tests__/recommend-date-search-server.test.ts __tests__/stepIntentResolve.test.ts --runInBand`

Expected: 모든 테스트 PASS. 특히 다음을 확인한다.

- 기본 키워드 `라멘`과 직접 입력 키워드 `샐러드`가 모두 required다.
- 키워드 매칭 후보가 없으면 `STEP_INTENT_UNSATISFIED`이고 AI를 호출하지 않는다.
- AI가 비매칭 후보를 선택하면 결과가 결정론 폴백으로 매칭 후보를 선택한다.
- 키워드가 없는 스텝과 preferred 자유 입력 동작은 변하지 않는다.
- 핀·잠금 스텝의 기존 예외 동작은 변하지 않는다.

- [ ] **Step 2: 전체 타입 검사를 실행한다.**

Run: `npm run validate`

Expected: `tsc --noEmit` 오류 0개.

- [ ] **Step 3: 변경된 공유 Edge 코드의 배포 대상을 확인한다.**

변경 diff를 확인해 `recommend-date-handler.ts`가 포함된 Edge 함수 번들을 식별한다. 공유 `_shared` 모듈 배포 규칙에 따라 `recommend-date`와 `replacement-candidates`를 함께 배포 대상으로 유지한다. 이 단계 전에는 원격 상태를 변경하지 않는다.

- [ ] **Step 4: Task 4·5 구현과 검증을 끝낸 뒤 두 Edge Function을 배포한다.**

Run:

```bash
supabase functions deploy recommend-date --project-ref wqjguifsmtblgrhdfnji
supabase functions deploy replacement-candidates --project-ref wqjguifsmtblgrhdfnji
```

Expected: 두 함수가 성공적으로 배포되고, 배포 후 한 번의 실제 요청에서 `intentTags: ['삼겹살']`가 매칭 후보를 선택하는지 확인한다. Task 5에서 provider-neutral 경로를 Kakao-only로 잠그기로 결정하면 `recommend-date`의 실제 무키워드 요청도 Kakao identity 계약을 만족하는지 함께 확인한다.

- [ ] **Step 5: 배포 후 운영 시나리오를 확인한다.**

다음 세 시나리오를 기록한다.

1. 매칭 후보 존재 + AI가 비매칭 후보 반환 → 매칭 후보로 폴백
2. 매칭 후보 0개 → `STEP_INTENT_UNSATISFIED`, 일반 장소 대체 없음
3. 매칭 후보 존재 + AI가 매칭 후보 반환 → AI 결과 유지

---

### Task 4: 키워드 엣지케이스 회귀 계약 추가

**Files:**
- Test: `__tests__/recommend-date-phase7-handler.test.ts`
- Test: `__tests__/recommend-date-course-selection.test.ts`
- Test: `__tests__/recommend-date-pinned-step.test.ts`
- Test: `__tests__/recommend-date-intent-server.test.ts`
- Test: `__tests__/recommend-date-search-server.test.ts`
- Test: `__tests__/stepIntentResolve.test.ts`
- Modify if needed: `app/mode-flow/generating.tsx`

**Interfaces:**
- Consumes: `RecommendationRequest.courseSteps[].intentTags`, `resolvedStepIntents`, candidate evidence, lock/pin metadata.
- Produces: 키워드가 있는 스텝은 모든 재추천·교체·AI·결정론 폴백에서 같은 required 조건을 유지한다는 회귀 계약.

- [ ] **Step 1: 코스 전체 조합이 불가능한 경우를 고정한다.**

  개별적으로는 키워드 매칭 후보가 있어도 같은 장소를 두 스텝이 동시에 써야 하거나, 유효 후보 수가 반복 스텝 수보다 부족하거나, 동선/중복 검증 때문에 전체 코스를 만들 수 없는 fixture를 추가한다. 기대 결과는 다음 중 하나로 제한한다.

  - 키워드 조건을 만족하는 다른 조합으로 결정론 폴백
  - 조건을 만족하는 조합 자체가 없으면 `COURSE_VALIDATION_FAILED` 또는 기존의 명시적 후보 부족 오류

  일반 카테고리 후보를 끼워 넣어 성공시키는 결과는 허용하지 않는다.

- [ ] **Step 2: 교체·추가 경로도 같은 required 조건을 사용하는지 검증한다.**

  특정 스텝에 키워드가 있는 세션에서 `replacement-candidates`, 교체 적용, 검증된 스텝 추가가 모두 키워드 매칭 후보만 반환·저장하는지 확인한다. 교체 응답의 임시 `candidateId`를 다른 검색 요청의 번호로 재사용하지 않고, 해당 요청을 attest한 응답의 `stepId`와 provider identity를 사용한다는 계약도 함께 고정한다.

- [ ] **Step 3: 핀·잠금의 예외를 명시적으로 고정한다.**

  핀 장소와 잠긴 스텝은 기존 우선순위대로 보존하되, 새로 선택되거나 교체되는 비잠금 스텝에는 키워드 강제를 적용한다. 즉 “키워드 항상 강제”의 의미가 핀·잠금 장소를 몰래 바꾸는 것은 아님을 테스트로 명확히 한다.

- [ ] **Step 4: 검색 후보 풀의 경계에서 조용한 일반화가 없는지 검증한다.**

  키워드 매칭 결과가 검색 페이지·랭킹 상한·후보 pool 컷 바깥에 있는 경우를 fixture로 만든다. 이때 매칭 후보를 찾지 못했다면 `STEP_INTENT_UNSATISFIED` 또는 명시적 검색 실패를 반환하고, 상위에 남은 일반 카테고리 후보를 AI에게 넘겨 성공시키지 않는다. 검색 recall 개선은 별도 최적화로 분리하되, 현재 보수적 실패 계약은 유지한다.

- [ ] **Step 5: 기본 키워드·직접 추가 키워드·자유 입력의 근거 차이를 검증한다.**

  기본 catalog 키워드와 개인 catalog에 직접 추가한 키워드가 모두 `required`로 해석되는지, 장소명·검증된 카테고리·해당 키워드 검색 evidence 중 허용된 근거가 없으면 통과하지 않는지 확인한다. 키워드가 없는 스텝과 `preferred` 자유 문장은 기존처럼 동작해야 한다.

- [ ] **Step 6: “조건 완화” 재시도가 실제로 완화되는지 수정·검증한다.**

  서버가 `STEP_INTENT_UNSATISFIED`를 반환했을 때 `generating.tsx`의 조건 완화 버튼이 structured `courseSteps[].intentTags`를 그대로 재전송하지 않도록 한다. 완화 재시도는 키워드 required 조건을 제거하거나 사용자가 수정한 요청으로 다시 구성해야 하며, 사용자가 명시적으로 조건을 유지한 일반 재시도는 계속 강제되어야 한다.

---

### Task 5: 무키워드 Naver/Kakao provider-neutral 회귀 원인 제거

**Files:**
- Modify: `supabase/functions/_shared/place-dedup.ts` if normalization correction is required
- Modify: `supabase/functions/_shared/kakao-place-link.ts` if link failure classification or matching correction is required
- Modify: `supabase/functions/_shared/recommend-date-handler.ts` and/or `supabase/functions/recommend-date/index.ts` for the selected rollout contract
- Test: `__tests__/provider-neutral-discovery-pipeline.test.ts`
- Test: `__tests__/place-dedup.test.ts`
- Test: `__tests__/kakao-place-link.test.ts`
- Test: `__tests__/recommend-date-server.test.ts`
- Test: `__tests__/provider-neutral-course-selection.test.ts`
- Test: `__tests__/recommendation-session-fixture.ts` or the relevant session/client test

**Root cause to preserve in the tests:**

무키워드·신규·미고정 요청은 `recommend-date-handler.ts`의 `canUseProviderNeutralPath` 조건을 만족한다. Edge 환경이 `RECOMMENDATION_DISCOVERY_STRATEGY=naver_primary_with_kakao_fallback`이고 `RECOMMENDATION_PROVIDER_SESSION_PERSISTENCE=enabled`이면 Kakao-only 검색이 아니라 Naver-first discovery가 실행된다. Naver 후보에는 legacy Kakao ID가 없고, 선택된 Naver 장소의 Kakao 연결은 주소·좌표·상호명 조건을 만족할 때만 후처리로 붙으며 실패해도 현재 응답은 성공한다.

반대로 구조화 `intentTags`가 실제로 `resolvedStepIntents`로 해석된 `recommend-date` 요청은 현재 `canUseProviderNeutralPath`의 추가 조건 때문에 Kakao 검색 경로를 사용한다. 이 조건은 `ec850f4`에서 “provider-neutral discovery에 per-step intent evidence가 없다”는 이유로 추가됐다. `naver_shadow` 로그에 Naver 결과가 보여도 그것은 비교 관측이며 사용자 후보를 만드는 primary 결과가 아니다. 원래 요구대로 키워드 요청도 Naver-first로 만들려면 이 분기를 되돌리는 동시에 Naver 검색어·evidence·required 선택 검증을 연결해야 한다.

따라서 “Kakao placeId를 찾지 못함”은 다음 두 경우를 구분해야 한다.

1. Kakao fallback이 실행됐지만 제공처 간 주소/상호명 정규화가 달라 동일 장소 dedupe에 실패한 경우
2. Naver 장소가 대표 후보로 선택됐고 Kakao link 검색이 빈 결과·API 오류·좌표/주소 부족·복수 후보 ambiguity로 실패한 경우
3. 후보 풀에서 Naver와 Kakao가 같은 물리 장소인데 provider ID가 달라 각각 살아남고, 최종 코스 선택기가 이를 서로 다른 장소로 취급한 경우

세 경우를 같은 “후보 없음”으로 처리하거나 조용히 일반 후보로 바꾸지 않는다.

- [ ] **Step 1: 실제 실행 경로와 원격 설정을 확인한다.**

  배포된 `recommend-date`의 discovery strategy, provider persistence flag, 함수 배포 시점을 확인하고, 한 건의 실패 요청에서 다음 로그를 request/session 기준으로 묶는다.

  - `recommend_date_provider_discovery`: Naver/Kakao 후보 수, `fallbackUsed`, 시도 횟수
  - `recommend_date_kakao_fallback`: Kakao fallback 호출 여부
  - `recommend_date_kakao_link_resolution`: `selectedNaverCount`와 `linkedCount`

  로컬 소스와 원격 배포본이 다르면 먼저 배포 불일치를 해결한다. 원격 환경값을 확인하지 않고 코드만 고쳐 재현 종료로 판단하지 않는다.

- [ ] **Step 2: Naver-first와 Kakao fallback의 동일 장소 dedupe를 재현한다.**

  주소의 공백·문장부호·도로명 표기, 상호명의 지점 suffix·공백 차이, 좌표 오차를 포함한 Naver/Kakao fixture를 추가한다. 실제 동일 장소만 하나로 합치고, 다른 지점은 유지해야 한다. 대표 provider를 Naver로 유지할 때 Kakao ID가 자동으로 생긴다고 가정하지 않으며, candidate identity는 항상 `{ provider, providerPlaceId }`로 보존한다.

  후보 풀 dedupe만으로 끝내지 않는다. dedupe가 주소 표기 차이 때문에 놓치거나, 의도적으로 양 provider identity를 모두 보존하는 경우에도 최종 코스에서는 동일 장소를 두 스텝에 중복 선택할 수 없어야 한다. 따라서 선택 단계는 provider ID뿐 아니라 좌표·정규화 주소·정규화 상호명의 물리 장소 키를 비교하거나, 그 동등성을 보장하는 공통 canonical identity를 사용한다. 단, 같은 주소의 서로 다른 지점은 좌표 거리·상호명까지 함께 확인해 보존한다.

- [ ] **Step 3: Kakao link 성공·실패를 명시적으로 구분한다.**

  선택된 Naver 장소에 대해 주소/좌표가 일치하는 단일 Kakao 후보, 주소는 같지만 복수 후보, API 빈 응답/오류, Naver 필드 부족을 각각 테스트한다.

  - Kakao 연결 성공: `kakaoPlaceId`와 Kakao map URL을 추가하되 Naver 원본 identity는 바꾸지 않는다.
  - 연결 실패: Naver 장소는 유지할 수 있지만 `linkedCount`, 실패 원인, Kakao API 응답 상태를 관측 가능하게 남긴다.
  - 키워드 경로와 무키워드 경로가 동일한 Naver 원본 필드·동일한 Kakao 검색 fixture를 받으면 반드시 같은 Kakao ID를 반환해야 한다. 차이가 나면 linker 기준을 더 느슨하게 바꾸기 전에 입력 필드·endpoint·환경값·배포 버전을 확인한다.

- [ ] **Step 4: 현재 클라이언트와 세션 persistence 계약을 한 방향으로 맞춘다.**

  이번 릴리스의 기준은 **현재 위치가 아닌 신규 요청에서 무키워드와 키워드 선택 모두 Naver-first**다. `RECOMMENDATION_DISCOVERY_STRATEGY=naver_primary_with_kakao_fallback`을 유지하고, `location.source === 'current'`일 때만 기존처럼 Naver query가 비어 Kakao fallback으로 갈 수 있다.

  `resolvedStepIntents`가 있는 요청도 provider-neutral 경로로 보내되, Naver query에 해당 스텝의 키워드를 포함하고 후보의 검색 evidence 또는 엄격한 장소명·카테고리 근거로 required를 검증한다. Naver identity와 Kakao ID를 함께 저장할 때는 원본 provider identity를 Kakao identity로 덮어쓰지 않는다.

- [ ] **Step 5: 무키워드 운영 회귀 시나리오를 추가한다.**

  다음을 각각 검증한다.

  1. 현재 위치가 아닌 무키워드 신규 요청 → Naver-first 후보가 선택되고 Kakao ID 연결을 시도함
  2. 현재 위치가 아닌 키워드 신규 요청 → Kakao 검색으로 우회하지 않고 Naver-first 후보가 선택되며 required 키워드를 만족함
  3. 선택 Naver 후보의 Kakao link 성공 → Kakao ID가 보조 metadata로 붙음
  4. 선택 Naver 후보의 Kakao link 실패 → Naver 장소는 유지되고 실패 원인이 관측됨
  5. Naver shadow → 제품 응답에 영향을 주지 않고 관측 로그만 남음
  6. Naver/Kakao provider ID가 다른 동일 장소를 한 코스의 두 스텝에 중복 선택하지 않음
  7. 응답 저장 후 재조회·교체·잠금에서 Naver identity와 보조 Kakao ID가 서로 뒤섞이지 않음

- [ ] **Step 6: 관련 테스트와 타입 검사를 실행한다.**

  Run: `npx jest __tests__/provider-neutral-discovery-pipeline.test.ts __tests__/place-dedup.test.ts __tests__/kakao-place-link.test.ts __tests__/provider-neutral-course-selection.test.ts __tests__/recommend-date-server.test.ts --runInBand`

  Run: `npm run validate`

## 범위 밖 후속 작업

- `metadata.stepIntent.verifiedCanonicalTerms`를 선택된 장소 기준으로 재계산하는 작업은 별도 메타데이터 정합성 개선으로 분리한다. 이번 핵심 버그 수정에는 필요하지 않다.
