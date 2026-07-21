import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, Image,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, TouchableOpacity, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../../../lib/supabase';
import { useI18n } from '../../../lib/i18n';
import { Heart, Star, CircleCheck, RotateCcw, Camera } from 'lucide-react-native';
import { C, SP, R } from '../../../constants/theme';
import { BackBar, BigButton } from '../../../components/ui';

const RATING_ICONS: Record<string, typeof Heart> = {
  love: Heart,
  good: Star,
  ok: CircleCheck,
  change: RotateCcw,
};

const RATING_TONES: Record<string, { fg: string; bg: string }> = {
  love: { fg: C.danger, bg: C.pinkLight },
  good: { fg: C.creamFg, bg: C.cream },
  ok: { fg: C.mintFg, bg: C.mint },
  change: { fg: C.lavenderFg, bg: C.lavender },
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
      setPhotoUrl(pub.publicUrl);
    } catch {
      Alert.alert(s.common.error, s.card.memory.photoUploadError);
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleSave() {
    if (!photoUrl) { Alert.alert('', s.card.memory.photoRequiredError); return; }
    if (!rating) { Alert.alert('', c.noRatingError); return; }
    if (!myUserId || !coupleId) { Alert.alert('', s.common.coupleRequired); return; }
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

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex1}>
        <ScrollView style={styles.flex1} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <BackBar />

          <View style={styles.headingBlock}>
            <Text style={styles.heading}>{s.card.memory.newHeading}</Text>
            <Text style={styles.sub}>{s.card.memory.newSub}</Text>
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
              <View style={styles.photoTextWrap}>
                <Camera size={18} color={C.pinkDeep} strokeWidth={2} />
                <Text style={styles.photoText}>{s.card.memory.addPhotoCta}</Text>
              </View>
            )}
          </TouchableOpacity>

          <Text style={[styles.sectionLabel, styles.sectionLabelTop]}>{s.card.memory.titleLabel}</Text>
          <TextInput
            style={styles.titleInput}
            value={title}
            onChangeText={setTitle}
            placeholder={s.card.memory.titlePlaceholder}
            placeholderTextColor={C.textFaint}
            maxLength={40}
            returnKeyType="next"
          />

          <Text style={[styles.sectionLabel, styles.sectionLabelTop]}>{c.ratingLabel}</Text>
          <View style={styles.ratingGrid}>
            {c.ratings.map((item: { key: keyof typeof RATING_ICONS; label: string }) => {
              const sel = rating === item.key;
              const Icon = RATING_ICONS[item.key];
              const tone = RATING_TONES[item.key];
              return (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.ratingCard, sel && { backgroundColor: tone.bg, borderColor: tone.fg, borderWidth: 1.5 }]}
                  onPress={() => setRating(item.key)}
                  activeOpacity={0.75}
                >
                  <View style={[styles.ratingIconWrap, sel && { backgroundColor: C.white }]}>
                    <Icon size={18} color={sel ? tone.fg : C.textSub} strokeWidth={2} />
                  </View>
                  <Text style={[styles.ratingLabel, sel && { color: tone.fg, fontWeight: '600' }]}>{item.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.sectionLabel, styles.sectionLabelTop]}>{c.reviewLabel}</Text>
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

          <BigButton onPress={handleSave} variant={saving ? 'disabled' : 'primary'} style={styles.saveBtn}>
            {saving ? s.common.saving : c.saveButton}
          </BigButton>
        </ScrollView>
      </KeyboardAvoidingView>
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
  sectionLabelTop: { marginTop: SP.xl },
  saveBtn: { marginTop: SP.xxl },

  titleInput: {
    backgroundColor: C.white,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: SP.lg,
    paddingVertical: SP.md,
    fontSize: 14,
    color: C.text,
  },

  ratingGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.sm },
  ratingCard: {
    width: '47%',
    backgroundColor: C.white,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: SP.md + 2,
    gap: SP.sm,
  },
  ratingIconWrap: {
    width: 36,
    height: 36,
    borderRadius: R.sm,
    backgroundColor: C.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingLabel: { fontSize: 13, color: C.textSub, fontWeight: '500' },

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
    height: 180,
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
});
