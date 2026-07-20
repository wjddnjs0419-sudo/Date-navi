import {
  View, Text, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Heart, Clock3, ChevronRight } from 'lucide-react-native';
import { C } from '../../constants/colors';
import { G } from '../../constants/theme';
import { BackBar, SoftCard } from '../../components/ui';
import { useI18n } from '../../lib/i18n';

export default function CoupleChoiceScreen() {
  const router = useRouter();
  const { t } = useI18n();

  return (
    <SafeAreaView style={G.screen}>
      <View style={s.container}>
        <BackBar />

        <View style={s.headingBlock}>
          <Text style={s.heading}>{t('onboarding.coupleChoice.title')}</Text>
          <Text style={s.subText}>{t('onboarding.coupleChoice.subtitle')}</Text>
        </View>

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
  );
}

const s = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32 },
  headingBlock: { marginTop: 24 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 29 },
  subText: { fontSize: 13, color: C.textSub, marginTop: 8, lineHeight: 20 },
  cardList: { marginTop: 32, gap: 16 },
  nowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: C.pinkLight,
    borderColor: C.pinkBorder,
  },
  laterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBadgeNow: { backgroundColor: C.pink },
  iconBadgeLater: { backgroundColor: C.gray },
  cardBody: { flex: 1, gap: 4 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: C.text },
  cardDesc: { fontSize: 12, color: C.textSub, lineHeight: 18 },
  spacer: { flex: 1 },
});
