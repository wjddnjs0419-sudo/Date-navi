# 추천 이력·다양성 기반 출시 전 품질 보정 설계

작성일: 2026-07-26  
상태: 설계 방향 승인, 구현 계획 승인 대기

## 1. 목표

새 외부 API와 신규 DB 테이블을 도입하지 않고 다음 문제를 해결한다.

1. 같은 지역에서 새 계획을 만들 때 최근 계획과 동일한 장소가 반복되는 문제를 줄인다.
2. 교체 후보 상단 3개의 의미를 실제 판단 근거에 맞게 `추천`에서 `동선 추천`으로 정정한다.
3. 이미 저장 중인 추천 세션·장소·행동·피드백·장소 조합 데이터를 신규 계획과 교체 후보 점수에 연결한다.
4. 희소 지역에서 이력 제외 때문에 코스 생성이 실패하지 않도록 통제된 완화와 사용자 고지를 제공한다.

성공은 AI 온도를 높여 결과를 무작위화하는 것이 아니라, 검증된 카카오 후보 안에서 최근 중복을 줄이고 현재 코스 동선을 보존하는 것으로 정의한다.

## 2. 비범위

- 평점·리뷰 수·영업시간·실제 가격 검증
- 실제 보행 경로 API
- 신규 장소 정보 공급자 또는 외부 API
- 신규 DB 테이블 및 장기 학습 모델
- 레거시 느낌/다음 만남 추천
- 카카오 검색 캐시 제거
- 사용자 입력 예산의 정확한 장소별 반영

## 3. 현재 동작과 문제

### 신규 계획

신규 요청은 현재 사용자·커플의 과거 `kakaoPlaceId`를 포함하지 않는다. 같은 지역과 코스 단계는 동일한 카카오 검색 계획, 30일 캐시, 결정론 랭킹, 온도 0의 후보 선택을 거치므로 동일 장소가 반복되기 쉽다.

한 코스 안의 Kakao 장소 ID 중복은 서버 스키마와 선택 검증에서 막지만, 서로 다른 추천 세션 사이의 중복은 막지 않는다.

### 교체 후보

현재 교체 후보는 다음 순서로 결정된다.

1. 현재 코스에 이미 포함된 장소 제외
2. 교체 대상 카테고리와 호환되는 후보만 유지
3. 도보 한도가 있으면 앞·뒤 단계 각각에 대해 `한도 분 × 80m` 직선거리 이내만 유지
4. 카테고리·검색 중심 거리 기반 후보 점수 계산
5. `contextScore = candidate.score - 앞뒤 직선거리 합계 / 100`
6. 상위 3개에 UI가 무조건 `추천` 라벨 부여

평점·리뷰·예산·분위기·행동 이력은 이 상위 3개 판정에 사용되지 않는다. 따라서 사용자 문구는 `동선 추천`이 정확하다.

## 4. 검토한 접근

### A. 최근 장소 전체를 30일간 하드 제외

중복은 강하게 줄지만 후보가 적은 지역·카테고리에서 생성 실패가 늘고, 사용자가 좋아하는 장소까지 다시 선택할 수 없다. 채택하지 않는다.

### B. 모든 과거 행동을 하나의 개인화 점수로 합산

구현은 단순하지만 확정·잠금 같은 약한 행동이 실제 만족으로 오해되고, 데이터가 적은 출시 초기에 인기 편향이 커진다. 채택하지 않는다.

### C. 계층형 제외 + 보수적 행동 보정

최근 노출은 우선 제외하되 후보 부족 시 감점 후보로 재도입한다. 교체·삭제는 강한 부정 신호로, 재방문과 충분한 표본의 장소 조합은 작은 보조 가점으로 사용한다. 기존 카테고리·필수 의도·직접 지정·동선 제약을 항상 우선한다.

이 접근을 채택한다.

## 5. 이력 범위와 소유권

