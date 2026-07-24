import { useCallback, useEffect, useRef, useState } from 'react';
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
import { BackBar, BigButton, HeartDoodle, ListGroup, ListRow, SectionLabel, SoftCard } from '../../components/ui';
import { Illustration } from '../../components/illustration';
import { DateWheelPicker, PickerSheet, defaultIsoDate } from '../../components/pickers';
import { useI18n } from '../../lib/i18n';
import {
  PENDING_INVITE_CODE_KEY,
  formatInviteCode,
  inviteCodeBody,
  normalizeInviteCode,
  resolveCoupleConnectDestination,
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
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);

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

      const { data: prefs } = await supabase
        .from('user_preferences')
        .select('onboarding_completed')
        .eq('user_id', user.id)
        .maybeSingle<{ onboarding_completed: boolean | null }>();
      const completed = !!prefs?.onboarding_completed;
      setOnboardingCompleted(completed);

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

      // 연결된 상태의 이 화면은 커플 관리용이라 온보딩을 이어갈 CTA가 없다.
      // 온보딩 중이라면 축하 화면으로 넘겨 남은 단계로 흐르게 한다.
      if (resolveCoupleConnectDestination({
        status: isLinked ? 'linked' : 'waiting',
        partnerUserId: coupleRow.partner_user_id,
        onboardingCompleted: completed,
      })) {
        router.replace('/onboarding/connected' as any);
        return;
      }

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

  // 초대한 쪽은 코드를 공유한 뒤 이 화면에 머문다. 상대가 수락해도 화면을 다시 열기 전까지는
  // 아무 일도 일어나지 않으므로, 자기 커플 행의 변경을 구독해 연결 즉시 축하 화면으로 보낸다.
  const onboardingCompletedRef = useRef(onboardingCompleted);
  useEffect(() => { onboardingCompletedRef.current = onboardingCompleted; }, [onboardingCompleted]);

  const coupleId = couple?.id;
  useEffect(() => {
    if (!coupleId) return;

    const channel = supabase
      .channel(`couple-connect-${coupleId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'date_planner_couples', filter: `id=eq.${coupleId}` },
        (payload) => {
          const next = payload.new as { status?: ConnectionStatus; partner_user_id?: string | null };
          const destination = resolveCoupleConnectDestination({
            status: next.status ?? 'waiting',
            partnerUserId: next.partner_user_id ?? null,
            onboardingCompleted: onboardingCompletedRef.current,
          });
          if (destination) router.replace('/onboarding/connected' as any);
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [coupleId, router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/(auth)' as any);
  }

  function handleBack() {
    // 미연결 상태로 이탈하면 대기 코드를 지워 매 부팅마다 이 화면으로
    // 재라우팅되는 루프를 막는다.
    if (status !== 'linked') {
      void AsyncStorage.removeItem(PENDING_INVITE_CODE_KEY);
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    // 딥링크 콜드부트 등 백스택이 없을 때의 폴백.
    router.replace((onboardingCompleted ? '/(tabs)' : '/onboarding/couple-choice') as any);
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
      // refreshSession()을 부르면 루트 레이아웃의 onAuthStateChange(TOKEN_REFRESHED)가
      // 전역 라우팅을 재실행해 방금 띄운 connected 화면을 preferences로 덮어쓴다.
      // 커플 정보는 JWT 클레임이 아니라 DB에만 있으므로 세션 리프레시는 불필요하다.
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
    <View style={s.root}>
      {status === 'linked' && (
        <Illustration name="bg-park" resizeMode="cover" height={340} style={s.bgPark} />
      )}
      <SafeAreaView style={s.safe}>
      <ScrollView
        contentContainerStyle={s.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <BackBar onPress={handleBack} />

        <View style={s.headingBlock}>
          <View style={s.headingRow}>
            <Text style={s.heading}>{heading}</Text>
            {status === 'linked' && <HeartDoodle filled style={s.headingHeart} />}
          </View>
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
              <Text style={s.inviteLabel}>{t.myInviteCode}</Text>
              <Text style={s.codeText}>{displayCode}</Text>
              <Illustration name="mascot-heart-couple" width={150} style={s.inviteMascot} />

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
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  safe: { flex: 1 },
  // connected.tsx와 동일 패턴: SafeAreaView 밖(root)에 절대위치로 그려야 하단이 진짜 화면 끝까지 붙는다.
  bgPark: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  container: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 44 },
  headingBlock: { marginTop: 16 },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start' },
  headingHeart: { marginTop: 2, marginLeft: 4 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 29 },
  subText: { fontSize: 13, color: C.textSub, lineHeight: 20, marginTop: 8 },
  section: { marginTop: 26 },
  inviteCard: {
    marginTop: 24,
    padding: 20,
    alignItems: 'center',
  },
  inviteLabel: { fontSize: 11, color: C.pinkDeep, fontWeight: '700', letterSpacing: 0.4 },
  codeText: { fontSize: 34, fontWeight: '800', color: C.pinkDeep, letterSpacing: 4, marginTop: 8 },
  inviteMascot: { marginVertical: 12 },
  createBtn: { marginTop: 4, width: '100%' },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.pink,
    borderRadius: 18,
    paddingVertical: 16,
    marginTop: 4,
    width: '100%',
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
});
