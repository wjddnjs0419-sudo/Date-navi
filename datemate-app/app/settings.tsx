import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, SafeAreaView,
  TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../lib/supabase';
import {
  User, Users, Lock, Bell, Globe, Shield,
  HelpCircle, FileText, LogOut, Trash2, Camera, Heart, ChevronRight,
} from 'lucide-react-native';
import { C } from '../constants/colors';
import { ListGroup, ListRow, SectionLabel } from '../components/ui';
import { useI18n, type AppLanguage } from '../lib/i18n';

export default function SettingsScreen() {
  const router = useRouter();
  const { language, setLanguage, strings } = useI18n();
  const t = strings.settings;

  const [displayName, setDisplayName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [daysConnected, setDaysConnected] = useState<number | null>(null);
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

          const { data: profile } = await supabase
            .from('date_planner_profiles')
            .select('display_name, invite_code, couple_id, created_at')
            .eq('user_id', user.id)
            .maybeSingle();

          if (profile) {
            setDisplayName(profile.display_name ?? '');
            setInviteCode(profile.invite_code ?? '');

            if (profile.couple_id) {
              const { data: coupleRow } = await supabase
                .from('date_planner_couples')
                .select('created_at')
                .eq('id', profile.couple_id)
                .maybeSingle();

              if (coupleRow?.created_at) {
                const diff = Math.floor((Date.now() - new Date(coupleRow.created_at).getTime()) / (1000 * 60 * 60 * 24));
                setDaysConnected(diff);
              }

              const { data: partnerProfile } = await supabase
                .from('date_planner_profiles')
                .select('display_name')
                .eq('couple_id', profile.couple_id)
                .neq('user_id', user.id)
                .maybeSingle();

              if (partnerProfile?.display_name) setPartnerName(partnerProfile.display_name);
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

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFF8F3', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={C.pink} />
      </View>
    );
  }

  const initials = displayName.slice(0, 1) || '나';
  const dayLabel = daysConnected !== null
    ? t.daysWith(partnerName || t.partnerFallback, daysConnected)
    : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFF8F3' }}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* 프로필 헤더 */}
        <TouchableOpacity
          style={s.avatarBtn}
          onPress={() => router.push('/account/edit-profile' as any)}
          activeOpacity={0.8}
        >
          <View style={s.avatar}>
            <Text style={s.avatarText}>{initials}</Text>
            <View style={s.avatarCamera}>
              <Camera size={14} strokeWidth={1.8} color={C.text} />
            </View>
          </View>
        </TouchableOpacity>

        <View style={s.profileCenter}>
          <Text style={s.profileName}>{displayName || t.nameEmpty}</Text>
          {dayLabel && (
            <View style={s.dayBadge}>
              <Heart size={10} color={C.pinkDeep} fill={C.pinkDeep} strokeWidth={0} />
              <Text style={s.dayBadgeText}>{dayLabel}</Text>
            </View>
          )}
        </View>

        {/* 통계 */}
        <View style={s.statsRow}>
          {[
            { label: t.statDates, value: String(stats.dates) },
            { label: t.statWantAgain, value: String(stats.wantAgain) },
          ].map((st, i) => (
            <View key={st.label} style={[s.statBox, i > 0 && { borderLeftWidth: 1, borderLeftColor: C.border }]}>
              <Text style={s.statValue}>{st.value}</Text>
              <Text style={s.statLabel}>{st.label}</Text>
            </View>
          ))}
        </View>

        {/* 계정 */}
        <View style={{ marginTop: 28 }}>
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
              value={inviteCode || '—'}
              trailing={<ChevronRight size={14} color={C.textFaint} />}
              onPress={() => router.push('/onboarding/couple-connect' as any)}
            />
            <ListRow
              icon={<Lock size={16} strokeWidth={1.8} color={C.text} />}
              label={t.rowPassword}
              trailing={<ChevronRight size={14} color={C.textFaint} />}
              onPress={() => router.push('/account/change-password' as any)}
              divider={false}
            />
          </ListGroup>
        </View>

        {/* 환경설정 */}
        <View style={{ marginTop: 20 }}>
          <SectionLabel>{t.prefsTitle}</SectionLabel>
          <ListGroup>
            <ListRow
              icon={<Bell size={16} strokeWidth={1.8} color={C.text} />}
              label={t.rowNotifications}
              trailing={<ChevronRight size={14} color={C.textFaint} />}
              onPress={() => router.push('/account/notifications' as any)}
            />
            <ListRow
              icon={<Globe size={16} strokeWidth={1.8} color={C.text} />}
              label={t.rowLanguage}
              value={language === 'ko' ? '한국어' : 'English'}
              trailing={<ChevronRight size={14} color={C.textFaint} />}
              onPress={handleLanguage}
              divider={false}
            />
          </ListGroup>
        </View>

        {/* 정보 */}
        <View style={{ marginTop: 20 }}>
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
        <View style={{ marginTop: 20 }}>
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
        <View style={{ height: 40 }} />
      </ScrollView>
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
  statValue: { fontSize: 18, fontWeight: '800', color: C.pinkDeep },
  statLabel: { fontSize: 11, color: C.textSub, marginTop: 2 },
  version: { textAlign: 'center', fontSize: 11, color: C.textLight, marginTop: 24 },
});
