# PLAN.md

완료된 계획은 `RESULT.md`에 세부 구현 내용이 기록되므로, 이 파일에는 활성/예정 작업만 유지합니다.
완료 항목은 `[Done]` 한 줄로 축약하고, 10개 초과 시 가장 오래된 항목부터 삭제합니다.

---

## ⚠️ 세션 시작 필수 규칙

> **모든 새 세션은 반드시 아래 순서대로 시작한다. 생략 금지.**

1. `PLAN.md` (이 파일) 전체 읽기
2. `RESULT.md` (직전 세션 결과) 전체 읽기
3. `Super plan/` 폴더의 4개 파일 전체 읽기:
   - `Super plan/Proposal.md`
   - `Super plan/DateMate_App_Launch_Timeline_Plan.md`
   - `Super plan/DateMate_Development_Requirements.md`
   - `Super plan/DateMate_MVP_Function_Spec.md`
4. 위 5개 문서를 모두 읽은 뒤 현재 Phase와 남은 작업을 요약하고 사용자 지시를 기다린다.

> **이유**: Super Plan 문서에 UX 문구, 데이터 모델, AI 출력 스키마, 우선순위 기준이 모두 포함되어 있다. 이를 읽지 않으면 구현이 기획 의도에서 벗어난다.

---

## 현재 방향 (Super Plan 기반 재정렬)

**플랫폼**: Next.js 웹앱 → **React Native + Expo** 전환
**백엔드**: 기존 Supabase 재사용 (스키마 호환)
**목표**: App Store / Google Play 소프트 런칭 (12~16주)

---

## Phase 0 — React Native 프로젝트 세팅 ✅ 완료 (2026-05-23)

- [x] Expo 프로젝트 생성 (`datemate-app/`)
- [x] Supabase JS 클라이언트 연결 (기존 URL/ANON_KEY 재사용)
- [x] 기본 폴더 구조: `app/(auth)/`, `app/(tabs)/`, `lib/`
- [x] 탭 네비게이터: 홈 / 데이트 모드 / 우리 후보 / 마음 전하기 / 추억
- [x] Supabase Auth 이메일 로그인/가입 화면 + 세션 유지
- [x] 데이트 모드 선택 화면 (8가지 모드 카드 UI)

---

## Phase 1 — 인증 & 커플 연결 ✅ 완료 (2026-05-23)

- [x] 구글 로그인 추가 (2026-07-07) — 네이티브 SDK(`@react-native-google-signin`) + Supabase `signInWithIdToken`. EAS dev build(iOS 시뮬레이터)로 실제 로그인 검증 완료.
- [x] 카카오 로그인 추가 (2026-07-07) — `@react-native-seoul/kakao-login` + Supabase `signInWithIdToken`. Supabase Kakao Provider Client ID는 REST API Key가 아니라 **Native App Key**로 설정해야 함(idToken의 aud가 Native App Key라 REST API Key로 두면 "Unacceptable audience" 에러). EAS dev build(iOS 시뮬레이터)로 실제 로그인 검증 완료. Android 플랫폼 등록은 보류.
- [x] 이메일 로그인 방식 제거 (2026-07-08) — 코드 제거 + 기존 이메일 계정 2개 및 연관 데이터 DB 삭제. 애플 로그인은 Apple Developer Program 멤버십 필요로 보류.
- [ ] 애플 로그인 추가
- [x] 닉네임 입력 (최초 가입 시) — `app/onboarding/nickname.tsx`
- [x] 커플 초대 코드 생성 — `app/onboarding/couple-connect.tsx`
- [x] 초대 코드로 커플 연결 — RLS 정책 포함
- [x] 로그아웃 — 홈 화면 하단
- [→ Phase 6.5] 회원 탈퇴 기본 구조

---

## Phase 2 — 데이트 모드 UX ✅ 완료 (2026-05-23)

> 홈 화면에서 "오늘 필요한 도움"을 선택하면 모드별 입력 플로우로 진입

### 2-A. 데이트 모드 선택 화면
- [x] 모드 카드 UI: 8가지 모드 카드 → 클릭 시 feeling 화면 진입
- [x] 모드별 라우팅: `app/mode-flow/feeling.tsx?mode=<id>`

### 2-B. 느낌 입력 플로우
- [x] 컨디션 / 예산 / 거리 / 분위기 / 시간 — 5단계 버튼 선택
- [x] 피하고 싶은 조건 멀티 선택 + 자유 텍스트 입력
- [x] 진행 프로그레스바 + 뒤로가기

### 2-C. AI 조건 해석 & 데이트 카드 생성
- [x] 입력값 → Gemini Flash API → 카드 3개 JSON
- [x] 카드: title, summary, estimated_time, estimated_budget, tags, why_recommended
- [x] `date_cards` 테이블 저장 (RLS 포함)
- [x] LLM 실패 시 fallback 템플릿 3개 제공
- [x] `app/(tabs)/candidates.tsx` — 저장된 카드 목록 표시

---

## Phase 3 — 반응 & 후보 분류 ✅ 완료 (2026-05-23)

- [x] 부담 없는 반응 버튼: 완전 끌려 / 느낌은 좋아 / 오늘은 부담돼 / 다음에
- [x] reactions 테이블 저장 (RLS 포함)
- [x] 후보 자동 분류: 둘 다 끌림 / 조건부 / 다음에
- [x] "우리 후보" 화면에서 분류별 탭 표시

---

## Phase 4 — 내 마음 문장 만들기 ✅ 완료 (2026-05-23)

- [x] 민감 조건 버튼 선택 (피곤함 / 예산 부담 / 멀리 가기 싫음 / 거절하기 미안함 등 8가지)
- [x] 선택 → Gemini Flash로 부드러운 문장 생성 + fallback
- [x] 사용자가 수정 후 클립보드 복사 (자동 전송 금지)
- [x] `soft_messages` 테이블 저장 (RLS 포함)

---

## Phase 5 — 온보딩 & 추억 ✅ 완료 (2026-05-23)

- [x] 기본 취향 온보딩: 선호 분위기, 피하고 싶은 조건, 장거리 여부, 계획 성향
- [x] `user_preferences` 테이블 저장 (RLS 포함)
- [x] 완료한 데이트 기록: 후기, 다시 하고 싶은지
- [x] `date_memories` 테이블 저장 (RLS 포함)
- [x] 온보딩 Skip 버튼 (건너뛰면 빈 rows로 저장)

---

## Phase 5.5 — 취향 데이터 AI 반영 ✅ 완료 (2026-05-23)

---

## Phase 6 — QA & 출시 전 정리 (7~8주차) ✅ 완료 (2026-05-24)

- [x] 예외 처리: 로그인 실패, 코드 오류, AI 응답 실패
- [x] 로딩 상태 / 빈 화면 / 에러 메시지 UX (홈 탭 로딩 스피너 추가)
- [x] 개인정보처리방침 / 이용약관 페이지
- [x] 핵심 이벤트 로그: signup, couple_connected, mode_selected, ai_card_created, onboarding_completed
- [x] QA 전 전체 데이터 초기화 SQL 준비 (`docs/qa-reset.sql`)

---

## Phase 6.5 — 마이페이지 & 계정 관리 ✅ 완료 (2026-05-24)

- [x] 설정 화면을 마이페이지로 확장 (`app/settings.tsx`)
- [x] 닉네임/표시 이름 수정 (`date_planner_profiles.display_name`)
- [x] 앱 언어 설정 유지 (기존 UI 승계)
- [x] 비밀번호 변경 플로우 (`supabase.auth.updateUser`)
- [x] 로그아웃 위치 정리 (홈 하단 버튼 제거 → 마이페이지 통합)
- [x] 회원 탈퇴 UI: 위험 안내, "탈퇴" 재확인 입력, 최종 삭제 버튼
- [x] 회원 탈퇴 백엔드: Edge Function `delete-account` 배포 (ACTIVE)
- [x] 커플 해제 정책: 탈퇴 시 상대방 couple_id null 처리, 공유 카드/반응 보존
- [x] 탈퇴/비밀번호/닉네임 성공·실패 메시지 i18n (한국어/영어)

---

## Phase 7 — 영어 버전 (English Localization)

