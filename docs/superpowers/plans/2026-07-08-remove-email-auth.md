# 이메일 인증 제거 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 이메일/비밀번호 인증 코드와 관련 UI, i18n 키를 전부 제거하고 카카오/구글 소셜 로그인만 남긴다 (Apple은 다음 세션).

**Architecture:** `app/(auth)/index.tsx`에서 이메일 폼 렌더링 분기와 관련 상태/핸들러를 삭제해 웰컴 화면 단일 렌더링 경로로 단순화한다. 비밀번호 변경 화면(`app/account/change-password.tsx`)은 이메일 인증 전용 기능이므로 파일째 삭제하고 설정 화면에서 진입점을 제거한다. i18n 파일에서 이제 쓰이지 않는 이메일 전용 키를 정리한다.

**Tech Stack:** React Native (Expo Router), TypeScript, i18next(`useI18n`), Supabase JS

**DB 작업 (완료됨):** 브레인스토밍 세션 중 Supabase MCP로 `auth.users`에서 이메일 provider 계정 2개(및 CASCADE 연관 데이터)를 이미 삭제 완료했다. 이 플랜은 앱 코드/i18n만 다룬다.

**TDD 참고:** 이번 작업은 순수 삭제/배선 변경이며 신규 비즈니스 로직이 없다. 각 태스크는 "삭제 → 타입체크로 검증" 순서를 따르며, RED-GREEN 유닛 테스트 사이클 대상 함수는 없다.

---

### Task 1: `app/(auth)/index.tsx` — 이메일 인증 코드 제거

**Files:**
- Modify: `app/(auth)/index.tsx`

- [ ] **Step 1: 파일 전체를 아래 내용으로 교체**

기존 파일(394줄)에서 이메일 모드 관련 상태/함수/렌더링을 제거하고, 애플 버튼 렌더링을 제거한 최종 버전은 다음과 같다:

```tsx
import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { logEvent } from '../../lib/analytics';
import { signInWithGoogle, getGoogleSignInErrorMessageKey } from '../../lib/googleAuth';
import { isErrorWithCode } from '@react-native-google-signin/google-signin';
import { signInWithKakao, getKakaoSignInErrorMessageKey } from '../../lib/kakaoAuth';
import { C } from '../../constants/colors';
import { G } from '../../constants/theme';
import { useI18n } from '../../lib/i18n';

type SocialVariant = 'kakao' | 'google' | 'apple';

export default function AuthScreen() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  async function handleKakaoSignIn() {
    setErrorMsg('');
    setLoading(true);
    try {
      const { cancelled } = await signInWithKakao();
      if (!cancelled) await logEvent('login', { method: 'kakao' });
    } catch (e: any) {
      const key = getKakaoSignInErrorMessageKey(e?.code);
      if (key) setErrorMsg(t(key));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setErrorMsg('');
    setLoading(true);
    try {
      const { cancelled } = await signInWithGoogle();
      if (!cancelled) await logEvent('login', { method: 'google' });
    } catch (e: any) {
      const code = isErrorWithCode(e) ? e.code : undefined;
      const key = getGoogleSignInErrorMessageKey(code);
      if (key) setErrorMsg(t(key));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={G.screen}>
      <View style={s.welcomeContainer}>
        {/* 로고 배너 */}
        <View style={s.logoBanner}>
          <Image
            source={require('../../assets/logo.png')}
            style={s.logoImage}
            resizeMode="contain"
          />
        </View>

        {/* 헤드라인 */}
        <View style={s.headlineBlock}>
          <Text style={s.heading}>{t('auth.welcomeHeading')}</Text>
          <Text style={s.subText}>
            {t('auth.welcomeBody')}
          </Text>
        </View>

        <View style={s.spacer} />

        {/* 소셜 버튼 영역 */}
        <View style={s.btnArea}>
          <SocialButton
            variant="kakao"
            label={t('auth.kakaoStart')}
            onPress={handleKakaoSignIn}
            disabled={loading}
          />
          <SocialButton
            variant="google"
            label={t('auth.googleStart')}
            onPress={handleGoogleSignIn}
            disabled={loading}
          />
          {errorMsg !== '' && (
            <View style={s.errorBox}>
              <Text style={s.errorText}>{errorMsg}</Text>
            </View>
          )}
          <Text style={s.legal}>
            {t('auth.legalPrefix')}<Text style={s.legalLink}>{t('auth.terms')}</Text>
            {t('auth.legalMiddle')}<Text style={s.legalLink}>{t('auth.privacy')}</Text>{t('auth.legalSuffix')}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

function SocialButton({ variant, label, onPress, disabled }: {
  variant: SocialVariant; label: string; onPress: () => void; disabled?: boolean;
}) {
  const buttonStyle = {
    kakao: s.socialBtnKakao,
    google: s.socialBtnGoogle,
    apple: s.socialBtnApple,
  }[variant];
  const textStyle = {
    kakao: s.socialBtnTextKakao,
    google: s.socialBtnTextGoogle,
    apple: s.socialBtnTextApple,
  }[variant];
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      style={[s.socialBtn, buttonStyle, disabled && s.socialBtnDisabled]}
    >
      <Text style={[s.socialBtnText, textStyle]}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  welcomeContainer: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 32,
  },
  logoBanner: {
    height: 260,
    backgroundColor: C.bgSplash,
    borderRadius: 28,
    marginTop: 8,
    marginBottom: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    width: 180,
    height: 180,
  },
  headlineBlock: { paddingHorizontal: 4 },
  spacer: { flex: 1 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 30 },
  subText: { fontSize: 13, color: C.textSub, lineHeight: 20, marginTop: 10 },
  btnArea: { gap: 10 },
  socialBtn: {
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    position: 'relative',
  },
  socialBtnKakao: { backgroundColor: '#FEE500', borderColor: 'transparent', borderWidth: 1 },
  socialBtnGoogle: { backgroundColor: C.white, borderColor: C.border, borderWidth: 1 },
  socialBtnApple: { backgroundColor: C.dark, borderColor: 'transparent', borderWidth: 1 },
  socialBtnDisabled: { opacity: 0.5 },
  socialBtnText: { fontSize: 15, fontWeight: '600' },
  socialBtnTextKakao: { color: '#3D2A00' },
  socialBtnTextGoogle: { color: '#3D3D3D' },
  socialBtnTextApple: { color: C.white },
  legal: { fontSize: 11, color: C.textMuted, textAlign: 'center', lineHeight: 17 },
  legalLink: { textDecorationLine: 'underline' },
  errorBox: {
    backgroundColor: C.pinkLight,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  errorText: { color: C.pinkDeep, fontSize: 13, textAlign: 'center' },
});
```

