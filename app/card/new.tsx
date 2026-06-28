import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, SafeAreaView, Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { generateDateCards, getUserPreferences } from '../../lib/ai';
import { Sparkles } from 'lucide-react-native';
import { C } from '../../constants/colors';
import { BackBar, BigButton, SoftCard } from '../../components/ui';

const TIME_OPTIONS = ['1~2시간', '2~3시간', '반나절', '하루 종일'];
const BUDGET_OPTIONS = ['아끼기', '적당히', '특별하게'];

export default function NewCardScreen() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selTime, setSelTime] = useState<number | null>(null);
  const [selBudget, setSelBudget] = useState<number | null>(null);
  const [useAI, setUseAI] = useState(false);
  const [saving, setSaving] = useState(false);

  const canSave = title.trim().length > 0;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('date_planner_profiles')
        .select('couple_id')
        .eq('user_id', user.id)
        .single();

      if (!profile?.couple_id) {
        Alert.alert('연인과 연결 후 사용해주세요.');
        return;
      }

      const cardId = Math.random().toString(36).slice(2) + Date.now().toString(36);

      if (useAI) {
        const prefs = await getUserPreferences();
        const cards = await generateDateCards(
          {
            energy: '',
            budget: selBudget !== null ? BUDGET_OPTIONS[selBudget] : '',
            distance: '',
            mood: '',
            duration: selTime !== null ? TIME_OPTIONS[selTime] : '',
            avoid: [],
            freeText: [title.trim(), description.trim()].filter(Boolean).join('. '),
          },
          'make_course',
          prefs,
          'ko',
        );
        const card = cards[0];

        await supabase.from('date_cards').insert({
          id: cardId,
          couple_id: profile.couple_id,
          created_by: user.id,
          mode: 'manual',
          input_json: {},
          source: 'ai',
          title: card.title,
          summary: card.summary,
          estimated_time: card.estimated_time,
          estimated_budget: card.estimated_budget,
          tags: card.tags,
          why_recommended: card.why_recommended,
        });
      } else {
        await supabase.from('date_cards').insert({
          id: cardId,
          couple_id: profile.couple_id,
          created_by: user.id,
          mode: 'manual',
          input_json: {},
          source: 'manual',
          title: title.trim(),
          summary: description.trim(),
          estimated_time: selTime !== null ? TIME_OPTIONS[selTime] : '',
          estimated_budget: selBudget !== null ? BUDGET_OPTIONS[selBudget] : '',
          tags: [],
          why_recommended: '',
        });
      }

      router.replace('/(tabs)/candidates');
    } catch {
      Alert.alert('오류', '후보 추가 중 오류가 발생했어요.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFF8F3' }}>
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <BackBar onPress={() => router.back()} />

        <Text style={[s.heading, { marginTop: 16 }]}>아이디어를 후보로{'\n'}등록할게요</Text>
        <Text style={s.subText}>제목만 입력해도 바로 후보가 돼요.</Text>

        {/* 제목 */}
        <Text style={s.label}>아이디어 제목 *</Text>
        <View style={[s.inputWrap, title.length > 0 && s.inputWrapActive]}>
          <TextInput
            style={s.input}
            value={title}
            onChangeText={setTitle}
            placeholder="예: 동네 맛집 포장 + 집 영화"
            placeholderTextColor={C.textFaint}
            maxLength={60}
          />
        </View>

        {/* 설명 */}
        <Text style={s.label}>설명 (선택)</Text>
        <View style={s.inputWrap}>
          <TextInput
            style={[s.input, { minHeight: 72, textAlignVertical: 'top' }]}
            value={description}
            onChangeText={setDescription}
            placeholder="어떤 느낌인지 간단히 적어주세요"
            placeholderTextColor={C.textFaint}
            multiline
            maxLength={200}
          />
        </View>

        {/* 예상 시간 */}
        <Text style={s.label}>예상 시간 (선택)</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {TIME_OPTIONS.map((t, i) => {
            const sel = i === selTime;
            return (
              <TouchableOpacity
                key={t}
                onPress={() => setSelTime(sel ? null : i)}
                activeOpacity={0.7}
                style={[s.chipBtn, sel && s.chipBtnOn]}
              >
                <Text style={[s.chipText, sel && s.chipTextOn]}>{t}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* 예산 */}
        <Text style={[s.label, { marginTop: 20 }]}>예산 (선택)</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {BUDGET_OPTIONS.map((b, i) => {
            const sel = i === selBudget;
            return (
              <TouchableOpacity
                key={b}
                onPress={() => setSelBudget(sel ? null : i)}
                activeOpacity={0.7}
                style={[s.chipBtn, { flex: 1 }, sel && s.chipBtnOn]}
              >
                <Text style={[s.chipText, sel && s.chipTextOn]}>{b}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* AI 보정 토글 */}
        <SoftCard style={{ marginTop: 24, backgroundColor: useAI ? C.lavender : C.white }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <Sparkles size={16} color={useAI ? C.lavenderFg : C.textSub} />
              <View style={{ flex: 1 }}>
                <Text style={[s.toggleTitle, useAI && { color: C.lavenderFg }]}>
                  AI가 카드로 정리해줘
                </Text>
                <Text style={s.toggleSub}>입력한 내용을 AI가 정제해서 카드로 만들어줘요</Text>
              </View>
            </View>
            <Switch
              value={useAI}
              onValueChange={setUseAI}
              trackColor={{ false: C.border, true: C.lavenderFg }}
              thumbColor={C.white}
            />
          </View>
        </SoftCard>

        <View style={{ height: 120 }} />
      </ScrollView>

      <View style={s.footer}>
        <BigButton
          onPress={handleSave}
          variant={!canSave || saving ? 'disabled' : 'primary'}
        >
          {saving
            ? <ActivityIndicator color={C.white} size="small" />
            : useAI ? 'AI로 카드 만들기 ✨' : '후보로 추가하기'}
        </BigButton>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 29 },
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
  chipBtn: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
  },
  chipBtnOn: { backgroundColor: C.pinkLight, borderColor: C.pinkBorder, borderWidth: 1.5 },
  chipText: { fontSize: 13, color: '#4A4A55', fontWeight: '500' },
  chipTextOn: { color: C.pinkDeep, fontWeight: '600' },
  toggleTitle: { fontSize: 13, fontWeight: '600', color: C.text },
  toggleSub: { fontSize: 11, color: C.textSub, marginTop: 2, lineHeight: 16 },
  footer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 12,
    backgroundColor: '#FFF8F3',
  },
});
