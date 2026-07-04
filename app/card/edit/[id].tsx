import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { C } from '../../../constants/colors';
import { G } from '../../../constants/theme';
import { BackBar, BigButton } from '../../../components/ui';
import { DurationWheelPicker } from '../../../components/pickers';

const TIME_OPTIONS = ['1~2시간', '2~3시간', '반나절', '하루 종일'];

export default function EditCardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [time, setTime] = useState('');
  const [budget, setBudget] = useState('');

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const { data } = await supabase
          .from('date_cards')
          .select('title, summary, estimated_time, estimated_budget')
          .eq('id', id)
          .maybeSingle();
        if (!active) return;
        if (data) {
          setTitle(data.title ?? '');
          setSummary(data.summary ?? '');
          setTime(data.estimated_time ?? '');
          setBudget(data.estimated_budget ?? '');
        }
        setLoading(false);
      })();
      return () => { active = false; };
    }, [id]),
  );

  const canSave = title.trim().length > 0;
  const timeOptions = [
    { value: '', label: '선택 안 함' },
    ...(time && !TIME_OPTIONS.includes(time) ? [{ value: time, label: `기존 값 · ${time}` }] : []),
    ...TIME_OPTIONS.map((t) => ({ value: t, label: t })),
  ];

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('date_cards')
        .update({
          title: title.trim(),
          summary: summary.trim(),
          estimated_time: time.trim(),
          estimated_budget: budget.trim(),
        })
        .eq('id', id);
      if (error) throw error;
      router.back();
    } catch {
      Alert.alert('오류', '수정 중 문제가 발생했어요.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={[G.screen, G.center]}>
        <ActivityIndicator size="large" color={C.pink} />
      </View>
    );
  }

  return (
    <SafeAreaView style={G.screen}>
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <BackBar onPress={() => router.back()} />

        <Text style={[s.heading, s.headingTop]}>후보 수정하기</Text>
        <Text style={s.subText}>내용을 바꾼 뒤 저장하면 후보에 반영돼요.</Text>

        <Text style={s.label}>제목 *</Text>
        <View style={[s.inputWrap, title.length > 0 && s.inputWrapActive]}>
          <TextInput
            style={s.input}
            value={title}
            onChangeText={setTitle}
            placeholder="제목"
            placeholderTextColor={C.textFaint}
            maxLength={60}
          />
        </View>

        <Text style={s.label}>설명</Text>
        <View style={s.inputWrap}>
          <TextInput
            style={[s.input, s.inputMultiline]}
            value={summary}
            onChangeText={setSummary}
            placeholder="어떤 데이트인지 적어주세요"
            placeholderTextColor={C.textFaint}
            multiline
            maxLength={300}
          />
        </View>

        <Text style={s.label}>예상 시간</Text>
        <DurationWheelPicker
          options={timeOptions}
          value={time}
          onChange={setTime}
        />

        <Text style={s.label}>예산</Text>
        <View style={s.inputWrap}>
          <TextInput
            style={s.input}
            value={budget}
            onChangeText={setBudget}
            placeholder="예: 5만원 내외"
            placeholderTextColor={C.textFaint}
            maxLength={30}
          />
        </View>

        <View style={s.bottomSpacer} />
      </ScrollView>

      <View style={s.footer}>
        <BigButton
          onPress={handleSave}
          variant={!canSave || saving ? 'disabled' : 'primary'}
        >
          {saving ? <ActivityIndicator color={C.white} size="small" /> : '저장하기'}
        </BigButton>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 29 },
  headingTop: { marginTop: 16 },
  subText: { fontSize: 13, color: C.textSub, lineHeight: 20, marginTop: 8 },
  label: { fontSize: 13, fontWeight: '600', color: C.text, marginTop: 20, marginBottom: 8 },
  inputWrap: {
    backgroundColor: C.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  inputWrapActive: { borderColor: C.pinkBorder, borderWidth: 1.5 },
  input: { fontSize: 14, color: C.text, lineHeight: 22 },
  inputMultiline: { minHeight: 72, textAlignVertical: 'top' },
  bottomSpacer: { height: 120 },
  footer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 12,
    backgroundColor: C.bg,
  },
});
