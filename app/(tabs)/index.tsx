import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Image,
  Dimensions, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../../lib/supabase';
import { Bell, ChevronRight } from 'lucide-react-native';
import { C, SP, R, G } from '../../constants/theme';
import { Wordmark } from '../../components/brand';
import { Illustration } from '../../components/illustration';
import { CourseMapPreview } from '../../components/course-map';
import { Badge, BigButton, MetaChipRow, PlanListRow } from '../../components/ui';
import { formatDateLabel } from '../../components/pickers';
import { useI18n } from '../../lib/i18n';
import { useRevalidatingLoad } from '../../lib/useRevalidatingLoad';
import { DATE_MODE_ROUTES } from '../../lib/dateModes';

type Profile = { display_name: string; couple_id: string | null; profile_photo_url: string | null };
type UpcomingPlan = {
  id: string; title: string;
  confirmed_date: string | null; confirmed_time: string | null; confirmed_place: string | null;
};

const SCREEN_W = Dimensions.get('window').width;
// 히어로 일러스트: 화면 폭 대비 명시적 숫자 폭(RN이 width:'100%'+aspectRatio 조합을 무시하는 문제 회피).
const HERO_ART_W = Math.round(SCREEN_W * 0.42);

// PHASE0-BACKMERGE: D-day 계산(홈·일정 공유 후보). now 주입으로 테스트 결정성 확보.
function daysUntilIso(iso: string | null, now: number = Date.now()): number {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return 0;
  const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today.getTime()) / 86400000);
}

