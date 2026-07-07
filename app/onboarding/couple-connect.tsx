import { useCallback, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert,
  ScrollView, Share, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as ExpoLinking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import { logEvent } from '../../lib/analytics';
import {
  CalendarDays, ChevronRight, Share2, Users, XCircle,
} from 'lucide-react-native';
import { C } from '../../constants/colors';
import { G } from '../../constants/theme';
import { BackBar, BigButton, ListGroup, ListRow, SectionLabel, SoftCard } from '../../components/ui';
import { DateWheelPicker, PickerSheet, defaultIsoDate } from '../../components/pickers';
import { useI18n } from '../../lib/i18n';
import {
  PENDING_INVITE_CODE_KEY,
  formatInviteCode,
  inviteCodeBody,
  normalizeInviteCode,
} from '../../lib/couple-invite';

type ConnectionStatus = 'none' | 'waiting' | 'linked';

type CoupleRow = {
  id: string;
  code: string | null;
  owner_user_id: string;
  partner_user_id: string | null;
  status: 'waiting' | 'linked';
  created_at: string | null;
  linked_at: string | null;
};

type ProfileRow = {
  display_name: string | null;
  couple_id: string | null;
  anniversary_date: string | null;
};

function makeCodeBody() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

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

function formatDate(value: string, language: 'ko' | 'en') {
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return '—';
  if (language === 'en') return `${Number(month)}/${Number(day)}/${year}`;
  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}

export default function CoupleConnectScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string }>();
  const { language, strings } = useI18n();
  const t = strings.coupleConnect;

  const [userId, setUserId] = useState('');
  const [status, setStatus] = useState<ConnectionStatus>('none');
  const [couple, setCouple] = useState<CoupleRow | null>(null);
  const [partnerName, setPartnerName] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [relationshipDate, setRelationshipDate] = useState('');
  const [draftRelationshipDate, setDraftRelationshipDate] = useState(defaultIsoDate());
  const [relationshipPickerOpen, setRelationshipPickerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [savingRelationshipDate, setSavingRelationshipDate] = useState(false);
  const [backBlockedVisible, setBackBlockedVisible] = useState(false);

  const displayCode = formatInviteCode(couple?.code) || 'DN-????';
  const canJoin = !!inviteCodeBody(inputCode) && !busy;

  const loadConnection = useCallback(async () => {
    setLoading(true);
    try {
      const queryCode = normalizeInviteCode(params.code);
      const pendingCode = queryCode || normalizeInviteCode(await AsyncStorage.getItem(PENDING_INVITE_CODE_KEY));
      if (pendingCode) setInputCode((prev) => prev || pendingCode);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('no user');
      setUserId(user.id);

      const { data: profile } = await supabase
        .from('date_planner_profiles')
        .select('display_name, couple_id, anniversary_date')
        .eq('user_id', user.id)
        .maybeSingle<ProfileRow>();

      setPartnerName('');
      setCouple(null);
      setStatus('none');

      if (!profile?.couple_id) {
        const startDate = toDateOnly(profile?.anniversary_date);
        setRelationshipDate(startDate);
        setDraftRelationshipDate(startDate || defaultIsoDate());
        return;
      }

      const { data: coupleRow } = await supabase
        .from('date_planner_couples')
        .select('id, code, owner_user_id, partner_user_id, status, created_at, linked_at')
        .eq('id', profile.couple_id)
        .maybeSingle<CoupleRow>();

      if (!coupleRow) return;

      const isLinked = coupleRow.status === 'linked' && !!coupleRow.partner_user_id;
      setCouple(coupleRow);
      setStatus(isLinked ? 'linked' : 'waiting');

      let partnerAnniversary = '';
      if (isLinked) {
        const partnerId = coupleRow.owner_user_id === user.id
          ? coupleRow.partner_user_id
          : coupleRow.owner_user_id;

        const { data: partnerProfile } = await supabase
          .from('date_planner_profiles')
          .select('display_name, anniversary_date')
          .eq('user_id', partnerId)
          .maybeSingle<{ display_name: string | null; anniversary_date: string | null }>();

        partnerAnniversary = toDateOnly(partnerProfile?.anniversary_date);
        setPartnerName(partnerProfile?.display_name || t.partnerFallback);
      }

      const ownerAnniversary = coupleRow.owner_user_id === user.id
        ? profile.anniversary_date
        : partnerAnniversary;
      const startDate = toDateOnly(ownerAnniversary)
        || toDateOnly(profile.anniversary_date)
        || partnerAnniversary
        || toDateOnly(coupleRow.linked_at)
        || toDateOnly(coupleRow.created_at);
      setRelationshipDate(startDate);
      setDraftRelationshipDate(startDate || defaultIsoDate());
    } finally {
      setLoading(false);
    }
  }, [params.code, t.partnerFallback]);

  useFocusEffect(
    useCallback(() => {
      void loadConnection();
    }, [loadConnection]),
  );

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/(auth)' as any);
  }

  async function createCode() {
    if (busy) return;
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t.alertNoUser);

      const { data: existing } = await supabase
        .from('date_planner_couples')
        .select('id, code, owner_user_id, partner_user_id, status, created_at, linked_at')
        .eq('id', user.id)
        .maybeSingle<CoupleRow>();

      let coupleId = user.id;
      let codeBody = existing?.code || makeCodeBody();

      if (existing?.owner_user_id === user.id) {
        const { error } = await supabase
          .from('date_planner_couples')
          .update({
            code: codeBody,
            partner_user_id: null,
            status: 'waiting',
            linked_at: null,
          })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        codeBody = makeCodeBody();
        const { data: inserted, error } = await supabase
          .from('date_planner_couples')
          .insert({
            id: user.id,
            code: codeBody,
            owner_user_id: user.id,
            status: 'waiting',
          })
          .select('id')
          .single<{ id: string }>();
        if (error) throw error;
        coupleId = inserted.id;
      }

      const { error: profileError } = await supabase
        .from('date_planner_profiles')
        .update({ couple_id: coupleId, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
      if (profileError) throw profileError;

      await loadConnection();
    } catch (e: any) {
      const msg = e?.message ?? '';
      if (msg.includes('duplicate') || msg.includes('already')) {
        Alert.alert(t.alertDuplicateTitle, t.alertDuplicateDesc);
      } else {
        Alert.alert(strings.common.error, t.alertCreateError);
      }
    } finally {
      setBusy(false);
    }
  }

  async function shareInvite() {
    const code = formatInviteCode(couple?.code);
    if (!code) return;

    const url = ExpoLinking.createURL('/onboarding/couple-connect', {
      scheme: 'datenavi',
      queryParams: { code },
    });
    const message = `${t.shareMessage(code)}\n\n${url}`;

    await Share.share({
      title: 'Date Navi',
      message,
      url,
    });
  }

  async function joinWithCode() {
    const raw = inviteCodeBody(inputCode);
    if (!raw) {
      Alert.alert(t.alertCodeEmpty);
      return;
    }

    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t.alertNoUser);

      const { data: targetCouple, error: findError } = await supabase
        .from('date_planner_couples')
        .select('id, owner_user_id')
        .eq('code', raw)
        .eq('status', 'waiting')
        .maybeSingle<{ id: string; owner_user_id: string }>();

      if (findError) throw findError;
      if (!targetCouple) {
        Alert.alert(t.alertCodeNotFoundTitle, t.alertCodeNotFoundDesc);
        return;
      }
      if (targetCouple.owner_user_id === user.id) {
        Alert.alert(t.alertOwnCodeTitle, t.alertOwnCodeDesc);
        return;
      }

      const { error: updateError } = await supabase
        .from('date_planner_couples')
        .update({ partner_user_id: user.id, status: 'linked', linked_at: new Date().toISOString() })
        .eq('id', targetCouple.id);
      if (updateError) throw updateError;

      const { error: profileError } = await supabase
        .from('date_planner_profiles')
        .update({ couple_id: targetCouple.id, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
      if (profileError) throw profileError;

      const { data: coupleProfiles } = await supabase
        .from('date_planner_profiles')
        .select('user_id, anniversary_date')
        .eq('couple_id', targetCouple.id);

      const ownerDate = coupleProfiles?.find((profile) => profile.user_id === targetCouple.owner_user_id)?.anniversary_date;
      const myDate = coupleProfiles?.find((profile) => profile.user_id === user.id)?.anniversary_date;
      const sharedDate = toDateOnly(ownerDate) || toDateOnly(myDate);

      if (sharedDate) {
        await supabase.rpc('set_date_planner_couple_anniversary', { p_anniversary_date: sharedDate });
      }

      await AsyncStorage.removeItem(PENDING_INVITE_CODE_KEY);
      await logEvent('couple_connected');
      await supabase.auth.refreshSession();
      router.replace('/onboarding/connected' as any);
    } catch {
      Alert.alert(strings.common.error, t.alertJoinError);
    } finally {
      setBusy(false);
    }
  }

  function openRelationshipPicker() {
    setDraftRelationshipDate(relationshipDate || defaultIsoDate());
    setRelationshipPickerOpen(true);
  }

  async function handleSaveRelationshipDate() {
    if (savingRelationshipDate) return;
    setSavingRelationshipDate(true);
    try {
      const { error } = await supabase
        .rpc('set_date_planner_couple_anniversary', { p_anniversary_date: draftRelationshipDate });
      if (error) throw error;

      setRelationshipDate(draftRelationshipDate);
      setRelationshipPickerOpen(false);
    } catch {
      Alert.alert(strings.common.error, t.alertAnniversaryError);
    } finally {
      setSavingRelationshipDate(false);
    }
  }

  function confirmDisconnect() {
    Alert.alert(t.disconnectTitle, t.disconnectMessage, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.disconnectConfirm,
        style: 'destructive',
        onPress: () => void disconnectPartner(),
      },
    ]);
  }

  async function disconnectPartner() {
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc('disconnect_date_planner_couple');
      if (error) throw error;
      await AsyncStorage.removeItem(PENDING_INVITE_CODE_KEY);
      await loadConnection();
      Alert.alert(t.disconnectDoneTitle, t.disconnectDoneMessage);
    } catch {
      Alert.alert(strings.common.error, t.disconnectError);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <View style={[G.screen, G.center]}>
        <ActivityIndicator size="large" color={C.pink} />
      </View>
    );
  }

  const heading = status === 'linked'
    ? t.manageTitle
    : status === 'waiting'
      ? t.waitingTitle
      : t.title;
  const subtitle = status === 'linked'
    ? t.manageSubtitle
    : status === 'waiting'
      ? t.waitingSubtitle
      : t.subtitle;

  return (
    <SafeAreaView style={G.screen}>
      <ScrollView
        contentContainerStyle={s.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <BackBar onPress={status === 'linked' ? undefined : () => setBackBlockedVisible(true)} />

        <View style={s.headingBlock}>
          <Text style={s.heading}>{heading}</Text>
          <Text style={s.subText}>{subtitle}</Text>
        </View>

        {status === 'linked' ? (
          <>
            <View style={s.section}>
              <SectionLabel>{t.partnerSection}</SectionLabel>
              <ListGroup>
                <ListRow
                  icon={<Users size={16} strokeWidth={1.8} color={C.textSub} />}
                  label={t.partnerName}
                  value={partnerName || t.partnerFallback}
                  divider={false}
                />
              </ListGroup>
            </View>

            <View style={s.section}>
              <SectionLabel>{t.relationshipSection}</SectionLabel>
              <ListGroup>
                <ListRow
                  icon={<CalendarDays size={16} strokeWidth={1.8} color={C.textSub} />}
                  label={t.anniversary}
                  value={relationshipDate ? formatDate(relationshipDate, language) : t.notSet}
                  trailing={<ChevronRight size={14} color={C.textFaint} />}
                  onPress={openRelationshipPicker}
                />
                <ListRow
                  icon={<XCircle size={16} strokeWidth={1.8} color={C.pinkDeep} />}
                  label={t.disconnect}
                  destructive
                  trailing={<ChevronRight size={14} color={C.textFaint} />}
                  onPress={confirmDisconnect}
                  divider={false}
                />
              </ListGroup>
            </View>
          </>
        ) : (
          <>
            <SoftCard style={s.inviteCard}>
              <View style={s.inviteTopRow}>
                <View>
                  <Text style={s.inviteLabel}>{t.myInviteCode}</Text>
                  <Text style={s.codeText}>{displayCode}</Text>
                </View>
              </View>

              {status === 'waiting' ? (
                <TouchableOpacity style={s.shareBtn} onPress={shareInvite} activeOpacity={0.82}>
                  <Share2 size={16} color={C.white} strokeWidth={2.2} />
                  <Text style={s.shareBtnText}>{t.shareInviteLink}</Text>
                </TouchableOpacity>
              ) : (
                <BigButton onPress={busy ? undefined : createCode} variant={busy ? 'disabled' : 'primary'} style={s.createBtn}>
                  {busy ? t.creatingButton : t.createButton}
                </BigButton>
              )}
            </SoftCard>

            <View style={s.divider}>
              <View style={s.dividerLine} />
              <Text style={s.dividerText}>{t.or}</Text>
              <View style={s.dividerLine} />
            </View>

            <View style={s.fieldBox}>
              <Text style={s.fieldLabel}>{t.inputTitle}</Text>
              <TextInput
                style={s.fieldInput}
                placeholder="DN-____"
                placeholderTextColor={C.textFaint}
                value={inputCode}
                onChangeText={(value) => setInputCode(normalizeInviteCode(value))}
                maxLength={12}
                autoCapitalize="characters"
                autoCorrect={false}
              />
            </View>

            <View style={s.joinBtnWrap}>
              <BigButton onPress={canJoin ? joinWithCode : undefined} variant={canJoin ? 'secondary' : 'disabled'}>
                {busy ? t.connectingButton : t.connectButton}
              </BigButton>
            </View>

            <Text style={s.footerText}>{t.linkHint}</Text>

            <TouchableOpacity onPress={handleLogout} style={s.logoutLink}>
              <Text style={s.logoutLinkText}>{t.logoutLink}</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      <PickerSheet
        visible={relationshipPickerOpen}
        title={t.anniversary}
        onCancel={() => setRelationshipPickerOpen(false)}
        onConfirm={handleSaveRelationshipDate}
        confirmLabel={savingRelationshipDate ? t.savingButton : t.done}
      >
        <DateWheelPicker
          value={draftRelationshipDate}
          minYear={new Date().getFullYear() - 30}
          maxYear={new Date().getFullYear()}
          onChange={setDraftRelationshipDate}
        />
      </PickerSheet>

      <PickerSheet
        visible={backBlockedVisible}
        title={t.backBlockedTitle}
        onCancel={() => setBackBlockedVisible(false)}
        onConfirm={() => { setBackBlockedVisible(false); handleLogout(); }}
        confirmLabel={strings.settings.logout}
        centered
      >
        <Text style={s.backBlockedBody}>{t.backBlockedBody}</Text>
      </PickerSheet>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 44 },
  headingBlock: { marginTop: 16 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 29 },
  subText: { fontSize: 13, color: C.textSub, lineHeight: 20, marginTop: 8 },
  section: { marginTop: 26 },
  inviteCard: {
    marginTop: 24,
    backgroundColor: C.cream,
    padding: 20,
  },
  inviteTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  inviteLabel: { fontSize: 11, color: C.creamFg, fontWeight: '700', letterSpacing: 0.4 },
  codeText: { fontSize: 32, fontWeight: '800', color: C.text, letterSpacing: 4, marginTop: 8 },
  createBtn: { marginTop: 18 },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.pink,
    borderRadius: 18,
    paddingVertical: 16,
    marginTop: 18,
  },
  shareBtnText: { fontSize: 15, fontWeight: '700', color: C.white },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 24 },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.border },
  dividerText: { fontSize: 11, color: C.textMuted },
  fieldBox: {
    backgroundColor: C.white,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  fieldLabel: { fontSize: 11, color: C.textLight, marginBottom: 4 },
  fieldInput: { fontSize: 18, color: C.text, letterSpacing: 3, fontWeight: '700' },
  joinBtnWrap: { marginTop: 12 },
  footerText: { fontSize: 11, color: C.textMuted, textAlign: 'center', lineHeight: 18, marginTop: 22 },
  logoutLink: { alignItems: 'center', marginTop: 20 },
  logoutLinkText: { fontSize: 12, color: C.textFaint, textDecorationLine: 'underline' },
  backBlockedBody: { fontSize: 13, color: C.textSub, lineHeight: 20, textAlign: 'center' },
});
