import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, SafeAreaView,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../../lib/supabase';
import {
  Bell, ChevronRight, Heart, Gift, MessageCircle, Map, Mail, Sparkles,
} from 'lucide-react-native';
import { C } from '../../constants/colors';
import { SoftCard, Chip } from '../../components/ui';

type Profile = { display_name: string; couple_id: string | null };
type Partner = { display_name: string } | null;

const MODES = [
  { title: '앱이 골라줘', Icon: Gift, bg: C.pinkLight, fg: C.pinkDeep },
  { title: '느낌만 말할게', Icon: MessageCircle, bg: C.lavender, fg: C.lavenderFg },
  { title: '코스로 정리해줘', Icon: Map, bg: C.mint, fg: C.mintFg },
  { title: '부드럽게 말해줘', Icon: Mail, bg: C.cream, fg: C.creamFg },
];

export default function HomeScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [partner, setPartner] = useState<Partner>(null);
  const [loading, setLoading] = useState(true);
  const [hasNotif, setHasNotif] = useState(false);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setLoading(true);
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          const { count: notifCount } = await supabase
            .from('notifications')
            .select('id', { count: 'exact', head: true });
          setHasNotif((notifCount ?? 0) > 0);

          const { data: myProfile } = await supabase
            .from('date_planner_profiles')
            .select('display_name, couple_id')
            .eq('user_id', user.id)
            .maybeSingle();
          if (!myProfile) return;
          setProfile(myProfile);

          if (myProfile.couple_id) {
            const { data: couple } = await supabase
              .from('date_planner_couples')
              .select('owner_user_id, partner_user_id')
              .eq('id', myProfile.couple_id)
              .maybeSingle();

            if (couple) {
              const partnerId = couple.owner_user_id === user.id
                ? couple.partner_user_id
                : couple.owner_user_id;
              if (partnerId) {
                const { data: partnerProfile } = await supabase
                  .from('date_planner_profiles')
                  .select('display_name')
                  .eq('user_id', partnerId)
                  .maybeSingle();
                setPartner(partnerProfile);
              }
            }
          }
        } finally {
          setLoading(false);
        }
      })();
    }, []),
  );

  if (loading) {
    return (
      <View style={[s.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={C.pink} />
      </View>
    );
  }

  const today = new Date();
  const dayNames = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  const dateStr = `${dayNames[today.getDay()]}, ${today.getMonth() + 1}월 ${today.getDate()}일`;
  const firstName = profile?.display_name?.charAt(0) ?? '?';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFF8F3' }}>
      <ScrollView
        style={s.container}
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* 헤더 배너 — 그라디언트 */}
        <LinearGradient
          colors={['#FFE8EC', '#FFF5F0', '#FFF8F3']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.heroBanner}
        >
          <View style={s.headerRow}>
            <View>
              <Text style={s.dateText}>{dateStr}</Text>
              <Text style={s.greetText}>오늘은 어떻게{'\n'}정해볼까요?</Text>
            </View>
            <View style={s.headerActions}>
              <TouchableOpacity
                style={s.bellBtn}
                onPress={() => router.push('/account/notifications' as any)}
              >
                <Bell size={18} color={C.textSub} />
                {hasNotif && <View style={s.notifDot} />}
              </TouchableOpacity>
              <TouchableOpacity
                style={s.avatarBtn}
                onPress={() => router.push('/settings' as any)}
              >
                <Text style={s.avatarText}>{firstName}</Text>
              </TouchableOpacity>
            </View>
          </View>
          <Text style={s.subText}>완벽한 계획 말고, 끌리는 느낌만 골라도 괜찮아요.</Text>
        </LinearGradient>

        <View style={s.content}>

        {/* 연결 배너 (미연결 상태) */}
        {!profile?.couple_id && (
          <TouchableOpacity
            style={s.connectBanner}
            onPress={() => router.push('/onboarding/couple-connect' as any)}
          >
            <Text style={s.connectText}>연인과 연결하면 함께 정할 수 있어요</Text>
            <ChevronRight size={16} color={C.pinkDeep} />
          </TouchableOpacity>
        )}

        {/* 오늘 필요한 도움 카드 */}
        <SoftCard
          style={s.modeCard}
          onPress={() => router.push('/(tabs)/mode')}
        >
          <View style={s.modeCardHeader}>
            <Text style={s.modeCardTitle}>오늘 필요한 도움</Text>
            <ChevronRight size={16} color={C.creamFg} />
          </View>
          <View style={s.modeGrid}>
            {MODES.map((m) => (
              <View key={m.title} style={s.modeItem}>
                <View style={[s.modeIcon, { backgroundColor: m.bg }]}>
                  <m.Icon size={18} strokeWidth={1.8} color={m.fg} />
                </View>
                <Text style={s.modeItemLabel}>{m.title}</Text>
              </View>
            ))}
          </View>
        </SoftCard>

        {/* 둘 다 끌린 후보 */}
        <View style={s.sectionRow}>
          <Text style={s.sectionTitle}>둘 다 끌린 후보</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/candidates')}>
            <Text style={s.sectionLink}>전체 보기</Text>
          </TouchableOpacity>
        </View>
        <SoftCard onPress={() => router.push('/mode-flow/result' as any)}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={[s.candidateIcon, { backgroundColor: C.pinkLight }]}>
              <Heart size={22} strokeWidth={1.8} color={C.pinkDeep} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.candidateTitle}>동네 맛집 포장 + 집 영화</Text>
              <View style={s.chips}>
                <Chip tone="gray">이동 적음</Chip>
                <Chip tone="gray">돈 적게 듦</Chip>
                <Chip tone="gray">피곤한 날</Chip>
              </View>
            </View>
          </View>
        </SoftCard>

        {/* 파트너 반응 */}
        {partner && (
          <View style={{ marginTop: 20 }}>
            <Text style={s.sectionTitle}>상대가 남긴 반응</Text>
            <SoftCard style={{ marginTop: 10 }} onPress={() => router.push('/share/mutual' as any)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={s.partnerAvatar}>
                  <Text style={s.partnerAvatarText}>{partner.display_name.charAt(0)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.partnerText}>
                    {partner.display_name}가{' '}
                    <Text style={{ color: C.pinkDeep, fontWeight: '600' }}>"가까우면 좋아"</Text>
                    를 남겼어요
                  </Text>
                  <Text style={s.partnerTime}>5분 전</Text>
                </View>
                <ChevronRight size={16} color={C.textFaint} />
              </View>
            </SoftCard>
          </View>
        )}

        {/* AI 추천 빠른 시작 — 그라디언트 버튼 */}
        <TouchableOpacity
          style={{ marginTop: 24, borderRadius: 18, overflow: 'hidden' }}
          onPress={() => router.push({
            pathname: '/mode-flow/feeling',
            params: { mode: 'pick_for_me' },
          } as any)}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={['#FF6B85', '#FF4F6D', '#E8395A']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={s.startBtn}
          >
            <Sparkles size={18} color={C.white} />
            <Text style={s.startBtnText}>데이트 후보 만들기</Text>
          </LinearGradient>
        </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF8F3' },
  heroBanner: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },
  content: { paddingHorizontal: 20, paddingTop: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  dateText: { fontSize: 12, color: '#B8AEA6' },
  greetText: { fontSize: 22, fontWeight: '700', color: C.text, marginTop: 2, lineHeight: 28 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bellBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: C.white, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.border,
  },
  notifDot: {
    position: 'absolute', top: 10, right: 10,
    width: 8, height: 8, borderRadius: 4, backgroundColor: C.pink,
  },
  avatarBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: C.pinkMid, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 14, fontWeight: '700', color: C.white },
  subText: { fontSize: 13, color: C.textSub, lineHeight: 20, marginTop: 8, marginBottom: 4 },
  connectBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.pinkLight,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: C.pinkBorder,
  },
  connectText: { fontSize: 13, color: C.pinkDeep, fontWeight: '600' },
  modeCard: { marginTop: 20, backgroundColor: C.cream },
  modeCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  modeCardTitle: { fontSize: 13, fontWeight: '700', color: C.creamFg },
  modeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  modeItem: { width: '47%', backgroundColor: C.white, borderRadius: 16, padding: 12 },
  modeIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  modeItemLabel: { fontSize: 12, fontWeight: '600', color: C.text, marginTop: 10 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: C.text },
  sectionLink: { fontSize: 12, color: C.textSub },
  candidateIcon: { width: 56, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  candidateTitle: { fontSize: 14, fontWeight: '700', color: C.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  partnerAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: C.lavender, alignItems: 'center', justifyContent: 'center',
  },
  partnerAvatarText: { fontSize: 13, fontWeight: '700', color: C.lavenderFg },
  partnerText: { fontSize: 13, color: C.text },
  partnerTime: { fontSize: 11, color: '#B8AEA6', marginTop: 2 },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 18,
    paddingVertical: 16,
  },
  startBtnText: { fontSize: 15, fontWeight: '600', color: C.white },
});
