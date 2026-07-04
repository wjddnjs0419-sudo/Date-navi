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
import { C } from '../../../../constants/colors';
import { G } from '../../../../constants/theme';
import { BackBar, BigButton } from '../../../../components/ui';

export default function EditMemoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

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
      if (!data?.length) { Alert.alert('알림', '본인이 남긴 추억만 수정할 수 있어요.'); return; }
      router.back();
    } catch {
      Alert.alert('오류', '수정 중 문제가 발생했어요.');
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

        <Text style={[s.heading, s.headingTop]}>추억 수정하기</Text>
        <Text style={s.subText}>내용을 바꾼 뒤 저장하면 추억에 반영돼요.</Text>

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
            <Text style={s.photoText}>📷 사진 추가하기</Text>
          )}
        </TouchableOpacity>

        {isFreeform && (
          <>
            <Text style={s.label}>제목</Text>
            <View style={s.inputWrap}>
              <TextInput
                style={s.input}
                value={title}
                onChangeText={setTitle}
                placeholder="예: 한강 피크닉"
                placeholderTextColor={C.textFaint}
                maxLength={40}
              />
            </View>
          </>
        )}

        <Text style={s.label}>한 줄 후기</Text>
        <View style={s.inputWrap}>
          <TextInput
            style={[s.input, s.inputMultiline]}
            value={reviewText}
            onChangeText={setReviewText}
            placeholder="어떤 데이트였나요?"
            placeholderTextColor={C.textFaint}
            multiline
            maxLength={100}
          />
        </View>

        <Text style={s.label}>다시 하고 싶어요?</Text>
        <View style={s.wantAgainRow}>
          {[{ value: true, label: '또 가고 싶어요' }, { value: false, label: '한 번이면 충분' }].map((item) => {
            const on = wantAgain === item.value;
            return (
              <TouchableOpacity
                key={String(item.value)}
                style={[s.wantBtn, on && s.wantBtnOn]}
                onPress={() => setWantAgain(item.value)}
                activeOpacity={0.75}
              >
                <Text style={[s.wantText, on && s.wantTextOn]}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={s.footerSpacer} />
      </ScrollView>

      <View style={s.footer}>
        <BigButton onPress={handleSave} variant={saving ? 'disabled' : 'primary'}>
          {saving ? <ActivityIndicator color={C.white} size="small" /> : '저장하기'}
        </BigButton>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 29 },
  headingTop: { marginTop: 16 },
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
  input: { fontSize: 14, color: C.text, lineHeight: 22 },
  inputMultiline: { minHeight: 70, textAlignVertical: 'top' },
  footerSpacer: { height: 120 },

  photoPlaceholder: {
    marginTop: 14,
    height: 160,
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

  wantAgainRow: { flexDirection: 'row', gap: 10 },
  wantBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: C.white,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: C.border,
  },
  wantBtnOn: { backgroundColor: C.pinkLight, borderColor: C.pink },
  wantText: { fontSize: 14, color: C.textSub, fontWeight: '500' },
  wantTextOn: { color: C.pinkDeep, fontWeight: '700' },

  footer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 12,
    backgroundColor: C.bg,
  },
});
