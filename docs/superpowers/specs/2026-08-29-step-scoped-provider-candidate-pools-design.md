# 단계별 provider 후보풀 설계

## 목표

Naver-first와 Kakao-first 추천 모두에서 후보를 검색 단계별로 분리하고, 후보가 다른 단계로 전용되는 경로를 제거한다. 각 단계는 최종 선택 가능한 후보를 최소 2개 보유해야 하며, 부족한 단계만 보조 provider로 보강한다.

이 설계는 다음 운영 위험을 함께 제거한다.

- Cafe 단계가 Meal 검색에서 나온 장소를 선택하는 등 평면 후보풀의 교차 단계 선택
- 키워드 검색어 자체가 키워드 일치 증거가 되어, 실제 상호·카테고리와 무관하게 통과하는 문제
- 전체 후보 수가 충분하다는 이유로 특정 단계의 후보 부족 fallback이 생략되는 문제
- 생성·교체·재생성·저장 snapshot이 서로 다른 후보 소속 계약을 쓰는 문제
- Naver 장소에 Kakao ID가 없다는 이유만으로 교체·잠금·재생성이 중단되는 문제

## 범위와 비범위

### 범위

- 신규 추천, 전체 재생성, 잠금 보존 재생성, 단계별 replacement options, 수동 장소 교체의 후보 소속 계약을 통일한다.
- Naver-first, Kakao-first, provider fallback에 동일한 단계별 부족 판단을 적용한다.
- 후보 snapshot, AI 입력, AI 응답 검증, 결정형 fallback, 운영 telemetry를 단계 소속 기준으로 바꾼다.
- provider identity를 기준으로 mutation을 수행할 수 있게 하여 Naver 결과도 Kakao link 유무와 무관하게 편집한다.

### 비범위

- Naver 장소와 Kakao 장소를 하나의 canonical provider ID로 병합하지 않는다. Kakao ID는 계속 선택적 지도·리뷰 링크 메타데이터다.
- `unknown`을 새 분류기로 재판정하거나 Claude 같은 보조 모델로 분류하지 않는다.
- 자유 입력 `additionalRequest`의 UI·해석은 변경하지 않는다.

## 핵심 불변식

1. 모든 선택 후보는 정확히 하나의 `sourceStepId`를 가진다.
2. 대상 단계는 같은 `sourceStepId`의 후보만 선택할 수 있다.
3. 태그가 있는 단계는 태그 검증을 통과한 선택 가능 후보가 2개 이상이어야 한다. 태그 없는 단계도 선택 가능 후보가 2개 이상이어야 한다.
4. `unknown` 카테고리는 해당 후보가 생성된 단계 안에서는 선택 가능하지만, 다른 단계로 이동할 수 없다.
5. 최종 코스에는 같은 물리 장소를 두 번 선택할 수 없다.
6. provider 링크 실패는 후보 선택이나 편집 실패 사유가 아니다.

## 데이터 모델과 경계

평면 `ProviderNeutralCandidate[]`를 다음 논리 구조로 바꾼다.

```ts
type StepCandidatePool = {
  stepId: string;
  minimumSelectableCandidates: 2;
  candidates: ProviderNeutralCandidate[];
};

type ProviderNeutralCandidate = {
  candidateId: string;
  sourceStepId: string;
  place: NormalizedPlace;
  distanceFromSearchCenterMeters: number;
  popularityBonus: number;
  qualification: {
    category: 'compatible' | 'unknown';
    intent: 'not_required' | 'matched' | 'unmatched';
    intentEvidence: readonly IntentEvidence[];
  };
};
```

`candidateId`는 요청 전체에서 유일해야 한다. 동일 장소가 서로 다른 단계 검색에서 발견되면 각 단계 풀에는 각각 존재할 수 있으나, 서로 다른 후보 ID를 사용한다. 같은 풀 안의 중복 제거만 후보 수에 영향을 준다.

후보 snapshot에는 `sourceStepId`, provider identity, 원본 provider 카테고리/상호에 기반한 intent evidence, quality 결과를 저장한다. 따라서 이후 mutation과 감사 로그가 후보의 단계 소속 및 태그 판정 근거를 재현할 수 있다.

## 검색과 단계별 fallback

각 provider 검색 plan 항목은 반드시 `stepId`를 가진다. 같은 카테고리의 두 단계도 별개의 pool을 구성한다. API 응답을 캐시하거나 재사용할 수는 있지만, 재사용된 결과의 후보 생성·검증은 각 대상 단계별로 독립 실행한다.

1. 요청의 각 단계를 기준 provider로 검색한다.
   - Naver 무태그 단계: 고정 한국어 카테고리 검색어를 사용한다.
   - Naver 태그 단계: 지역 + 태그만 사용한다.
   - Kakao도 각 검색 plan에 대상 `stepId`를 유지한다.
2. 해당 단계 안에서 quality, 최근 이력, 카테고리, 태그를 검증하고 같은 물리 장소를 제거한다.
3. 선택 가능 후보가 2개 미만인 단계만 보조 provider 검색을 실행하고, 그 결과도 같은 단계 풀에만 합친다.
4. 보조 provider 이후에도 2개 미만인 단계가 하나라도 있으면 추천을 생성하지 않고 후보 부족 결과를 반환한다. 다른 단계의 후보를 전용하지 않는다.

