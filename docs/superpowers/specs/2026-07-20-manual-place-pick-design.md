# 수동 장소 지정 — 설계 문서

- 날짜: 2026-07-20
- 상태: 설계 승인 대기
- 관련 레거시: `app/card/new.tsx`, `app/(tabs)/candidates.tsx`의 "직접 추가"

## 1. 배경 & 목표

레거시 "직접 추가"(`card/new.tsx`)는 클라이언트가 `date_cards`에 직접 insert하며 `mode:'manual'`, steps 없는 단일 카드를 만든다. 현행 AI 코스(`make_course`)와 저장 형식·렌더가 달라 낡은 카드 UI로 남아 있다.

**목표:** 레거시 수동 추가를 제거하고, "사용자가 각 스텝의 실제 장소를 직접 고르는" 기능을 현행 코스 흐름 안에 통합한다. 저장물은 AI 코스와 **100% 동일한 `make_course` 카드**(`source:'ai'`, steps 채움, recommend-date edge → RPC 경유).

## 2. 핵심 사실 (조사 결과)

- 서버는 클라이언트가 조립한 step을 신뢰하지 않는다. attestation은 `recommend-date` edge만 발급(SERVICE_ROLE). 임의 JSON 저장 경로는 봉인됨. → **모든 저장은 recommend-date edge를 반드시 거친다.**
- "장소 직접 지정"은 사실상 이미 존재: 요청 필드 `replacement:{stepId, kakaoPlaceId}` + `replace` RPC 액션이 "사용자가 특정 카카오 장소를 스텝에 박기"를 수행. 서버가 place_name/좌표/주소를 attestation 응답에서 복사.
- **빠진 것은 딱 하나:** 사용자가 임의 키워드로 카카오를 검색해 `kakaoPlaceId`를 얻는 **UI**. 검색 로직(`place-search` edge)은 이미 있으나 이를 띄우는 화면 컴포넌트가 없다.
- 현행 제약: recommend-date 핸들러는 강제 장소가 "그 스텝의 지역·카테고리 카카오 검색 결과에 포함될 때만" 허용. 완전 임의 장소는 서버 완화 필요.

## 3. 확정된 UX (화면별)

### 디자인 제약 (전 화면 공통)
- 카테고리 선택은 **기존 `CourseStepEditor` 컴포넌트/칩 그대로** 재사용.
- **신규 요소에 이모티콘 금지.** 아이콘은 기존에 쓰던 lucide만.
- **색깔 채운 뱃지/태그 금지** (라벤더·크림·민트 filled badge 금지). 상태 표시는 중립 스타일(테두리·gray bg·텍스트)로.
- 기존 스타일(soft card, `constants/colors.ts` 토큰) 최대한 유지.

### 화면 ① 코스 입력 — 스텝별 장소 핀 (선택안 1-B)
- `CourseStepEditor` 각 스텝 상단에 세그먼트 토글 **[카테고리 | 직접 지정]** 추가.
- **카테고리** 탭: 현행 카테고리 칩 그대로.
- **직접 지정** 탭: 검색 진입 행 노출 → 탭 시 화면 ②로 이동. 지정 완료 시 장소명 + 주소(중립 텍스트, 색 뱃지 X)와 "지우기" 텍스트 버튼 표시.
- 한 스텝은 카테고리 **또는** 지정 장소 중 하나(상호배타).

### 화면 ② 카카오 장소 검색 (신규, 공용) (선택안 2-B)
- 전체 화면 라우트(예: `app/mode-flow/place-search.tsx`). 화면 ①·③가 공용.
- 상단 검색 입력(디바운스) → `place-search` edge 호출, 코스 지역 좌표로 bias.
- 결과 리스트는 기존 교체 시트 행 스타일 재사용: 장소명 + 도로명주소(중립 텍스트). **카테고리 색 태그 금지.**
- 항목 선택 → 호출한 화면으로 `{kakaoPlaceId, name, address, ...}` 반환.
- 진입점별 반환 처리: ①은 스텝 핀에 저장, ③은 즉시 replace 실행.

