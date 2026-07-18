import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { BackBar } from '../../components/ui';
import { C } from '../../constants/colors';
import { useI18n } from '../../lib/i18n';
import { buildKakaoMapUrl, buildNaverMapUrl } from '../../lib/replacement-candidates';

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
    return <SafeAreaView style={s.safe}><View style={s.header}><BackBar /></View><View style={s.content}><Text style={s.error}>{t('modeFlow.courseResult.loadError')}</Text></View></SafeAreaView>;
  }
  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}><BackBar /></View>
      <View style={s.content}>
        <Text style={s.title}>{name}</Text>
        {!!address && <Text style={s.address}>{address}</Text>}
        <Text style={s.notice}>{t('modeFlow.courseResult.detailNotice')}</Text>
        <TouchableOpacity accessibilityRole="link" onPress={() => void WebBrowser.openBrowserAsync(buildNaverMapUrl(name))} style={s.primary}><Text style={s.primaryText}>{t('modeFlow.courseResult.naverReviews')}</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="link" onPress={() => void WebBrowser.openBrowserAsync(buildKakaoMapUrl({ kakaoPlaceId, mapUrl }))} style={s.secondary}><Text style={s.secondaryText}>{t('modeFlow.courseResult.kakaoMap')}</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" onPress={() => router.back()} style={s.back}><Text style={s.backText}>{t('modeFlow.courseResult.back')}</Text></TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg }, header: { paddingHorizontal: 20 }, content: { padding: 20, gap: 12 }, title: { color: C.text, fontSize: 24, fontWeight: '800' }, address: { color: C.textSub, fontSize: 14 }, notice: { color: C.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 8 }, primary: { minHeight: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: C.pink }, primaryText: { color: C.white, fontSize: 15, fontWeight: '800' }, secondary: { minHeight: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.pinkBorder }, secondaryText: { color: C.pinkDeep, fontSize: 15, fontWeight: '800' }, back: { minHeight: 44, alignItems: 'center', justifyContent: 'center' }, backText: { color: C.textSub, fontSize: 14, fontWeight: '700' }, error: { color: C.textSub, fontSize: 14 },
});
