import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Image,
  Dimensions, NativeSyntheticEvent, NativeScrollEvent, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../../lib/supabase';
import {
  Bell, ChevronRight, Heart, MessageCircle, Map, Plane, Sparkles,
  CalendarHeart, Clock, MapPin,
} from 'lucide-react-native';
import { C } from '../../constants/colors';
import { G, R } from '../../constants/theme';
import { SoftCard, Chip } from '../../components/ui';
import { useI18n } from '../../lib/i18n';
import { useRevalidatingLoad } from '../../lib/useRevalidatingLoad';
import { pickLatestReaction, formatReactionText, filterActiveCards } from '../../lib/partnerReaction';
import { relativeTime } from '../../lib/time';
import { ENABLED_DATE_MODE_IDS, DATE_MODE_ROUTES, type DateModeId } from '../../lib/dateModes';

type Profile = { display_name: string; couple_id: string | null; profile_photo_url: string | null };
type Partner = { display_name: string } | null;
type PartnerReaction = { cardId: string; cardTitle: string; text: string; timeAgo: string } | null;
type TopCandidate = { id: string; title: string; tags: string[] } | null;
type UpcomingPlan = {
  id: string; title: string;
  confirmed_date: string | null; confirmed_time: string | null; confirmed_place: string | null;
};

const POSITIVE = ['love', 'like'];

const MODE_CARD_STYLE: Record<DateModeId, { Icon: typeof MessageCircle; bg: string; fg: string }> = {
  feeling: { Icon: MessageCircle, bg: C.lavender, fg: C.lavenderFg },
  make_course: { Icon: Map, bg: C.mint, fg: C.mintFg },
  next_meet: { Icon: Plane, bg: C.pinkLight, fg: C.pinkDeep },
};

function useModes() {
  const { t } = useI18n();
  return ENABLED_DATE_MODE_IDS.map((id) => ({
    id,
    title: t(`mode.tabModes.${id}.title`),
    desc: t(`mode.tabModes.${id}.desc`),
    ...MODE_CARD_STYLE[id],
  }));
}

const SCREEN_W = Dimensions.get('window').width;
const CARD_GAP = 12;
const CARD_W = SCREEN_W - 64; // 살짝 다음 카드가 보이도록
const SNAP = CARD_W + CARD_GAP;
// 단일 모드 카드 이미지: RN이 width:'100%'+aspectRatio 조합을 무시하고 원본 고유 크기로
// 렌더하는 문제가 있어, 카드 폭(SCREEN_W-40) 기준 명시적 숫자 높이로 계산한다.
const SINGLE_MODE_IMAGE_RATIO = 2.3;
const SINGLE_MODE_IMAGE_HEIGHT = Math.round((SCREEN_W - 40) / SINGLE_MODE_IMAGE_RATIO);

