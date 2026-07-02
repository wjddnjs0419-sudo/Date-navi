import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, Image,
  SafeAreaView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, TouchableOpacity, Linking,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../../../lib/supabase';
import { useI18n } from '../../../lib/i18n';
import { C } from '../../../constants/colors';
import { BackBar, BigButton } from '../../../components/ui';

const RATING_ICONS: Record<string, string> = {
  love: '❤️',
  good: '⭐',
  ok: '✅',
  change: '🔄',
};

export default function NewMemoryScreen() {
  const router = useRouter();
  const { strings: s } = useI18n();
  const c = s.review;

  const [coupleId, setCoupleId] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [rating, setRating] = useState<string | null>(null);
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
        '사진 접근 권한 필요',
        '추억 사진을 등록하려면 설정에서 사진 접근을 허용해주세요.',
        [
          { text: '취소', style: 'cancel' },
          { text: '설정 열기', onPress: () => Linking.openSettings() },
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
      setPhotoUrl(pub.publicUrl);
    } catch {
      Alert.alert('오류', '사진 업로드 중 문제가 생겼어요.');
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleSave() {
    if (!photoUrl) { Alert.alert('', '사진을 추가해주세요.'); return; }
    if (!rating) { Alert.alert('', c.noRatingError); return; }
    if (!myUserId || !coupleId) { Alert.alert('', c.missingCoupleError); return; }
    if (saving) return;
    setSaving(true);
    try {
      const wantAgain = rating === 'love' || rating === 'good';

      const { error } = await supabase.from('date_memories').insert({
        couple_id: coupleId,
        card_id: null,
        user_id: myUserId,
        title: title.trim() || null,
        review: reviewText.trim(),
        want_again: wantAgain,
        photo_url: photoUrl,
      });
      if (error) throw error;
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
            <Text style={styles.heading}>새 추억 남기기</Text>
            <Text style={styles.sub}>사진과 함께 그날의 기억을 남겨보세요.</Text>
          </View>

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
              <Text style={styles.photoText}>📷 사진 추가하기</Text>
            )}
          </TouchableOpacity>

          <Text style={[styles.sectionLabel, { marginTop: 20 }]}>제목</Text>
          <TextInput
            style={styles.titleInput}
            value={title}
            onChangeText={setTitle}
            placeholder="예: 한강 피크닉"
            placeholderTextColor={C.textFaint}
            maxLength={40}
            returnKeyType="next"
          />

          <Text style={[styles.sectionLabel, { marginTop: 20 }]}>{c.ratingLabel}</Text>
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

  titleInput: {
    backgroundColor: C.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: C.text,
  },

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
    height: 180,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: C.pinkBorder,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoPreview: { width: '100%', height: '100%' },
  photoText: { fontSize: 13, color: C.textMuted },
});
