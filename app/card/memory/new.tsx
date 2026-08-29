import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Image,
  ActivityIndicator, Alert, TouchableOpacity, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../../../lib/supabase';
import { useI18n } from '../../../lib/i18n';
import { Star, Camera } from '../../../components/iconography';
import { C, DS, SP } from '../../../constants/theme';
import { BigButton, Header, InputField, ScreenHeading } from '../../../components/ui';
import { Illustration, MINI_ILLUSTRATION_WIDTH } from '../../../components/illustration';
import { Rating, RATING_FEEDBACK_KEY, RATING_FEEDBACK_ICON, RATING_FEEDBACK_TONE, deriveWantAgain } from '../../../lib/ratingFeedback';
import { removeStorageObjectByUrl } from '../../../lib/storageCleanup';

export default function NewMemoryScreen() {
  const router = useRouter();
  const { strings: s } = useI18n();
  const c = s.review;

  const [coupleId, setCoupleId] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

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
    if (!photoUrl) { Alert.alert('', s.card.memory.photoRequiredError); return; }
    if (!rating) { Alert.alert('', c.noStarRatingError); return; }
    if (!myUserId || !coupleId) { Alert.alert('', s.common.coupleRequired); return; }
    if (saving) return;
    setSaving(true);
    try {
      const wantAgain = deriveWantAgain(rating as Rating);

      const { error } = await supabase.from('date_memories').insert({
        couple_id: coupleId,
        card_id: null,
        user_id: myUserId,
        title: title.trim() || null,
        rating,
        review: reviewText.trim(),
        want_again: wantAgain,
        photo_url: photoUrl,
      });
      if (error) throw error;
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
      <Header onBack={() => router.back()} />
      <ScreenHeading title={s.card.memory.newHeading} subtitle={s.card.memory.newSub} />
      <ScrollView style={styles.flex1} contentContainerStyle={styles.content} automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled">
          <View style={styles.headingBlock}>
            <Illustration name="mini-park-bench" width={MINI_ILLUSTRATION_WIDTH} style={styles.headingIllustration} />
          </View>

          <TouchableOpacity
            style={styles.photoPlaceholder}
            onPress={handlePickPhoto}
            activeOpacity={0.88}
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

          <InputField
            label={s.card.memory.titleLabel}
            value={title}
            onChangeText={setTitle}
            placeholder={s.card.memory.titlePlaceholder}
            maxLength={40}
            returnKeyType="next"
            style={styles.field}
          />

          <Text style={styles.sectionLabel}>{c.starRatingLabel}</Text>
          <View style={styles.starRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <TouchableOpacity
                key={n}
                testID={`new-memory-star-${n}`}
                accessibilityRole="button"
                accessibilityLabel={`${n}점`}
                onPress={() => setRating(n)}
                style={styles.starBtn}
                activeOpacity={0.88}
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

          <InputField
            label={c.reviewLabel}
            value={reviewText}
            onChangeText={setReviewText}
            placeholder={c.reviewPlaceholder}
            multiline
            maxLength={100}
            returnKeyType="done"
            style={styles.field}
          />

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
  content: { paddingHorizontal: SP.screen, paddingTop: SP.xxl, paddingBottom: SP.xxxl + SP.lg },

  headingBlock: { marginBottom: SP.lg },
  headingIllustration: { alignSelf: 'flex-end' },

  sectionLabel: { ...DS.typography.bodyCompact, fontWeight: '600', color: C.text, marginTop: SP.lg, marginBottom: SP.md },
  field: { marginTop: SP.lg },

  starRow: { flexDirection: 'row', gap: SP.sm },
  starBtn: { minWidth: DS.spacing.touch, minHeight: DS.spacing.touch, alignItems: 'center', justifyContent: 'center' },

  feedbackCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP.sm,
    marginTop: SP.md,
    paddingHorizontal: SP.lg,
    paddingVertical: SP.md,
    borderRadius: DS.radius.input,
    borderWidth: 1.5,
  },
  feedbackLabel: { ...DS.typography.bodyCompact, fontWeight: '600' },

  saveBtn: { marginTop: SP.lg },

  photoPlaceholder: {
    marginTop: SP.md,
    height: 180,
    borderRadius: DS.radius.input,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: C.pinkBorder,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoPreview: { width: '100%', height: '100%' },
  photoTextWrap: { flexDirection: 'row', alignItems: 'center', gap: SP.xs },
  photoText: { ...DS.typography.buttonCompact, color: C.pinkDeep, fontWeight: '600' },
});
