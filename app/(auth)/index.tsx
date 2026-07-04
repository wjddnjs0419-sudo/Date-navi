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

type Mode = 'welcome' | 'email';

function toLocalizedError(message: string): string {
  if (message.includes('Invalid login credentials')) return '이메일 또는 비밀번호가 올바르지 않아요.';
  if (message.includes('User already registered')) return '이미 가입된 이메일이에요.';
  if (message.includes('Password should be at least')) return '비밀번호는 6자 이상이어야 해요.';
  if (message.includes('Email not confirmed')) return '이메일 인증이 필요해요.';
  if (message.includes('Invalid email') || message.includes('valid email')) return '이메일 형식이 올바르지 않아요.';
  if (message.includes('rate limit') || message.includes('Too many')) return '잠시 후 다시 시도해주세요.';
  if (message.includes('Network') || message.includes('fetch') || message.includes('Failed')) {
    return '네트워크 연결을 확인해주세요.';
  }
  return '오류가 발생했어요. 다시 시도해주세요.';
}

export default function AuthScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('welcome');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [agreed, setAgreed] = useState(true);

  async function handleAuth() {
    setErrorMsg('');
    if (!email.trim()) { setErrorMsg('이메일을 입력해주세요.'); return; }
    if (!email.includes('@')) { setErrorMsg('이메일 형식이 올바르지 않아요.'); return; }
    if (password.length < 6) { setErrorMsg('비밀번호는 6자 이상이어야 해요.'); return; }

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
      setErrorMsg(toLocalizedError(e.message ?? ''));
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
            <Text style={s.heading}>"오늘 뭐 하지?"를{'\n'}가볍게 정해요</Text>
            <Text style={s.subText}>
              둘의 취향과 오늘의 상태를 모아{'\n'}데이트 후보를 추천해드려요.
            </Text>
          </View>

          <View style={s.spacer} />

          {/* 소셜 버튼 영역 */}
          <View style={s.btnArea}>
            <SocialButton
              color="#FEE500"
              textColor="#3D2A00"
              label="카카오로 시작하기"
              onPress={() => setMode('email')}
            />
            <SocialButton
              color={C.white}
              textColor="#3D3D3D"
              border={C.border}
              label="구글로 시작하기"
              onPress={() => setMode('email')}
            />
            <SocialButton
              color={C.dark}
              textColor={C.white}
              label="Apple로 시작하기"
              onPress={() => setMode('email')}
            />
            <View style={s.divider}>
              <View style={s.dividerLine} />
              <Text style={s.dividerText}>또는</Text>
              <View style={s.dividerLine} />
            </View>
            <TouchableOpacity
              onPress={() => setMode('email')}
              style={[s.socialBtn, s.emailBtn]}
            >
              <View style={s.emailIcon}>
                <Mail size={16} color={C.pinkDeep} />
              </View>
              <Text style={[s.socialBtnText, s.emailBtnText]}>이메일로 시작하기</Text>
            </TouchableOpacity>
            <Text style={s.legal}>
              가입하면 <Text style={s.legalLink}>이용약관</Text>과{' '}
              <Text style={s.legalLink}>개인정보처리방침</Text>에 동의하게 됩니다.
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

          <Text style={s.heading}>이메일로 시작하기</Text>
          <Text style={[s.subText, s.emailSub]}>
            로그인에 사용할 이메일과 비밀번호를 알려주세요.
          </Text>

          <View style={s.fieldGroup}>
            <View style={s.fieldBox}>
              <Text style={s.fieldLabel}>이메일</Text>
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
              <Text style={s.fieldLabel}>비밀번호</Text>
              <TextInput
                style={s.fieldInput}
                placeholder="영문·숫자 포함 8자 이상"
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
                (필수) <Text style={s.legalLink}>이용약관</Text>·
                <Text style={s.legalLink}>개인정보처리방침</Text> 동의
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
              {loading ? '처리 중...' : isSignUp ? '회원가입' : '로그인'}
            </BigButton>
          </View>

          <TouchableOpacity
            onPress={() => { setIsSignUp(!isSignUp); setErrorMsg(''); }}
            style={s.toggleBtn}
          >
            <Text style={s.toggleText}>
              {isSignUp ? '이미 계정이 있으신가요? ' : '계정이 없으신가요? '}
              <Text style={s.toggleStrong}>
                {isSignUp ? '로그인' : '회원가입'}
              </Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

function SocialButton({ color, textColor, border, label, onPress }: {
  color: string; textColor: string; border?: string; label: string; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[s.socialBtn, { backgroundColor: color, borderColor: border ?? 'transparent', borderWidth: border ? 1 : 0 }]}
    >
      <Text style={[s.socialBtnText, { color: textColor }]}>{label}</Text>
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
  socialBtnText: { fontSize: 15, fontWeight: '600' },
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
