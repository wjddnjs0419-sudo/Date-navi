import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useRouter } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import { logEvent } from '../../lib/analytics';
import { signInWithGoogle, getGoogleSignInErrorMessageKey } from '../../lib/googleAuth';
import { isErrorWithCode } from '@react-native-google-signin/google-signin';
import { signInWithKakao, getKakaoSignInErrorMessageKey } from '../../lib/kakaoAuth';
import { socialButtonHeight, socialButtonRadius } from '../../lib/socialButtonMetrics';
import { C, SP, R } from '../../constants/theme';
import { useI18n } from '../../lib/i18n';
import { Wordmark } from '../../components/brand';
import { Illustration } from '../../components/illustration';

const KAKAO_BUTTON_IMAGE = {
  ko: require('../../kakao_login/ko/kakao_login_large_wide.png'),
  en: require('../../kakao_login/en/kakao_login_large_wide.png'),
} as const;

const SCREEN_WIDTH = Dimensions.get('window').width;
const SOCIAL_BUTTON_HEIGHT = socialButtonHeight(SCREEN_WIDTH);
const SOCIAL_BUTTON_RADIUS = socialButtonRadius(SOCIAL_BUTTON_HEIGHT);

export default function AuthScreen() {
  const router = useRouter();
  const { t, language } = useI18n();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [appleNotice, setAppleNotice] = useState(false);
  // Sign in with Apple은 Apple 플랫폼에서만 제공된다. 다른 곳에서 Apple 버튼을 노출하는 건
  // 브랜드 가이드 위반이라, 사용 가능할 때만 렌더한다.
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AppleAuthentication.isAvailableAsync()
      .then((available) => { if (!cancelled) setAppleAvailable(available); })
      .catch(() => { if (!cancelled) setAppleAvailable(false); });
    return () => { cancelled = true; };
  }, []);

  async function handleKakaoSignIn() {
    setErrorMsg('');
    setAppleNotice(false);
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
    setAppleNotice(false);
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

  // Apple 로그인 로직(expo-apple-authentication)은 아직 없다. 목업의 3번째 버튼 자리를
  // 비주얼로만 채우고, 탭하면 준비 중 안내만 보여준다. PHASE0-BACKMERGE 아님 — 별도 세션에서
  // 실제 Apple 로그인 로직을 붙일 때 이 핸들러를 교체한다.
  function handleApplePress() {
    setErrorMsg('');
    setAppleNotice(true);
  }

  return (
    <SafeAreaView style={s.screen}>
      <View style={s.heroContainer}>
        <View style={s.hero}>
          <Wordmark size="lg" style={s.wordmark} />

          <Text style={s.heading}>
            {t('auth.welcomeHeadingPrefix')}
            <Text style={s.headingHighlight}>{t('auth.welcomeHeadingHighlight')}</Text>
            {t('auth.welcomeHeadingSuffix')}
          </Text>
          <Text style={s.subText}>{t('auth.welcomeBody')}</Text>

          <Illustration
            name="date-course-map-horizontal"
            width={SCREEN_WIDTH}
            style={s.illustration}
          />
        </View>

        {/* 소셜 버튼 영역 */}
        <View style={s.btnArea}>
          <KakaoLoginButton
            language={language}
            label={t('auth.kakaoStart')}
            onPress={handleKakaoSignIn}
            disabled={loading}
          />
          <GoogleLoginButton
            label={t('auth.googleStart')}
            onPress={handleGoogleSignIn}
            disabled={loading}
          />
          {appleAvailable && (
            <AppleLoginButton
              label={t('auth.appleStart')}
              onPress={handleApplePress}
              disabled={loading}
            />
          )}
          {appleNotice && (
            <View style={s.noticeBox}>
              <Text style={s.noticeText}>{t('auth.appleComingSoon')}</Text>
            </View>
          )}
          {errorMsg !== '' && (
            <View style={s.errorBox}>
              <Text style={s.errorText}>{errorMsg}</Text>
            </View>
          )}
          <Text style={s.legal}>
            {t('auth.legalPrefix')}<Text accessibilityRole="link" style={s.legalLink} onPress={() => router.push('/legal/terms' as any)}>{t('auth.terms')}</Text>
            {t('auth.legalMiddle')}<Text accessibilityRole="link" style={s.legalLink} onPress={() => router.push('/legal/privacy' as any)}>{t('auth.privacy')}</Text>{t('auth.legalSuffix')}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

function KakaoLoginButton({ language, label, onPress, disabled }: {
  language: 'ko' | 'en'; label: string; onPress: () => void; disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[s.kakaoBtn, disabled && s.socialBtnDisabled]}
    >
      <Image
        testID="kakao-official-button"
        source={KAKAO_BUTTON_IMAGE[language] ?? KAKAO_BUTTON_IMAGE.ko}
        style={s.kakaoImage}
        resizeMode="contain"
        accessible={false}
      />
    </TouchableOpacity>
  );
}

function GoogleLoginButton({ label, onPress, disabled }: {
  label: string; onPress: () => void; disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[s.socialBtn, s.socialBtnGoogle, disabled && s.socialBtnDisabled]}
    >
      <GoogleGLogo />
      <Text style={[s.socialBtnText, s.socialBtnTextGoogle]}>{label}</Text>
    </TouchableOpacity>
  );
}

