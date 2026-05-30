import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, SafeAreaView, TextInput, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Camera, Check } from 'lucide-react-native';
import { C } from '../../constants/colors';
import { BackBar, BigButton, ListGroup, ListRow, SectionLabel } from '../../components/ui';

const PLANNING_STYLES = [
  '자주 계획하는 편이에요',
  '같이 정하는 편이에요',
  '고르는 건 괜찮지만 계획은 어려워요',
  '의견을 말하기가 조금 어려워요',
  '그때그때 달라요',
];

export default function EditProfileScreen() {
  const router = useRouter();

  const [nickname, setNickname] = useState('');
  const [planningStyle, setPlanningStyle] = useState(2);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [initials, setInitials] = useState('나');

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from('date_planner_profiles')
          .select('display_name')
          .eq('user_id', user.id)
          .maybeSingle();

        if (profile?.display_name) {
          setNickname(profile.display_name);
          setInitials(profile.display_name.slice(0, 1));
        }

        const { data: prefs } = await supabase
          .from('user_preferences')
          .select('planning_style')
          .eq('user_id', user.id)
          .maybeSingle();

        if (prefs?.planning_style) {
          const idx = PLANNING_STYLES.findIndex(s => s === prefs.planning_style);
          if (idx >= 0) setPlanningStyle(idx);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSave() {
    const trimmed = nickname.trim();
    if (!trimmed) { Alert.alert('닉네임을 입력해주세요.'); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('no user');

      const { error: profileError } = await supabase
        .from('date_planner_profiles')
        .update({ display_name: trimmed })
        .eq('user_id', user.id);
      if (profileError) throw profileError;

      // 계획 성향 저장은 best-effort — 실패해도 닉네임 저장/이동을 막지 않는다.
      try {
        const { error: prefsError } = await supabase
          .from('user_preferences')
          .upsert(
            { user_id: user.id, planning_style: PLANNING_STYLES[planningStyle] },
            { onConflict: 'user_id' },
          );
        if (prefsError) console.warn('planning_style 저장 실패:', prefsError.message);
      } catch (e) {
        console.warn('planning_style 저장 예외:', e);
      }

      Alert.alert('저장 완료', '프로필이 업데이트됐어요.');
      router.back();
    } catch {
      Alert.alert('오류', '저장 중 문제가 생겼어요.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFF8F3', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={C.pink} />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFF8F3' }}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <BackBar />
        <Text style={[s.heading, { marginTop: 16 }]}>프로필 수정</Text>

        <View style={s.avatarWrap}>
          <TouchableOpacity
            onPress={() => Alert.alert('사진 변경', '이미지 선택 기능은 곧 업데이트될 예정이에요.')}
            activeOpacity={0.8}
          >
            <View style={s.avatar}>
              <Text style={s.avatarText}>{initials}</Text>
              <View style={s.avatarCamera}>
                <Camera size={16} strokeWidth={1.8} color={C.text} />
              </View>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ marginTop: 12 }}
            onPress={() => Alert.alert('사진 변경', '이미지 선택 기능은 곧 업데이트될 예정이에요.')}
          >
            <Text style={s.changePhotoBtn}>사진 변경하기</Text>
          </TouchableOpacity>
        </View>

        <View style={{ marginTop: 28 }}>
          <SectionLabel>닉네임</SectionLabel>
          <ListGroup>
            <ListRow
              label={
                <TextInput
                  style={s.nicknameInput}
                  value={nickname}
                  onChangeText={t => {
                    setNickname(t);
                    if (t.length > 0) setInitials(t.slice(0, 1));
                  }}
                  maxLength={12}
                  returnKeyType="done"
                />
              }
              divider={false}
              trailing={<Text style={s.charCount}>{nickname.length}/12</Text>}
            />
          </ListGroup>
          <Text style={s.fieldHint}>한글, 영문, 숫자 2~12자</Text>
        </View>

        <View style={{ marginTop: 20 }}>
          <SectionLabel>나는 데이트 계획할 때 보통...</SectionLabel>
          <ListGroup>
            {PLANNING_STYLES.map((option, i, arr) => (
              <ListRow
                key={option}
                onPress={() => setPlanningStyle(i)}
                label={
                  <Text style={{ color: i === planningStyle ? C.pinkDeep : C.text, fontWeight: i === planningStyle ? '600' : '500', fontSize: 14 }}>
                    {option}
                  </Text>
                }
                trailing={
                  i === planningStyle ? (
                    <View style={s.checkCircle}>
                      <Check size={11} color={C.white} strokeWidth={3} />
                    </View>
                  ) : null
                }
                divider={i < arr.length - 1}
              />
            ))}
          </ListGroup>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      <View style={s.footer}>
        <BigButton onPress={handleSave} variant={saving ? 'disabled' : 'primary'}>
          {saving ? <ActivityIndicator color={C.white} size="small" /> : '변경사항 저장'}
        </BigButton>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text },
  avatarWrap: { alignItems: 'center', marginTop: 24 },
  avatar: {
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: C.pinkMid,
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  avatarText: { fontSize: 40, fontWeight: '800', color: C.white },
  avatarCamera: {
    position: 'absolute', bottom: 0, right: 0,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.white,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: C.border,
  },
  changePhotoBtn: { fontSize: 13, color: C.pinkDeep, fontWeight: '600' },
  nicknameInput: { fontSize: 14, color: C.text, fontWeight: '500', flex: 1 },
  charCount: { fontSize: 11, color: C.textLight },
  fieldHint: { fontSize: 11, color: C.textMuted, marginTop: 6, paddingHorizontal: 4 },
  checkCircle: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: C.pink,
    alignItems: 'center', justifyContent: 'center',
  },
  footer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 12,
    backgroundColor: '#FFF8F3',
  },
});
