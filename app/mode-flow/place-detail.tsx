import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ExternalLink, MapPin } from 'lucide-react-native';
import { BackBar } from '../../components/ui';
import { Illustration } from '../../components/illustration';
import { C, R, SP } from '../../constants/theme';
import { useI18n } from '../../lib/i18n';
import { openPlaceInBrowser } from '../../lib/placeBrowser';

const value = (input: string | string[] | undefined) => Array.isArray(input) ? input[0] ?? '' : input ?? '';

export default function PlaceDetailScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { t } = useI18n();
  const name = value(params.name);
  const address = value(params.address);
  const kakaoPlaceId = value(params.kakaoPlaceId);
  const mapUrl = value(params.mapUrl);
  if (!name || !kakaoPlaceId) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.header}><BackBar /></View>
        <View style={s.content}><Text style={s.error}>{t('modeFlow.courseResult.loadError')}</Text></View>
      </SafeAreaView>
    );
  }
  return (
    <View style={s.root}>
      <Illustration name="bg-park" resizeMode="cover" height={340} style={s.bgPark} />
      <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}><BackBar /></View>
      <View style={s.content}>
        <View style={s.titleBlock}>
          <View style={s.pinTile}><MapPin size={22} color={C.pink} /></View>
          <Text style={s.title}>{name}</Text>
          {!!address && <Text style={s.address}>{address}</Text>}
        </View>

        <View style={s.noticeCard}>
          <Text style={s.notice}>{t('modeFlow.courseResult.detailNotice')}</Text>
        </View>

        <TouchableOpacity
          accessibilityRole="link"
          onPress={() => void openPlaceInBrowser({ kakaoPlaceId, mapUrl })}
          style={s.primary}
        >
          <ExternalLink size={18} color={C.white} />
          <Text style={s.primaryText}>{t('modeFlow.courseResult.placeReviews')}</Text>
        </TouchableOpacity>

        <TouchableOpacity accessibilityRole="button" onPress={() => router.back()} style={s.back}>
          <Text style={s.backText}>{t('modeFlow.courseResult.back')}</Text>
        </TouchableOpacity>
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
  header: { paddingHorizontal: SP.xl },
  content: { padding: SP.xl, gap: SP.md },
  titleBlock: { gap: SP.sm, marginBottom: SP.xs },
  pinTile: {
    width: 52, height: 52, borderRadius: R.lg,
    backgroundColor: C.pinkLight,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: SP.xs,
  },
  title: { color: C.text, fontSize: 24, fontWeight: '800', lineHeight: 31 },
  address: { color: C.textSub, fontSize: 14 },
  noticeCard: {
    backgroundColor: C.pinkLight,
    borderRadius: R.lg,
    padding: SP.lg,
    marginBottom: SP.xs,
  },
  notice: { color: C.textSub, fontSize: 13, lineHeight: 20 },
  primary: {
    flexDirection: 'row', gap: SP.sm,
    minHeight: 52, borderRadius: R.md,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: C.pink,
  },
  primaryText: { color: C.white, fontSize: 15, fontWeight: '800' },
  back: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  backText: { color: C.textSub, fontSize: 14, fontWeight: '700' },
  error: { color: C.textSub, fontSize: 14 },
});
