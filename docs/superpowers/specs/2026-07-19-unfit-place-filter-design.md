# 부적합 장소 필터 설계 (2026-07-19)

## 배경

카카오 로컬 검색이 "데이트 장소" 키워드 등으로 병원·약국·모텔·키즈카페 같은
데이트에 부적합한 장소를 후보에 섞어 반환한다. 이들이 후보 명단에 남으면
Haiku 코스 선택기까지 전달되어 코스에 뽑힐 수 있다.

## 목표

부적합 장소를 후보 랭킹 단계에서 제거하여 후보(recommend-date)와
대안(replacement-candidates) 양쪽에서 다시 노출되지 않도록 한다.

## 비목표 (후속 작업)

- **B안 (후속)**: 구글 Places API의 별점·리뷰수 도입으로 진짜 품질 레벨링.
  이번 범위 아님. PLAN.md 백로그에 기록.
- **C안 (폐기)**: 카카오 캐시 빈도 기반 인기도 디렉토리/부스팅.
  빈도는 품질이 아닌 상권 중심성을 재고, 프랜차이즈 편향 역효과 위험이 있어
  진행하지 않는다.

## 적용 지점

두 소비처 모두 `searchAndRankRecommendation` → `rankPlaceCandidates`를 거친다:

- `supabase/functions/recommend-date/index.ts` (최초 후보)
- `supabase/functions/replacement-candidates/index.ts` (교체 대안)

따라서 `recommendation-ranking.ts`의 `eligiblePlaces` 필터
(현재 excludedPlaceIds/excludedCategories 처리) 한 곳에 부적합 술어를 추가하면
양쪽에 동시 적용된다.

## 데이터

필터에 필요한 필드는 이미 `EvidencedKakaoPlace`에 보존되어 있다:

- `categoryGroupCode` (예: `HP8`, `CE7`)
- `categoryName` (예: `음식점 > 카페 > 키즈카페`)

새 저장소·집계·마이그레이션 없음. 순수 결정론 필터.

## 판정 술어

`isUnfitDatePlace(place: { categoryGroupCode: string; categoryName: string }): boolean`

두 블록리스트 중 하나라도 걸리면 `true`(제외):

### 1. 카테고리 그룹코드 차단 — `UNFIT_CATEGORY_GROUP_CODES`

```
HP8 병원, PM9 약국, AD5 숙박(모텔),
BK9 은행, PK6 주차장, OL7 주유소, SW8 지하철역,
MT1 대형마트, CS2 편의점, PS3 어린이집·유치원,
SC4 학교, AC5 학원, AG2 부동산, PO3 공공기관
```

데이트 적합 코드(FD6 음식점, CE7 카페, CT1 문화시설, AT4 관광명소)는 통과.
빈 문자열 그룹코드(키워드 검색 결과 일부)는 그룹코드로는 못 거르므로
2번 키워드 규칙으로 보강한다.

### 2. 카테고리명 키워드 차단 — `UNFIT_CATEGORY_NAME_KEYWORDS`

허용 그룹코드 안에 숨은 잡음 제거용. `categoryName` 부분일치:

```
키즈카페, 모텔, 무인텔, 병원, 산부인과, 성인
```

## 설계 원칙

- 상수 2개(`UNFIT_CATEGORY_GROUP_CODES` Set, `UNFIT_CATEGORY_NAME_KEYWORDS` 배열)로
  분리. 마법문자열 금지, 추가 용이.
- 술어는 `recommendation-category.ts`에 함께 두어 카테고리 판정 로직과 응집.
- 필터로 특정 필수 카테고리 후보가 0이 되면 그대로 비운다. 부적합을 채우는 것보다
  비는 게 낫고, 부적합 장소는 어차피 `verifiedPlaceMatchesCategory`도 통과 못 한다.

## 에러 처리

없음. 순수 함수, 예외 경로 없음. 빈/누락 필드는 각각 "그룹코드 미차단",
"키워드 미포함"으로 안전하게 통과 또는 2번 규칙에 위임.

## 테스트 (TDD)

1. `isUnfitDatePlace` 유닛
   - 각 차단 그룹코드 → true
   - 각 차단 키워드(정상 그룹코드 + 부적합 이름) → true
   - 정상 데이트 장소(FD6/CE7 + 정상 이름) → false
   - 빈 필드 → false
2. `rankPlaceCandidates` 통합
   - 부적합 장소가 입력에 있어도 `candidates`에서 제외됨
   - 정상 장소는 유지·랭킹됨
