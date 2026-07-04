import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { buildCourseInput } from '../../lib/modeForm';
import { useI18n } from '../../lib/i18n';
import { C } from '../../constants/colors';
import { BackBar, BigButton, LocationField } from '../../components/ui';

export default function CourseScreen() {
  const router = useRouter();
  const { strings: s } = useI18n();
  const c = s.course;

  const [idea, setIdea] = useState('');
  const [budget, setBudget] = useState('');
  const [duration, setDuration] = useState('');
  const [location, setLocation] = useState('');
  const [coords, setCoords] = useState<{ x: string; y: string } | null>(null);

  function handleGenerate() {
    if (!idea.trim()) {
      Alert.alert(c.errorEmpty);
      return;
    }
    const input = buildCourseInput({ idea, budget, duration, location, coords: coords ?? undefined });
    router.replace({
      pathname: '/mode-flow/generating',
      params: { mode: 'make_course', input: JSON.stringify(input) },
    } as any);
  }

  return (
    <SafeAreaView style={s2.safe}>
      <BackBar />
      <ScrollView contentContainerStyle={s2.content} keyboardShouldPersistTaps="handled">
        <Text style={s2.modeLabel}>{c.modeLabel}</Text>
        <Text style={s2.title}>{c.title}</Text>

        <Text style={s2.sectionLabel}>{c.ideaLabel}</Text>
        <TextInput
          style={s2.ideaInput}
          placeholder={c.ideaPlaceholder}
          placeholderTextColor={C.textFaint}
          value={idea}
          onChangeText={setIdea}
          multiline
          maxLength={200}
        />
        <Text style={s2.hint}>{c.ideaHint}</Text>

        <Text style={s2.sectionLabel}>{c.budgetLabel}</Text>
        <View style={s2.optionRow}>
          {c.budgetOptions.map(opt => {
            const sel = budget === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[s2.optionCard, sel && s2.optionSelected]}
                onPress={() => setBudget(opt.value)}
                activeOpacity={0.7}
              >
                <Text style={s2.optionEmoji}>{opt.emoji}</Text>
                <Text style={[s2.optionLabel, sel && s2.optionLabelSelected]}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={s2.sectionLabel}>{c.durationLabel}</Text>
        <View style={s2.optionRow}>
          {c.durationOptions.map(opt => {
            const sel = duration === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[s2.optionCard, sel && s2.optionSelected]}
                onPress={() => setDuration(opt.value)}
                activeOpacity={0.7}
              >
                <Text style={s2.optionEmoji}>{opt.emoji}</Text>
                <Text style={[s2.optionLabel, sel && s2.optionLabelSelected]}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <LocationField value={location} onChangeText={setLocation} coords={coords} onCoordsChange={setCoords} />

        <View style={s2.bottomSpacer} />
        <BigButton onPress={handleGenerate} variant={idea.trim() ? 'primary' : 'disabled'}>{c.generateButton}</BigButton>
      </ScrollView>
    </SafeAreaView>
  );
}

const s2 = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 60 },
  bottomSpacer: { height: 24 },
  modeLabel: { fontSize: 13, color: C.pinkDeep, fontWeight: '600', marginBottom: 8 },
  title: { fontSize: 24, fontWeight: '700', lineHeight: 32, color: C.text, marginBottom: 28 },
  sectionLabel: { fontSize: 15, fontWeight: '600', color: C.text, marginBottom: 12 },
  ideaInput: {
    borderWidth: 1.5, borderColor: C.border, borderRadius: 14, padding: 16,
    fontSize: 15, color: C.text, minHeight: 96, textAlignVertical: 'top',
    marginBottom: 8, backgroundColor: C.white,
  },
  hint: { fontSize: 13, color: C.textMuted, marginBottom: 28 },
  optionRow: { flexDirection: 'row', gap: 10, marginBottom: 28 },
  optionCard: {
    flex: 1, alignItems: 'center', backgroundColor: C.white, borderRadius: 14,
    paddingVertical: 16, paddingHorizontal: 4, borderWidth: 2, borderColor: 'transparent', gap: 6,
  },
  optionSelected: { backgroundColor: C.pinkLight, borderColor: C.pinkBorder },
  optionEmoji: { fontSize: 22 },
  optionLabel: { fontSize: 13, fontWeight: '600', color: C.textSub, textAlign: 'center' },
  optionLabelSelected: { color: C.pinkDeep },
});