export default function HomeScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const MODES = useModes();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [partner, setPartner] = useState<Partner>(null);
  const [partnerReaction, setPartnerReaction] = useState<PartnerReaction>(null);
  // 최초 로드에만 전체 스피너를 띄우고, 이후 재포커스는 기존 화면을 유지한 채 조용히 갱신한다.
  const { loading, begin: beginLoad, end: endLoad } = useRevalidatingLoad();
  const [hasNotif, setHasNotif] = useState(false);
  const [activeMode, setActiveMode] = useState(0);
  const [topCandidate, setTopCandidate] = useState<TopCandidate>(null);
  const [upcoming, setUpcoming] = useState<UpcomingPlan[]>([]);

  const onModeScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SNAP);
    if (idx !== activeMode) setActiveMode(idx);
  };

  useFocusEffect(
    useCallback(() => {
      (async () => {
        beginLoad();
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          const { count: notifCount } = await supabase
            .from('notifications')
            .select('id', { count: 'exact', head: true });
          setHasNotif((notifCount ?? 0) > 0);

          const { data: myProfile } = await supabase
            .from('date_planner_profiles')
            .select('display_name, couple_id, profile_photo_url')
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

                const { data: allCards } = await supabase
                  .from('date_cards')
                  .select('id, title, status')
                  .eq('couple_id', myProfile.couple_id);

                const activeCards = filterActiveCards(allCards ?? []);

                if (activeCards.length) {
                  const { data: rxRows } = await supabase
                    .from('reactions')
                    .select('card_id, reaction_type, condition_tag, created_at')
                    .eq('user_id', partnerId)
                    .in('card_id', activeCards.map(c => c.id))
                    .order('created_at', { ascending: false })
                    .limit(1);

                  const latest = pickLatestReaction(rxRows ?? []);
                  const cardTitle = latest ? activeCards.find(c => c.id === latest.card_id)?.title : undefined;
                  setPartnerReaction(latest && cardTitle ? {
                    cardId: latest.card_id,
                    cardTitle,
                    text: formatReactionText(latest, {
                      condition: (tag) => t(`card.conditionTags.${tag}.label`) || undefined,
                      reaction: (type) => t(`candidates.rxLabel.${type}`),
                    }),
                    timeAgo: relativeTime(latest.created_at, {
                      justNow: t('notifications.timeJustNow'),
                      minutes: t('notifications.timeMinutes'),
                      hours: t('notifications.timeHours'),
                      yesterday: t('notifications.timeYesterday'),
                      days: t('notifications.timeDays'),
                    }),
                  } : null);
                } else {
                  setPartnerReaction(null);
                }
              }
            }

            // 둘 다 끌린 후보 1건 조회
            const { data: cardRows } = await supabase
              .from('date_cards')
              .select('id, title, tags')
              .eq('couple_id', myProfile.couple_id)
              .eq('status', 'active')
              .order('created_at', { ascending: false });

            if (cardRows?.length) {
              const { data: rxRows } = await supabase
                .from('reactions')
                .select('card_id, user_id, reaction_type')
                .in('card_id', cardRows.map(c => c.id));

              const both = cardRows.find(card => {
                const rx = rxRows?.filter(r => r.card_id === card.id) ?? [];
                const mine = rx.find(r => r.user_id === user.id);
                const ptnr = rx.find(r => r.user_id !== user.id);
                return mine && ptnr
                  && POSITIVE.includes(mine.reaction_type)
                  && POSITIVE.includes(ptnr.reaction_type);
              });
              setTopCandidate(both
                ? { id: both.id, title: both.title, tags: both.tags ?? [] }
                : null);
            } else {
              setTopCandidate(null);
            }

            // 다가오는 데이트(확정) 최신 2건
            const { data: planRows } = await supabase
              .from('date_cards')
              .select('id, title, confirmed_date, confirmed_time, confirmed_place')
              .eq('couple_id', myProfile.couple_id)
              .eq('status', 'confirmed')
              .order('confirmed_date', { ascending: true, nullsFirst: false })
              .order('created_at', { ascending: false })
              .limit(2);
            setUpcoming(planRows ?? []);
          }
        } catch {
          Alert.alert(t('common.error'), t('home.loadError'));
        } finally {
          endLoad();
        }
      })();
    }, []),
  );

  if (loading) {
    return (
      <View style={[s.container, s.centerContent]}>
        <ActivityIndicator size="large" color={C.pink} />
      </View>
    );
  }

  const today = new Date();
  const weekdaysFull = t('home.weekdaysFull', { returnObjects: true }) as string[];
  const dateStr = t('home.dateHeader', {
    weekday: weekdaysFull[today.getDay()],
    month: today.getMonth() + 1,
    day: today.getDate(),
  });
  const firstName = profile?.display_name?.charAt(0) ?? '?';

  return (
    <LinearGradient
      colors={C.bgGradient}
      start={C.bgGradientStart}
      end={C.bgGradientEnd}
      style={G.screen}
    >
    <SafeAreaView style={s.safeArea}>
      <ScrollView
        style={s.container}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 헤더 배너 */}
        <LinearGradient
          colors={C.bgGradient}
          start={C.bgGradientStart}
          end={C.bgGradientEnd}
          style={s.heroBanner}
        >
          <View style={s.headerRow}>
            <View>
              <Text style={s.dateText}>{dateStr}</Text>
              <Text style={s.greetText}>{t('home.greeting')}</Text>
            </View>
            <View style={s.headerActions}>
              <TouchableOpacity
                style={s.bellBtn}
                onPress={() => router.push('/account/notifications' as any)}
                accessibilityLabel={t('home.accessibility.notifications')}
              >
                <Bell size={18} color={C.textSub} />
                {hasNotif && <View style={s.notifDot} />}
              </TouchableOpacity>
              <TouchableOpacity
                style={s.avatarBtn}
                onPress={() => router.push('/settings' as any)}
                accessibilityLabel={t('home.accessibility.settings')}
              >
                {profile?.profile_photo_url ? (
                  <Image source={{ uri: profile.profile_photo_url }} style={s.avatarImage} />
                ) : (
                  <Text style={s.avatarText}>{firstName}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
          <Text style={s.subText}>{t('home.subtitle')}</Text>
        </LinearGradient>

        <View style={s.content}>

        {/* 연결 배너 (미연결 상태) */}
        {!profile?.couple_id && (
          <TouchableOpacity
            style={s.connectBanner}
            onPress={() => router.push('/onboarding/couple-connect' as any)}
          >
            <Text style={s.connectText}>{t('home.connectBanner')}</Text>
            <ChevronRight size={16} color={C.pinkDeep} />
          </TouchableOpacity>
        )}

        {/* 오늘 필요한 도움 — 가로 스와이프 카드 */}
        <View style={s.sectionRow}>
          <Text style={s.sectionTitle}>{t('home.todayHelp')}</Text>
          {MODES.length > 1 && (
            <TouchableOpacity onPress={() => router.push('/(tabs)/mode')}>
              <Text style={s.sectionLink}>{t('common.seeAll')}</Text>
            </TouchableOpacity>
          )}
        </View>
        {MODES.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            snapToInterval={SNAP}
            snapToAlignment="start"
            onScroll={onModeScroll}
            scrollEventThrottle={16}
            contentContainerStyle={s.modeScrollContent}
          >
            {MODES.map((m, i) => (
              <TouchableOpacity
                key={m.id}
                activeOpacity={0.9}
                onPress={() => router.push(DATE_MODE_ROUTES[m.id] as any)}
                style={[
                  s.modeCard,
                  s.modeCardSized,
                  { marginRight: i === MODES.length - 1 ? 0 : CARD_GAP },
                ]}
              >
                <View style={[s.modeIcon, { backgroundColor: m.bg }]}>
                  <m.Icon size={26} strokeWidth={1.8} color={m.fg} />
                </View>
                <Text style={s.modeItemLabel}>{m.title}</Text>
                <Text style={s.modeItemDesc}>{m.desc}</Text>
                <View style={s.modeCardFooter}>
                  <Text style={[s.modeCardCta, { color: m.fg }]}>{t('home.startCta')}</Text>
                  <ChevronRight size={16} color={m.fg} />
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          // 단일 모드: 가로 스크롤 없이 좌우 여백 동일한 전폭 카드 + 상단 커플 이미지(위쪽만 둥근).
          MODES.map((m) => (
            <TouchableOpacity
              key={m.id}
              activeOpacity={0.9}
              onPress={() => router.push(DATE_MODE_ROUTES[m.id] as any)}
              style={[s.modeCard, s.singleModeCard]}
            >
              <Image
                source={require('../../assets/images/couple-card.jpg')}
                style={s.singleModeImage}
                resizeMode="cover"
              />
              <View style={s.singleModeBody}>
                <Text style={s.modeItemLabel}>{m.title}</Text>
                <Text style={s.modeItemDesc}>{m.desc}</Text>
                <View style={s.modeCardFooter}>
                  <Text style={[s.modeCardCta, { color: C.pinkDeep }]}>{t('home.startCta')}</Text>
                  <ChevronRight size={16} color={C.pinkDeep} />
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
        {MODES.length > 1 && (
          <View style={s.dots}>
            {MODES.map((m, i) => (
              <View
                key={m.id}
                style={[s.dot, i === activeMode && s.dotActive]}
              />
            ))}
          </View>
        )}

        {/* 다가오는 데이트 — 확정된 데이트 있을 때만 */}
        {upcoming.length > 0 && (
          <>
            <View style={s.sectionRow}>
              <Text style={s.sectionTitle}>{t('home.upcomingTitle')}</Text>
              <TouchableOpacity onPress={() => router.push('/plans' as any)}>
                <Text style={s.sectionLink}>{t('common.seeAll')}</Text>
              </TouchableOpacity>
            </View>
            <View style={s.upcomingList}>
              {upcoming.map((p) => (
                <SoftCard key={p.id} onPress={() => router.push({ pathname: '/card/confirm', params: { id: p.id } } as any)}>
                  <View style={s.planRow}>
                    <View style={[s.candidateIcon, s.bgPinkLight]}>
                      <CalendarHeart size={22} strokeWidth={1.8} color={C.pinkDeep} />
                    </View>
                    <View style={s.flex1}>
                      <Text style={s.candidateTitle}>{p.title}</Text>
                      <View style={s.planMeta}>
                        {p.confirmed_date && (
                          <View style={s.planMetaItem}>
                            <CalendarHeart size={12} color={C.textSub} />
                            <Text style={s.planMetaText}>{p.confirmed_date}</Text>
                          </View>
                        )}
                        {p.confirmed_time && (
                          <View style={s.planMetaItem}>
                            <Clock size={12} color={C.textSub} />
                            <Text style={s.planMetaText}>{p.confirmed_time}</Text>
                          </View>
                        )}
                        {p.confirmed_place && (
                          <View style={s.planMetaItem}>
                            <MapPin size={12} color={C.textSub} />
                            <Text style={s.planMetaText}>{p.confirmed_place}</Text>
                          </View>
                        )}
                        {!p.confirmed_date && !p.confirmed_time && !p.confirmed_place && (
                          <Text style={s.planMetaText}>{t('home.dateUnset')}</Text>
                        )}
                      </View>
                    </View>
                    <ChevronRight size={16} color={C.textFaint} />
                  </View>
                </SoftCard>
              ))}
            </View>
          </>
        )}

        {/* 둘 다 끌린 후보 — 실제 데이터 있을 때만 */}
        {topCandidate && (
          <>
            <View style={s.sectionRow}>
              <Text style={s.sectionTitle}>{t('home.mutualTitle')}</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/candidates')}>
                <Text style={s.sectionLink}>{t('common.seeAll')}</Text>
              </TouchableOpacity>
            </View>
            <SoftCard onPress={() => router.push(`/card/${topCandidate.id}` as any)}>
              <View style={s.candidateRow}>
                <View style={[s.candidateIcon, s.bgPinkLight]}>
                  <Heart size={22} strokeWidth={1.8} color={C.pinkDeep} />
                </View>
                <View style={s.flex1}>
                  <Text style={s.candidateTitle}>{topCandidate.title}</Text>
                  <View style={s.chips}>
                    {topCandidate.tags.slice(0, 3).map((t) => (
                      <Chip key={t} tone="gray">{t}</Chip>
                    ))}
                  </View>
                </View>
              </View>
            </SoftCard>
          </>
        )}

        {/* 파트너 반응 */}
        {partner && partnerReaction && (
          <View style={s.partnerSection}>
            <Text style={s.sectionTitle}>{t('home.partnerReactionsTitle')}</Text>
            <SoftCard style={s.partnerCard} onPress={() => router.push(`/card/${partnerReaction.cardId}` as any)}>
              <View style={s.partnerRow}>
                <View style={s.partnerAvatar}>
                  <Text style={s.partnerAvatarText}>{partner.display_name.charAt(0)}</Text>
                </View>
                <View style={s.flex1}>
                  <Text style={s.partnerText}>
                    {t('home.partnerReactionPrefix', { name: partner.display_name })}
                    <Text style={s.partnerQuote}>"{partnerReaction.text}"</Text>
                    {t('home.partnerReactionSuffix')}
                  </Text>
                  <Text style={s.partnerTime}>{partnerReaction.timeAgo}</Text>
                </View>
                <ChevronRight size={16} color={C.textFaint} />
              </View>
            </SoftCard>
          </View>
        )}

        {/* AI 추천 빠른 시작 */}
        <TouchableOpacity
          style={s.startBtnWrap}
          onPress={() => router.push(DATE_MODE_ROUTES.make_course as any)}
          activeOpacity={0.85}
        >
          <View style={s.startBtn}>
            <Sparkles size={18} color={C.white} />
            <Text style={s.startBtnText}>{t('home.createCta')}</Text>
          </View>
        </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: 'transparent' },
  container: { flex: 1, backgroundColor: 'transparent' },
  flex1: { flex: 1 },
  centerContent: { alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingBottom: 32 },
  heroBanner: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },
  content: { paddingHorizontal: 20, paddingTop: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  dateText: { fontSize: 12, color: C.textLight },
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
  avatarImage: { width: 44, height: 44, borderRadius: 22 },
  subText: { fontSize: 13, color: C.textSub, lineHeight: 20, marginTop: 8, marginBottom: 4 },
  connectBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.pinkLight,
    borderRadius: R.card,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: C.pinkBorder,
  },
  connectText: { fontSize: 13, color: C.pinkDeep, fontWeight: '600' },
  modeCard: {
    backgroundColor: C.white,
    borderRadius: R.card,
    padding: 20,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: C.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 7,
    elevation: 3,
  },
  modeCardSized: { width: CARD_W },
  modeScrollContent: { paddingRight: 20 },
  // 이미지가 카드 위쪽 radius를 그대로 따르도록 카드에서 클리핑하고, 텍스트만 내부 패딩을 준다.
  singleModeCard: { width: '100%', padding: 0, overflow: 'hidden' },
  singleModeImage: { width: '100%', height: SINGLE_MODE_IMAGE_HEIGHT },
  singleModeBody: { padding: 20 },
  modeIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  modeItemLabel: { fontSize: 17, fontWeight: '700', color: C.text, marginTop: 16 },
  modeItemDesc: { fontSize: 13, color: C.textSub, lineHeight: 19, marginTop: 6 },
  modeCardFooter: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 16 },
  modeCardCta: { fontSize: 13, fontWeight: '700' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 14 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.border },
  dotActive: { width: 18, backgroundColor: C.pink },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: C.text },
  sectionLink: { fontSize: 12, color: C.textSub },
  candidateIcon: { width: 56, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  candidateTitle: { fontSize: 14, fontWeight: '700', color: C.text },
  candidateRow: { flexDirection: 'row', gap: 12 },
  bgPinkLight: { backgroundColor: C.pinkLight },
  upcomingList: { gap: 10 },
  planRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  planMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
  planMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  planMetaText: { fontSize: 12, color: C.textSub },
  partnerAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: C.lavender, alignItems: 'center', justifyContent: 'center',
  },
  partnerAvatarText: { fontSize: 13, fontWeight: '700', color: C.lavenderFg },
  partnerText: { fontSize: 13, color: C.text },
  partnerTime: { fontSize: 12, color: C.textLight, marginTop: 2 },
  partnerSection: { marginTop: 20 },
  partnerCard: { marginTop: 10 },
  partnerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  partnerQuote: { color: C.pinkDeep, fontWeight: '600' },
  startBtnWrap: { marginTop: 24, borderRadius: 18, overflow: 'hidden' },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 18,
    paddingVertical: 16,
    backgroundColor: C.pink,
  },
  startBtnText: { fontSize: 15, fontWeight: '600', color: C.white },
});
