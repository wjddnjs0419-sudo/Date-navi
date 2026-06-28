import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert,
  ScrollView, Share, ActivityIndicator, SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { logEvent } from '../../lib/analytics';
import { Copy, Share2 } from 'lucide-react-native';
import { C } from '../../constants/colors';
import { BackBar, BigButton, SoftCard } from '../../components/ui';

function makeCode() {
  return 'DN-' + Math.random().toString(36).slice(2, 6).toUpperCase();
}

export default function CoupleConnectScreen() {
  const router = useRouter();
  const [myCode, setMyCode] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [loading, setLoading] = useState(false);

  async function createCode() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('로그인 정보를 찾을 수 없어요.');

      const code = makeCode();

      const { data: couple, error } = await supabase
        .from('date_planner_couples')
        .insert({ id: user.id, code: code.replace('DN-', ''), owner_user_id: user.id, status: 'waiting' })
        .select('id')
        .single();
      if (error) throw error;

      await supabase
        .from('date_planner_profiles')
        .update({ couple_id: couple.id, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);

      setMyCode(code);
    } catch (e: any) {
      const msg = e.message ?? '';
      if (msg.includes('duplicate') || msg.includes('already')) {
        Alert.alert('이미 연결된 계정이에요.', '기존 코드를 사용해주세요.');
      } else {
        Alert.alert('오류', '코드 생성 중 오류가 발생했어요.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function joinWithCode() {
    const raw = inputCode.trim().toUpperCase().replace('DN-', '');
    if (!raw) { Alert.alert('초대 코드를 입력해주세요.'); return; }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('로그인 정보를 찾을 수 없어요.');

      const { data: couple, error: findError } = await supabase
        .from('date_planner_couples')
        .select('id, owner_user_id')
        .eq('code', raw)
        .eq('status', 'waiting')
        .maybeSingle();

      if (findError) throw findError;
      if (!couple) { Alert.alert('코드를 찾을 수 없어요.', '코드를 다시 확인해주세요.'); return; }
      if (couple.owner_user_id === user.id) { Alert.alert('내 코드예요.', '상대방의 코드를 입력해주세요.'); return; }

      const { error: updateError } = await supabase
        .from('date_planner_couples')
        .update({ partner_user_id: user.id, status: 'linked', linked_at: new Date().toISOString() })
        .eq('id', couple.id);
      if (updateError) throw updateError;

      await Promise.all([
        supabase.from('date_planner_profiles')
          .update({ couple_id: couple.id, updated_at: new Date().toISOString() })
          .eq('user_id', user.id),
        supabase.from('date_planner_profiles')
          .update({ couple_id: couple.id, updated_at: new Date().toISOString() })
          .eq('user_id', couple.owner_user_id),
      ]);

      await logEvent('couple_connected');
      await supabase.auth.refreshSession();
      router.replace('/onboarding/connected' as any);
    } catch (e: any) {
      Alert.alert('오류', '연결 중 오류가 발생했어요.');
    } finally {
      setLoading(false);
    }
  }

  // 커플 연결을 건너뛰면 솔로 모드: couple_id를 자기 user.id로 설정해
  // 저장/후보 조회가 동작하게 한다. (나중에 실제 연결 시 couple_id가 갱신됨)
  async function skipConnect() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // couple_id는 date_planner_couples를 참조하므로 솔로용 couple 행을 먼저 만든다.
        await supabase
          .from('date_planner_couples')
          .upsert(
            {
              id: user.id,
              code: user.id.replace(/-/g, '').slice(0, 8).toUpperCase(),
              owner_user_id: user.id,
              status: 'waiting',
            },
            { onConflict: 'id', ignoreDuplicates: true },
          );

        await supabase
          .from('date_planner_profiles')
          .update({ couple_id: user.id, updated_at: new Date().toISOString() })
          .eq('user_id', user.id)
          .is('couple_id', null);
      }
    } catch {
      // 실패해도 온보딩은 진행 (다음 진입 시 재시도됨)
    }
    router.replace('/onboarding/preferences' as any);
  }

  const displayCode = myCode || 'DN-????';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFF8F3' }}>
      <ScrollView
        contentContainerStyle={s.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <BackBar />

        <View style={{ marginTop: 16 }}>
          <Text style={s.heading}>연인과 연결해볼까요?</Text>
          <Text style={s.subText}>
            데이트 후보를 함께 고르고,{'\n'}서로의 반응을 볼 수 있어요.
          </Text>
        </View>

        {/* 초대 코드 카드 */}
        <SoftCard style={s.inviteCard}>
          <Text style={s.inviteLabel}>내 초대 코드</Text>
          <View style={s.codeRow}>
            <Text style={s.codeText}>{displayCode}</Text>
            {myCode ? (
              <TouchableOpacity
                style={s.iconBtn}
                onPress={() => Share.share({ message: `Date Navi 초대 코드: ${myCode}` })}
              >
                <Copy size={15} color={C.textSub} />
              </TouchableOpacity>
            ) : null}
          </View>
          {!myCode ? (
            <BigButton onPress={createCode} variant={loading ? 'disabled' : 'primary'} style={{ marginTop: 12 }}>
              {loading ? <ActivityIndicator color={C.white} size="small" /> : '초대 코드 만들기'}
            </BigButton>
          ) : (
            <TouchableOpacity
              style={s.shareBtn}
              onPress={() => Share.share({ message: `Date Navi 초대 코드: ${myCode}` })}
            >
              <Share2 size={15} color={C.pinkDeep} />
              <Text style={s.shareBtnText}>초대 링크 공유하기</Text>
            </TouchableOpacity>
          )}
        </SoftCard>

        {/* 구분선 */}
        <View style={s.divider}>
          <View style={s.dividerLine} />
          <Text style={s.dividerText}>또는</Text>
          <View style={s.dividerLine} />
        </View>

        {/* 코드 입력 */}
        <View style={s.fieldBox}>
          <Text style={s.fieldLabel}>초대 코드 입력</Text>
          <TextInput
            style={s.fieldInput}
            placeholder="DN-____"
            placeholderTextColor={C.textFaint}
            value={inputCode}
            onChangeText={(t) => setInputCode(t.toUpperCase())}
            maxLength={7}
            autoCapitalize="characters"
          />
        </View>

        <View style={{ marginTop: 12 }}>
          <BigButton onPress={joinWithCode} variant="secondary">
            코드 입력하고 연결하기
          </BigButton>
        </View>

        <View style={{ flex: 1, minHeight: 32 }} />

        <TouchableOpacity
          style={{ alignItems: 'center', paddingVertical: 12 }}
          onPress={skipConnect}
        >
          <Text style={s.skipText}>나중에 연결할게요</Text>
        </TouchableOpacity>

        <Text style={s.footerText}>
          상대가 아직 가입하지 않아도 링크를 보낼 수 있어요.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 29 },
  subText: { fontSize: 13, color: '#8A7F76', lineHeight: 20, marginTop: 8 },
  inviteCard: {
    marginTop: 24,
    backgroundColor: C.cream,
    padding: 20,
  },
  inviteLabel: { fontSize: 11, color: C.creamFg, fontWeight: '600', letterSpacing: 0.4 },
  codeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  codeText: { fontSize: 28, fontWeight: '800', color: C.text, letterSpacing: 4 },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: C.white,
    borderRadius: 14,
    paddingVertical: 12,
    marginTop: 16,
  },
  shareBtnText: { fontSize: 13, fontWeight: '600', color: C.pinkDeep },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 24 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#F2E0DC' },
  dividerText: { fontSize: 11, color: C.textMuted },
  fieldBox: {
    backgroundColor: C.white,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  fieldLabel: { fontSize: 11, color: '#B8AEA6', marginBottom: 4 },
  fieldInput: { fontSize: 16, color: C.textFaint, letterSpacing: 4, fontWeight: '600' },
  skipText: { fontSize: 12, color: C.textMuted },
  footerText: { fontSize: 11, color: C.textMuted, textAlign: 'center', marginTop: 8 },
});
