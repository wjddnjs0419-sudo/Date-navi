# 카카오 검색 크로스 유저 캐시 설계 (2026-07-18)

## 목표

1. 코스 결과 화면 "이 단계 교체" 시트 2~3초 로딩 제거 (보고된 버그).
2. 비슷한 위치에서 코스를 만드는 유저들이 카카오 검색 결과를 공유 → 카카오 API 호출량 절감.
3. 초기 코스 생성도 캐시 히트 시 검색 구간 가속.

승인된 결정:
- 교체 시트는 **AI 큐레이션 제거**, 결정론 랭킹(`rankReplacementCandidates`)만 사용.
- 크로스 유저 **장기 캐시**(TTL 30일) — 카카오 약관 리스크(검색 결과 DB화 제한) 사용자 인지 후 강행 승인.
- 세션별 후보 풀 저장(레이어 A)은 하지 않음 — 캐시 하나가 초기 생성·교체 양쪽을 서빙.

## 비범위

- 클라이언트(`course-result.tsx`) 변경 없음.
- `recommendation_sessions`/steps/RPC/attestation 변경 없음.
- 장소 단위 정규화 테이블(`cached_places`), 실사진, 피드백 조인 — 향후 확장.

## 아키텍처

```
recommend-date / replacement-candidates (Edge)
  → createCachedKakaoSearchPage(deps)        ← 신규 _shared/kakao-search-cache.ts
      1) 검색 플랜 전체 키(항목 × 최대 2페이지) 일괄 prefetch (DB 1회)
      2) 히트 → documents 반환 (카카오 0회)
      3) 미스 → fetchKakaoSearchPage 호출 → 성공만 배치 upsert (fire-and-forget)
  → executeKakaoSearchPlan (기존, 무변경)
  → rankPlaceCandidates (기존, 무변경)
```

### 스키마 — 신규 마이그레이션 `kakao_search_cache`

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `cache_key` | text PK | `endpoint\|category_code∥query_text\|grid_lat\|grid_lng\|page` 정규화 문자열 |
| `endpoint` | text | `category` / `keyword` |
| `category_code` | text nullable | |
| `query_text` | text nullable | |
| `grid_lat`, `grid_lng` | double precision | 스냅된 격자 좌표 |
| `page` | int | |
| `documents` | jsonb | 카카오 응답 documents 원본 |
| `fetched_at` | timestamptz default now() | |

- **RLS enable + 정책 0개** = service role 전용. 클라이언트 직접 접근 불가.
- 인덱스: PK로 충분 (`fetched_at` 필터는 PK 조회 후 행 단위).

### 격자 스냅

- 상수 `KAKAO_CACHE_GRID_DEGREES = 0.005` (~서울 위도 550m/경도 440m).
- `snapToGrid(value) = Math.round(value / GRID) * GRID` — 부동소수 문자열화는 `toFixed(3)`급 고정 자리로 키 안정화.
- **스냅 좌표를 카카오 호출 자체에 사용** → 키와 결과가 항상 일치, 같은 셀 유저 완전 공유.
- 최대 중심 오차 ~390m. 장소 좌표·동선 계산·다운스트림 랭킹은 실제 좌표 사용이라 무영향. 카카오 `sort=distance`의 반환 순서만 셀 중심 기준.

### TTL / 만료

- 읽기 시 `fetched_at >= now() - 30일` 필터 — 스케줄러 미가동이어도 만료 데이터 미사용 보장.
- `purge_expired_ai_data()`에 `delete from kakao_search_cache where fetched_at < now() - interval '30 days'` 추가 (기존 30일 정책과 정합).

### 실패 의미론

- 캐시 읽기/쓰기 실패 → 무조건 카카오 라이브 폴백. **캐시는 검색을 절대 깨뜨리지 않는다.**
- `rate_limited`/`timeout`/`failure` 결과는 캐시하지 않음.
- 성공 0건은 캐시함(빈 지역 반복 호출 방지).
- 동시 미스 upsert → `on conflict (cache_key) do update` 멱등.
- 캐시 히트는 outcome `success`로 집계 — 기존 `searchMetadata` 계약 유지.

### 소비자 배선

