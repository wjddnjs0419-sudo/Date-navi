import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  SafeAreaView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useI18n } from '../../lib/i18n';
import { C } from '../../constants/colors';
import { BackBar, BigButton, Chip } from '../../components/ui';

const RATING_ICONS: Record<string, string> = {
  love: '❤️',
  good: '⭐',
  ok: '✅',
  change: '🔄',
};

export default function ReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { strings: s } = useI18n();
  const c = s.review;

  const [coupleId, setCoupleId] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rating, setRating] = useState<string | null>(null);
  const [selectedChips, setSelectedChips] = useState<string[]>([]);
  const [reviewText, setReviewText] = useState('');

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); return; }
        setMyUserId(user.id);
        const { data: profile } = await supabase
          .from('date_planner_profiles')
          .select('couple_id')
          .eq('user_id', user.id)
          .maybeSingle();
        if (profile?.couple_id) setCoupleId(profile.couple_id);
        setLoading(false);
      })();
    }, []),
  );

  function toggleChip(chip: string) {
    setSelectedChips((prev) =>
      prev.includes(chip) ? prev.filter((c) => c !== chip) : [...prev, chip],
    );
  }

  async function handleSave() {
    if (!rating) { Alert.alert('', c.noRatingError); return; }
    if (!myUserId || !coupleId) { Alert.alert('', c.missingCoupleError); return; }
    if (saving) return;
    setSaving(true);
    try {
      const wantAgain = rating === 'love' || rating === 'good';
      const reviewParts = [
        ...selectedChips,
        reviewText.trim(),
      ].filter(Boolean).join(' / ');

      const { error } = await supabase.from('date_memories').insert({
        couple_id: coupleId,
        card_id: id,
        user_id: myUserId,
        review: reviewParts || null,
        want_again: wantAgain,
      });
      if (error) throw error;
      // 회고를 남기면 데이트는 완료 상태가 되어 계획 목록에서 빠진다.
      await supabase.from('date_cards').update({ status: 'done' }).eq('id', id);
      router.replace('/(tabs)/memories');
    } catch {
      Alert.alert('오류', c.saveError);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={C.pink} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <BackBar />

          <View style={styles.headingBlock}>
            <Text style={styles.heading}>{c.heading}</Text>
            <Text style={styles.sub}>{c.sub}</Text>
          </View>

          <Text style={styles.sectionLabel}>{c.ratingLabel}</Text>
          <View style={styles.ratingGrid}>
            {c.ratings.map((item) => {
              const sel = rating === item.key;
              return (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.ratingCard, sel && styles.ratingCardSel]}
                  onPress={() => setRating(item.key)}
                  activeOpacity={0.75}
                >
                  <View style={[styles.ratingIconWrap, sel && styles.ratingIconWrapSel]}>
                    <Text style={styles.ratingIcon}>{RATING_ICONS[item.key]}</Text>
                  </View>
                  <Text style={[styles.ratingLabel, sel && styles.ratingLabelSel]}>{item.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.sectionLabel, { marginTop: 20 }]}>{c.goodLabel}</Text>
          <View style={styles.chipRow}>
            {c.goodChips.map((chip) => (
              <Chip
                key={chip}
                tone="pink"
                selected={selectedChips.includes(chip)}
                onPress={() => toggleChip(chip)}
              >
                {chip}
              </Chip>
            ))}
          </View>

          <Text style={[styles.sectionLabel, { marginTop: 20 }]}>{c.reviewLabel}</Text>
          <TextInput
            style={styles.reviewInput}
            value={reviewText}
            onChangeText={setReviewText}
            placeholder={c.reviewPlaceholder}
            placeholderTextColor={C.textFaint}
            multiline
            maxLength={100}
            returnKeyType="done"
          />

          <View style={styles.photoPlaceholder}>
            <Text style={styles.photoText}>📷 사진 추가하기</Text>
          </View>

          <BigButton onPress={handleSave} variant={saving ? 'disabled' : 'primary'} style={{ marginTop: 24 }}>
            {saving ? '저장 중...' : c.saveButton}
          </BigButton>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48 },

  headingBlock: { marginTop: 16, marginBottom: 20 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 30 },
  sub: { marginTop: 6, fontSize: 13, color: C.textSub, lineHeight: 19 },

  sectionLabel: { fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 12 },

  ratingGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  ratingCard: {
    width: '47%',
    backgroundColor: C.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    gap: 8,
  },
  ratingCardSel: { backgroundColor: C.pinkLight, borderColor: C.pinkBorder, borderWidth: 1.5 },
  ratingIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingIconWrapSel: { backgroundColor: C.white },
  ratingIcon: { fontSize: 16 },
  ratingLabel: { fontSize: 13, color: C.textSub, fontWeight: '500' },
  ratingLabelSel: { color: C.pinkDeep, fontWeight: '600' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  reviewInput: {
    backgroundColor: C.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 14,
    color: C.text,
    minHeight: 70,
    textAlignVertical: 'top',
  },

  photoPlaceholder: {
    marginTop: 14,
    height: 80,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: C.pinkBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoText: { fontSize: 13, color: C.textMuted },
});