주의: `socialBtnApple`/`socialBtnTextApple` 스타일과 `SocialVariant`의 `'apple'`은 렌더링에서 쓰이지 않지만, 다음 세션에 Apple 로그인 버튼을 다시 붙일 때 재사용하기 위해 의도적으로 남겨둔다.

- [ ] **Step 2: 타입체크로 검증**

Run: `npm run validate`
Expected: 에러 없이 통과 (미사용 지역 변수는 tsconfig에 `noUnusedLocals`가 없어 에러가 되지 않지만, 위 코드는 모든 import를 실제로 사용하므로 경고도 없어야 한다)

- [ ] **Step 3: Commit**

```bash
git add "app/(auth)/index.tsx"
git commit -m "refactor: remove email/password auth from login screen"
```

---

### Task 2: `app/account/change-password.tsx` 삭제 + `app/settings.tsx` 진입점 제거

**Files:**
- Delete: `app/account/change-password.tsx`
- Modify: `app/settings.tsx:13` (import), `app/settings.tsx:318-324` (ListRow)

- [ ] **Step 1: 비밀번호 변경 화면 파일 삭제**

```bash
git rm "app/account/change-password.tsx"
```

- [ ] **Step 2: `app/settings.tsx`에서 `Lock` import 제거**

`app/settings.tsx:13`을 다음으로 변경:

```tsx
  User, Users, Bell, Globe, Shield,
```

(기존: `User, Users, Lock, Bell, Globe, Shield,`)

- [ ] **Step 3: `app/settings.tsx`에서 "비밀번호" 메뉴 행 제거**

`app/settings.tsx:311-324`의 다음 블록:

```tsx
            <ListRow
              icon={<Users size={16} strokeWidth={1.8} color={C.text} />}
              label={t.rowCouple}
              value={coupleStatusLabel}
              trailing={<ChevronRight size={14} color={C.textFaint} />}
              onPress={() => router.push('/onboarding/couple-connect' as any)}
            />
            <ListRow
              icon={<Lock size={16} strokeWidth={1.8} color={C.text} />}
              label={t.rowPassword}
              trailing={<ChevronRight size={14} color={C.textFaint} />}
              onPress={() => router.push('/account/change-password' as any)}
              divider={false}
            />
```

를 다음으로 교체 (커플 연결 행의 `divider={false}` 속성만 추가, 비밀번호 행 삭제):

```tsx
            <ListRow
              icon={<Users size={16} strokeWidth={1.8} color={C.text} />}
              label={t.rowCouple}
              value={coupleStatusLabel}
              trailing={<ChevronRight size={14} color={C.textFaint} />}
              onPress={() => router.push('/onboarding/couple-connect' as any)}
              divider={false}
            />
```

- [ ] **Step 4: 타입체크로 검증**

