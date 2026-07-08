import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator, Alert, Linking, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as ExpoLocation from 'expo-location';
import { supabase } from '../lib/supabase';
import {
  User, Users, Bell, Globe, Shield,
  HelpCircle, FileText, LogOut, Trash2, Camera, Heart, ChevronRight, MapPin,
} from 'lucide-react-native';
import { C } from '../constants/colors';
import { G } from '../constants/theme';
import { ListGroup, ListRow, SectionLabel } from '../components/ui';
import { DateWheelPicker, PickerSheet, defaultIsoDate } from '../components/pickers';
import { useI18n, type AppLanguage } from '../lib/i18n';

type CoupleConnectionStatus = 'none' | 'waiting' | 'linked';

function toDateOnly(value?: string | null) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysSince(dateStr: string) {
  const start = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(start.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
}

export default function SettingsScreen() {
  const router = useRouter();
  const { language, setLanguage, strings } = useI18n();
  const t = strings.settings;

  const [displayName, setDisplayName] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [coupleStatus, setCoupleStatus] = useState<CoupleConnectionStatus>('none');
  const [daysConnected, setDaysConnected] = useState<number | null>(null);
  const [relationshipStartDate, setRelationshipStartDate] = useState('');
  const [draftRelationshipDate, setDraftRelationshipDate] = useState(defaultIsoDate());
  const [relationshipPickerOpen, setRelationshipPickerOpen] = useState(false);
  const [savingRelationshipDate, setSavingRelationshipDate] = useState(false);
  const [partnerName, setPartnerName] = useState('');
  const [stats, setStats] = useState({ dates: 0, wantAgain: 0 });
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      (async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;
          setCoupleStatus('none');
          setPartnerName('');
          setDaysConnected(null);
          setRelationshipStartDate('');

          const { data: profile } = await supabase
            .from('date_planner_profiles')
            .select('display_name, profile_photo_url, couple_id, anniversary_date')
            .eq('user_id', user.id)
            .maybeSingle();

          if (profile) {
            setDisplayName(profile.display_name ?? '');
            setPhotoUrl(profile.profile_photo_url ?? null);

            if (profile.couple_id) {
              // 초대 코드는 profiles가 아니라 date_planner_couples.code에 있다.
              const { data: coupleRow } = await supabase
                .from('date_planner_couples')
                .select('created_at, code, status, owner_user_id, partner_user_id')
                .eq('id', profile.couple_id)
                .maybeSingle();

              setCoupleStatus(coupleRow ? (coupleRow.status === 'linked' && coupleRow.partner_user_id ? 'linked' : 'waiting') : 'none');

              const { data: partnerProfile } = await supabase
                .from('date_planner_profiles')
                .select('display_name, anniversary_date')
                .eq('couple_id', profile.couple_id)
                .neq('user_id', user.id)
                .maybeSingle();

              if (partnerProfile?.display_name) setPartnerName(partnerProfile.display_name);

              const ownerAnniversary = coupleRow?.owner_user_id === user.id
                ? profile.anniversary_date
                : partnerProfile?.anniversary_date;
              const startDate = toDateOnly(ownerAnniversary)
                || toDateOnly(profile.anniversary_date)
                || toDateOnly(partnerProfile?.anniversary_date)
                || toDateOnly(coupleRow?.created_at);
              const days = daysSince(startDate);
              setRelationshipStartDate(startDate);
              setDaysConnected(days);
            } else if (profile.anniversary_date) {
              const startDate = toDateOnly(profile.anniversary_date);
              setRelationshipStartDate(startDate);
              setDaysConnected(daysSince(startDate));
            }
          }

          const { data: memories } = await supabase
            .from('date_memories')
            .select('id, want_again')
            .eq('user_id', user.id);

          if (memories) {
            setStats({
              dates: memories.length,
              wantAgain: memories.filter(m => m.want_again).length,
            });
          }
        } finally {
          setLoading(false);
        }
      })();
    }, []),
  );

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/(auth)' as any);
  }

  function handleLanguage() {
    Alert.alert(t.langPickTitle, t.langPickMessage, [
      { text: t.korean, onPress: () => setLanguage('ko' as AppLanguage), style: language === 'ko' ? 'destructive' : 'default' },
      { text: t.english, onPress: () => setLanguage('en' as AppLanguage), style: language === 'en' ? 'destructive' : 'default' },
      { text: t.cancel, style: 'cancel' },
    ]);
  }

  function handleHelp() {
    Alert.alert(t.helpTitle, t.helpMessage);
  }

  function openRelationshipPicker() {
    setDraftRelationshipDate(relationshipStartDate || defaultIsoDate());
    setRelationshipPickerOpen(true);
  }

  async function handleSaveRelationshipDate() {
    if (savingRelationshipDate) return;
    setSavingRelationshipDate(true);
    try {
      const { error } = await supabase
        .rpc('set_date_planner_couple_anniversary', { p_anniversary_date: draftRelationshipDate });
      if (error) throw error;

      setRelationshipStartDate(draftRelationshipDate);
      setDaysConnected(daysSince(draftRelationshipDate));
      setRelationshipPickerOpen(false);
    } catch {
      Alert.alert(strings.common.error, t.relationshipDateSaveError);
    } finally {
      setSavingRelationshipDate(false);
    }
  }

  async function handleNotifications() {
    const { status, canAskAgain } = await Notifications.getPermissionsAsync();

    // 아직 한 번도 안 물어봤으면 iOS 권한 팝업을 띄운다(이때부터 설정에 알림 항목 생김).
    if (status === 'undetermined' && canAskAgain) {
      const res = await Notifications.requestPermissionsAsync();
      if (res.status === 'granted') {
        Alert.alert(t.notificationOnTitle, t.notificationOnBody);
      } else {
        Alert.alert(t.notificationOffTitle, t.notificationOffBody, [
          { text: strings.common.ok, style: 'cancel' },
          { text: strings.common.settingsOpen, onPress: () => Linking.openSettings() },
        ]);
      }
      return;
    }

    // 이미 결정된 상태면(허용/거부) iOS 설정에서 직접 바꾸게 안내.
    Alert.alert(
      t.notificationSettingsTitle,
      status === 'granted'
        ? t.notificationEnabledBody
        : t.notificationDisabledBody,
      [
        { text: strings.common.cancel, style: 'cancel' },
        { text: strings.common.settingsOpen, onPress: () => Linking.openSettings() },
      ],
    );
  }

  async function handleLocation() {
    const { status, canAskAgain } = await ExpoLocation.getForegroundPermissionsAsync();

    // 아직 한 번도 안 물어봤으면 OS 권한 팝업을 띄운다.
    if (status === 'undetermined' && canAskAgain) {
      const res = await ExpoLocation.requestForegroundPermissionsAsync();
      if (res.status === 'granted') {
        Alert.alert(t.locationOnTitle, t.locationOnBody);
      } else {
        Alert.alert(t.locationOffTitle, t.locationOffBody, [
          { text: strings.common.ok, style: 'cancel' },
          { text: strings.common.settingsOpen, onPress: () => Linking.openSettings() },
        ]);
      }
      return;
    }

    // 이미 결정된 상태면(허용/거부) OS 설정에서 직접 바꾸게 안내.
    Alert.alert(
      t.locationSettingsTitle,
      status === 'granted'
        ? t.locationEnabledBody
        : t.locationDisabledBody,
      [
        { text: strings.common.cancel, style: 'cancel' },
        { text: strings.common.settingsOpen, onPress: () => Linking.openSettings() },
      ],
    );
  }

  if (loading) {
    return (
      <View style={[G.screen, G.center]}>
        <ActivityIndicator size="large" color={C.pink} />
      </View>
    );
  }

  const initials = displayName.slice(0, 1) || t.meInitial;
  const dayLabel = daysConnected !== null
    ? t.daysWith(partnerName || t.partnerFallback, daysConnected)
    : null;
  const coupleStatusLabel = coupleStatus === 'linked'
    ? (partnerName || t.rowCoupleLinked)
    : coupleStatus === 'waiting'
      ? t.rowCoupleWaiting
      : t.rowCoupleNone;

  return (
    <SafeAreaView style={G.screen}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* 프로필 헤더 */}
        <TouchableOpacity
          style={s.avatarBtn}
          onPress={() => router.push('/account/edit-profile' as any)}
          activeOpacity={0.8}
        >
          <View style={s.avatar}>
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} style={s.avatarImage} />
            ) : (
              <Text style={s.avatarText}>{initials}</Text>
            )}
            <View style={s.avatarCamera}>
              <Camera size={14} strokeWidth={1.8} color={C.text} />
            </View>
          </View>
        </TouchableOpacity>

        <View style={s.profileCenter}>
          <Text style={s.profileName}>{displayName || t.nameEmpty}</Text>
          {dayLabel && (
            <TouchableOpacity style={s.dayBadge} activeOpacity={0.8} onPress={openRelationshipPicker}>
              <Heart size={10} color={C.pinkDeep} fill={C.pinkDeep} strokeWidth={0} />
              <Text style={s.dayBadgeText}>{dayLabel}</Text>
              <ChevronRight size={10} color={C.pinkDeep} strokeWidth={2.2} />
            </TouchableOpacity>
          )}
        </View>

        {/* 통계 */}
        <View style={s.statsRow}>
          {[
            { label: t.statDates, value: String(stats.dates) },
            { label: t.statWantAgain, value: String(stats.wantAgain) },
          ].map((st, i) => (
            <View key={st.label} style={[s.statBox, i > 0 && s.statBoxDivider]}>
              <Text style={s.statValue}>{st.value}</Text>
              <Text style={s.statLabel}>{st.label}</Text>
            </View>
          ))}
        </View>

        {/* 계정 */}
        <View style={s.sectionFirst}>
          <SectionLabel>{t.accountTitle}</SectionLabel>
          <ListGroup>
            <ListRow
              icon={<User size={16} strokeWidth={1.8} color={C.text} />}
              label={t.rowNickname}
              value={displayName || '—'}
              trailing={<ChevronRight size={14} color={C.textFaint} />}
              onPress={() => router.push('/account/edit-profile' as any)}
            />
            <ListRow
              icon={<Users size={16} strokeWidth={1.8} color={C.text} />}
              label={t.rowCouple}
              value={coupleStatusLabel}
              trailing={<ChevronRight size={14} color={C.textFaint} />}
              onPress={() => router.push('/onboarding/couple-connect' as any)}
              divider={false}
            />
          </ListGroup>
        </View>

        {/* 환경설정 */}
        <View style={s.section}>
          <SectionLabel>{t.prefsTitle}</SectionLabel>
          <ListGroup>
            <ListRow
              icon={<Bell size={16} strokeWidth={1.8} color={C.text} />}
              label={t.rowNotifications}
              trailing={<ChevronRight size={14} color={C.textFaint} />}
              onPress={handleNotifications}
            />
            <ListRow
              icon={<MapPin size={16} strokeWidth={1.8} color={C.text} />}
              label={t.rowLocation}
              trailing={<ChevronRight size={14} color={C.textFaint} />}
              onPress={handleLocation}
            />
            <ListRow
              icon={<Globe size={16} strokeWidth={1.8} color={C.text} />}
              label={t.rowLanguage}
              value={strings.language[language]}
              trailing={<ChevronRight size={14} color={C.textFaint} />}
              onPress={handleLanguage}
              divider={false}
            />
          </ListGroup>
        </View>

        {/* 정보 */}
        <View style={s.section}>
          <SectionLabel>{t.infoTitle}</SectionLabel>
          <ListGroup>
            <ListRow
              icon={<HelpCircle size={16} strokeWidth={1.8} color={C.text} />}
              label={t.rowHelp}
              trailing={<ChevronRight size={14} color={C.textFaint} />}
              onPress={handleHelp}
            />
            <ListRow
              icon={<FileText size={16} strokeWidth={1.8} color={C.text} />}
              label={t.rowTerms}
              trailing={<ChevronRight size={14} color={C.textFaint} />}
              onPress={() => router.push('/legal/terms' as any)}
            />
            <ListRow
              icon={<Shield size={16} strokeWidth={1.8} color={C.text} />}
              label={t.rowPrivacy}
              trailing={<ChevronRight size={14} color={C.textFaint} />}
              onPress={() => router.push('/legal/privacy' as any)}
              divider={false}
            />
          </ListGroup>
        </View>

        {/* 로그아웃 / 탈퇴 */}
        <View style={s.section}>
          <ListGroup>
            <ListRow
              icon={<LogOut size={16} strokeWidth={1.8} color={C.text} />}
              label={t.logout}
              onPress={handleLogout}
            />
            <ListRow
              icon={<Trash2 size={16} strokeWidth={1.8} color="#EF4444" />}
              label={t.deleteTitle}
              destructive
              onPress={() => router.push('/account/delete-account' as any)}
              divider={false}
            />
          </ListGroup>
        </View>

        <Text style={s.version}>Date Navi v1.0.0</Text>
        <View style={s.bottomSpacer} />
      </ScrollView>
      <PickerSheet
        visible={relationshipPickerOpen}
        title={t.relationshipDateTitle}
        onCancel={() => setRelationshipPickerOpen(false)}
        onConfirm={handleSaveRelationshipDate}
        confirmLabel={savingRelationshipDate ? t.savingDone : strings.common.done}
      >
        <DateWheelPicker
          value={draftRelationshipDate}
          minYear={new Date().getFullYear() - 30}
          maxYear={new Date().getFullYear()}
          onChange={setDraftRelationshipDate}
        />
      </PickerSheet>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40 },
  avatarBtn: { alignSelf: 'center' },
  avatar: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: C.pinkMid,
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  avatarImage: { width: 100, height: 100, borderRadius: 50 },
  avatarText: { fontSize: 36, fontWeight: '800', color: C.white },
  avatarCamera: {
    position: 'absolute', bottom: 0, right: 0,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: C.white,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: C.border,
  },
  profileCenter: { alignItems: 'center', marginTop: 12 },
  profileName: { fontSize: 18, fontWeight: '700', color: C.text },
  dayBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: 6,
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: C.pinkLight,
  },
  dayBadgeText: { fontSize: 11, fontWeight: '600', color: C.pinkDeep },
  statsRow: {
    flexDirection: 'row',
    marginTop: 24,
    backgroundColor: C.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  statBox: { flex: 1, padding: 16, alignItems: 'center' },
  statBoxDivider: { borderLeftWidth: 1, borderLeftColor: C.border },
  statValue: { fontSize: 18, fontWeight: '800', color: C.pinkDeep },
  statLabel: { fontSize: 11, color: C.textSub, marginTop: 2 },
  sectionFirst: { marginTop: 28 },
  section: { marginTop: 20 },
  version: { textAlign: 'center', fontSize: 11, color: C.textLight, marginTop: 24 },
  bottomSpacer: { height: 40 },
});
