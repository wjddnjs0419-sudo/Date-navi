import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { logEvent } from '../../lib/analytics';
import { Mail, Check } from 'lucide-react-native';
import { C } from '../../constants/colors';
import { G } from '../../constants/theme';
import { BigButton } from '../../components/ui';
import { useI18n } from '../../lib/i18n';

type Mode = 'welcome' | 'email';

type SocialVariant = 'kakao' | 'google' | 'apple';

function toLocalizedError(message: string, t: (key: string) => string): string {
  if (message.includes('Invalid login credentials')) return t('auth.errorInvalidLogin');
  if (message.includes('User already registered')) return t('auth.errorRegistered');
  if (message.includes('Password should be at least')) return t('auth.errorPassword');
  if (message.includes('Email not confirmed')) return t('auth.errorNeedConfirmation');
  if (message.includes('Invalid email') || message.includes('valid email')) return t('auth.errorInvalidEmail');
  if (message.includes('rate limit') || message.includes('Too many')) return t('auth.errorRateLimit');
  if (message.includes('Network') || message.includes('fetch') || message.includes('Failed')) {
    return t('auth.errorNetwork');
  }
  return t('auth.errorGeneric');
}

export default function AuthScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>('welcome');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [agreed, setAgreed] = useState(true);

  async function handleAuth() {
    setErrorMsg('');
    if (!email.trim()) { setErrorMsg(t('auth.errorEmail')); return; }
    if (!email.includes('@')) { setErrorMsg(t('auth.errorInvalidEmail')); return; }
    if (password.length < 6) { setErrorMsg(t('auth.errorPassword')); return; }

    setLoading(true);
    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        await logEvent('signup', { method: 'email' });
        if (!data.session) {
          const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
          if (signInError) throw signInError;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        await logEvent('login', { method: 'email' });
      }
    } catch (e: any) {
      setErrorMsg(toLocalizedError(e.message ?? '', t));
    } finally {
      setLoading(false);
    }
  }

  if (mode === 'welcome') {
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
              onPress={() => setMode('email')}
            />
            <SocialButton
              variant="google"
              label={t('auth.googleStart')}
              onPress={() => setMode('email')}
            />
            <SocialButton
              variant="apple"
              label={t('auth.appleStart')}
              onPress={() => setMode('email')}
            />
            <View style={s.divider}>
              <View style={s.dividerLine} />
              <Text style={s.dividerText}>{t('auth.or')}</Text>
              <View style={s.dividerLine} />
            </View>
            <TouchableOpacity
              onPress={() => setMode('email')}
              style={[s.socialBtn, s.emailBtn]}
            >
              <View style={s.emailIcon}>
                <Mail size={16} color={C.pinkDeep} />
              </View>
              <Text style={[s.socialBtnText, s.emailBtnText]}>{t('auth.emailStart')}</Text>
            </TouchableOpacity>
            <Text style={s.legal}>
              {t('auth.legalPrefix')}<Text style={s.legalLink}>{t('auth.terms')}</Text>
              {t('auth.legalMiddle')}<Text style={s.legalLink}>{t('auth.privacy')}</Text>{t('auth.legalSuffix')}
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // 이메일 로그인/회원가입 화면
  return (
    <KeyboardAvoidingView
      style={G.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <SafeAreaView style={s.safe}>
        <ScrollView
          contentContainerStyle={s.emailContainer}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* 뒤로가기 */}
          <TouchableOpacity onPress={() => setMode('welcome')} style={s.backBtn}>
            <Text style={s.backText}>‹</Text>
          </TouchableOpacity>

          <Text style={s.heading}>{t('auth.emailHeading')}</Text>
          <Text style={[s.subText, s.emailSub]}>
            {t('auth.emailBody')}
          </Text>

          <View style={s.fieldGroup}>
            <View style={s.fieldBox}>
              <Text style={s.fieldLabel}>{t('auth.emailLabel')}</Text>
              <TextInput
                style={s.fieldInput}
                placeholder="you@datemate.app"
                placeholderTextColor={C.textFaint}
                value={email}
                onChangeText={(t) => { setEmail(t); setErrorMsg(''); }}
                autoCapitalize="none"
                keyboardType="email-address"
                returnKeyType="next"
              />
            </View>
            <View style={s.fieldBox}>
              <Text style={s.fieldLabel}>{t('auth.passwordLabel')}</Text>
              <TextInput
                style={s.fieldInput}
                placeholder={t('auth.passwordCreatePlaceholder')}
                placeholderTextColor={C.textFaint}
                value={password}
                onChangeText={(t) => { setPassword(t); setErrorMsg(''); }}
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={handleAuth}
              />
            </View>
          </View>

          {/* 약관 동의 */}
          <View style={s.agreeBlock}>
            <TouchableOpacity
              onPress={() => setAgreed(!agreed)}
              style={s.checkRow}
            >
              <View style={[s.checkBox, agreed ? s.checkBoxOn : s.checkBoxOff]}>
                {agreed && <Check size={13} color={C.white} strokeWidth={3} />}
              </View>
              <Text style={s.checkLabel}>
                {t('auth.requiredPrefix')}<Text style={s.legalLink}>{t('auth.terms')}</Text>
                {t('auth.requiredMiddle')}<Text style={s.legalLink}>{t('auth.privacy')}</Text>{t('auth.requiredSuffix')}
              </Text>
            </TouchableOpacity>
          </View>

          {errorMsg !== '' && (
            <View style={s.errorBox}>
              <Text style={s.errorText}>{errorMsg}</Text>
            </View>
          )}

          <View style={s.submitBlock}>
            <BigButton
              onPress={handleAuth}
              variant={loading ? 'disabled' : 'primary'}
            >
              {loading ? t('auth.signingIn') : isSignUp ? t('auth.submitSignUp') : t('auth.signIn')}
            </BigButton>
          </View>

          <TouchableOpacity
            onPress={() => { setIsSignUp(!isSignUp); setErrorMsg(''); }}
            style={s.toggleBtn}
          >
            <Text style={s.toggleText}>
              {isSignUp ? t('auth.hasAccount') : t('auth.noAccount')}
              <Text style={s.toggleStrong}>
                {isSignUp ? t('auth.signIn') : t('auth.submitSignUp')}
              </Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

function SocialButton({ variant, label, onPress }: {
  variant: SocialVariant; label: string; onPress: () => void;
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
      activeOpacity={0.85}
      style={[s.socialBtn, buttonStyle]}
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
  socialBtnText: { fontSize: 15, fontWeight: '600' },
  socialBtnTextKakao: { color: '#3D2A00' },
  socialBtnTextGoogle: { color: '#3D3D3D' },
  socialBtnTextApple: { color: C.white },
  emailBtn: { backgroundColor: C.white, borderColor: C.pinkBorder, borderWidth: 1 },
  emailIcon: { position: 'absolute', left: 20 },
  emailBtnText: { color: C.pinkDeep },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.border },
  dividerText: { fontSize: 11, color: C.textMuted },
  legal: { fontSize: 11, color: C.textMuted, textAlign: 'center', lineHeight: 17 },
  legalLink: { textDecorationLine: 'underline' },

  safe: { flex: 1 },
  emailSub: { marginTop: 8 },
  fieldGroup: { gap: 10, marginTop: 24 },
  emailContainer: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
  },
  backBtn: { marginLeft: -8, padding: 4, alignSelf: 'flex-start', marginBottom: 20 },
  backText: { fontSize: 28, color: C.text, fontWeight: '300' },
  fieldBox: {
    backgroundColor: C.white,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  fieldLabel: { fontSize: 11, color: C.textLight, marginBottom: 4 },
  fieldInput: { fontSize: 15, color: C.text, fontWeight: '500' },
  agreeBlock: { marginTop: 20, gap: 10 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBoxOn: { backgroundColor: C.pink },
  checkBoxOff: { backgroundColor: C.border },
  checkLabel: { fontSize: 12, color: C.text, flex: 1, lineHeight: 18 },
  errorBox: {
    backgroundColor: C.pinkLight,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  errorText: { color: C.pinkDeep, fontSize: 13, textAlign: 'center' },
  submitBlock: { marginTop: 24 },
  toggleBtn: { marginTop: 16, alignItems: 'center' },
  toggleText: { fontSize: 13, color: C.textSub },
  toggleStrong: { color: C.pinkDeep, fontWeight: '600' },
});
