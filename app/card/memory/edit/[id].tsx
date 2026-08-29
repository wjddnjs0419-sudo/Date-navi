// app/card/memory/edit/[id].tsx
import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Image,
  ActivityIndicator, Alert, TouchableOpacity, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../../../../lib/supabase';
import { Camera, Star } from '../../../../components/iconography';
import { C, DS, SP, G } from '../../../../constants/theme';
import { BigButton, Header, HeartDoodle, InputField, ScreenHeading } from '../../../../components/ui';
import { Illustration, MINI_ILLUSTRATION_WIDTH } from '../../../../components/illustration';
import { useI18n } from '../../../../lib/i18n';
import { Rating, RATING_FEEDBACK_KEY, RATING_FEEDBACK_ICON, RATING_FEEDBACK_TONE, deriveWantAgain } from '../../../../lib/ratingFeedback';
import { removeStorageObjectByUrl } from '../../../../lib/storageCleanup';
import { usePlaceFeedback } from '../../../../lib/usePlaceFeedback';
import { PlaceFeedbackSection } from '../../../../components/PlaceFeedbackSection';

export default function EditMemoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { strings } = useI18n();
  const c = strings.review;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [isFreeform, setIsFreeform] = useState(false);
  const [title, setTitle] = useState('');
  const [reviewText, setReviewText] = useState('');
  const [rating, setRating] = useState(0);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  // 저장 성공 시 옛 사진 오브젝트를 지우기 위해 로드 시점의 URL을 기억한다.
  const [initialPhotoUrl, setInitialPhotoUrl] = useState<string | null>(null);
  const {
    places, satisfactions, prices, load: loadPlaces,
    tapSatisfaction, tapPrice, submit: submitPlaceFeedback,
  } = usePlaceFeedback();

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        setLoading(true);
        const { data } = await supabase
          .from('date_memories')
          .select('card_id, title, review, want_again, photo_url, rating')
          .eq('id', id)
          .maybeSingle();
        if (!active) return;
        if (data) {
          setIsFreeform(!data.card_id);
          setTitle(data.title ?? '');
          setReviewText(data.review ?? '');
          setRating(data.rating ?? 0);
          setPhotoUrl(data.photo_url);
          setInitialPhotoUrl(data.photo_url);
          // 코스 추억이면 장소별 등급도 함께 수정할 수 있어야 한다(리뷰 화면과 같은 섹션).
          await loadPlaces(data.card_id ?? undefined);
        }
        if (!active) return;
        setLoading(false);
      })();
      return () => { active = false; };
    }, [id, loadPlaces]),
  );

  async function handlePickPhoto() {
    if (uploadingPhoto) return;

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        strings.card.memory.photoPermTitle,
        strings.card.memory.photoPermMessage,
        [
          { text: strings.common.cancel, style: 'cancel' },
          { text: strings.card.memory.openSettingsCta, onPress: () => Linking.openSettings() },
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
      // 같은 편집 세션에서 여러 번 교체하면 중간 업로드가 고아가 되므로 즉시 지운다.
      // (원본은 저장 성공 전까지 보존 — 저장 없이 나가면 DB가 계속 원본을 가리킨다.)
      if (photoUrl && photoUrl !== initialPhotoUrl) void removeStorageObjectByUrl(photoUrl);
      setPhotoUrl(pub.publicUrl);
    } catch {
      Alert.alert(strings.common.error, strings.card.memory.photoUploadError);
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleSave() {
    if (!rating) { Alert.alert('', c.noStarRatingError); return; }
    if (saving) return;
    setSaving(true);
    try {
      const wantAgain = deriveWantAgain(rating as Rating);

      const { data, error } = await supabase
        .from('date_memories')
        .update({
          title: isFreeform ? (title.trim() || null) : undefined,
          review: reviewText.trim(),
          rating,
          want_again: wantAgain,
          photo_url: photoUrl,
        })
        .eq('id', id)
        .select('id');
      if (error) throw error;
      if (!data?.length) { Alert.alert(strings.common.notice, strings.card.memory.editForbidden); return; }
      // 장소별 등급은 선택 사항 — 실패해도 저장 흐름을 막지 않는다.
      await submitPlaceFeedback();
      // 사진이 교체된 채 저장됐으면 옛 오브젝트를 정리한다.
      if (initialPhotoUrl && initialPhotoUrl !== photoUrl) void removeStorageObjectByUrl(initialPhotoUrl);
      router.back();
    } catch {
      Alert.alert(strings.common.error, strings.card.memory.saveError);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={C.pink} />
      </View>
    );
  }

  const feedbackKey = rating ? RATING_FEEDBACK_KEY[rating as Rating] : null;
  const FeedbackIcon = rating ? RATING_FEEDBACK_ICON[rating as Rating] : null;
  const feedbackTone = rating ? RATING_FEEDBACK_TONE[rating as Rating] : null;

  return (
    <SafeAreaView style={G.screen}>
      <Header onBack={() => router.back()} />
      <ScreenHeading
        title={strings.card.memory.editHeading}
        subtitle={strings.card.memory.editSub}
        accessory={<HeartDoodle />}
      />
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={s.headingBlock}>
          <Illustration name="mini-trees-heart" width={MINI_ILLUSTRATION_WIDTH} style={s.headingIllustration} />
        </View>

        <TouchableOpacity
          style={s.photoPlaceholder}
          onPress={handlePickPhoto}
          activeOpacity={0.88}
          disabled={uploadingPhoto}
        >
          {uploadingPhoto ? (
            <ActivityIndicator color={C.pinkDeep} />
          ) : photoUrl ? (
            <Image source={{ uri: photoUrl }} style={s.photoPreview} />
          ) : (
            <View style={s.photoTextWrap}>
              <Camera size={18} color={C.pinkDeep} strokeWidth={2} />
              <Text style={s.photoText}>{strings.card.memory.addPhotoCta}</Text>
            </View>
          )}
        </TouchableOpacity>

        {isFreeform && (
          <>
            <InputField
              label={strings.card.memory.titleLabel}
              value={title}
              onChangeText={setTitle}
              placeholder={strings.card.memory.titlePlaceholder}
              maxLength={40}
              style={s.field}
            />
          </>
        )}

        <InputField
          label={strings.card.memory.reviewLabel}
          value={reviewText}
          onChangeText={setReviewText}
          placeholder={strings.card.memory.reviewPlaceholder}
          multiline
          maxLength={100}
          style={s.field}
        />

        <Text style={s.label}>{c.starRatingLabel}</Text>
        <View style={s.starRow}>
          {[1, 2, 3, 4, 5].map((n) => (
            <TouchableOpacity
              key={n}
              testID={`edit-memory-star-${n}`}
              accessibilityRole="button"
              accessibilityLabel={`${n}점`}
              onPress={() => setRating(n)}
              style={s.starBtn}
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
          <View style={[s.feedbackCard, { backgroundColor: feedbackTone.bg, borderColor: feedbackTone.fg }]}>
            <FeedbackIcon size={18} color={feedbackTone.fg} strokeWidth={2} />
            <Text style={[s.feedbackLabel, { color: feedbackTone.fg }]}>{c.ratingFeedback[feedbackKey]}</Text>
          </View>
        )}

        <PlaceFeedbackSection
          places={places}
          satisfactions={satisfactions}
          prices={prices}
          strings={c.placeSection}
          onSatisfaction={tapSatisfaction}
          onPrice={tapPrice}
        />

        <BigButton onPress={handleSave} variant={saving ? 'disabled' : 'primary'} style={s.saveBtn}>
          {saving ? <ActivityIndicator color={C.white} size="small" /> : strings.common.save}
        </BigButton>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: SP.screen, paddingTop: SP.xxl, paddingBottom: SP.xxl },
  headingBlock: { marginBottom: SP.lg },
  label: { ...DS.typography.bodyCompact, color: C.text, fontWeight: '600', marginTop: SP.lg, marginBottom: SP.sm },
  headingIllustration: { alignSelf: 'flex-end' },
  field: { marginTop: SP.lg },

  photoPlaceholder: {
    marginTop: SP.md,
    height: 160,
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
});