Edge Function이 인증된 사용자 ID를 기준으로 서버에서 직접 이력을 조회한다. 클라이언트는 과거 장소 ID나 행동 점수를 제출하지 않는다.

- 연결된 커플: 현재 `couple_id`와 일치하는 세션을 공동 이력으로 사용
- 미연결 사용자 또는 couple 조회 실패: `owner_user_id`가 현재 사용자와 일치하는 세션만 사용
- 다른 커플·다른 사용자의 세션과 개인 피드백은 사용하지 않음
- 전역 `place_pair_stats`는 기존 공개 임계치인 `unique_couple_count >= 10`과 `confirmed_selection_count >= 15`를 모두 충족한 조합만 사용

같은 지역은 과거 세션 `original_request.location`과 현재 요청 좌표의 직선거리가 2km 이하인 경우로 정의한다. 좌표나 요청 파싱이 실패한 과거 세션은 지역 중복 계산에서 제외하되 요청 자체를 실패시키지 않는다.

## 6. 서버 이력 컨텍스트

추천 랭커에 DB row를 직접 전달하지 않고, 별도의 순수 데이터 계약으로 정규화한다.

```ts
type RecommendationHistoryContext = {
  recentHardPlaceIds: string[];
  recentExposure: Record<string, {
    lastSeenAt: string;
    sessionDistance: number;
  }>;
  negativeActions: Record<string, {
    replacedCount: number;
    deletedCount: number;
    lastNegativeAt: string;
  }>;
  feedback: Record<string, {
    revisit: boolean;
    quiet: number;
    noisy: number;
    photos: number;
    crowded: number;
  }>;
  qualifiedPairs: Array<{
    sourceKakaoPlaceId: string;
    targetKakaoPlaceId: string;
  }>;
};
```

`sessionDistance`는 같은 지역에서 가장 최근 추천 세션을 1로 두는 양의 정수 순번이다. 원본 자연어와 AI prompt는 이 컨텍스트에 포함하지 않는다.

## 7. 제외·완화 정책

### 절대 제외

다음 조건은 기존처럼 완화하지 않는다.

- 현재 코스에 이미 존재하는 Kakao 장소 ID
- 요청의 명시적 `excludedPlaceIds`
- 사용자가 이번 입력에서 직접 지정한 장소와 충돌하는 중복 후보
- 선택 단계와 카테고리가 맞지 않는 후보
- required step intent를 충족하지 못하는 후보

직접 지정한 장소는 과거 이력보다 우선한다.

### 최근 계획 우선 제외

같은 지역의 최근 2개 추천 세션에 포함됐던 장소는 1차 후보군에서 제외한다.

1차 후보군으로 모든 요청 단계를 채울 수 있으면 최근 장소 없이 코스를 생성한다.

후보 부족 시 최근 장소를 재도입하되 아래 규칙을 적용한다.

- 가장 오래된 노출부터 재도입
- 재도입 후보에 `diversity: -30`
- 같은 장소를 다시 썼다면 `relaxedConstraints`에 `recentPlaceCooldown` 한 건 추가
- 결과 화면에 “새 장소 후보가 부족해 최근 추천 장소를 일부 다시 포함했어요” 표시

교체·삭제된 장소는 최근 90일 동안 `behavior: -30`을 추가 적용한다. 희소 지역 생성 실패를 피하기 위해 절대 제외로 만들지는 않지만, 동점이나 소폭 점수 차이에서 상위 후보가 될 수 없도록 한다.

## 8. 점수 정책

기존 카테고리·step intent·중심 거리 점수를 유지하고 비어 있던 `diversity`, `behavior`를 채운다.

### 다양성 점수

| 조건 | 점수 |
|---|---:|
| 같은 지역 최근 2개 세션 장소, 완화 재도입 | -30 |
| 같은 지역 3~5번째 최근 세션 장소 | -15 |
| 같은 지역 6번째 이후, 90일 이내 장소 | -5 |
| 최근 노출 없음 | 0 |