> 글로벌 App Store 출시 및 해외 커플 타깃 확장

- [x] i18n 기반 도입 (`expo-localization` + 자체 `I18nProvider`)
- [x] 한국어/영어 카피 사전 구성 (`datemate-app/lib/i18n.ts`)
- [x] 핵심 UI 텍스트 번역 (탭, 버튼, 안내문구, 빈 화면, 주요 에러 메시지)
- [x] AI 프롬프트 영어 버전 분기 (Gemini 프롬프트 언어별 분리)
- [x] 앱 언어 자동 감지 + 수동 변경 설정
- [x] 설정 화면 추가 (`datemate-app/app/settings.tsx`)
- [ ] App Store 영어 메타데이터 (앱 이름, 설명, 키워드)

---

## Phase 8 — 모드별 차별화 UX ✅ 완료 (2026-05-24)

- [x] `app/mode-flow/course.tsx` 신규 — "코스로 정리해줘" 전용 입력 화면
- [x] `mode.tsx`에서 "코스로 정리해줘" 라우팅 분기 (`/mode-flow/course`)
- [x] 나머지 모드 AI 프롬프트 분기 (`lib/ai.ts`) — light_date, special_date, low_risk, make_course

---

## Phase 9 — 사용자 직접 후보 추가 ✅ 완료 (2026-05-25)

- [x] 우리 후보 탭 우상단 "직접 추가" 버튼
- [x] `app/card/new.tsx` 신규 — 직접 추가 입력 화면
- [x] `date_cards` 테이블 `source` 컬럼 추가 (마이그레이션)
- [x] 후보 목록 카드에 "직접 추가" 라벤더 배지 구분 표시

---

## Phase 10 — "다음에 만나면" 버킷리스트 ✅ 완료 (2026-05-25)

- [x] `mode.tsx`에서 "다음에 만나면" 라우팅 분리 (`/mode-flow/bucketlist`)
- [x] `app/mode-flow/bucketlist.tsx` 신규 — 아이디어 자유 입력 + 저장
- [x] Supabase `bucket_list` + `bucket_reactions` 테이블 생성 (RLS 포함)
- [x] 상대방이 각 버킷 아이디어에 반응 (끌려 / 다음에)
- [x] "만남 확정" 버튼 → AI 코스 카드 생성 후 `date_cards`로 이동
- [x] 우리 후보 탭에 "다음에 만나면" 필터 탭 + BucketSection 추가

---

## Phase 11 — 반응 고도화 & 후보 재활용 ✅ 완료 (2026-05-25)

- [x] 반응 버튼 확장: 장소만 바꾸면 / 가까우면 / 실내면 / 예산 조정되면
- [x] `reactions` 테이블 `condition_tag` 컬럼 추가 (마이그레이션 `20260525000002`)
- [x] `burden` 반응 선택 시 조건 태그 선택 UI 노출 — `app/card/[id].tsx`
- [x] 조건 선택 → "조건 바꿔서 다시 찾아줘" 버튼 → AI 카드 3개 자동 생성
- [x] 우리 후보 탭 카드 반응 박스에 condition_tag 라벨 표시

---

## Phase UI — 시각 갭 (일부 완료)