Naver-first는 Naver를 기준 provider, Kakao-first는 Kakao를 기준 provider로 사용한다. 이 규칙은 전체 반환 수나 다른 단계 후보 수를 기준으로 충분성을 판단하지 않는다.

## 카테고리와 키워드 검증

카테고리 검증은 clear known mismatch를 제외하고 `unknown`을 통과시킨다. 단, 통과는 source step 내부에서만 의미가 있다.

태그 단계는 검색 질의가 아니라 provider 메타데이터에서 나온 명시적 증거를 요구한다. 인정 가능한 증거는 정규화된 상호, provider 카테고리, 사전 기반 의미 태그다. 검색을 위해 전달한 태그 문자열 또는 검색어는 증거로 저장하거나 `step_intent` 증거로 승격하지 않는다.

명시적 증거가 없는 후보는 raw pool에는 진단용으로 남길 수 있으나 `selectable` 후보로 계산하지 않는다. 따라서 태그 단계의 최소 2개도 이 검증을 통과한 후보 기준이다.

## 선택 계약

AI prompt는 후보를 단계별 그룹으로 제공한다. 각 그룹에는 해당 단계의 selectable 후보 ID만 포함한다. AI는 각 stepId에 대해 그 그룹의 후보 ID 하나를 응답한다.

서버는 AI 응답을 다음 순서로 검증한다.

1. 응답 stepId가 요청 단계와 일치하는지 확인한다.
2. 선택 candidateId가 해당 stepId의 pool에 존재하고 `sourceStepId`가 같은지 확인한다.
3. 후보가 selectable 상태인지, 태그 단계라면 explicit intent evidence가 있는지 확인한다.
4. 이미 선택된 장소와 같은 물리 장소인지 확인한다.

검증 실패 또는 AI 실패 시 결정형 fallback도 같은 step pool에서만 선택하며 위 2~4번 검사를 재사용한다.

## 편집과 mutation

전체 재생성은 잠긴 단계의 provider identity를 그대로 유지하고, 잠기지 않은 각 단계의 pool만 다시 구성한다. replacement options는 대상 stepId 하나에 대해서만 같은 discovery pipeline을 실행한다.

수동 Kakao 검색 교체와 세션 mutation은 `currentKakaoPlaceId`를 필수 전제로 삼지 않는다. 선택 장소의 canonical 입력은 `{ provider, providerPlaceId }`이고, 연결된 Kakao ID는 별도 선택 메타데이터로만 취급한다. 이 변경으로 Naver 결과는 Kakao link가 없어도 교체, 잠금, 잠금 해제 재생성, 전체 재생성 대상이 된다.

순서 변경은 장소 provider와 무관한 step ordering mutation으로 유지한다. 잠금 상태 및 교체된 장소도 source step identity와 provider identity를 함께 보존한다.

## 호환성과 이행

- 기존 저장 session의 flat candidate snapshot은 읽기 호환성을 유지한다. 새 후보풀 필드는 optional read로 도입하고, 새로 생성·갱신되는 session부터 필수로 기록한다.
- 기존 Kakao-only session은 계속 Kakao identity로 mutation할 수 있다.
- 신규 mutation RPC는 provider-neutral identity를 수용하며, legacy Kakao ID 입력은 변환 가능한 경우 호환 처리한다.
- Kakao link resolver와 지도/리뷰 UI는 선택적 link 메타데이터 계약을 유지한다.

## 관측과 오류 처리

`recommend_date_provider_discovery` telemetry는 전체 수치와 함께 stepId별 다음 값을 기록한다: 기준 provider 반환 수, 풀 내 중복 제거 수, category/intent/quality/history 탈락 수, selectable 수, fallback provider, 최종 충분성.

후보 부족 응답은 부족한 stepId와 해당 단계의 selectable 후보 수를 포함한다. provider API 실패와 검증 후 후보 부족을 구분하되, 사용자 키워드 원문이나 자유 입력 원문은 로그에 기록하지 않는다.

## 테스트와 완료 기준

- Naver-first와 Kakao-first에서 각 단계가 독립 pool을 만들고, 같은 카테고리 단계도 서로 후보를 전용하지 않는다.
- 한 단계만 0~1개면 그 단계에만 fallback이 실행된다. 다른 단계가 다수 후보를 가져도 성공 처리되지 않는다.
- `unknown` 후보는 원래 step에서만 선택 가능하다. known incompatible 후보는 선택 불가다.
- 태그 검색에서 나온 후보라도 provider 메타데이터 기반 intent evidence가 없으면 태그 단계에서 선택 불가다.
- AI 응답과 결정형 fallback이 cross-step candidate, 태그 불일치, 동일 물리 장소 중복을 모두 거부한다.
- 전체 재생성, 잠금 보존 재생성, replacement options, 수동 교체가 같은 sourceStepId 계약을 쓴다.
- Naver identity만 있는 session도 Kakao link 없이 교체·잠금·잠금 해제 재생성·전체 재생성을 수행한다.
- 새 snapshot/RPC가 legacy Kakao session을 깨지 않으며, 단계별 telemetry가 생성된다.
- 관련 Jest 테스트, `npm run validate`, `git diff --check`가 통과한다.