// Apple 공식 버튼. 로고·문구·다국어·터치 피드백을 전부 Apple 네이티브 뷰가 그리므로
// 라벨이나 아이콘을 직접 그리면 안 된다(브랜드 가이드). 우리가 정할 수 있는 건
// 타입(SIGN_IN)·색(BLACK)·코너 반경·크기뿐이다.
function AppleLoginButton({ label, onPress, disabled }: {
  label: string; onPress: () => void; disabled?: boolean;
}) {
  return (
    <AppleAuthentication.AppleAuthenticationButton
      testID="apple-login-button"
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={SOCIAL_BUTTON_RADIUS}
      accessibilityLabel={label}
      onPress={disabled ? () => {} : onPress}
      style={[s.appleBtn, disabled && s.socialBtnDisabled]}
    />
  );
}

// Google 공식 4색 "G" 로고. 색상·형태는 브랜딩 가이드 고정값이라 변경 금지.
function GoogleGLogo() {
  return (
    <Svg testID="google-g-logo" width={18} height={18} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  heroContainer: {
    flex: 1,
    paddingHorizontal: SP.xxl,
    paddingTop: SP.sm,
    paddingBottom: SP.xxxl,
    justifyContent: 'space-between',
  },
  hero: { alignItems: 'center' },
  wordmark: { marginTop: SP.lg, marginBottom: SP.xxl },
  heading: {
    fontSize: 26,
    fontWeight: '800',
    color: C.text,
    textAlign: 'center',
    lineHeight: 34,
  },
  headingHighlight: { color: C.pink },
  subText: {
    fontSize: 13,
    color: C.textSub,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: SP.md,
  },
  illustration: { marginTop: SP.xxl },
  btnArea: { gap: SP.md },
  socialBtn: {
    height: SOCIAL_BUTTON_HEIGHT,
    borderRadius: SOCIAL_BUTTON_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: SP.sm,
  },
  socialBtnGoogle: { backgroundColor: C.white, borderColor: '#747775', borderWidth: 1 },
  appleBtn: { height: SOCIAL_BUTTON_HEIGHT, width: '100%' },
  kakaoBtn: { height: SOCIAL_BUTTON_HEIGHT },
  kakaoImage: { width: '100%', height: '100%' },
  socialBtnDisabled: { opacity: 0.5 },
  // Google 브랜딩 가이드: 라이트 버튼 텍스트 색 #1F1F1F.
  socialBtnText: { fontSize: 15, fontWeight: '600' },
  socialBtnTextGoogle: { color: '#1F1F1F' },
  legal: { fontSize: 11, color: C.textMuted, textAlign: 'center', lineHeight: 17 },
  legalLink: { textDecorationLine: 'underline' },
  noticeBox: { paddingVertical: SP.xs },
  noticeText: { color: C.textSub, fontSize: 12, textAlign: 'center' },
  errorBox: {
    backgroundColor: C.pinkLight,
    borderRadius: R.sm,
    padding: SP.md,
    marginTop: SP.md,
  },
  errorText: { color: C.pinkDeep, fontSize: 13, textAlign: 'center' },
});
