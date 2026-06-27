import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import type { FeelingInput } from '../../lib/ai';
import { useI18n } from '../../lib/i18n';

export default function CourseScreen() {
  const router = useRouter();
  const { strings: s } = useI18n();
  const c = s.course;

  const [idea, setIdea] = useState('');
  const [budget, setBudget] = useState('');
  const [duration, setDuration] = useState('');

  function handleGenerate() {
    if (!idea.trim()) {
      Alert.alert(c.errorEmpty);
      return;
    }
    const input: FeelingInput = {
      energy: 'medium',
      budget: budget || 'medium',
      distance: 'any',
      mood: 'comfortable',
      duration: duration || '2-3h',
      avoid: [],
      freeText: idea.trim(),
    };
    router.push({
      pathname: '/mode-flow/result',
      params: { mode: 'make_course', input: JSON.stringify(input) },
    } as any);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backText}>{c.back}</Text>
        </TouchableOpacity>
        <Text style={styles.modeLabel}>{c.modeLabel}</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>{c.title}</Text>

        {/* 아이디어 입력 */}
        <Text style={styles.sectionLabel}>{c.ideaLabel}</Text>
        <TextInput
          style={styles.ideaInput}
          placeholder={c.ideaPlaceholder}
          placeholderTextColor="#C0C0C0"
          value={idea}
          onChangeText={setIdea}
          multiline
          maxLength={200}
        />
        <Text style={styles.hint}>{c.ideaHint}</Text>

        {/* 예산 선택 */}
        <Text style={styles.sectionLabel}>{c.budgetLabel}</Text>
        <View style={styles.optionRow}>
          {c.budgetOptions.map(opt => {
            const selected = budget === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[styles.optionCard, selected && styles.optionSelected]}
                onPress={() => setBudget(opt.value)}
                activeOpacity={0.7}
              >
                <Text style={styles.optionEmoji}>{opt.emoji}</Text>
                <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* 시간 선택 */}
        <Text style={styles.sectionLabel}>{c.durationLabel}</Text>
        <View style={styles.optionRow}>
          {c.durationOptions.map(opt => {
            const selected = duration === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[styles.optionCard, selected && styles.optionSelected]}
                onPress={() => setDuration(opt.value)}
                activeOpacity={0.7}
              >
                <Text style={styles.optionEmoji}>{opt.emoji}</Text>
                <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={[styles.generateBtn, !idea.trim() && styles.generateBtnDisabled]}
          onPress={handleGenerate}
          activeOpacity={0.85}
        >
          <Text style={styles.generateBtnText}>{c.generateButton}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },

  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
  },
  backBtn: { alignSelf: 'flex-start' },
  backText: { fontSize: 24, color: '#333' },
  modeLabel: { fontSize: 13, color: '#FF4F6D', fontWeight: '600' },

  scroll: { flex: 1 },
  content: { padding: 24, paddingTop: 8, paddingBottom: 60 },

  title: {
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 38,
    color: '#1A1A1A',
    marginBottom: 32,
  },

  sectionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },

  ideaInput: {
    borderWidth: 1.5,
    borderColor: '#E8E8E8',
    borderRadius: 14,
    padding: 16,
    fontSize: 16,
    color: '#333',
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 8,
  },
  hint: {
    fontSize: 13,
    color: '#ADADAD',
    marginBottom: 32,
  },

  optionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 32,
  },
  optionCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: 'transparent',
    gap: 6,
  },
  optionSelected: {
    backgroundColor: '#FFF0F3',
    borderColor: '#FF4F6D',
  },
  optionEmoji: { fontSize: 22 },
  optionLabel: { fontSize: 13, fontWeight: '600', color: '#555', textAlign: 'center' },
  optionLabelSelected: { color: '#FF4F6D' },

  generateBtn: {
    backgroundColor: '#FF4F6D',
    borderRadius: 20,
    paddingVertical: 20,
    alignItems: 'center',
    marginTop: 8,
  },
  generateBtnDisabled: { opacity: 0.45 },
  generateBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
