# App Store 심사 준비 팩 (Phase 14 잔여 4건)

> 2026-07-25 작성. 코드 근거로 산출 — 추측 아님.

## 1. App Privacy (수집 데이터 라벨) — ASC 선언값

App Store Connect → 앱 → App Privacy → Get Started.

**공통 답변**: Tracking(추적) = **No** (광고/분석 SDK 없음, 제3자 추적 공유 없음).
모든 항목: 목적 = **App Functionality**, **Linked to user = Yes**, **Used for tracking = No**.

| ASC 카테고리 | 세부 항목 | 근거 |
|---|---|---|
| Contact Info | Email Address | Google/Kakao/Apple 로그인 → Supabase auth |
| Contact Info | Name | 닉네임(`date_planner_profiles.display_name`) |
| Location | Precise Location | 위치 기반 추천, `recommendation_sessions.original_request`에 좌표 저장 |
| Photos or Videos | Photos | 프로필 사진 + 추억 사진 (Supabase Storage) |
| User Content | Other User-Generated Content | 코스/카드, 리뷰, 추억 텍스트, 코멘트 |
| Identifiers | User ID | Supabase user id, couple id |
| Identifiers | Device ID | Expo push token (`lib/push.ts`, push_tokens 저장) |
| Usage Data | Product Interaction | `recommendation_step_events` (교체/lock 등 이벤트) |

선언 안 함: Health, Financial, Contacts, Browsing/Search History(외부), Diagnostics(크래시 SDK 없음), Coarse Location(Precise로 커버), Sensitive Info.

주의: Android `RECORD_AUDIO` 권한이 `app.json`에 있으나 iOS 미해당 — iOS 라벨에 오디오 없음. (추후 Android 출시 전 실사용 여부 점검 권장.)

## 2. Demo couple 계정 — 설계

로그인 = 소셜 3종만(Google/Kakao/Apple), 이메일/비번 없음 → 데모는 실계정 필요.

**Primary**: 데모용 Google 계정 1개 신규 생성 (예: `datenavi.demo@gmail.com`)
- 2단계 인증 **끄기** (심사자는 미국 IP/낯선 기기 → 2FA 있으면 로그인 차단 위험)
- 이 계정으로 앱 로그인 → 온보딩 완료 → 파트너 계정과 커플 연결 완료 상태로 셋업
- 파트너 = 본인 기존 계정 or 두 번째 데모 계정, 코스 1–2개 저장 + 추억 1개 등록해 화면 채우기

**Backup** (Google이 낯선 로그인 차단할 경우 대비): 미연결 데모 파트너 계정 하나 더 만들어 **초대 코드** 발급, Review note에 명시 → 심사자가 본인 Apple ID로 Sign in with Apple 후 코드 입력해 커플 연결. (코드는 커플 1쌍만 연결 가능 — 소모되면 재발급 필요.)

**제출 직전 체크**: 새 시뮬/기기에서 데모 Google 계정 로그인 → 홈까지 진입 1회 확인.

## 3. App Review note — 초안 (ASC "Notes" 필드, 영문)

```
Date Navi is a couple date-course planning app focused on South Korea.
Place data comes from Kakao Maps (Korean POI), so recommendations work
best with a Korean location.

LOGIN / DEMO ACCOUNT
- Sign-in methods: Google, Kakao, and Sign in with Apple.
- Demo account (Google): datenavi.demo@gmail.com / [PASSWORD]
  This account is already connected as a couple, with sample courses
  and memories, so all couple features are immediately visible.
- Backup: if Google blocks the sign-in, please use Sign in with Apple
  with your own Apple ID, then enter invite code [CODE] on the
  "couple connect" screen to pair with our demo partner account.

LOCATION
- Location permission is optional. If denied (or outside Korea),
  tap the location field and search manually — e.g. type "강남"
  (Gangnam, Seoul) — to get recommendations.

OTHER
- Account deletion: Settings > Delete Account (in-app, immediate).
- Push notifications are optional and not required for any feature.
- The app is iPhone-only and supports Korean and English (device locale).
```

`[PASSWORD]`, `[CODE]`는 계정 생성 후 치환.

## 4. 정식 심사 제출 — 순서 체크리스트

1. [ ] E2E 잔여 경로 재검증 완료 (교체·lock·부분재생성·확정·피드백·탈퇴, 빌드5 #4·#5 포함)
2. [ ] 데모 Google 계정 생성 + 커플 연결 + 샘플 데이터 셋업 + 로그인 검증
3. [ ] ASC App Privacy 라벨 입력 (§1 표 그대로)
4. [ ] ASC 스크린샷/설명/키워드/지원 URL/개인정보처리방침 URL 확인
5. [ ] Review note 입력 (§3, 비번·코드 치환) + demo 계정 필드에도 동일 기입
6. [ ] 심사용 빌드 선택 (TestFlight 최신 = 빌드5 검증 통과본)
7. [ ] Export compliance = 암호화 없음(`ITSAppUsesNonExemptEncryption:false` 반영 확인) → Submit