Run: `npm run validate`
Expected: 에러 없이 통과 (`Lock`, `/account/change-password` 참조가 모두 제거되어야 함)

- [ ] **Step 5: Commit**

```bash
git add app/settings.tsx
git commit -m "refactor: remove password-change entry point from settings"
```

---

### Task 3: `locales/ko.json`, `locales/en.json` 정리

**Files:**
- Modify: `locales/ko.json:109-156` (`auth` 네임스페이스), `locales/ko.json:1495-1512` (`account.changePassword`), `locales/ko.json:76` (`rowPassword`)
- Modify: `locales/en.json` 동일 위치

- [ ] **Step 1: `locales/ko.json`의 `auth` 네임스페이스(109~156행)를 다음으로 교체**

```json
  "auth": {
    "appName": "Date Navi 💕",
    "subtitle": "데이트 계획, 혼자 다 하지 않아도 돼요.",
    "emailPlaceholder": "이메일",
    "passwordPlaceholder": "비밀번호 (6자 이상)",
    "signUp": "가입하기",
    "toSignUp": "계정이 없어요 → 가입하기",
    "toSignIn": "이미 계정이 있어요 → 로그인",
    "terms": "이용약관",
    "privacy": "개인정보처리방침",
    "languageHint": "언어",
    "errorGoogleFailed": "구글 로그인에 실패했어요. 다시 시도해주세요.",
    "errorKakaoFailed": "카카오 로그인에 실패했어요. 다시 시도해주세요.",
    "welcomeHeading": "\"오늘 뭐 하지?\"를\n가볍게 정해요",
    "welcomeBody": "둘의 취향과 오늘의 상태를 모아\n데이트 후보를 추천해드려요.",
    "kakaoStart": "카카오로 시작하기",
    "googleStart": "구글로 시작하기",
    "appleStart": "Apple로 시작하기",
    "or": "또는",
    "legalAgree": "가입하면 {{terms}}과 {{privacy}}에 동의하게 됩니다.",
    "legalPrefix": "가입하면 ",
    "legalMiddle": "과 ",
    "legalSuffix": "에 동의하게 됩니다."
  },
```

(제거된 키: `signIn`, `signingIn`, `errorEmail`, `errorPassword`, `errorGeneric`, `errorInvalidLogin`, `errorRegistered`, `errorNeedConfirmation`, `errorInvalidEmail`, `errorRateLimit`, `errorNetwork`, `emailStart`, `emailHeading`, `emailBody`, `emailLabel`, `passwordLabel`, `passwordCreatePlaceholder`, `requiredAgreement`, `submitSignUp`, `hasAccount`, `noAccount`, `requiredPrefix`, `requiredMiddle`, `requiredSuffix`. 기존에 이미 미사용이던 레거시 키(`emailPlaceholder`, `passwordPlaceholder`, `signUp`, `toSignUp`, `toSignIn`, `languageHint`, `legalAgree`)는 이번 작업 범위가 아니므로 그대로 유지.)

- [ ] **Step 2: `locales/en.json`의 `auth` 네임스페이스(109~156행)를 다음으로 교체**

```json
  "auth": {
    "appName": "Date Navi 💕",
    "subtitle": "You do not have to plan every date alone.",
    "emailPlaceholder": "Email",
    "passwordPlaceholder": "Password (6+ chars)",
    "signUp": "Sign up",
    "toSignUp": "No account yet? Sign up",
    "toSignIn": "Already have an account? Log in",
    "terms": "Terms of Service",
    "privacy": "Privacy Policy",
    "languageHint": "Language",
    "errorGoogleFailed": "Google sign-in failed. Please try again.",
    "errorKakaoFailed": "Kakao sign-in failed. Please try again.",
    "welcomeHeading": "Settle \"what should we do today?\"\nwith less pressure",
    "welcomeBody": "Bring together your tastes and today's mood\nto get date ideas that fit both of you.",
    "kakaoStart": "Continue with Kakao",
    "googleStart": "Continue with Google",
    "appleStart": "Continue with Apple",
    "or": "or",
    "legalAgree": "By signing up, you agree to the {{terms}} and {{privacy}}.",
    "legalPrefix": "By signing up, you agree to the ",
    "legalMiddle": " and ",
    "legalSuffix": "."
  },
```

- [ ] **Step 3: `locales/ko.json`의 `account.changePassword` 네임스페이스(1495~1512행) 삭제**

다음 블록을 통째로 제거하고, 그 앞 항목의 닫는 `}`만 남긴다:

