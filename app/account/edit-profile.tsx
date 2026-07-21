import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, Alert, Image, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../../lib/supabase';
import { Camera, Check } from 'lucide-react-native';
import { C } from '../../constants/colors';
import { G, SP, R, T } from '../../constants/theme';
import { BackBar, BigButton, ListGroup, ListRow, SectionLabel } from '../../components/ui';
import { useI18n } from '../../lib/i18n';

export default function EditProfileScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const PLANNING_STYLES = [
    t('account.editProfile.planningOptions.often'),
    t('account.editProfile.planningOptions.together'),
    t('account.editProfile.planningOptions.okPickHardPlan'),
    t('account.editProfile.planningOptions.hardToSayOpinion'),
    t('account.editProfile.planningOptions.depends'),
  ];

  const [nickname, setNickname] = useState('');
  const [planningStyle, setPlanningStyle] = useState(2);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [initials, setInitials] = useState(t('card.memory.meFallback'));

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from('date_planner_profiles')
          .select('display_name, profile_photo_url')
          .eq('user_id', user.id)
          .maybeSingle();

        if (profile?.display_name) {
          setNickname(profile.display_name);
          setInitials(profile.display_name.slice(0, 1));
        }
        if (profile?.profile_photo_url) setPhotoUrl(profile.profile_photo_url);

        const { data: prefs } = await supabase
          .from('user_preferences')
          .select('planning_style')
          .eq('user_id', user.id)
          .maybeSingle();

        if (prefs?.planning_style) {
          const idx = PLANNING_STYLES.findIndex(s => s === prefs.planning_style);
          if (idx >= 0) setPlanningStyle(idx);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handlePickPhoto() {
    if (uploadingPhoto) return;

    // 갤러리 접근 권한 요청 — 거부 시 iOS 설정으로 안내
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        t('account.editProfile.photoPermTitle'),
        t('account.editProfile.photoPermMessage'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('card.memory.openSettingsCta'), onPress: () => Linking.openSettings() },
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

    setUploadingPhoto(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('no user');

      const base64 = result.assets[0].base64!;
      const path = `${user.id}/avatar_${Date.now()}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, decode(base64), { contentType: 'image/jpeg', upsert: true });
      if (uploadError) throw uploadError;

      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = pub.publicUrl;

      // 프로필 행이 없을 수도 있으므로 upsert로 사진 URL 저장
      const { error: saveError } = await supabase
        .from('date_planner_profiles')
        .upsert(
          {
            id: user.id,
            user_id: user.id,
            display_name: nickname.trim() || initials,
            profile_photo_url: publicUrl,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        );
      if (saveError) throw saveError;

      setPhotoUrl(publicUrl);
    } catch {
      Alert.alert(t('common.error'), t('card.memory.photoUploadError'));
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleSave() {
    const trimmed = nickname.trim();
    if (!trimmed) { Alert.alert(t('account.editProfile.nicknameRequiredError')); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('no user');

      // update가 아닌 upsert — 프로필 행이 없는 계정에서도 닉네임이 확실히 저장된다.
      // (update는 행이 없으면 0건 매칭으로 조용히 무시되어 마이페이지에 반영되지 않았음)
      const { error: profileError } = await supabase
        .from('date_planner_profiles')
        .upsert(
          {
            id: user.id,
            user_id: user.id,
            display_name: trimmed,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        );
      if (profileError) throw profileError;

      // 계획 성향 저장은 best-effort — 실패해도 닉네임 저장/이동을 막지 않는다.
      try {
        const { error: prefsError } = await supabase
          .from('user_preferences')
          .upsert(
            { user_id: user.id, planning_style: PLANNING_STYLES[planningStyle] },
            { onConflict: 'user_id' },
          );
        if (prefsError) console.warn('planning_style 저장 실패:', prefsError.message);
      } catch (e) {
        console.warn('planning_style 저장 예외:', e);
      }

      Alert.alert(t('account.editProfile.saveSuccessTitle'), t('account.editProfile.saveSuccessMessage'));
      router.back();
    } catch {
      Alert.alert(t('common.error'), t('account.editProfile.saveError'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={[G.screen, G.center]}>
        <ActivityIndicator size="large" color={C.pink} />
      </View>
    );
  }

  return (
    <SafeAreaView style={G.screen}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <BackBar />
        <Text style={[T.h1, s.headingSpacing]}>{t('account.editProfile.heading')}</Text>

        <View style={s.avatarWrap}>
          <TouchableOpacity onPress={handlePickPhoto} activeOpacity={0.8} disabled={uploadingPhoto}>
            <View style={s.avatar}>
              {photoUrl ? (
                <Image source={{ uri: photoUrl }} style={s.avatarImage} />
              ) : (
                <Text style={s.avatarText}>{initials}</Text>
              )}
              {uploadingPhoto && (
                <View style={s.avatarOverlay}>
                  <ActivityIndicator color={C.white} />
                </View>
              )}
              <View style={s.avatarCamera}>
                <Camera size={16} strokeWidth={1.8} color={C.text} />
              </View>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={s.changePhotoWrap} onPress={handlePickPhoto} disabled={uploadingPhoto}>
            <Text style={s.changePhotoBtn}>{t('account.editProfile.changePhotoCta')}</Text>
          </TouchableOpacity>
        </View>

        <View style={s.nicknameSection}>
          <SectionLabel>{t('account.editProfile.nicknameLabel')}</SectionLabel>
          <ListGroup>
            <ListRow
              label={
                <TextInput
                  style={s.nicknameInput}
                  value={nickname}
                  onChangeText={(value) => {
                    setNickname(value);
                    if (value.length > 0) setInitials(value.slice(0, 1));
                  }}
                  maxLength={12}
                  returnKeyType="done"
                />
              }
              divider={false}
              trailing={<Text style={s.charCount}>{nickname.length}/12</Text>}
            />
          </ListGroup>
          <Text style={s.fieldHint}>{t('account.editProfile.nicknameHint')}</Text>
        </View>

        <View style={s.planningSection}>
          <SectionLabel>{t('account.editProfile.planningLabel')}</SectionLabel>
          <ListGroup>
            {PLANNING_STYLES.map((option, i, arr) => (
              <ListRow
                key={option}
                onPress={() => setPlanningStyle(i)}
                label={
                  <Text style={[s.optionText, { color: i === planningStyle ? C.pinkDeep : C.text, fontWeight: i === planningStyle ? '600' : '500' }]}>
                    {option}
                  </Text>
                }
                trailing={
                  i === planningStyle ? (
                    <View style={s.checkCircle}>
                      <Check size={11} color={C.white} strokeWidth={3} />
                    </View>
                  ) : null
                }
                divider={i < arr.length - 1}
              />
            ))}
          </ListGroup>
        </View>

        <View style={s.bottomSpacer} />
      </ScrollView>

      <View style={s.footer}>
        <BigButton onPress={handleSave} variant={saving ? 'disabled' : 'primary'}>
          {saving ? <ActivityIndicator color={C.white} size="small" /> : t('account.editProfile.saveCta')}
        </BigButton>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: SP.xl, paddingTop: SP.lg, paddingBottom: SP.xxxl + SP.sm },
  headingSpacing: { marginTop: SP.lg },
  avatarWrap: { alignItems: 'center', marginTop: SP.xxl },
  changePhotoWrap: { marginTop: SP.md },
  nicknameSection: { marginTop: SP.xxl + SP.xs },
  planningSection: { marginTop: SP.xl },
  optionText: { fontSize: 14 },
  bottomSpacer: { height: 120 },
  avatar: {
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: C.pinkMid,
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  avatarText: { fontSize: 40, fontWeight: '800', color: C.white },
  avatarImage: { width: 110, height: 110, borderRadius: 55 },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 55,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarCamera: {
    position: 'absolute', bottom: 0, right: 0,
    width: 36, height: 36, borderRadius: R.btn,
    backgroundColor: C.white,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: C.border,
  },
  changePhotoBtn: { fontSize: 13, color: C.pinkDeep, fontWeight: '600' },
  nicknameInput: { fontSize: 14, color: C.text, fontWeight: '500', flex: 1 },
  charCount: { fontSize: 11, color: C.textLight },
  fieldHint: { fontSize: 11, color: C.textMuted, marginTop: SP.xs + 2, paddingHorizontal: SP.xs },
  checkCircle: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: C.pink,
    alignItems: 'center', justifyContent: 'center',
  },
  footer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: SP.xl,
    paddingBottom: SP.xxxl,
    paddingTop: SP.md,
    backgroundColor: C.bg,
  },
});
