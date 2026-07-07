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
- [ ] 카카오 로그인 추가 — 다음 세션. 네이티브 SDK 필요(카카오는 웹뷰 OAuth 대신 카카오톡 앱 연동 SDK 씀), EAS dev build 환경은 이미 구축됨(재사용 가능).
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
- 커플 취향 리포트 (프리미엄)
- 캘린더 뷰 날짜 시각화
- 카카오 로그인 추가

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

---

## 완료된 항목

- [Done] Phase 5.5 취향 데이터 AI 반영 — user_preferences를 generateDateCards 프롬프트에 주입 (2026-05-23)
- [Done] Phase 8 모드별 차별화 UX — course.tsx 신규, 모드별 프롬프트 강조 분기 (2026-05-24)
- [Done] 알림 Supabase 연동 — notifications 테이블/트리거 2개(reaction·new_card), 개별·전체 삭제, 빈 상태 UI, 벨 dot 조건부 (2026-05-28)
- [Done] 마이페이지 버그픽스 — 커플연결 onPress 추가, settings 전체 i18n localize, 닉네임 저장 prefs upsert 분리 (2026-05-28)
- [Done] AI 후보 생성 로딩 아이콘 pulse 애니메이션 추가 (2026-07-05)
- [Done] 날짜/시간/소요시간 선택 UX를 드래그 picker로 전환 (2026-07-05)
- [Done] 사귄 날짜 수정 및 함께한 날 기준 통일 (2026-07-05)
- [Done] 커플 연결 UX/관리 플로우 개선 — 나중에 연결 제거, 초대 링크 공유, 연결 상태/해제 관리 추가 (2026-07-05)
- [Done] 영어 지원 i18n 구조 정리 — i18next/react-i18next, JSON locale 파일, 주요 화면 t() 키 전환 (2026-07-05)
- [Done] Date Navi 리디자인으로 되돌아간 화면 i18n 재작업 — 홈/후보/추억/모드/공유/카드/계정/온보딩/마음전하기 전체, 카드 등록 "예상 시간"을 OptionCardPicker 공통 컴포넌트로 통일 (2026-07-05)
