import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, Image, ActivityIndicator, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { Camera } from 'lucide-react-native';
import { C } from '../../constants/colors';
import { G } from '../../constants/theme';
import { BackBar, BigButton, ProgressDots } from '../../components/ui';
import { useI18n } from '../../lib/i18n';
import { supabase } from '../../lib/supabase';

export default function PhotoScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const [initial, setInitial] = useState(t('onboarding.photo.initial'));
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // 닉네임 단계에서 저장한 이름의 첫 글자를 아바타 이니셜로 쓴다.
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from('date_planner_profiles')
        .select('display_name, profile_photo_url')
        .eq('user_id', user.id)
        .maybeSingle<{ display_name: string | null; profile_photo_url: string | null }>();
      if (profile?.display_name) setInitial(profile.display_name.slice(0, 1));
      if (profile?.profile_photo_url) setPhotoUrl(profile.profile_photo_url);
    })();
  }, []);

  async function handlePickPhoto() {
    if (uploading) return;

    // 갤러리 접근 권한 요청 — 거부 시 설정으로 안내
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        t('onboarding.photo.permTitle'),
        t('onboarding.photo.permMessage'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('onboarding.photo.openSettingsCta'), onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });
    if (result.canceled || !result.assets[0]?.base64) return;

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('no user');

      const path = `${user.id}/avatar_${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, decode(result.assets[0].base64!), { contentType: 'image/jpeg', upsert: true });
      if (uploadError) throw uploadError;

      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);

      // 프로필 행이 아직 없을 수 있어 upsert로 저장한다.
      const { error: saveError } = await supabase
        .from('date_planner_profiles')
        .upsert(
          {
            id: user.id,
            user_id: user.id,
            profile_photo_url: pub.publicUrl,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        );
      if (saveError) throw saveError;

      setPhotoUrl(pub.publicUrl);
    } catch {
      Alert.alert(t('common.error'), t('onboarding.photo.uploadError'));
    } finally {
      setUploading(false);
    }
  }

  return (
    <SafeAreaView style={G.screen}>
      <View style={s.container}>
        <BackBar />
        <View style={s.progressRow}>
          <ProgressDots current={2} total={4} />
          <Text style={s.stepCount}>2 / 4</Text>
        </View>

        <View style={s.headingBlock}>
          <Text style={s.heading}>{t('onboarding.photo.title')}</Text>
          <Text style={s.subText}>{t('onboarding.photo.sub')}</Text>
        </View>

        <View style={s.avatarWrap}>
          <View style={s.avatar}>
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} style={s.avatarImage} />
            ) : (
              <Text style={s.avatarText}>{initial}</Text>
            )}
            {uploading && (
              <View style={s.avatarOverlay}>
                <ActivityIndicator color={C.white} />
              </View>
            )}
          </View>
          <TouchableOpacity
            style={s.cameraBtn}
            onPress={handlePickPhoto}
            disabled={uploading}
            accessibilityRole="button"
            accessibilityLabel={t('onboarding.photo.change')}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          >
            <Camera size={18} color={C.pinkDeep} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={s.changeBtn} onPress={handlePickPhoto} disabled={uploading}>
          <Text style={s.changeBtnText}>{t('onboarding.photo.change')}</Text>
        </TouchableOpacity>

        <Text style={s.hint}>{t('onboarding.photo.hint')}</Text>

        <View style={s.spacer} />

        <BigButton onPress={() => router.push('/onboarding/anniversary' as any)}>
          {t('onboarding.photo.next')}
        </BigButton>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32 },
  progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  stepCount: { fontSize: 11, color: C.textMuted },
  headingBlock: { marginTop: 20 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 29 },
  subText: { fontSize: 13, color: C.textSub, marginTop: 8 },
  avatarWrap: {
    alignSelf: 'center',
    marginTop: 36,
    position: 'relative',
  },
  avatar: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: C.pinkLight,
    borderWidth: 1.5,
    borderColor: '#F2D6DA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 46, fontWeight: '700', color: C.pinkDeep },
  avatarImage: { width: 150, height: 150, borderRadius: 75 },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 75,
    backgroundColor: 'rgba(40,30,25,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  changeBtn: {
    alignSelf: 'center',
    marginTop: 20,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
  },
  changeBtnText: { fontSize: 13, fontWeight: '600', color: C.pinkDeep },
  hint: { fontSize: 11, color: C.textMuted, textAlign: 'center', marginTop: 12 },
  spacer: { flex: 1 },
});
