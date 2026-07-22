import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, Image,
  ActivityIndicator, Alert, TouchableOpacity, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../../../../lib/supabase';
import { Camera, Heart } from 'lucide-react-native';
import { C, SP, R, G } from '../../../../constants/theme';
import { BackBar, BigButton, HeartDoodle } from '../../../../components/ui';
import { Illustration, MINI_ILLUSTRATION_WIDTH } from '../../../../components/illustration';
import { useI18n } from '../../../../lib/i18n';

export default function EditMemoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { strings } = useI18n();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [isFreeform, setIsFreeform] = useState(false);
  const [title, setTitle] = useState('');
  const [reviewText, setReviewText] = useState('');
  const [wantAgain, setWantAgain] = useState(true);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        setLoading(true);
        const { data } = await supabase
          .from('date_memories')
          .select('card_id, title, review, want_again, photo_url')
          .eq('id', id)
          .maybeSingle();
        if (!active) return;
        if (data) {
          setIsFreeform(!data.card_id);
          setTitle(data.title ?? '');
          setReviewText(data.review ?? '');
          setWantAgain(data.want_again);
          setPhotoUrl(data.photo_url);
        }
        setLoading(false);
      })();
      return () => { active = false; };
    }, [id]),
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
      setPhotoUrl(pub.publicUrl);
    } catch {
      Alert.alert(strings.common.error, strings.card.memory.photoUploadError);
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('date_memories')
        .update({
          title: isFreeform ? (title.trim() || null) : undefined,
          review: reviewText.trim(),
          want_again: wantAgain,
          photo_url: photoUrl,
        })
        .eq('id', id)
        .select('id');
      if (error) throw error;
      if (!data?.length) { Alert.alert(strings.common.notice, strings.card.memory.editForbidden); return; }
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

  return (
    <SafeAreaView style={G.screen}>
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <BackBar onPress={() => router.back()} />

        <View style={s.headingBlock}>
          <View style={s.headingRow}>
            <Text style={[s.heading, s.headingTop]}>{strings.card.memory.editHeading}</Text>
            <HeartDoodle style={s.headingHeart} />
          </View>
          <Text style={s.subText}>{strings.card.memory.editSub}</Text>
          <Illustration name="mini-trees-heart" width={MINI_ILLUSTRATION_WIDTH} style={s.headingIllustration} />
        </View>

        <TouchableOpacity
          style={s.photoPlaceholder}
          onPress={handlePickPhoto}
          activeOpacity={0.8}
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
            <Text style={s.label}>{strings.card.memory.titleLabel}</Text>
            <View style={s.inputWrap}>
              <TextInput
                style={s.input}
                value={title}
                onChangeText={setTitle}
                placeholder={strings.card.memory.titlePlaceholder}
                placeholderTextColor={C.textFaint}
                maxLength={40}
              />
            </View>
          </>
        )}

        <Text style={s.label}>{strings.card.memory.reviewLabel}</Text>
        <View style={s.inputWrap}>
          <TextInput
            style={[s.input, s.inputMultiline]}
            value={reviewText}
            onChangeText={setReviewText}
            placeholder={strings.card.memory.reviewPlaceholder}
            placeholderTextColor={C.textFaint}
            multiline
            maxLength={100}
          />
        </View>

        <Text style={s.label}>{strings.card.memory.wantAgainLabel}</Text>
        <View style={s.wantAgainRow}>
          {[{ value: true, label: strings.card.memory.wantAgainYes }, { value: false, label: strings.card.memory.wantAgainNo }].map((item) => {
            const on = wantAgain === item.value;
            return (
              <TouchableOpacity
                key={String(item.value)}
                style={[s.wantBtn, on && s.wantBtnOn]}
                onPress={() => setWantAgain(item.value)}
                activeOpacity={0.75}
              >
                <Heart size={16} color={on ? C.pinkDeep : C.textLight} strokeWidth={2} fill={on ? C.pinkLight : 'none'} />
                <Text style={[s.wantText, on && s.wantTextOn]}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={s.footerSpacer} />
      </ScrollView>

      <View style={s.footer}>
        <BigButton onPress={handleSave} variant={saving ? 'disabled' : 'primary'}>
          {saving ? <ActivityIndicator color={C.white} size="small" /> : strings.common.save}
        </BigButton>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: SP.xl, paddingTop: SP.xl, paddingBottom: SP.xxxl + SP.sm },
  headingBlock: { marginBottom: SP.md },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start' },
  headingHeart: { marginTop: SP.lg + 4, marginLeft: 4 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 29 },
  headingTop: { marginTop: SP.lg },
  subText: { fontSize: 13, color: C.textSub, lineHeight: 20, marginTop: SP.sm },
  headingIllustration: { alignSelf: 'flex-end', marginTop: -8 },
  label: { fontSize: 13, fontWeight: '600', color: C.text, marginTop: SP.xl, marginBottom: SP.sm },
  inputWrap: {
    backgroundColor: C.white,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: SP.lg,
    paddingVertical: SP.md,
  },
  // 단일행 입력에 lineHeight를 주면 iOS에서 세로 중앙이 어긋난다. lineHeight는 multiline 전용.
  input: { fontSize: 14, color: C.text, paddingVertical: 0 },
  inputMultiline: { minHeight: 70, lineHeight: 22, textAlignVertical: 'top' },
  footerSpacer: { height: 120 },

  photoPlaceholder: {
    marginTop: SP.md + 2,
    height: 160,
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

  wantAgainRow: { flexDirection: 'row', gap: SP.sm },
  wantBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: SP.xs,
    paddingVertical: SP.lg - 2,
    borderRadius: R.md,
    backgroundColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: C.border,
  },
  wantBtnOn: { backgroundColor: C.pinkLight, borderColor: C.pink },
  wantText: { fontSize: 14, color: C.textSub, fontWeight: '500' },
  wantTextOn: { color: C.pinkDeep, fontWeight: '700' },

  footer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: SP.xl,
    paddingBottom: SP.xxxl,
    paddingTop: SP.md,
    backgroundColor: C.bg,
  },
});
