# 이메일 인증 제거 — 설계 문서

날짜: 2026-07-08

## 배경 / 목표

Date Navi의 최종 인증 목표는 **Apple, Google, Kakao 소셜 로그인만 지원**하고 기존 이메일/비밀번호 인증 방식을 완전히 제거하는 것이다.

Apple 로그인은 유료 Apple Developer Program 멤버십이 없으면 Xcode에서 "Sign in with Apple" capability 자체를 추가할 수 없어(개인 팀 제한) 이번 세션에서는 진행이 불가능하다. 따라서 이번 세션은 **이메일 인증 제거**만 범위로 한다. Apple 로그인 연결은 멤버십 가입 후 별도 세션에서 진행한다.

Google/Kakao 로그인은 이미 네이티브 SDK + `supabase.auth.signInWithIdToken`으로 완전히 연동되어 있으며 이번 작업의 영향을 받지 않는다.

## 범위

### 1. DB 데이터 정리 — 완료됨 (세션 중 실행)

Supabase 프로젝트(`wqjguifsmtblgrhdfnji`, Date-Navi)의 `auth.users`에서 `raw_app_meta_data->>'provider' = 'email'`인 계정 2개를 삭제했다:
- `doro.claudia@gmail.com` (2026-05-23 가입)
- `wjddnjs0419@naver.com` (2026-06-27 가입)

둘 다 개발자 본인의 테스트 계정으로 확인됨. 모든 관련 테이블 FK가 `auth.users`에 대해 `ON DELETE CASCADE`(일부는 `SET NULL`, 영향 없음 확인)로 설정되어 있어, 삭제 시 다음이 함께 제거됨:
- `date_planner_profiles` 2건, `date_planner_couples` 2건(소유자·파트너 모두 이메일 계정이라 완전 삭제, 카카오 계정과 무관)
- `date_cards` 11건, `reactions` 5건, `soft_messages` 10건, `notifications` 8건, `user_preferences` 2건, `date_memories`/`date_memory_comments` 각 1건

삭제 후 검증: `auth.users`에 카카오 계정(`cf5361dc-...`) 1개만 남고, 위 테이블들의 관련 행이 모두 정리됨을 SQL로 확인 완료.

### 2. `app/(auth)/index.tsx`

- `Mode`(`welcome`|`email`) 상태와 이메일 폼 관련 상태(`email`, `password`, `isSignUp`, `agreed`) 제거
- `handleAuth`(signUp/signInWithPassword 호출), `toLocalizedError` 함수 제거
- 이메일 폼을 렌더링하던 두 번째 `return` 블록(176~271행) 전체 삭제 → 웰컴 화면만 남는 단일 렌더링 경로로 단순화
- 웰컴 화면에서 "또는" 구분선 + "이메일로 시작하기" 버튼 제거
- "Apple로 시작하기" `SocialButton` 렌더링을 제거(멤버십 가입 후 실제 연동과 함께 재추가 예정). `SocialVariant` 타입과 `apple` 관련 스타일(`socialBtnApple`, `socialBtnTextApple`)은 재추가를 쉽게 하기 위해 그대로 유지
- 더 이상 쓰이지 않는 import 제거: `supabase`, `Mail`(lucide-react-native의 `Check`도 이메일 폼 체크박스 전용이므로 함께 제거)

### 3. `app/account/change-password.tsx`

비밀번호 변경은 이메일/비밀번호 인증에서만 의미가 있는 기능이므로 파일 자체를 삭제한다.

### 4. `app/settings.tsx`

"비밀번호" 메뉴 행(`/account/change-password`로 이동하는 `ListRow`)과 그 전용 `Lock` 아이콘 import를 제거한다.

### 5. `locales/ko.json`, `locales/en.json`

`auth` 네임스페이스에서 이메일 전용 키를 제거한다:
`emailStart`, `emailHeading`, `emailBody`, `emailLabel`, `passwordLabel`, `passwordCreatePlaceholder`, `requiredPrefix`, `requiredMiddle`, `requiredSuffix`, `signIn`, `submitSignUp`, `hasAccount`, `noAccount`, `signingIn`, `errorEmail`, `errorInvalidEmail`, `errorPassword`, `errorRegistered`, `errorNeedConfirmation`, `errorRateLimit`, `errorInvalidLogin`, `errorNetwork`, `errorGeneric`.

`account.changePassword` 네임스페이스 전체를 제거한다.

공용으로 계속 쓰이는 키(`appleStart`, `kakaoStart`, `googleStart`, `or`, `terms`, `privacy`, `legalPrefix`, `legalMiddle`, `legalSuffix`, `welcomeHeading`, `welcomeBody`, `errorGoogleFailed`, `errorKakaoFailed` 등)는 그대로 둔다. 리디자인 이전부터 남아있던 미사용 레거시 키(`emailPlaceholder`, `passwordPlaceholder`, `signUp`, `toSignUp`, `toSignIn`, `languageHint`, `legalAgree`)는 이번 작업 범위 밖이므로 건드리지 않는다. (`requiredAgreement`는 초안에서는 범위 밖으로 분류했으나, 실제로는 이메일 폼 전용 키였음이 확인되어 구현 계획서에서 제거 대상에 포함하고 실제로도 제거했다.)

## 테스트 / 검증

이번 작업은 신규 로직 추가 없이 기존 코드/데이터를 제거하는 작업이므로 TDD RED-GREEN 사이클 대상 신규 함수는 없다. 검증은 다음으로 한다:
- `npm run validate` (tsc --noEmit) 통과
- `npx jest` 통과 (기존 `googleAuth.test.ts`, `kakaoAuth.test.ts`는 영향 없음 확인)
- iOS 시뮬레이터에서 웰컴 화면에 카카오/구글 버튼만 보이고 정상 동작하는지 육안 확인

## 비범위 (다음 세션)

- Apple 로그인 실제 연동 (Apple Developer Program 가입 → Supabase Apple Provider 설정 → `expo-apple-authentication` 연동)
- Android 카카오 로그인 플랫폼 등록 (기존 보류 항목, 무관)