export default function HomeScreen() {
  const router = useRouter();
  const { t, language } = useI18n();
  const [profile, setProfile] = useState<Profile | null>(null);
  // 최초 로드에만 전체 스피너를 띄우고, 이후 재포커스는 기존 화면을 유지한 채 조용히 갱신한다.
  const { loading, begin: beginLoad, end: endLoad } = useRevalidatingLoad();
  const [hasNotif, setHasNotif] = useState(false);
  const [upcoming, setUpcoming] = useState<UpcomingPlan[]>([]);

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
            // 다가오는 데이트(확정) 최신 3건.
            const { data: planRows } = await supabase
              .from('date_cards')
              .select('id, title, confirmed_date, confirmed_time, confirmed_place')
              .eq('couple_id', myProfile.couple_id)
              .eq('status', 'confirmed')
              .order('confirmed_date', { ascending: true, nullsFirst: false })
              .order('created_at', { ascending: false })
              .limit(3);
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

  const coursePreview = [
    { category: 'meal' as const, label: t('home.coursePreview.meal') },
    { category: 'cafe' as const, label: t('home.coursePreview.cafe') },
    { category: 'walk' as const, label: t('home.coursePreview.walk') },
  ];
  const courseMeta = [
    { icon: 'map' as const, label: t('home.courseMeta.area') },
    { icon: 'clock' as const, label: t('home.courseMeta.duration') },
    { icon: 'walk' as const, label: t('home.courseMeta.walk') },
  ];

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
          {/* 헤더: 워드마크 + 알림 + 아바타 */}
          <View style={s.headerRow}>
            <Wordmark size="sm" />
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

          {/* 히어로: 날짜 + 인사 + 일러스트 */}
          <View style={s.hero}>
            <View style={s.heroText}>
              <Text style={s.dateText}>{dateStr}</Text>
              <Text style={s.greetLine1}>{t('home.greetingLine1')}</Text>
              <Text style={s.greetLine2}>{t('home.greetingLine2')}</Text>
              <Text style={s.subText}>{t('home.subtitle')}</Text>
            </View>
            <Illustration name="home-map-book" width={HERO_ART_W} style={s.heroArt} />
          </View>

          <View style={s.content}>
            {/* 새 데이트 코스 만들기 */}
            <View style={s.courseCard}>
              <View style={s.courseTitleRow}>
                <Text style={s.courseTitle}>{t('home.newCourseTitle')}</Text>
                <Badge tone="pink">{t('home.aiBadge')}</Badge>
              </View>
              <Text style={s.courseDesc}>{t('home.newCourseDesc')}</Text>
              <View style={s.coursePreviewWrap}>
                <CourseMapPreview steps={coursePreview} />
              </View>
              <MetaChipRow items={courseMeta} />
              <BigButton
                onPress={() => router.push(DATE_MODE_ROUTES.make_course as any)}
                style={s.courseCta}
              >
                {t('home.courseStartCta')}
              </BigButton>
            </View>

            {/* 다가오는 데이트 */}
            {upcoming.length > 0 && (
              <>
                <View style={s.sectionRow}>
                  <Text style={s.sectionTitle}>{t('home.upcomingTitle')}</Text>
                  <TouchableOpacity onPress={() => router.push('/plans' as any)}>
                    <Text style={s.sectionLink}>{t('common.seeAll')}</Text>
                  </TouchableOpacity>
                </View>
                <View style={s.upcomingCard}>
                  {upcoming.map((p, i) => {
                    const dateLabel = [
                      p.confirmed_date ? formatDateLabel(p.confirmed_date, '', language) : '',
                      p.confirmed_time ?? '',
                    ].filter(Boolean).join(' ');
                    return (
                      <View key={p.id}>
                        {i > 0 && <View style={s.rowDivider} />}
                        <PlanListRow
                          title={p.title}
                          dateLabel={dateLabel || t('home.upcomingTitle')}
                          days={daysUntilIso(p.confirmed_date)}
                          onPress={() => router.push({ pathname: '/card/confirm', params: { id: p.id } } as any)}
                        />
                      </View>
                    );
                  })}
                </View>
              </>
            )}

            {/* 취향 프롬프트 */}
            <TouchableOpacity
              style={s.prefBanner}
              onPress={() => router.push('/onboarding/preferences' as any)}
              activeOpacity={0.85}
            >
              <Illustration name="mascot-heart-couple" width={40} />
              <View style={s.prefText}>
                <Text style={s.prefTitle}>{t('home.prefTitle')}</Text>
                <Text style={s.prefSub}>{t('home.prefSub')}</Text>
              </View>
              <ChevronRight size={18} color={C.pinkDeep} strokeWidth={2} />
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
  centerContent: { alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingBottom: SP.xxxl },

  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SP.xl, paddingTop: SP.md, paddingBottom: SP.xs,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: SP.sm },
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

  hero: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: SP.xl, paddingTop: SP.sm,
  },
  heroText: { flex: 1, paddingTop: SP.sm },
  heroArt: { marginTop: SP.xs },
  dateText: { fontSize: 12, fontWeight: '600', color: C.pinkDeep },
  greetLine1: { fontSize: 26, fontWeight: '700', color: C.text, marginTop: SP.sm, lineHeight: 33 },
  greetLine2: { fontSize: 26, fontWeight: '700', color: C.pink, lineHeight: 33 },
  subText: { fontSize: 13, color: C.textSub, lineHeight: 20, marginTop: SP.md },

  content: { paddingHorizontal: SP.xl, paddingTop: SP.xl },

  courseCard: {
    backgroundColor: C.white,
    borderRadius: R.card,
    padding: SP.xl,
    borderWidth: 1,
    borderColor: C.borderLight,
    shadowColor: C.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 7,
    elevation: 3,
  },
  courseTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SP.sm },
  courseTitle: { flex: 1, fontSize: 19, fontWeight: '700', color: C.text },
  courseDesc: { fontSize: 13, color: C.textSub, lineHeight: 20, marginTop: SP.sm },
  coursePreviewWrap: { marginTop: SP.xl, marginBottom: SP.lg },
  courseCta: { marginTop: SP.xl },

  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SP.xxl, marginBottom: SP.sm },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  sectionLink: { fontSize: 12, color: C.textSub },
  upcomingCard: {
    backgroundColor: C.white,
    borderRadius: R.card,
    paddingHorizontal: SP.lg,
    borderWidth: 1,
    borderColor: C.borderLight,
    shadowColor: C.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.09,
    shadowRadius: 7,
    elevation: 2,
  },
  rowDivider: { height: 1, backgroundColor: C.borderLight },

  prefBanner: {
    flexDirection: 'row', alignItems: 'center', gap: SP.md,
    backgroundColor: C.pinkLight,
    borderRadius: R.card,
    paddingHorizontal: SP.lg, paddingVertical: SP.lg,
    marginTop: SP.xxl,
  },
  prefText: { flex: 1 },
  prefTitle: { fontSize: 14, fontWeight: '700', color: C.text },
  prefSub: { fontSize: 12, color: C.textSub, marginTop: 2 },
});