### 완료 ✅
- [x] `expo-linear-gradient` 설치
- [x] 홈 화면 헤더 배너 그라디언트 (#FFE8EC → #FFF5F0 → #FFF8F3)
- [x] 홈 화면 "데이트 후보 만들기" CTA 버튼 그라디언트

### 미완료
- [ ] `expo-image-picker` 설치 후 `onboarding/photo.tsx` 실제 이미지 선택 연결

---

## Phase QA — 버그픽스 ✅ 완료 (2026-05-25)

- [x] `account/notifications.tsx` — 모두읽음 버튼 onPress 연결 (unread 상태 관리)
- [x] `account/edit-profile.tsx` — 카메라/사진변경 버튼 onPress 연결 (Alert 안내)
- [x] `settings.tsx` — useFocusEffect로 변경, 닉네임 수정 후 즉시 반영
- [x] `settings.tsx` — 알림 row "켜짐" value 제거 → 알림 화면 네비게이션 명확화
- [x] `settings.tsx` — 도움말 onPress 연결 (이메일 문의 Alert)
- [x] `settings.tsx` — 언어 onPress 연결 (i18n Alert 선택, 현재 언어 표시)
- [x] `settings.tsx` — 로그아웃 후 router.replace('/(auth)') 즉시 호출 → 스와이프백 차단

---

## Long-Term Backlog

- 클로즈드 베타 10~30쌍
- 푸시 알림 (Firebase Cloud Messaging) — 상대 반응 시 알림
- 장소 추천 고도화 — 네이버 지역 검색 API / Google Places API 연동
  - **B안 (부적합 필터 후속)**: 구글 Places 별점·리뷰수·사진 도입으로 **진짜 품질 레벨링**. 무료 카카오엔 별점/리뷰 신호가 없어 빈도 기반 인기도(폐기한 C안)로는 상권 중심성·프랜차이즈 편향만 잡힘. 비용/쿼터 관리 필요. 스펙: `docs/superpowers/specs/2026-07-19-unfit-place-filter-design.md` §비목표.
- 커플 취향 리포트 (프리미엄)
- 캘린더 뷰 날짜 시각화
- 카카오 로그인 추가

---

## V2 — 추천 생성 로직 개선 (진행 중)

> 설계 문서: `PLAN_GENERATION_ARCHITECTURE_V2.md`. Haiku 단일 호출 유지하며 hallucination 제거·placeId 안정화·결정론 필드/Validation 도입.
> V2-core = 문서 Phase 0·1·3·4·5. (아래 Phase 번호는 **문서 기준**, 앱 빌드 Phase와 무관.)

### 완료 ✅ (2026-07-08)
- [x] **Phase 0 — placeId 보존**: `place-search`가 Kakao `doc.id`를 `placeId`로 반환. Edge v4 배포됨. `KakaoPlace.placeId` 추가.
- [x] **Phase 1 — Intent Resolution**: 신규 `lib/intent.ts` `resolveIntent()` (mode+freeText+mood+budget+duration → `PlanIntent`), 기존 `detectPlaceFocus` 흡수, Query Expansion, make_course 다카테고리. 테스트 8개.
- [x] **Phase 3 — Candidate Processing**: 신규 `lib/candidate.ts` `buildCandidates()` (placeId dedup → Evidence scoring → ranking → candidateId → limit). 테스트 7개.

### 완료 ✅ (2026-07-08 세션 AH)
- [x] **Phase 4 — Claude 통합**: `lib/recommendation.ts` 신규 — candidate_id 선택 프롬프트(feeling/course 2종), `estimated_time/budget` 앱 결정론 채우기(§11·§17 하위호환), `lib/intent.ts`·`lib/candidate.ts` `generateDateCards` 배선. Edge `generate-ai` **v10 배포됨**(feeling_select/course_select 스키마 + usage). 위치 없으면 현행 자유생성 유지(무회귀).
- [x] **Phase 5 — Validation & Fallback**: candidate_id 실재/중복/previousPlaceIds 검증(feeling·course), 유효 장소 0인 코스 폐기, Deterministic Fallback(재호출 없음). 테스트 23개.

### 완료 ✅ (2026-07-08 세션 AH — V2 전체)
- [x] **Phase 2 — Adaptive Retrieval**: `place-search` multi-query(키워드+카테고리) + pagination + 부분실패(독립 catch) + min/max·요청예산·intent쿼리 early-stop + placeId dedup + `_meta`. `buildRetrievalPlan(intent)` 신규. **Edge place-search v5 배포됨.** candidate 플로우만 adaptive, 자유생성은 focus 유지.
- [x] **Phase 6 — Session/Regeneration**: `lib/recommendationSession.ts` 경량 module store. generating이 최초 추천 시 세션 생성, 재추천 시 Candidate Pool 재사용 + previousPlaceIds 제외(소진 시 fresh 폴백). result/course-result가 sessionId 전달. `handleGenerateAlt`가 `input_json` 기반으로 location/coords 보존(§15).
- [x] **Phase 7 — Observability**: `recommendation_generated/regenerated/fallback` 이벤트 — raw/ranked/haiku/final/fallback count, retrieval·claude latency, Claude usage 토큰을 `analytics_events.params`에 적재.

### ⚠️ 남은 확인
- [ ] **시뮬레이터 육안 검증(사용자 수동)**: feeling(위치)·make_course·자유생성 3경로 + 재추천 placeId 제외 + 조건 재생성 location 보존 + analytics 로우 생성.
- [ ] (코스 결과 UI 재설계 §16 — SVG 트레일→세로 화살표, Phase 4 이후 별도 세션. 여전히 Future.)

---

## Phase UI — Date Navi 기반 UI/UX 전면 교체 (진행 중)

> `Date Navi/` 폴더의 Figma Make 프로토타입을 React Native 코드로 포팅. 기존 Supabase/AI 로직은 그대로 유지.
> 디자인 기준: `Date Navi/src/app/components/Nav.tsx`의 ScreenId 목록 전체

### 완료 ✅
- [x] `constants/colors.ts` — Date Navi 색상 시스템 완전 일치
- [x] `components/ui.tsx` — BigButton, SoftCard, Chip, Badge, BackBar, ProgressDots, ListGroup, ListRow, SectionLabel, InfoNote, FieldBox
- [x] `onboarding/photo.tsx` 신규 (Step 2/4)
- [x] `onboarding/anniversary.tsx` 신규 (Step 3/4, Supabase `anniversary_date` 저장)
- [x] `onboarding/type.tsx` 신규 (Step 4/4, `planning_style` 저장)
- [x] `onboarding/connected.tsx` 신규 (RN Animated 커플 연결 성공 애니메이션)
- [x] 온보딩 라우팅 재연결: nickname→photo→anniversary→type→couple-connect→connected→preferences→home
- [x] `preferences.tsx` 단계 재배치: 활동→분위기→피하기→장거리 여부 + `is_long_distance` 저장
- [x] `(tabs)/index.tsx` — 알림 벨 dot 추가
- [x] 홈·모드·인증 화면 — Date Navi 레이아웃과 이미 근접 (별도 수정 불필요)

### 미구현 화면 — 최우선 ❌
- [x] `app/card/confirm.tsx` 신규 — DateConfirmScreen (2026-05-25)
- [x] `app/card/review.tsx` 신규 — DateReviewScreen (2026-05-25)

### UI 갭 — 중요도 순 ⚠️
- [x] `(tabs)/candidates.tsx` — 반응 바이패널 (이미 구현됨)
- [x] `(tabs)/memories.tsx` — featured 카드 메타 강화 (시간/비용/태그/최근 추억 badge) (2026-05-25)
- [x] `share/mutual.tsx` — 색상 섹션 그룹핑 + 카드 summary/메타/태그/탭 연결 + CTA 라우팅 개선 (2026-05-25)
- [x] `(tabs)/soft-message.tsx` — softHelper + softResult 2단계 화면 분리 (2026-05-25)

### 시각적 디테일 갭 — 낮은 우선순위
- [ ] `expo-linear-gradient` 설치 후 카드 배너·그라디언트 배경 적용
- [ ] `expo-image-picker` 설치 후 `onboarding/photo.tsx` 실제 이미지 선택 연결

### 완료 기준
- Nav.tsx ScreenId 전체 화면이 datemate-app에 대응되어야 함
- `npx tsc --noEmit` 통과
- 기존 Supabase/AI 로직 회귀 없음

---

## Pending Approval

### [Phase 0 완료·병합 대기] 2026-07-21 세션 BE — UI 전면 교체 공용 기반
- **브랜치 `ui/phase0`(11커밋, 병합 `5a3faee`, 15커밋)**: 토큰(카테고리 핀 3색) + i18n 조각분할(병렬 충돌 제거) + 신규 공용 컴포넌트 8종(Illustration/Wordmark/CoursePin·StepPin·CourseMapPreview/DdayBadge/MetaChipRow/PlanListRow) + 공용 모달 3종 리스타일 + Design.md·STYLESEED.md·메모리. 850 tests/tsc 클린.
- 설계 `docs/superpowers/specs/2026-07-21-ui-renew-parallel-design.md`, 플랜 `docs/superpowers/plans/2026-07-21-ui-renew-phase0.md`.
- **다음**: `ui/phase0` → main 병합(사용자 승인) → 병합 커밋을 기준선으로 클러스터 6개 작업 패킷 생성 → 병렬 세션(Phase 1). 미결: SuccessModal 자동닫힘 vs 버튼닫힘, GeneratingView 부제/팁 i18n.

### [진행 중] 2026-07-21 세션 BD — UI 전면 교체 (asset 준비 완료, 화면 조립 대기)
- **asset 8장 완성** → `assets/illustrations/` (하트 마스코트 3 + 코스지도 가로·세로 + 홈책지도 + 핀로고 + 공원배경). 스타일: 매트 클레이 파스텔 핑크.
- 참고 목업 50화면 = `UI RENEW/`(gitignore, 로컬 참고용). 화면별 asset 필요 여부 감사 완료(RESULT 세션 BD).
- **다음 세션 착수점**: login 화면부터. 브레인스토밍 → 디자인 토큰(`constants/colors.ts`·`theme.ts`) 목업 대조 검증 → 공통 컴포넌트(`components/ui.tsx`) → login 조립 → 나머지. 구현이므로 TDD + StyleSeed 게이트.
- 미결: 온보딩 `connected`의 유저 아바타 서클은 코드로 얹기(실사진). 소형 코너지도는 `date-course-map-horizontal` 크롭 재사용.

### [Done] 2026-07-21 세션 BC — 전 화면 스크린샷 dev 모드 + 한/영 유저 플로우 맵. `EXPO_PUBLIC_SCREENSHOT=1` 플래그 격리(목업 supabase+fixtures+HTTP 제어서버 네비게이터+하네스)로 시뮬레이터 37 라이브 화면 자동 캡처. `docs/screenshots/flow-map.html`(한/영 토글 자체완결). MVP 미사용 화면(모드 선택·feeling·bucketlist·result) 제외. tsc 클린. 도구 유지(플래그 off 기본). 재사용법 = 메모리 screenshot-mode-tooling.

### [배포 대기] 2026-07-19 — Step Intent Phase 2·3: AI 파서 fallback(`parse_step_intents`, 스펙 §8.2 고재현 게이트) + 부정어("삼겹살 말고") + 미지원/충돌 감지 + 응답 `metadata.stepIntent` + 결과 화면 감지 칩 + required 미충족 완화 UI. 792 테스트/tsc 통과, 로컬 완결. **edge function 배포(`recommend-date`·`generate-ai`) 승인 필요** — 캐시 히트율·AI 비용 변동 사전 보고. Phase 4(가격/외부증거)는 데이터 소스 부재로 연기(`docs/superpowers/plans/2026-07-19-step-intent-phase4-deferred.md`).

### [Done] 2026-07-18 — 카카오 검색 크로스 유저 캐시 + 교체 시트 AI 큐레이션 제거: `kakao_search_cache`(500m 격자, TTL 30일, service-role 전용) 신설, `recommend-date`·`replacement-candidates` read-through 배선, 교체 시트는 결정론 랭킹만. 교체 시트 2~3초 → 0.3~0.6초 실측. 마이그레이션·함수 2개 배포, KPI 시뮬레이션 완료(RESULT.md 참조). 유저 자유텍스트(explicit 쿼리)는 캐시 제외.

### [Done] 2026-07-18 — 이용약관·개인정보처리방침 사실관계 정정 및 페이지 업데이트: ko/en 10개 섹션 문서와 로그인 법률 링크를 반영했고, 구조 계약 테스트·전체 검증을 통과했다. 배포 전 법률 검토 및 미확정 대괄호 값 확정이 필요하다.

### AI 추천 경험 재설계 + App Store 준비 — 실행 Phase 1~13 완료, 버그 수정 세션 AM 완료, Phase 14 대기

> 기준 문서: `/Users/jeongwonkim/Downloads/DATE_NAVI_AI_RECOMMENDATION_REDESIGN.md`
> 현재 단계: **실행 Phase 1~13 완료. 남은 것은 실행 Phase 14(출시 준비)와 아래 "다음 세션 후보".**
> 작업 위치: **이 재설계의 실행 Phase 1~14 변경은 현재 `main` 작업 트리에서 진행한다.** 별도 branch/worktree 생성과 stage/commit/push는 사용자가 명시적으로 요청할 때만 수행한다.

#### 실행 Phase 1 완료 (2026-07-14)

- `shared/recommendation/`에 런타임과 분리된 `RecommendationRequest`·hard/soft constraints·위치·코스·응답·typed error 계약과 Zod schema를 추가했다.
- `course`는 2~4 단계, `single_place`는 1 단계로 검증하며, 중복 course step/candidate/Kakao place ID를 거부한다.
- 한·영 request 직렬화와 모든 오류 코드의 한·영 안내·재시도/조건 수정 메타데이터 테스트를 추가했다.
- 기존 AI 호출, DB migration, Edge Function 배포는 범위 밖으로 유지했다.

#### 실행 Phase 2 완료 (2026-07-14)

- candidate-backed `DateCard`와 `CourseStep`에 request-scoped `candidateId`와 안정 `kakaoPlaceId`를 보존하고, `collectPlaceIds()`의 장소명 역매칭을 제거했다.
- 모든 추천 생성 결과에 `expo-crypto` UUID 기반 `requestId`를 부여하고, 재추천/최초 candidate session의 `sessionId`를 카드에 연결했다.
- 현재 6개 AI `date_cards` insert 경로가 `recommendation_request_id`·`recommendation_session_id`·`kakao_place_id`를 dual-write하며, manual 카드와 구 DB row는 null/missing 필드를 그대로 허용한다.
- `20260714000000_add_recommendation_identity_to_date_cards.sql`을 linked Supabase에 적용했다. 세 컬럼은 nullable `text`이고 migration history에도 applied로 기록했다.
- 정규화된 recommendation session/step/event 테이블은 실행 Phase 8 이후 범위로 유지했다.

#### 실행 Phase 3 완료 (2026-07-14)

- `make_course`에 인증된 `location-autocomplete` Edge 소스, 2글자/300ms/stale 응답 차단/최대 8개 결정론 랭킹을 연결했다.
- 최근 위치 5개 저장, GPS foreground permission, ko/en UI/accessibility, `RecommendationLocation`과 legacy 좌표 dual-write를 구현했다.
- Edge 배포와 Expo Go/실기기 Kakao 통합 검증은 실행 Phase 7 배포 게이트와 수동 QA에 남겼다.
- focused 25/25, 전체 32 suites/238 tests, `npm run validate`, `git diff --check`, 독립 리뷰를 통과했다.

#### 실행 Phase 4 완료 (2026-07-14)

- `make_course`에 안정 ID 기반 2~4단계 편집, 도보 5/10/20분/무관, 2인 총예산, 복수 mood, optional duration/additional request를 적용했다.
- ko/en exclusion/soft preview와 구조화 step 충돌 차단을 순수 reducer/validator/parser로 구현했으며, 자연어가 구조화 조건을 자동 덮어쓰지 않는다.
- 새 구조화 payload를 `FeelingInput.courseDraft`에 보존하면서 legacy 위치/좌표/freeText/mood/duration 매핑을 유지했다.
- focused 50/50, 전체 35 suites/274 tests, `npm run validate`, `git diff --check`, 독립 리뷰를 통과했다.

#### 실행 Phase 5 완료 (2026-07-14)

- 구조화 `make_course` 요청을 인증된 `recommend-date` Edge로 전환하고, 모바일은 엄격한 공용 schema를 통과한 구조화 payload만 전송하도록 고정했다.
- 서버 전용 `recommend-date-v1` prompt, 인증 우선 처리, requestId 보존, typed/sanitized 오류, 20초 downstream timeout을 구현했다.
- 최상위와 중첩 request 경계를 strict로 만들고, Deno 전이 import 그래프와 실제 `deno check`를 검증했다.
- 검색·근거·랭킹과 candidate-only 선택/검증/fallback은 각각 실행 Phase 6~7 범위로 유지했으며 Edge 배포는 실행 Phase 7까지 보류했다.
- focused 71/71, 전체 38 suites/309 tests, `npm run validate`, 실제 Deno check, `git diff --check`, 독립 재리뷰를 통과했다.

#### 실행 Phase 6 완료 (2026-07-14)

- `recommend-date` 내부에 bilingual additional-request parsing/conflict, Kakao 검색 계획·bounded adapter, query/page/source evidence 병합을 이관했다.
- stable Kakao ID 기준 canonical normalization/dedup, category-aware 최대 40개 후보, deterministic score/tie-break, per-category recall과 Haversine route/walking heuristic metadata를 구현했다.
- client `parsedPreferences`를 신뢰하지 않고 서버에서 재파싱하며, hard exclusion 충돌은 검색 전에 거부하고 제외 장소/카테고리는 prompt 후보 집합에서 제거한다.
- 한국어 명사 나열 `하고`와 동사 연결 `-고/-지만`, ko/en local negation을 구조적으로 구분하는 parser regression matrix를 추가했다.
- focused 82/82, 전체 42 suites/391 tests, `npm run validate`, 실제 Deno check, `git diff --check`, 독립 재리뷰를 통과했다.

#### 실행 Phase 7 완료 (2026-07-14)

- Haiku는 검증된 Kakao candidate ID만 선택하며, 서버가 코스/카드 사실·동선·잠금·완화 조건을 재검증하고 전체 후보 집합에서 결정론 fallback을 수행한다.
- 검색/선택/인증/timeout 오류를 typed response로 고정하고 free-form/static 구조화 fallback을 제거했다.
- focused 142/142, 전체 45 suites/473 tests, `npm run validate`, 두 Deno check, `git diff --check`, 독립 재리뷰를 통과했다.
- linked Supabase에 `generate-ai` v14, `recommend-date` v1, `location-autocomplete` v1을 순서대로 배포했고, remote OPTIONS와 missing/invalid auth 401 응답을 확인했다.
- valid-user Kakao/Anthropic E2E와 Expo Go/실기기 통합은 수동 QA로 남겼다.

#### 실행 Phase 8 완료 (2026-07-14)

- `recommendation_sessions`·`recommendation_course_steps`·`recommendation_step_events`과 owner RLS/FK/index/append-only event 기반을 추가하고 `date_cards`의 nullable dual-write 경계를 보존했다.
- `make_course`는 Phase 7 full response를 one-RPC transaction으로 저장하고 memory-first provider/cache 또는 owner-filtered DB hydrate로 복원한다. persistent device cache와 full JSON route param을 사용하지 않는다.
- structured course는 course→generating에서 `requestId`만, generating→result에서 `requestId/sessionId`만 전달한다. 기존 feeling route는 하위호환을 유지한다.
- initial review Important 3건(timestamp offset, concurrent persist race, direct couple-ID injection)을 보정 migration `20260714220000_harden_recommendation_sessions.sql`으로 해결했다.
- linked Supabase에 `20260714210000`과 `20260714220000`을 단독 transaction으로 적용·history 기록했다. 50 suites/510 tests, `npm run validate`, `git diff --check`, 재리뷰를 통과했다.

#### 실행 Phase 9 완료 (2026-07-14)

- 실제 generation stage/state와 AbortController 기반 안전 취소/실패 UI, editable result의 lock/unlock·replace·reorder·add/delete·unlocked-only regenerate·confirm transaction을 구현했다.
- Edge가 인증 사용자별로 검증된 response를 private attestation으로 보관하고, 앱은 opaque request ID와 selection ID만 RPC에 전달한다. definer RPC는 소유자/커플/현재 base request/잠금/코스 구조를 원자적으로 검증하고 direct REST DML을 거부한다.
- `20260715090000_editable_recommendation_sessions.sql`을 linked Supabase에 적용·history 기록하고, `generate-ai` v15와 `recommend-date` v2를 배포했다. remote 함수 카탈로그·RLS/grant·OPTIONS·invalid-JWT 401 스모크를 통과했다.
- 전체 51 suites/526 tests, `npm run validate`, 두 Deno check, `git diff --check`, 독립 재리뷰를 통과했다. 인증된 사용자 Expo E2E는 수동 QA로 남겼다.

#### 실행 Phase 10 완료 (2026-07-14)

- 인증 owner 세션의 최신 제외 이력·현재 코스 컨텍스트를 기준으로 category/이전·다음 단계별 도보 한도를 반영한 최대 15개 교체 후보를 반환하고 Top 3를 먼저 표시한다.
- 선택한 후보는 클라이언트가 장소 사실을 쓰지 않고 `recommend-date`의 Kakao 후보 재검증·attestation 뒤 기존 opaque mutation RPC로만 교체한다.
- 현재/교체 후보 장소 상세에서 Naver와 Kakao Map을 `expo-web-browser`로 연다. 외부 후기 내용을 저장·스크래핑·검증하지 않는다.
- `recommend-date` v3와 `replacement-candidates` v1을 배포했고, 53 suites/530 tests, 타입/Deno/diff, remote OPTIONS·invalid-JWT 스모크, 독립 재리뷰를 통과했다. 인증 기기 E2E는 수동 QA로 남겼다.

#### 현재: 실행 Phase 11

- initial/final 선택, 교체 rank, lock/unlock, add/delete, confirm, visit, 짧은 feedback tag의 first-party event 기록을 owner-safe 경계에 추가한다.

#### 실행 Phase 11 완료 (2026-07-14)

- owner-safe event/feedback RPC와 RLS-only `place_feedback`을 추가해 initial recommendation, lock/unlock, replace, add/delete, confirm, visit/short tag를 first-party 기록으로 남긴다.
- `20260715100000_recommendation_learning_events.sql`을 linked Supabase에 적용·history 기록했고 remote direct DML revoke/RLS/definer RPC를 확인했다. 54 suites/532 tests, type/diff gate를 통과했다.

#### 현재: 실행 Phase 12

- first-party pair 통계를 요청 경로 밖에서 incremental aggregate로 갱신하고 최소 표본 전에는 행동 기반 문구를 노출하지 않는다.

#### 실행 Phase 12 완료 (2026-07-14)

- confirmed event trigger가 place-pair aggregate를 incremental하게 갱신하며, `often_selected_together`는 10 unique couples와 15 confirmed selections를 모두 충족할 때만 반환한다.
- `20260715110000_place_pair_stats.sql`을 linked Supabase에 적용·history 기록했다.

#### 실행 Phase 13 완료 (2026-07-14)

- 코스 생성 전 AI 제3자 전송/30일 보존 동의를 요구하고 server-side versioned consent를 기록한다. raw AI log와 generation attestation은 30일 purge RPC 대상으로 고정했다.
- 계정 삭제는 caller user ID나 client-side pre-delete를 신뢰하지 않고 authenticated Edge subject만 server-side auth deletion으로 처리한다.
- `20260715120000_ai_privacy_retention.sql`을 linked Supabase에 적용·history 기록하고 `delete-account` v6을 배포했다. 56 suites/534 tests, validate, Deno, diff gate를 통과했다.

#### 버그 수정 세션 AM 완료 (2026-07-16)

- 사용자가 실기기에서 보고한 "코스를 만드는 중 문제가 생겼어요" 간헐적 에러 3건의 근본 원인을 systematic-debugging으로 규명·수정했다.
  1. `getPreparedRecommendationRequest`의 캐시 미스(`missing_prepared_request`)가 `RecommendationRequestError`로 분류되지 않아 항상 일반 에러 문구로 뭉개지고, "다시 시도하기"도 같은 requestId라 재실패했다 — 전용 문구/버튼 분기 추가.
  2. `recommend-date-downstream.ts`가 로깅하는 `recommend_date_select` action이 `ai_recommendation_logs_action_check`에 없어 코스 생성마다 로그 insert가 400으로 실패했다(사용자 비노출, 로그/평가 데이터 유실).
  3. **실제 에러의 진짜 원인**: linked Postgres의 `extra_float_digits=0` 때문에 `get_recommendation_session`이 `recommendation_course_steps`(double precision 컬럼)를 JSON으로 직렬화할 때 좌표가 유효자리 15자리로 반올림됐다. `current_course`(jsonb 원본, numeric 기반이라 정밀도 그대로)와 비교하는 클라이언트의 엄격한 무결성 검증(`mapRecommendationSessionPayload`)이 16자리 이상 필요한 좌표를 가진 코스마다 `malformed`로 거부했다. `get_recommendation_session(text)`에 함수 단위로 `set extra_float_digits = 3`을 적용해 해결했고, 실제 문제 있던 세션으로 재검증해 정밀도 일치를 확인했다.
- `20260715152131_ai_recommendation_logs_add_recommend_date_action.sql`, `20260716000100_get_recommendation_session_float_precision.sql`을 linked Supabase에 적용했다.
- 신규 테스트 4개(`recommend-date-expired-request`, `aiRecommendationLogsActionMigration`, `getRecommendationSessionFloatPrecisionMigration` 등) 추가. 전체 61 suites/544 tests, `npm run validate`, `git diff --check` 통과. 사용자가 Xcode 재빌드로 정상 동작 확인함.

#### 코스 결과 화면 UX 재설계 — 세션 AO+AP 완료, 배포 완료 (2026-07-16)

> 계획 전문: `/Users/jeongwonkim/.claude/plans/zazzy-pondering-heron.md` (brainstorming + Plan mode로 승인 완료, 2026-07-16). 상세 변경 내역은 `RESULT.md` 세션 AO(초기 재설계)·AP(실기기 QA 보정 + 잠금 버그 수정) 참조.

- 세션 AO: 상단/하단 중복 렌더링, "이 단계 교체" 후보 0개 백엔드 버그, 액션시트 통합, Haiku 큐레이션, 데이트 후 피드백 제거를 TDD로 구현·배포 완료.
- 세션 AP: 사용자가 실기기에서 UI 4건(카드 높이/가로 UI/스크롤 불가/버튼 텍스트 줄바꿈)과 "잠금 외 재추천"·"이 단계 교체" 저장 실패를 재현·보고 → 세로 리스트+전체 스크롤 래핑+버튼 텍스트 축약으로 UI 수정, `candidateId`가 검색 호출 1회 한정 임시 ID라 잠금 스텝이 재검색마다 검증 실패하던 근본 버그를 `recommendation-course-selection.ts`에서 lock 자체 장소 사실 기반 해석으로 수정. `recommend-date` v6 재배포 완료(71 suites/611 tests, validate, diff-check 통과).
- 세션 AQ: 잠금·재추천·교체가 모두 "저장 실패"로 뜨던 잔여 버그를 Postgres/attestation 로그로 정확히 규명. (1) 잠금·재추천은 `latest_request_drop_locked_steps` 마이그레이션이 살아있던 창에서 RPC가 `current_course.locked=true`인데 `lockedSteps`를 지운 페이로드를 반환 → 클라이언트 lock-flag 교차검증(`schemas.ts:354`)이 예외 → 이미 `restore_full_locked_steps`로 해소됨(라이브 RPC 재현으로 확인). (2) 교체는 클라이언트가 `requestRecommendationResponse` 반환값을 버리고 replacement-candidates 검색의 임시 `candidateId`를 mutate에 넘겨 RPC 조회 실패 → `course-result.tsx`에서 `add` 패턴처럼 응답의 `candidateId`를 꺼내 쓰도록 수정(클라이언트 전용, Edge/RPC 무변경). 620 tests/validate 통과.
- 세션 AR (2026-07-16): 교체 잔여 실패의 독립 버그 2개를 순차 확정·수정, **실기기 성공 확인 완료**. (1) Edge가 핀(lockedSteps) 멤버십을 응답 `locked`로 마킹 → 비잠금 스텝에서 RPC 검증 거부 — 핀의 `locked` 필드 에코로 변경(`recommend-date` v9 + 공용 검증기, 재빌드 완료). (2) RPC replace 분기가 임시 `candidateId`로 "변경 여부"를 비교해 검색 재번호 충돌(`candidate_001` vs `candidate_001`) 시 거부 — `20260716050000_replace_compare_stable_place_id`로 `kakaoPlaceId` 비교로 교체·적용. 실패했던 실제 mutation을 트랜잭션 롤백 재현으로 수정 전/후 인과 확정. 74 suites/626 tests, validate 통과.
- **다음 세션 우선 작업**: 세션 AT(2026-07-18) 변경분 실기기 확인 — 홈 카드 이미지 높이(RN aspectRatio 버그 수정본), 모드 탭 직행/뒤로가기, 후보 탭 필터·FAB, 탭바 4개. 이후 스텝 추가 간헐 실패 수정(`addVerifiedStep`이 잠긴 스텝만 핀 → 비잠금 스텝 재검색 드리프트 시 add 거부. locked 에코 수정으로 전체 스텝 핀 전송 가능해짐 — 클라이언트 소규모 수정). `generate-ai` 매 호출 502 원인 조사(Anthropic API 키/모델 추정, 결정론 폴백으로 사용자 비노출).
- **다음다음 세션 백로그**: 방문 확인 트리거(피드백 재도입) 설계 — `record_recommendation_place_feedback` RPC/DB는 유지됨. 장소 실사진 연동(현재는 카테고리 아이콘까지만, Kakao 로컬 API가 사진 URL 미제공 확인됨).

#### 목표와 권장 범위

- AI 결과를 완성본이 아니라 **수정 가능한 2~4개 장소 코스 초안**으로 전환한다.
- 구조화 조건을 진실의 원천으로 삼고, 자연어는 `additionalRequest`로만 취급한다.
- Kakao 검색 후보 밖 장소 생성, 검증되지 않은 가격·소음·혼잡·편의 정보 단정을 없앤다.
- 1차 전환 범위는 `make_course`로 한정하고 기존 `feeling` 및 나머지 모드는 회귀 없이 유지한다.
- 큰 리팩터링 한 번이 아니라, 각 단계가 독립적으로 검증·롤백 가능한 **수직 단계식 전환**을 권장한다.

#### 현재 추천 흐름

```text
course.tsx / feeling.tsx
→ 입력 전체를 JSON route param으로 generating.tsx에 전달
→ 모바일 lib/ai.ts가 resolveIntent/buildCandidates/route 정렬 수행
→ place-search Edge가 Kakao 검색 (키/인증은 서버 보관)
→ 모바일 lib/recommendation.ts가 최종 Haiku prompt 구성
→ generate-ai Edge가 prompt를 Haiku에 전달하고 raw prompt/응답 저장
→ 모바일이 candidate_id 검증·결정론 fallback·카드 조립
→ 메모리 RecommendationSession에 후보 pool 저장
→ 카드 전체 JSON을 result route param으로 전달
→ date_cards의 flat 컬럼 + steps jsonb + nullable request/session/Kakao ID로 저장
```

#### 이미 갖춘 기반

- Kakao REST 키와 Anthropic 키는 Edge Function에만 있고 인증 사용자만 호출 가능하다.
- 후보 선택 경로는 `candidate_id` 검증, `placeId` 중복 제거, invalid ID 제거, 결정론 fallback을 일부 갖췄다.
- Adaptive Retrieval, 좌표 기반 코스 compactness, 이전 추천 장소 제외, 추천 지표 로깅이 존재한다.
- GPS 현재 위치, ko/en i18n 기반, `steps` 저장/표시, Supabase RLS 기반 커플 소유권이 존재한다.

#### 목표 대비 핵심 차이

| 영역 | 현재 | 목표/조치 |
|---|---|---|
| 입력 계약 | `FeelingInput` 중심, 코스도 자유문장+시간+선택 위치 | hard/soft 분리, 명시적 `courseSteps`, 도보 한도, 2인 총예산, lock/exclusion 계약 |
| 위치 | 자유 텍스트를 첫 Kakao 결과로 geocode하거나 GPS 사용 | 2글자·300ms autocomplete, 5~8개 제안, stale 응답 차단, 최근 위치, 안정 ID 저장 |
| 장소 ID | Candidate→`DateCard`/`CourseStep`→DB 저장까지 `kakaoPlaceId` 보존. 교체/피드백은 미구현 | `kakaoPlaceId`를 검색→후보→step→저장→교체→피드백까지 보존 |
| 검색 근거 | 중복 결과의 첫 항목만 보존, 문자열 재매칭으로 `matchedQueries` 계산 | query/page/source/category를 `SearchEvidence[]`로 병합 |
| 오케스트레이션 | 모바일이 prompt와 후보 선택 지침을 구성 | `recommend-date` Edge가 인증·파싱·검색·랭킹·Haiku·검증·fallback을 일괄 담당 |
| fallback | 위치/후보가 없으면 free-form 장소 생성 또는 정적 카드 | 후보 집합 안에서만 결정론 fallback; 후보 부족은 명시적 typed error |
| 제약 검증 | 일부 candidate ID/중복/anchor 검증 | 2~4개, 카테고리, lock, exclusion, 도보/동선, 지원된 가격 정보, 완화 내역 전체 검증 |
| 세션/라우팅 | 프로세스 메모리 세션 + 카드에 request/session ID 저장, 전체 input/cards JSON route param | DB-backed request/session/step + 앱 provider/cache; route에는 ID만 전달 |
| 결과 편집 | 카드 열람·전체 재추천·저장/공유 | map, 적용 조건, lock/replace/reorder/add/delete, unlocked partial regenerate, confirm |
| 대안/상세 | 대안 목록 없음, Kakao place URL만 열기 | step당 최대 15개(Top 3 강조), 전후 step 문맥 랭킹, 상세, Naver/Kakao 외부 확인 |
| 학습 | 추천 생성 지표와 일반 date memory | initial/final/replacement/lock/confirm/visit/feedback + 임계치 기반 pair stats |
| 오류 | 검색 실패를 `[]`로 축약하거나 fallback, 화면은 단일 에러 | typed error code, retry/edit/safe-to-retry 정책, 실제 진행 단계 |
| i18n | UI 틀은 ko/en이나 intent 규칙은 사실상 한국어 중심 | 입력 언어와 UI 언어를 독립 지원하고 locale formatter/누락 키/긴 영문 테스트 |
| 개인정보 | raw prompt·응답을 무기한 저장하는 구조 | raw 자유문장 기본 미저장, 구조화 품질 로그, 보존 기간·삭제/익명화 정책 |
| 출시 | Google/Kakao 로그인, Apple 로그인 보류, iPad 활성 | Apple 로그인, server-side 완전 삭제, privacy disclosure, iPad 정책, prod EAS/TestFlight |

#### 접근 방식 비교

1. **권장 — 수직 단계식 전환:** `make_course` 한 경로를 계약→검색→서버→UI→편집까지 단계별 전환한다. 기존 모드를 보존하고 각 단계별로 테스트/롤백할 수 있다.
2. **백엔드 전체 선행:** 서버·DB를 먼저 완성한 뒤 UI를 한 번에 연결한다. 서버 일관성은 좋지만 실제 UX 피드백이 늦고 미사용 계약을 과설계할 위험이 있다.
3. **일괄 재작성:** 입력부터 결과까지 한 번에 교체한다. 문서 모양은 빨리 맞지만 현재 미커밋 V2 변경, 기존 저장 카드, 공유/반응 플로우 회귀 위험이 가장 커서 채택하지 않는다.

#### 세션 단위 실행 로드맵

| 실행 Phase | 원본 목표 | 한 세션의 완료 기준 |
|---|---|---|
| 1 | 공용 계약 | `RecommendationRequest`·hard/soft constraints·location·error의 Zod schema/ko-en unit test 추가. 기존 런타임은 변경하지 않음. |
| 2 | 안정 ID/저장 기반 | `kakaoPlaceId`, request/session ID의 end-to-end 타입·nullable DB 확장·기존 카드 dual-read 경계 확정. |
| 3 | 위치 autocomplete | 서버 검색 + 2자/300ms/stale protection/최근 위치/GPS UI를 `make_course`에 연결. |
| 4 | 구조화 입력 | 2~4 단계, 2인 총예산, 도보 한도, mood, additional request, 충돌 preview를 한 화면에 적용. |
| 5 | 서버 오케스트레이터 골격 | `recommend-date` 인증·schema validation·서버 prompt 책임을 추가하고 클라이언트는 구조화 요청만 전송. |
| 6 | 검색·랭킹 | Kakao search evidence 병합, deterministic rank, bilingual parsing/conflict, route/constraint 계산을 서버로 이관. |
| 7 | 선택·검증·오류 | candidate-only Haiku 선택, course validation, deterministic fallback, typed error/relaxed constraints를 연결·배포. |
| 8 | 영속 세션/라우팅 | `recommendation_sessions`·`recommendation_course_steps`, RLS, provider/cache를 만들고 route JSON을 ID로 교체. |
| 9 | 편집 결과 | 실제 generating stage, 적용 조건/타임라인/map, lock/reorder/add/delete/confirm을 구현. |
| 10 | 교체·상세 | 최대 15개 문맥 대안, Top 3, place detail, Naver/Kakao 외부 확인을 구현. |
| 11 | 행동·피드백 | step event, visit confirmation, 짧은 feedback, initial/final selection을 저장. |
| 12 | 학습 집계 | pair statistics 증분/예약 집계와 임계치 기반 보수적 ranking/label을 구현. |
| 13 | 개인정보·계정 | raw prompt 30일 정책, 구조화 로그, server-side account deletion 확장, AI 고지/동의를 구현. |
| 14 | 출시 준비 | Apple 로그인(계정 준비 후), iPad 정책, production EAS/TestFlight, ko/en E2E·App Review 자료를 검증. |

#### 상위 목표별 상세 계획

##### 실행 Phase 1~2 — 공용 계약·검증·안정 ID 기반

- 생성: `shared/recommendation/contracts.ts`, `shared/recommendation/schemas.ts`, `shared/recommendation/errors.ts`
- 수정: `package.json`, `package-lock.json`, `lib/ai.ts`, `lib/course.ts`, `lib/candidate.ts`, 관련 unit tests
- 실행 Phase 1은 `RecommendationRequest`, hard/soft constraints, location, course/step, relaxed constraint, typed error를 단일 계약으로 고정한다.
- 실행 Phase 2는 request/session ID와 `kakao_place_id`를 기존 카드와 하위호환되게 추가하고, 정규화 테이블 도입 전 dual-read 경계를 정의한다.
- **실행 Phase 1의 가장 작은 첫 PR:** Zod 계약 + 직렬화/ko-en/error unit test만 추가하고 런타임 경로는 바꾸지 않는다. ID 컬럼/dual-write는 실행 Phase 2로 미룬다.
- 검증: schema reject/accept, candidate ID, 중복 ID, 2~4 step, ko/en serialization 테스트 + `npm run validate`.

##### 실행 Phase 3 — Kakao 위치 autocomplete 수직 슬라이스

- 생성: `supabase/functions/location-autocomplete/index.ts`, `lib/locationSearch.ts`, `lib/recentLocations.ts`, 전용 location selector/suggestion 컴포넌트 및 테스트.
- 수정: `app/mode-flow/course.tsx`, `components/ui.tsx` 또는 신규 `components/recommendation/*`, `locales/ko.json`, `locales/en.json`.
- 2자 이상, 약 300ms debounce, stale response token, 5~8개 결과, exact/prefix/station/landmark 우선 랭킹, 최근 선택, GPS를 구현한다.
- Kakao 키는 Edge에만 유지하고 선택 결과에 좌표와 `kakaoPlaceId`를 저장한다.

##### 실행 Phase 4 — 구조화 코스 입력

- 생성: location/course step/walking/budget/mood/additional request/parsed preview용 재사용 컴포넌트와 reducer/validator 테스트.
- 수정: `app/mode-flow/course.tsx`, `lib/modeForm.ts`, `locales/ko.json`, `locales/en.json`, 색상/간격 토큰.
- 코스 장소 2개 기본·최소 2·최대 4, 순서 편집, 5/10/20분/무관 도보 한도, **2인 총예산**, mood chip, optional `additionalRequest`를 제공한다.
- 자연어 파싱 결과와 구조화 조건 충돌을 미리 보여주되 구조화 조건을 자동 덮어쓰지 않는다.
- 새 inline style을 만들지 않고 44pt touch target, safe area, keyboard, 작은 iPhone/긴 영문을 확인한다.

##### 실행 Phase 5~7 — `recommend-date` 서버 오케스트레이터

- 생성: `supabase/functions/recommend-date/index.ts`와 `_shared` validation/search/ranking/prompt/course-validation 모듈, Edge integration test harness.
- 수정/이관: `lib/intent.ts`, `lib/candidate.ts`, `lib/courseRoute.ts`, `lib/recommendation.ts`, `lib/ai.ts`, `supabase/functions/place-search/index.ts`, `supabase/functions/generate-ai/index.ts`.
- 실행 Phase 5는 인증·schema validation·서버 prompt 책임까지, 실행 Phase 6은 parsing/search/ranking까지, 실행 Phase 7은 candidate selection/validation/fallback/error와 배포까지 진행한다.
- 실행 Phase 7에서 free-form place generation을 제거하고 모든 장소가 Kakao candidate set에 있는지 검증한다. hard constraint 완화는 실패로 숨기지 않고 `relaxedConstraints`에 정확히 반환한다.
- `generate-ai`는 soft message 등 기존 경로를 위해 유지하고 추천 prompt 조립 책임만 제거한다.

##### 실행 Phase 8~9 — DB-backed 편집 세션과 결과 화면

- 마이그레이션: `recommendation_sessions`, `recommendation_course_steps`, 필요한 RLS/index/FK와 기존 `date_cards` 호환 view/dual-write.
- 생성: recommendation session provider/store, session repository, result/map/condition summary/timeline/step card/action sheet 공용 컴포넌트와 편집 reducer 테스트.
- 수정: `app/mode-flow/generating.tsx`, `app/mode-flow/course-result.tsx`, `app/_layout.tsx`, 저장·공유·카드 상세 경로.
- 실행 Phase 8은 route param을 `requestId/sessionId`만 사용하도록 바꾸고, 실행 Phase 9는 lock/unlock, replace, reorder, add, 2개 초과 시 delete, unlocked-only regenerate, confirm UI/트랜잭션을 구현한다.
- 실행 Phase 9에서 생성 화면의 가짜 시간 진행을 서버의 실제 stage/state로 교체하고 취소·안전 이탈·전용 실패 UI를 제공한다.

##### 실행 Phase 10 — 교체 후보·장소 상세·외부 확인

- 생성: replacement/detail routes와 Top 3/추가 12 candidate, comparison, external review action 컴포넌트.
- 수정: server ranking에 previous/next step 거리, 총 도보, 예산, exclusion/repetition을 반영한다.
- Naver 리뷰와 Kakao Map은 `expo-web-browser`/플랫폼 브라우저로만 열고 DOM 추출·리뷰 저장은 하지 않는다.
- 영업시간·가격·정성 태그는 실제 근거가 있을 때만 verified로 표시하고 요청 preference와 시각적으로 분리한다.

##### 실행 Phase 11~12 — 1st-party 학습 루프

- 마이그레이션: `recommendation_step_events`, `place_feedback`, `place_pair_stats` + RLS/index/unique constraints.
- 실행 Phase 11에서 initial/final place, 교체 rank, lock/unlock, add/delete, confirm, actual visit, 짧은 feedback tag를 기록한다.
- 실행 Phase 12에서 pair stats를 요청마다 계산하지 않고 scheduled/incremental aggregate로 갱신한다.
- `10 unique couples + 15 confirmed co-selections` 미만에는 행동 기반 표현을 쓰지 않고 `이 코스와 잘 맞는 장소`로 표시한다.

##### 실행 Phase 13~14 — 보안·개인정보·App Store 준비

- 실행 Phase 13에서 AI 제3자 전송 고지/동의, raw prompt **30일 삭제 정책**, structured log/retention, server-side account deletion 확장을 구현한다.
- 실행 Phase 14에서 Apple 로그인(Apple Developer Program 가입 후), iPhone 우선 정책(`supportsTablet: false`), production EAS build, TestFlight, demo couple, App Review note, privacy declaration을 검증한다.
- 실행 Phase 14에서 ko/en E2E 핵심 경로와 위치 권한 거부→수동 검색→생성→교체→lock→부분 재생성→확정→외부 리뷰→피드백→탈퇴를 검증한다.

#### DB/배포 마이그레이션 위험과 대응

- 현재 `date_cards`는 flat 컬럼 + `steps jsonb`이고 저장된 구 카드가 존재하므로 destructive migration 금지. nullable 확장→dual-write→backfill→dual-read→전환 순서로 진행한다.
- [해결: 실행 Phase 2] `CourseStep`/`DateCard`에 `kakaoPlaceId`를 보존하고 `collectPlaceIds`의 이름 역매칭을 제거했다.
- 추천 세션이 앱 메모리뿐이라 재시작/다른 기기/공유 시 사라진다. UI 편집 전에 DB session 소유권과 RLS를 먼저 고정한다.
- `docs/supabase-schema.sql`과 실제 모바일 테이블 migration이 분리돼 있어 schema 문서 drift가 있다. 신규 migration과 같은 단계에서 canonical schema 문서를 갱신한다.
- Edge 2개가 이미 배포되어 있고 현재 작업 트리에 추천 V2 미커밋 변경이 있다. 구현 전 해당 변경을 checkpoint하고, disk/배포본 버전을 대조한 뒤 단계별 배포한다.
- 현재 raw prompt 로그는 자연어 요청을 포함한다. 새 오케스트레이터 전환 전에 저장 최소화·보존 기간·기존 로그 처리 정책을 확정한다.
- lint script가 없으므로 현재 자동 게이트는 `npm run validate`와 Jest다. lint를 품질 게이트로 요구하면 별도 도구 도입 PR을 계획한다.

#### 단계별 검증 게이트

- 각 서브태스크: 실패 unit test 작성→대상 Jest 실행→최소 구현→대상 Jest 재실행→루트 `npm run validate`.
- 각 Phase 종료: 전체 `npm test -- --runInBand` + `npm run validate`, ko/en key parity, DB/RLS 검증, Edge 실패 케이스 검증.
- 배포 Phase: 로컬 소스와 배포 Edge 재대조, rollback 대상 버전 기록, 시뮬레이터/실기기 육안 검증.
- 완료 기준은 hallucinated/out-of-candidate/duplicate/step mismatch/locked replacement/missing translation/unhandled crash가 모두 0이고 fallback/latency p95가 측정되는 상태다.

#### 확정된 기본값과 보류 조건

1. `make_course`만 먼저 재설계하고 `feeling`은 single-place 레거시 경로로 유지한다.
2. 예산은 전 화면에서 원화 기준 **2인 총예산**으로 통일한다.
3. 첫 출시 대상은 iPhone이며 실행 Phase 14에서 `supportsTablet: false`로 확정한다.
4. 결과 map은 해당 실행 Phase 직전에 Expo SDK 54 공식 문서로 호환 라이브러리/지도 제공자를 확인해 결정한다.
5. raw 추천 prompt 기존 로그는 실행 Phase 13에서 삭제/익명화하고, 신규 구조화 로그 보존 기간은 **30일**로 한다.
6. Apple 로그인과 TestFlight 완료에는 유료 Apple Developer Program 계정이 필요하다. 계정이 준비되지 않으면 실행 Phase 14의 해당 항목만 외부 차단으로 남기고 나머지 출시 검증을 끝낸다.

---

## 완료된 항목

- [Done] 코스 steps ordered anchors + 동선 최적화 — 복합 입력 anchor 순서 추출, Haversine route compactness 후보 정렬, origin meta 반환, place-search 재배포 (2026-07-09)
- [Done] AI 추천 재설계 실행 Phase 1 — shared Zod 계약·typed error·ko/en 직렬화/검증 테스트 추가, 기존 런타임 미연결 유지 (2026-07-14)
- [Done] AI 추천 재설계 실행 Phase 2 — candidate/Kakao/request/session ID end-to-end 보존, 구 카드 dual-read, 6개 AI 저장 경로 dual-write, nullable DB migration 적용 (2026-07-14)
- [Done] AI 코스 생성 에러 3건 근본 원인 수정 — 준비된 요청 캐시 미스 오분류, `ai_recommendation_logs` action 체크 제약 누락, `get_recommendation_session`의 `extra_float_digits=0`로 인한 좌표 반올림/malformed 오탐 (2026-07-16)
- [Done] 코스 입력 화면(`course.tsx`) UI 개선 — 단계추가 버튼 위치, 카테고리 아이콘화, 위치 아이콘 통일, AI 동의 체크박스 제거, 헤더 텍스트 축소, 예산/전체시간 드래그 슬라이더 전환(신규 `StepSlider` + `lib/slider-math.ts`, 예산 0~100,000원 1,000원 단위, 시간 0~24시간 1시간 단위). 실기기 테스트로 스크롤 충돌과 `useRef(PanResponder.create())` 렌더링별 재생성으로 인한 제스처 상태 리셋 버그를 순차 발견·수정 (2026-07-16)
- [Done] 영어 로컬라이제이션 버그 수정 + 커플 이중언어 카드 + 마이페이지 뒤로가기 + 코스 결과 화면 UI 폴리시 — 상세 내역은 `RESULT.md` 세션 AS 참조 (2026-07-17)
- [Done] MVP 단일 모드 전환("코스로 정리해줘"만 노출, feeling/next_meet UI 숨김+복원 가능) + 마음 전하기 코드 삭제 + 홈 코스 카드 커플 이미지·정렬 개선(RN aspectRatio 무시 버그 회피) — 상세 내역은 `RESULT.md` 세션 AT 참조 (2026-07-18)
- [Done] soft message 제거 + 알림 통합 — 카드 보낼 때 가던 `new_card`+`soft_message` 2개 알림을 문구 포함 "데이트 제안" 알림 1개로 통합(목업 3안+A). `trg_notify_card` DROP·`notify_on_soft_message` 재작성(카드+문구 payload)·`send-push` v3 프로덕션 배포, 알림함 모달 재구성(복사 삭제, "제안 보러가기"→반응 화면), push 라우팅 TDD, i18n 정리. 카드 생성만으론 무알림(보낼 때만). tsc·733테스트 통과, 실기기 확인 대기. 상세 `RESULT.md` 세션 AW 참조 (2026-07-19)
- [Done] AI 추천 Step Intent Phase 1 (결정론 수직슬라이스) — 자유텍스트("삼겹살"/"samgyupsal")를 규칙 파서로 step별 canonical 카카오 검색 의도로 변환, 검색→evidence→랭킹→선택검증→폴백→교체 전파. required(무조건) 강제(422 STEP_INTENT_UNSATISFIED)+선택검증+폴백 필터, preferred 소프트 우대. step-intent 사전+파서 신설, 검색플랜 step_intent 쿼리+raw explicit 제거+progressive expansion, step_intent 캐시 제외(보안), 프롬프트 v4 resolvedStepIntents. AI 파서 없음(Phase 2). 767테스트·tsc 통과, **미배포**(승인 후 별도). 브랜치 `feat/step-intent-phase1`. 애드덤 `docs/AI_RECOMMENDATION_V4_STEP_INTENT_RECONCILIATION.md`, 상세 `RESULT.md` 세션 AY (2026-07-19)
- [Done] 수동 장소 지정 Phase 2 — 코스 입력 스텝별 카카오 장소 핀(브랜치 `feat/manual-place-pick`). 계약 `CourseStepInput.pinnedKakaoPlaceId/pinnedName`, 파이프라인 per-step 재검색 병합, 핸들러 forcing(전량핀→AI 스킵 0원/부분핀→AI 병합/카테고리·intent 게이트 우회/신규 422 STEP_PIN_UNAVAILABLE), 랭킹 pin recall, 프롬프트 v5. UI = 스텝 에디터 Option B(`[AI 추천\|내가 직접]` 토글 + 카테고리 공존, "Let AI decide" 칩 제거). `recommend-date` 배포 완료, `generate-ai`·DB 무변경. 824테스트·tsc 통과. **미머지·실기기 미확인**. 상세 `RESULT.md` 세션 BB (2026-07-20)
