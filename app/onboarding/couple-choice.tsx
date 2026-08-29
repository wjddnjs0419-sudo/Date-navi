import {
  View, Text, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Heart, Clock3, ChevronRight } from '../../components/iconography';
import { C, DS } from '../../constants/theme';
import { Header, ScreenHeading, SoftCard } from '../../components/ui';
import { Illustration } from '../../components/illustration';
import { useI18n } from '../../lib/i18n';

export default function CoupleChoiceScreen() {
  const router = useRouter();
  const { t } = useI18n();

  return (
    <View style={s.root}>
      <Illustration name="bg-park" resizeMode="cover" height={340} style={s.bgPark} />
      <SafeAreaView style={s.safe}>
      <Header onBack={() => router.back()} />
      <ScreenHeading title={t('onboarding.coupleChoice.title')} subtitle={t('onboarding.coupleChoice.subtitle')} variant="input" />
      <View style={s.container}>
        <View style={s.cardList}>
          <SoftCard
            style={s.nowCard}
            onPress={() => router.push('/onboarding/couple-connect' as any)}
          >
            <View style={[s.iconBadge, s.iconBadgeNow]}>
              <Heart size={20} color={C.white} fill={C.white} strokeWidth={0} />
            </View>
            <View style={s.cardBody}>
              <Text style={s.cardTitle}>{t('onboarding.coupleChoice.nowTitle')}</Text>
              <Text style={s.cardDesc}>{t('onboarding.coupleChoice.nowDesc')}</Text>
            </View>
            <ChevronRight size={20} color={C.pinkBorder} strokeWidth={2} />
          </SoftCard>

          <SoftCard
            style={s.laterCard}
            onPress={() => router.replace('/onboarding/preferences' as any)}
          >
            <View style={[s.iconBadge, s.iconBadgeLater]}>
              <Clock3 size={20} color={C.grayFg} strokeWidth={2} />
            </View>
            <View style={s.cardBody}>
              <Text style={s.cardTitle}>{t('onboarding.coupleChoice.laterTitle')}</Text>
              <Text style={s.cardDesc}>{t('onboarding.coupleChoice.laterDesc')}</Text>
            </View>
            <ChevronRight size={20} color={C.textFaint} strokeWidth={2} />
          </SoftCard>
        </View>

        <View style={s.spacer} />
      </View>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  safe: { flex: 1 },
  // connected.tsx와 동일 패턴: SafeAreaView 밖(root)에 절대위치로 그려야 하단이 진짜 화면 끝까지 붙는다.
  bgPark: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  container: { flex: 1, paddingHorizontal: DS.spacing.screen, paddingTop: DS.spacing.section, paddingBottom: DS.spacing.section },
  cardList: { gap: DS.spacing.lg },
  nowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: DS.spacing.lg,
    backgroundColor: C.pinkLight,
    borderColor: C.pinkBorder,
  },
  laterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: DS.spacing.lg,
  },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: DS.radius.input,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBadgeNow: { backgroundColor: C.pink },
  iconBadgeLater: { backgroundColor: C.gray },
  cardBody: { flex: 1, gap: DS.spacing.xs },
  cardTitle: { ...DS.typography.cardTitle, fontWeight: '600', color: C.text },
  cardDesc: { ...DS.typography.bodySmall, color: C.textSub },
  spacer: { flex: 1 },
});