```json
    "changePassword": {
      "heading": "비밀번호 변경",
      "subText": "안전한 비밀번호로 계정을 지켜주세요.",
      "currentLabel": "현재 비밀번호",
      "currentPlaceholder": "현재 비밀번호 입력",
      "newLabel": "새 비밀번호",
      "newPlaceholder": "새 비밀번호 입력",
      "confirmLabel": "새 비밀번호 확인",
      "confirmPlaceholder": "다시 한 번 입력",
      "infoNote": "8자 이상, 영문·숫자·특수문자 중 2가지 이상 조합을 추천해요.",
      "saveCta": "비밀번호 변경",
      "errorTitle": "비밀번호 오류",
      "tooShortError": "새 비밀번호는 8자 이상이어야 해요.",
      "mismatchError": "새 비밀번호가 일치하지 않아요.",
      "successTitle": "변경 완료",
      "successMessage": "비밀번호가 변경됐어요.",
      "saveError": "비밀번호 변경 중 문제가 생겼어요."
    }
```

이 블록 바로 앞에 오는 `account` 네임스페이스의 이전 항목(마지막 키) 뒤에 있던 쉼표(`,`)도 함께 제거해 유효한 JSON을 유지한다.

- [ ] **Step 4: `locales/en.json`의 `account.changePassword` 네임스페이스(1495~1512행) 동일하게 삭제**

```json
    "changePassword": {
      "heading": "Change password",
      "subText": "Keep your account safe with a strong password.",
      "currentLabel": "Current password",
      "currentPlaceholder": "Enter current password",
      "newLabel": "New password",
      "newPlaceholder": "Enter new password",
      "confirmLabel": "Confirm new password",
      "confirmPlaceholder": "Enter it once more",
      "infoNote": "We recommend 8+ characters combining at least 2 of: letters, numbers, symbols.",
      "saveCta": "Change password",
      "errorTitle": "Password error",
      "tooShortError": "Your new password must be at least 8 characters.",
      "mismatchError": "The new passwords don't match.",
      "successTitle": "Changed",
      "successMessage": "Your password has been changed.",
      "saveError": "Something went wrong changing your password."
    }
```

- [ ] **Step 5: `locales/ko.json:76`, `locales/en.json:76`에서 `rowPassword` 키 삭제**

`locales/ko.json:76`: `"rowPassword": "비밀번호 변경",` 삭제
`locales/en.json:76`: `"rowPassword": "Change password",` 삭제

- [ ] **Step 6: JSON 유효성 + 타입체크로 검증**

Run: `node -e "JSON.parse(require('fs').readFileSync('locales/ko.json','utf8')); JSON.parse(require('fs').readFileSync('locales/en.json','utf8')); console.log('valid json')"`
Expected: `valid json` 출력 (파싱 에러 없음)

Run: `npm run validate`
Expected: 에러 없이 통과

- [ ] **Step 7: Commit**

```bash
git add locales/ko.json locales/en.json
git commit -m "chore: remove unused email-auth i18n keys"
```

---

### Task 4: 전체 검증 + 시뮬레이터 육안 확인

**Files:** 없음 (검증 전용)

- [ ] **Step 1: 전체 타입체크**

Run: `npm run validate`
Expected: 에러 0건

- [ ] **Step 2: 전체 테스트 스위트 실행**

Run: `npx jest`
Expected: 기존 테스트 스위트 전부 통과 (`googleAuth.test.ts`, `kakaoAuth.test.ts` 포함, 영향 없음)

- [ ] **Step 3: `app/(auth)/index.tsx`, `app/settings.tsx`, `app/account/` 디렉토리에 이메일/비밀번호 관련 잔여 참조가 없는지 grep으로 재확인**

Run: `grep -rn "signInWithPassword\|auth.signUp\|change-password" app/ --include="*.tsx"`
Expected: 결과 없음 (아무 것도 출력되지 않아야 함)

- [ ] **Step 4: iOS 시뮬레이터에서 육안 확인**

EAS dev build 또는 기존 dev build로 앱을 실행해 로그인 화면에 카카오/구글 버튼만 보이고(애플 버튼 없음, 이메일 버튼 없음), 카카오 로그인이 정상 동작하는지 확인. 설정 화면에서 "비밀번호 변경" 메뉴가 사라졌는지 확인.

- [ ] **Step 5: `PLAN.md`, `RESULT.md` 갱신**

`PLAN.md`의 "애플 로그인 추가" 항목 위에 완료 항목 추가:
```
- [x] 이메일 로그인 방식 제거 (2026-07-08) — 코드 제거 + 기존 이메일 계정 2개 및 연관 데이터 DB 삭제. 애플 로그인은 Apple Developer Program 멤버십 필요로 보류.
```

`RESULT.md`에 이번 세션 요약 섹션 추가 (변경 파일 표, DB 삭제 내역, 기술 결정 — Apple capability는 유료 멤버십 없이 추가 불가하다는 사실 포함).

- [ ] **Step 6: Commit**

```bash
git add PLAN.md RESULT.md
git commit -m "docs: update PLAN/RESULT for email auth removal"
```