### 행동 점수

| 조건 | 점수 |
|---|---:|
| 최근 90일 교체 또는 삭제 이력 | -30 |
| `revisit` 피드백 | +5 |
| quiet 요청 + `quiet` 피드백 | +5 |
| quiet 요청 + `noisy` 또는 `crowded` 피드백 | 각각 -8 |
| photo 요청 + `photos` 피드백 | +5 |
| 임계치 충족 장소 조합이 앞 또는 뒤 장소와 일치 | 이웃당 +3, 최대 +6 |

행동 점수 총합은 `-40...+10`으로 제한한다. 작은 양의 신호가 거리·카테고리·필수 의도를 역전하지 못하게 하기 위함이다.

`place_feedback`이 없거나 입력 분위기와 의미가 직접 일치하지 않으면 점수를 주지 않는다. `confirmed`와 `locked`는 선택 편향이 강하므로 단독 장소 가점으로 사용하지 않는다.

## 9. 신규 계획 데이터 흐름

```text
recommend-date 인증
→ 현재 사용자 profile/couple 확인
→ 같은 지역 추천 세션·단계·이벤트·피드백 조회
→ RecommendationHistoryContext 정규화
→ Kakao 검색/캐시
→ 카테고리·필수 intent·명시적 제외
→ 최근 2개 세션 장소 제외한 1차 랭킹
→ 코스 구성 가능 여부 확인
   ├─ 가능: 이력 중복 없는 후보로 선택
   └─ 불가: 최근 장소 감점 재도입 + recentPlaceCooldown 기록
→ 기존 후보 전용 AI 선택 또는 결정론 fallback
→ 서버 검증
```

AI는 history context를 해석하거나 장소 이력을 새로 추론하지 않는다. 서버가 계산한 최종 후보 점수와 제외 결과만 전달받는다.

## 10. 교체 후보 데이터 흐름

`replacement-candidates`에서도 동일한 이력 컨텍스트를 로드한다.

```text
대상 카테고리 일치
→ 현재 코스 장소 절대 제외
→ 도보 직선거리 한도 필터
→ 기존 candidate score
→ 앞뒤 거리 contextScore
→ diversity + behavior
→ 결정론 정렬
→ 1~3위: 동선 추천
→ 4~15위: 다른 후보
```

UI 문구:

- `추천` → `동선 추천`
- 설명: `현재 코스 동선과 최근 추천 이력을 반영한 상위 3개예요. 외부 후기·지도는 직접 확인해주세요.`
- 영어: `Route fit`
- 영어 설명: `These top three consider the current route and your recent recommendations. Check external reviews and maps directly.`

`동선 추천`은 평점·리뷰 품질 보장을 의미하지 않는다.

## 11. 오류와 폴백

- 이력 조회 실패: 추천 전체를 실패시키지 않고 빈 이력 컨텍스트로 기존 랭킹 수행
- 부분 row 파싱 실패: 해당 row만 제외하고 구조화 로그 기록
- 후보 부족: 최근 노출 장소만 단계적으로 재도입
- 여전히 후보 부족: 기존 `INSUFFICIENT_CANDIDATES` 또는 step intent 오류 유지
- pair stats·feedback 조회 실패: 해당 보조 점수만 0
- 직접 지정 장소: history 감점 없이 기존 pin-wins 검증 유지

이력 조회 실패와 완화 여부는 구조화 로그로 남기되, 다른 사용자의 식별자나 원본 자연어는 로그에 남기지 않는다.

## 12. 관측 지표

새 외부 분석 SDK 없이 Edge 구조화 로그와 기존 세션 DB로 계산한다.

