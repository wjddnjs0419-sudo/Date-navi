import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { logEvent } from '../../lib/analytics';
import { signInWithGoogle, getGoogleSignInErrorMessageKey } from '../../lib/googleAuth';
import { isErrorWithCode } from '@react-native-google-signin/google-signin';
import { signInWithKakao, getKakaoSignInErrorMessageKey } from '../../lib/kakaoAuth';
import { C } from '../../constants/colors';
import { G } from '../../constants/theme';
import { useI18n } from '../../lib/i18n';

const KAKAO_BUTTON_IMAGE = {
  ko: require('../../kakao_login/ko/kakao_login_large_wide.png'),
  en: require('../../kakao_login/en/kakao_login_large_wide.png'),
} as const;

// 카카오 공식 버튼 이미지 원본 비율(600×90). 높이 = 폭 / 이 값.
const KAKAO_BUTTON_RATIO = 600 / 90;
// 이미지에 내장된 코너 반경(측정값 7px / 원본 높이 90px). 이미지는 변형하지 않고,
// 구글 버튼 반경을 같은 비율로 맞춰 두 버튼의 코너를 일치시킨다.
const KAKAO_CORNER_RATIO = 7 / 90;
const CONTENT_WIDTH = Dimensions.get('window').width - 48; // welcomeContainer paddingHorizontal 24 * 2
const SOCIAL_BUTTON_HEIGHT = Math.round(CONTENT_WIDTH / KAKAO_BUTTON_RATIO);
const SOCIAL_BUTTON_RADIUS = Math.round(SOCIAL_BUTTON_HEIGHT * KAKAO_CORNER_RATIO);

export default function AuthScreen() {
  const { t, language } = useI18n();
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
    height: SOCIAL_BUTTON_HEIGHT,
    borderRadius: SOCIAL_BUTTON_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  socialBtnGoogle: { backgroundColor: C.white, borderColor: '#747775', borderWidth: 1 },
  kakaoBtn: { height: SOCIAL_BUTTON_HEIGHT },
  kakaoImage: { width: '100%', height: '100%' },
  socialBtnDisabled: { opacity: 0.5 },
  // Google 브랜딩 가이드: 라이트 버튼 텍스트 색 #1F1F1F.
  socialBtnText: { fontSize: 15, fontWeight: '600' },
  socialBtnTextGoogle: { color: '#1F1F1F' },
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
