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