- `same_area_repeat_rate`: 같은 지역 최근 2개 계획과 새 계획의 장소 중복 비율
- `recent_history_excluded_count`: 요청당 1차 제외 장소 수
- `recent_cooldown_relaxed_rate`: 최근 장소 재도입 비율
- `replacement_top3_repeat_rate`: 교체 상위 3개가 과거 추천과 겹치는 비율
- `replacement_pick_rate`: 동선 추천 3개 중 실제 선택 비율
- `replacement_empty_rate`: 교체 가능 후보 0건 비율
- `course_generation_failure_rate`: 이력 적용 전후 후보 부족 실패율

출시 전 고정 픽스처와 실제 QA 세션으로 기준선을 측정한다. 목표값은 기준선 없이 임의로 고정하지 않는다.

## 13. 테스트 설계

TDD 순서로 다음 실패 테스트를 먼저 작성한다.

1. 같은 지역 최근 2개 세션 장소가 신규 계획 1차 후보에서 제외된다.
2. 2km를 넘는 다른 지역 세션은 제외에 사용되지 않는다.
3. 연결 커플의 양쪽 소유 세션을 공동 이력으로 읽고 타 커플 데이터는 읽지 않는다.
4. 직접 지정 장소는 최근 이력에 있어도 유지된다.
5. 최근 장소를 빼면 단계 후보가 부족할 때만 감점 재도입된다.
6. 재도입 시 `recentPlaceCooldown` 완화가 정확히 한 번 반환된다.
7. 교체·삭제 장소는 일반 최근 노출보다 낮게 정렬된다.
8. feedback·pair stats는 의미 일치와 임계치 충족 때만 제한된 가점을 받는다.
9. 이력 조회 실패 시 기존 추천 경로로 정상 폴백한다.
10. 교체 후보 상위 3개만 `동선 추천` 라벨을 받는다.
11. ko/en 문구가 모두 존재하고 긴 영어에서도 버튼·라벨이 깨지지 않는다.
12. 기존 동일 코스 Kakao ID 중복·카테고리·required intent·pin·도보 검증이 회귀하지 않는다.

각 구현 서브태스크 종료 시 대상 Jest, 전체 Jest, `npm run validate`, `git diff --check`를 실행한다. Edge 변경은 Deno check와 로컬 소스/배포본 대조를 추가한다.

## 14. 변경 경계

예상 변경:

- `shared/recommendation/`: history context 계약과 순수 점수/완화 함수
- `supabase/functions/_shared/`: 인증 사용자 이력 로더와 랭커 연결
- `supabase/functions/recommend-date/index.ts`
- `supabase/functions/replacement-candidates/index.ts`
- `app/mode-flow/course-result.tsx`
- `locales/ko/modeFlow.json`
- `locales/en/modeFlow.json`
- 관련 Jest/Edge 계약 테스트

신규 테이블은 만들지 않는다. 필요한 인덱스가 이미 존재하는지 실행 계획 단계에서 `EXPLAIN`으로 확인하고, 실제 쿼리 성능 문제가 증명될 때만 별도 마이그레이션을 제안한다.

## 15. 배포와 롤백

1. 로컬 단위·통합 테스트
2. `recommend-date` 배포
3. `replacement-candidates` 배포
4. 앱 i18n/라벨 포함 Release 빌드
5. 같은 지역 반복 생성, 희소 지역 완화, 교체 후보 실기기 QA
6. Edge 로그로 중복률·완화율·실패율 확인

롤백은 두 Edge Function을 이전 버전으로 재배포하고 앱 라벨을 되돌리는 것이다. DB 스키마를 추가하지 않으므로 데이터 롤백은 필요 없다.

## 16. 자체 검토 결과

- 미정 항목: 없음
- 외부 API·신규 테이블: 없음
- 사용자 승인 범위 밖 레거시 추천 변경: 없음
- 리뷰·가격·실제 도보 품질을 암시하는 문구: 없음
- 후보 부족 시 무음 완화: 없음
- 직접 지정·기존 hard constraint 우선순위 충돌: 없음