- `recommend-date/index.ts`: `searchCandidates`가 캐시 래퍼 주입된 `searchAndRankRecommendation` 사용. service role client를 캐시 deps로 전달.
- `replacement-candidates/index.ts`:
  - 동일 캐시 래퍼 주입.
  - `invokeGenerateAiSelection`/`buildReplacementSelectionPrompt`/`selectCuratedReplacementCandidates` 호출 제거 — 결정론 랭킹 결과를 그대로 top/additional로 반환.
  - 미사용이 된 shared 심볼은 다른 소비자 없으면 함께 제거.

## 관측 가능성 (KPI 기반)

Edge 구조화 로그(JSON console) — 기존 `recommend_date_course_validation_failed` 패턴:

- `kakao_cache_lookup`: `{ planKeys, hits, misses, kakaoCalls, cacheReadMs, searchTotalMs, fn: 'recommend-date'|'replacement-candidates' }`
- `replacement_candidates_served`: `{ totalMs, cacheHits, kakaoCalls, poolSize }`

## KPI 검증 계획 (배포 후 시뮬레이션 → 사용자 보고)

배포 후 실제 인증 호출로 시뮬레이션을 돌려 아래 표로 보고한다:

| KPI | 측정 방법 | 목표 |
|---|---|---|
| 교체 시트 응답시간 (콜드/웜) | 동일 세션에 `replacement-candidates` 반복 호출, 1회차(미스) vs 2회차+(히트) 총 소요 비교 | 웜 < 1초 (기존 2~3초 대비) |
| 초기 생성 검색 구간 | `recommend-date`를 같은 셀 좌표로 콜드/웜 2회, 로그의 `searchTotalMs` 비교 | 웜에서 유의미 감소 |
| 카카오 호출량 | 로그 `kakaoCalls` — 콜드 대비 웜 호출 수 | 웜에서 0 또는 근접 |
| 크로스 셀 공유 | 같은 셀 내 다른 좌표(수백 m 이내) 호출이 히트하는지 | 히트 확인 |
| 교체 후보 품질 (AI 제거 영향) | 고정 픽스처 세션들에서 결정론 top3 vs 종전 AI 큐레이션 top3 겹침/타당성 육안 비교 | 명백한 품질 하락 없음 |
| 초기 생성 정확도 | 캐시 히트/미스 시 후보 documents 동일성 확인 | **동일(정확도 중립이 설계 목표)** |

정직성 원칙: 캐시는 동일 데이터를 더 빨리·싸게 제공하는 장치다. "AI 추천 정확도 상승"은 설계상 기대 효과가 아니며, 교체 후보는 AI 큐레이션 제거로 품질 변화 가능성이 있어 측정 대상이다. 결과는 미화 없이 보고한다.

## 테스트 (TDD)

1. `snapToGrid`/캐시 키 빌더 단위 테스트 (경계값, 음수 좌표, 고정 자리 문자열).
2. 캐시 래퍼: 히트→fetch 미호출 / 미스→fetch+upsert / 만료 행→재fetch / 캐시 읽기 예외→라이브 폴백 / 실패 status 미캐시 / 빈 성공 캐시.
3. `replacement-candidates`: AI 미호출 + 결정론 결과 반환 (기존 테스트 갱신).
4. 마이그레이션 계약 테스트 (기존 `*Migration` 테스트 패턴).
5. `npm run validate` + Deno check 2종 (`recommend-date`, `replacement-candidates`).

## 배포 순서 / 롤백

1. 마이그레이션 적용 (테이블 + purge 함수 재정의) — 앱/함수보다 먼저.
2. `recommend-date` 재배포.
3. `replacement-candidates` 재배포.
4. KPI 시뮬레이션 실행 → 보고.

롤백 = 함수 이전 버전 재배포. 테이블은 잔존해도 무해(참조자 없음).

## 리스크

- **카카오 약관**: 검색 결과 장기 저장·재제공은 DB화 제한 조항과 충돌 소지. 키 정지 시 앱 핵심 기능 중단. 사용자 인지 후 강행 결정 (2026-07-18).
- 폐업/이전 반영 지연 최대 30일 — TTL로 상한.
- 격자 스냅으로 카카오 반환 순서가 셀 중심 기준 — 다운스트림 재랭킹으로 완화.