### 화면 ③ 결과 교체 시트 확장 (선택안 3-A)
- 기존 교체 바텀시트 상단에 세그먼트 탭 **[추천 후보 | 직접 검색]** 추가.
- **추천 후보** 탭(기본): 현행 서버 랭킹 후보 리스트 그대로.
- **직접 검색** 탭: 화면 ②의 검색 UI 임베드 → 선택 시 기존 `replaceWithCandidate` 흐름 실행.
- 기존 행/라벨 스타일 유지, 신규 색 뱃지 추가 없음.

## 4. 저장 흐름 (세 화면 공통)

```
장소 선택
  → recommend-date edge (서버가 카카오로 재검증, client 좌표 불신)
  → attestation 발급
  → replace / generate RPC
  → make_course 카드 (source:'ai', steps 채움)
```

RPC/마이그레이션 변경 없음 — replace/add/confirm은 이미 attestation 응답에서 필드 복사.

## 5. 서버 변경

### 5.1 스키마 (`shared/recommendation/schemas.ts`)
- 코스 입력 각 스텝에 옵셔널 핀 필드 추가 (예: `pinnedKakaoPlaceId?`). 화면 ①의 입력-시점 강제 장소용.
- 기존 `replacement` 필드는 유지(화면 ③).
- 응답/attestation 정합 검증(카드 step = course step, 좌표·거리)은 **그대로 유지**.

### 5.2 핸들러 (`supabase/functions/_shared/recommend-date-handler.ts`)
- 입력-시점 다중 핀 지원: per-step 핀이 있으면 그 스텝은 AI 선택 대신 지정 장소 사용.
- 강제 장소 검증 완화: "카테고리 검색 결과 포함" 대신 **서버가 해당 kakaoPlaceId를 카카오로 재조회/재검증**해 실재·좌표 확인 후 배치.
- 문구(desc/summary/why/i18n)는 계속 AI가 채움.

## 6. Phase 계획 (배포 순서)

- **Phase 0 — 레거시 제거 (의존성 없음):**
  - `app/(tabs)/candidates.tsx`의 "직접 추가" 버튼 제거.
  - `app/card/new.tsx` + 라우트 제거, `mode:'manual'` 생성 경로 제거.
  - i18n `candidates.addManual` 키 정리 (ko/en 동시).
  - 기존 DB의 manual 카드는 fallback 렌더 유지 → 마이그레이션 불필요.
- **Phase 1 — 화면 ② 검색 UI + 화면 ③ 교체 확장:** 서버 replace 흐름 재사용, 핸들러 완화 포함. 사용자 가치 가장 빨리 전달.
- **Phase 2 — 화면 ① 입력 핀:** 스키마 per-step 핀 + 핸들러 다중 핀. 화면 ② 재사용.

## 7. 열린 리스크

- **카카오 place id 단건 재조회 가능 여부.** 핸들러가 지정 장소를 id로 재검증하려면 카카오가 id 기반 조회를 지원해야 한다. 미지원 시: 화면 ② 검색 결과 객체(name+coords)를 서버가 이름+좌표로 재검색해 대조하는 방식으로 폴백. → **Phase 1 계획/TDD 첫 단계에서 확정.**
- 비용: 지정 장소도 문구 생성을 위해 generate-ai를 태우면 1회 ≈22원(현행 코스와 동일). 순수 지정만이면 절감 여지 — Phase 2에서 재검토.

## 8. 테스트 전략 (TDD)

- `place-search` edge 호출 래퍼: 키워드+좌표 → 결과 파싱 단위 테스트.
- 화면 ② 컴포넌트: 검색 입력→결과→선택 반환 계약 테스트.
- 핸들러 핀/완화 로직: 지정 kakaoPlaceId가 응답 step에 반영되는지, 위조 좌표 거부되는지.
- 화면 ③ 교체 탭: 직접 검색 선택 시 기존 replace 경로 호출 검증.
- Phase 0 제거 후 기존 manual 카드 렌더 회귀 없음 확인.

## 9. 검증

- 변경마다 루트에서 `npm run validate` (`tsc --noEmit`).
- 신규/변경 UI는 StyleSeed 게이트(ss-score ≥80) + styleseed-design-review.
- i18n ko/en 동시 갱신.
