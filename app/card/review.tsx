import { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, Image,
  ActivityIndicator, Alert, TouchableOpacity, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../../lib/supabase';
import { useI18n } from '../../lib/i18n';
import { Star, Camera } from 'lucide-react-native';
import { C, SP, R } from '../../constants/theme';
import { BackBar, BigButton, SoftCard } from '../../components/ui';
import { Rating, RATING_FEEDBACK_KEY, RATING_FEEDBACK_ICON, RATING_FEEDBACK_TONE, deriveWantAgain } from '../../lib/ratingFeedback';
import { partnerHasReviewed } from '../../lib/reviewFlow';
import { removeStorageObjectByUrl } from '../../lib/storageCleanup';
import {
  PlaceSatisfaction, initialPlaceSatisfactions, togglePlaceSatisfaction, placeFeedbackRpcArgs,
} from '../../lib/placeReview';
import type { PriceLevel } from '../../shared/recommendation/place-price';

const PRICE_CHIPS = [
  { level: 1, labelKey: 'priceCheap' },
  { level: 2, labelKey: 'priceNormal' },
  { level: 3, labelKey: 'priceExpensive' },
] as const satisfies readonly { level: PriceLevel; labelKey: 'priceCheap' | 'priceNormal' | 'priceExpensive' }[];

type CoursePlace = {
  session_id: string;
  step_id: string;
  step_order: number;
  place_name: string;
  kakao_place_id: string | null;
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
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [places, setPlaces] = useState<CoursePlace[]>([]);
  const [placeSatisfactions, setPlaceSatisfactions] = useState<Record<string, PlaceSatisfaction>>({});
  const [placePrices, setPlacePrices] = useState<Record<string, PriceLevel>>({});
  // 사용자가 직접 만진 장소는 별점 재선택의 유도 기본값이 덮어쓰지 않는다.
  const touchedRef = useRef<Set<string>>(new Set());

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
        // 코스 카드가 아니거나 조회 실패면 빈 배열 — 장소 섹션은 렌더되지 않는다.
        // 다만 rpc는 실패해도 reject하지 않으므로, error를 열어보지 않으면
        // 권한·시그니처 불일치로 수집이 영구 0건이어도 아무 흔적이 남지 않는다.
        const { data: coursePlaces, error: placesError } = await supabase
          .rpc('get_course_places_for_review', { p_card_id: id });
        if (placesError) console.warn('[review] course_places lookup failed', placesError);
        setPlaces(Array.isArray(coursePlaces) ? (coursePlaces as CoursePlace[]) : []);
        setLoading(false);
      })();
    }, [id]),
  );

  function handleRating(n: number) {
    setRating(n);
    setPlaceSatisfactions((prev) => {
      // 사용자가 만진 스텝은 유도 기본값 밖으로 뺀다. prev에서 골라 덮어쓰기만 하면
      // "해제(=무응답)"가 undefined라 다시 좋아요로 되살아난다.
      const derived = initialPlaceSatisfactions(
        n as Rating,
        places.map((p) => p.step_id).filter((stepId) => !touchedRef.current.has(stepId)),
      );
      const kept = Object.fromEntries(
        [...touchedRef.current]
          .filter((stepId) => prev[stepId] !== undefined)
          .map((stepId) => [stepId, prev[stepId]]),
      );
      return { ...derived, ...kept };
    });
  }

  function handleSatisfactionTap(stepId: string, tapped: PlaceSatisfaction) {
    touchedRef.current.add(stepId);
    setPlaceSatisfactions((prev) => {
      const next = { ...prev };
      const value = togglePlaceSatisfaction(prev[stepId], tapped);
      if (value === undefined) delete next[stepId];
      else next[stepId] = value;
      return next;
    });
  }

  function handlePriceTap(stepId: string, level: PriceLevel) {
    setPlacePrices((prev) => {
      const next = { ...prev };
      if (prev[stepId] === level) delete next[stepId];
      else next[stepId] = level;
      return next;
    });
  }

  async function handlePickPhoto() {
    if (uploadingPhoto) return;

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        s.card.memory.photoPermTitle,
        s.card.memory.photoPermMessage,
        [
          { text: s.common.cancel, style: 'cancel' },
          { text: s.card.memory.openSettingsCta, onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
      base64: true,
    });
    if (result.canceled || !result.assets[0]?.base64) return;

    setUploadingPhoto(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('no user');

      const base64 = result.assets[0].base64!;
      const path = `${user.id}/memory_${Date.now()}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('memories')
        .upload(path, decode(base64), { contentType: 'image/jpeg', upsert: true });
      if (uploadError) throw uploadError;

      const { data: pub } = supabase.storage.from('memories').getPublicUrl(path);
      // 저장 전 재선택이면 이전 업로드는 아무 데서도 참조되지 않는 고아 — 즉시 지운다.
      if (photoUrl) void removeStorageObjectByUrl(photoUrl);
      setPhotoUrl(pub.publicUrl);
    } catch {
      Alert.alert(s.common.error, s.card.memory.photoUploadError);
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleSave() {
    if (!rating) { Alert.alert('', c.noStarRatingError); return; }
    if (!myUserId || !coupleId) { Alert.alert('', s.common.coupleRequired); return; }
    if (saving) return;
    setSaving(true);
    try {
      const wantAgain = deriveWantAgain(rating as Rating);

      const { error } = await supabase.from('date_memories').insert({
        couple_id: coupleId,
        card_id: id,
        user_id: myUserId,
        rating,
        review: reviewText.trim(),
        want_again: wantAgain,
        photo_url: photoUrl,
      });
      if (error) throw error;

      // 장소별 등급은 선택 사항 — 실패해도 별점 저장 성공 흐름을 막지 않는다.
      const feedbackCalls = places
        .map((entry) => placeFeedbackRpcArgs({
          sessionId: entry.session_id,
          stepId: entry.step_id,
          satisfaction: placeSatisfactions[entry.step_id],
          priceLevel: placePrices[entry.step_id] ?? null,
        }))
        .filter((args): args is NonNullable<typeof args> => args !== null);
      const feedbackResults = await Promise.allSettled(feedbackCalls.map((args) =>
        supabase.rpc('record_recommendation_place_feedback', args)));
      for (const result of feedbackResults) {
        const failure = result.status === 'rejected' ? result.reason : result.value?.error;
        if (failure) console.warn('[review] place_feedback rpc failed', failure);
      }

      // 둘 다 리뷰했을 때만 데이트를 done으로 아카이브한다. 한 명만 리뷰하면
      // 상대가 계획에서 자기 리뷰를 남길 수 있도록 confirmed 상태를 유지한다.
      const { data: reviewers } = await supabase
        .from('date_memories')
        .select('user_id')
        .eq('card_id', id);
      const reviewerIds = (reviewers ?? []).map((row) => row.user_id as string);
      if (partnerHasReviewed(reviewerIds, myUserId)) {
        await supabase.from('date_cards').update({ status: 'done' }).eq('id', id);
      }
      router.replace('/(tabs)/memories');
    } catch {
      Alert.alert(s.common.error, c.saveError);
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

  const feedbackKey = rating ? RATING_FEEDBACK_KEY[rating as Rating] : null;
  const FeedbackIcon = rating ? RATING_FEEDBACK_ICON[rating as Rating] : null;
  const feedbackTone = rating ? RATING_FEEDBACK_TONE[rating as Rating] : null;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.flex1} contentContainerStyle={styles.content} automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled">
          <BackBar />

          <View style={styles.headingBlock}>
            <Text style={styles.heading}>{c.heading}</Text>
            <Text style={styles.sub}>{c.sub}</Text>
          </View>

          <Text style={styles.sectionLabel}>{c.starRatingLabel}</Text>
          <View style={styles.starRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <TouchableOpacity
                key={n}
                testID={`review-star-${n}`}
                accessibilityRole="button"
                accessibilityLabel={`${n}점`}
                onPress={() => handleRating(n)}
                style={styles.starBtn}
                activeOpacity={1}
              >
                <Star
                  size={28}
                  strokeWidth={1.8}
                  color={C.pinkDeep}
                  fill={n <= rating ? C.pinkDeep : 'transparent'}
                />
              </TouchableOpacity>
            ))}
          </View>

          {feedbackKey && FeedbackIcon && feedbackTone && (
            <View style={[styles.feedbackCard, { backgroundColor: feedbackTone.bg, borderColor: feedbackTone.fg }]}>
              <FeedbackIcon size={18} color={feedbackTone.fg} strokeWidth={2} />
              <Text style={[styles.feedbackLabel, { color: feedbackTone.fg }]}>{c.ratingFeedback[feedbackKey]}</Text>
            </View>
          )}

          {places.length > 0 && (
            <View style={styles.placeSection}>
              <Text style={styles.placeSectionTitle}>{c.placeSection.title}</Text>
              <Text style={styles.placeSectionSub}>{c.placeSection.sub}</Text>
              {places.map((place) => (
                <SoftCard key={place.step_id} style={styles.placeCard}>
                  <Text style={styles.placeName} numberOfLines={1}>{place.place_name}</Text>
                  <View style={styles.chipRow}>
                    {(['good', 'bad'] as const).map((kind) => {
                      const selected = placeSatisfactions[place.step_id] === kind;
                      return (
                        <TouchableOpacity
                          key={kind}
                          testID={`place-${kind}-${place.step_id}`}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          accessibilityHint={c.placeSection.toggleHint}
                          accessibilityLabel={`${place.place_name} ${c.placeSection[kind]}`}
                          onPress={() => handleSatisfactionTap(place.step_id, kind)}
                          style={[styles.chip, selected && styles.chipOn]}
                          activeOpacity={0.8}
                        >
                          <Text style={[styles.chipText, selected && styles.chipTextOn]}>
                            {c.placeSection[kind]}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <View style={styles.chipRow}>
                    {PRICE_CHIPS.map((chip) => {
                      const selected = placePrices[place.step_id] === chip.level;
                      return (
                        <TouchableOpacity
                          key={chip.level}
                          testID={`place-price-${place.step_id}-${chip.level}`}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          accessibilityHint={c.placeSection.toggleHint}
                          accessibilityLabel={`${place.place_name} ${c.placeSection[chip.labelKey]}`}
                          onPress={() => handlePriceTap(place.step_id, chip.level)}
                          style={[styles.chip, styles.priceChip, selected && styles.chipOn]}
                          activeOpacity={0.8}
                        >
                          <Text style={[styles.chipText, selected && styles.chipTextOn]}>
                            {c.placeSection[chip.labelKey]}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </SoftCard>
              ))}
            </View>
          )}

          <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>{c.reviewLabel}</Text>
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

          <TouchableOpacity
            style={styles.photoPlaceholder}
            onPress={handlePickPhoto}
            activeOpacity={0.8}
            disabled={uploadingPhoto}
          >
            {uploadingPhoto ? (
              <ActivityIndicator color={C.pinkDeep} />
            ) : photoUrl ? (
              <Image source={{ uri: photoUrl }} style={styles.photoPreview} />
            ) : (
              <View style={styles.photoTextWrap}>
                <Camera size={18} color={C.pinkDeep} strokeWidth={2} />
                <Text style={styles.photoText}>{s.card.memory.addPhotoCta}</Text>
              </View>
            )}
          </TouchableOpacity>

          <BigButton onPress={handleSave} variant={saving ? 'disabled' : 'primary'} style={styles.saveBtn}>
            {saving ? s.common.saving : c.saveButton}
          </BigButton>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  flex1: { flex: 1 },
  content: { paddingHorizontal: SP.xl, paddingTop: SP.lg, paddingBottom: SP.xxxl + SP.lg },

  headingBlock: { marginTop: SP.lg, marginBottom: SP.xl },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 30 },
  sub: { marginTop: SP.xs + 2, fontSize: 13, color: C.textSub, lineHeight: 19 },

  sectionLabel: { fontSize: 13, fontWeight: '600', color: C.text, marginBottom: SP.md },
  sectionLabelSpaced: { marginTop: SP.xl },

  starRow: { flexDirection: 'row', gap: SP.sm },
  starBtn: { minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' },

  feedbackCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP.sm,
    marginTop: SP.md,
    marginBottom: SP.xl,
    paddingHorizontal: SP.lg,
    paddingVertical: SP.md,
    borderRadius: R.lg,
    borderWidth: 1.5,
  },
  feedbackLabel: { fontSize: 13, fontWeight: '600' },

  placeSection: { marginTop: SP.xl },
  placeSectionTitle: { fontSize: 13, fontWeight: '600', color: C.text },
  placeSectionSub: { marginTop: SP.xs, marginBottom: SP.md, fontSize: 12, color: C.textSub, lineHeight: 18 },
  placeCard: { marginBottom: SP.sm, gap: SP.sm },
  placeName: { fontSize: 14, fontWeight: '600', color: C.text },
  chipRow: { flexDirection: 'row', gap: SP.sm },
  chip: {
    minHeight: 44,
    paddingHorizontal: SP.lg,
    justifyContent: 'center',
    borderRadius: R.btn,
    borderWidth: 1,
    borderColor: C.borderLight,
    backgroundColor: C.bg,
  },
  priceChip: { flex: 1, alignItems: 'center' },
  chipOn: { backgroundColor: C.pinkMid, borderColor: C.pinkBorder },
  // 라벨은 항상 본문색 — 액센트 핑크(#C24B57)를 파스텔 칩 위에 얹으면 대비가 4.2:1로
  // 4.5:1 바닥을 못 넘는다. 선택은 배경·보더·굵기로 표시한다.
  chipText: { fontSize: 13, color: C.text, fontWeight: '500' },
  chipTextOn: { fontWeight: '700' },

  reviewInput: {
    backgroundColor: C.white,
    borderRadius: R.btn,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: SP.lg,
    paddingVertical: SP.md + 2,
    fontSize: 14,
    color: C.text,
    minHeight: 70,
    textAlignVertical: 'top',
  },

  photoPlaceholder: {
    marginTop: SP.md + 2,
    height: 140,
    borderRadius: R.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: C.pinkBorder,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoPreview: { width: '100%', height: '100%' },
  photoTextWrap: { flexDirection: 'row', alignItems: 'center', gap: SP.xs },
  photoText: { fontSize: 13, color: C.pinkDeep, fontWeight: '600' },
  saveBtn: { marginTop: SP.xxl },
});
