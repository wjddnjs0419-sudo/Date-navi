import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, Image, ActivityIndicator, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { Camera } from '../../components/iconography';
import { C, DS, G } from '../../constants/theme';
import { BigButton, Header, ProgressDots, ScreenHeading } from '../../components/ui';
import { useI18n } from '../../lib/i18n';
import { supabase } from '../../lib/supabase';
import { removeStorageObjectByUrl } from '../../lib/storageCleanup';

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

      // 새 URL이 저장됐으니 옛 아바타 오브젝트(같은 화면에서 재선택 포함)는 고아 — 지운다.
      if (photoUrl && photoUrl !== pub.publicUrl) void removeStorageObjectByUrl(photoUrl);
      setPhotoUrl(pub.publicUrl);
    } catch {
      Alert.alert(t('common.error'), t('onboarding.photo.uploadError'));
    } finally {
      setUploading(false);
    }
  }

  return (
    <SafeAreaView style={G.screen}>
      <Header
        onBack={() => router.back()}
        center={<ProgressDots current={2} total={4} />}
        right={<Text style={s.stepCount}>2 / 4</Text>}
      />
      <ScreenHeading title={t('onboarding.photo.title')} subtitle={t('onboarding.photo.sub')} variant="input" />
      <View style={s.container}>
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

        <TouchableOpacity style={s.changeBtn} onPress={handlePickPhoto} disabled={uploading} activeOpacity={0.88}>
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
  container: { flex: 1, paddingHorizontal: DS.spacing.screen, paddingTop: DS.spacing.xxl, paddingBottom: DS.spacing.section },
  stepCount: { ...DS.typography.caption, color: C.textMuted },
  avatarWrap: {
    alignSelf: 'center',
    marginTop: DS.spacing.section,
    position: 'relative',
  },
  avatar: {
    width: 150,
    height: 150,
    borderRadius: DS.radius.full,
    backgroundColor: C.pinkLight,
    borderWidth: 1.5,
    borderColor: C.avatarBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...DS.typography.avatarInitial, color: C.pinkDeep },
  avatarImage: { width: 150, height: 150, borderRadius: DS.radius.full },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: DS.radius.full,
    backgroundColor: DS.color.avatarOverlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 40,
    height: 40,
    borderRadius: DS.radius.full,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...DS.elevation.avatarAction,
  },
  changeBtn: {
    alignSelf: 'center',
    marginTop: DS.spacing.lg,
    borderRadius: DS.radius.chip,
    paddingHorizontal: DS.spacing.lg,
    paddingVertical: DS.spacing.sm,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
  },
  changeBtnText: { ...DS.typography.bodyCompact, fontWeight: '600', color: C.pinkDeep },
  hint: { ...DS.typography.caption, color: C.textMuted, textAlign: 'center', marginTop: DS.spacing.md },
  spacer: { flex: 1 },
});
