import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, MapPin, Search } from 'lucide-react-native';
import { C, R, SP } from '../../constants/theme';
import { useI18n } from '../../lib/i18n';
import { supabase } from '../../lib/supabase';
import { publishPickedPlace } from '../../lib/place-pick-bridge';
import { Illustration } from '../../components/illustration';

type Place = {
  placeId: string;
  name: string;
  category: string;
  address: string;
  url: string;
  x: string;
  y: string;
};

// 검색 중심 좌표 ↔ 장소 좌표 사이 실측 거리(m). 위경도 → 하버사인.
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R_EARTH = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(a)));
}

// 거리 표기: 1km 미만은 10m 단위 m, 이상은 소수 1자리 km. 계산 불가면 빈 문자열.
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return '';
  if (meters < 1000) return `${Math.round(meters / 10) * 10}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

// Kakao 카테고리 경로("음식점 > 카페 > 커피")에서 마지막 잎 라벨만.
function categoryLeaf(category: string): string {
  const leaf = category.split('>').pop();
  return leaf ? leaf.trim() : '';
}

export default function PlaceSearchScreen() {
  const { x, y, categoryCode } = useLocalSearchParams<{
    x: string;
    y: string;
    categoryCode?: string;
  }>();
  const router = useRouter();
  const { t } = useI18n();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (!q && !categoryCode) {
      setResults([]);
      setLoading(false);
      setError(false);
      return;
    }
    const handle = setTimeout(() => {
      const current = ++reqId.current;
      setLoading(true);
      setError(false);
      void supabase.functions
        .invoke('place-search', {
          body: {
            coords: { x, y },
            radius: 3000,
            queries: q ? [q] : [],
            ...(categoryCode ? { categoryCodes: [categoryCode] } : {}),
          },
        })
        .then(({ data, error: err }) => {
          if (current !== reqId.current) return;
          if (err) {
            setError(true);
            setResults([]);
          } else {
            setResults((data?.places ?? []) as Place[]);
          }
        })
        .catch(() => {
          if (current !== reqId.current) return;
          setError(true);
          setResults([]);
        })
        .finally(() => {
          if (current !== reqId.current) return;
          setLoading(false);
        });
    }, 350);
    return () => clearTimeout(handle);
  }, [query, x, y, categoryCode]);

  const onPick = (place: Place) => {
    publishPickedPlace({
      kakaoPlaceId: place.placeId,
      name: place.name,
      address: place.address,
      longitude: Number(place.x),
      latitude: Number(place.y),
    });
    router.back();
  };

  const showEmpty = !loading && !error && (query.trim().length > 0 || !!categoryCode) && results.length === 0;

  return (
    <View style={s.root}>
      <Illustration name="bg-park" resizeMode="cover" height={340} style={s.bgPark} />
      <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('modeFlow.placeSearch.back')}
          onPress={() => router.back()}
          style={s.backButton}
        >
          <ChevronLeft size={24} color={C.text} />
        </TouchableOpacity>
        <Text style={s.title}>{t('modeFlow.placeSearch.title')}</Text>
      </View>

      <View style={s.searchBar}>
        <Search size={18} color={C.textMuted} />
        <TextInput
          style={s.input}
          value={query}
          onChangeText={setQuery}
          placeholder={t('modeFlow.placeSearch.placeholder')}
          placeholderTextColor={C.textMuted}
          autoFocus
          returnKeyType="search"
        />
      </View>

      {loading && (
        <View style={s.center}>
          <ActivityIndicator color={C.pink} />
        </View>
      )}

      {error && <Text style={s.status}>{t('modeFlow.placeSearch.error')}</Text>}

      {showEmpty && <Text style={s.status}>{t('modeFlow.placeSearch.empty')}</Text>}

      <FlatList
        data={results}
        keyExtractor={(item) => item.placeId}
        contentContainerStyle={s.list}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const category = categoryLeaf(item.category);
          const distance = formatDistance(
            haversineMeters(Number(y), Number(x), Number(item.y), Number(item.x)),
          );
          return (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`${item.name}, ${t('modeFlow.placeSearch.pick')}`}
              onPress={() => onPick(item)}
              style={s.row}
            >
              <View style={s.thumb}>
                <MapPin size={20} color={C.pink} />
              </View>
              <View style={s.copy}>
                <Text style={s.name} numberOfLines={1}>{item.name}</Text>
                <View style={s.metaRow}>
                  {category !== '' && <Text style={s.category} numberOfLines={1}>{category}</Text>}
                  {distance !== '' && <Text style={s.distance}>{distance}</Text>}
                </View>
                <Text style={s.address} numberOfLines={1}>{item.address}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  safe: { flex: 1 },
  // connected.tsx와 동일 패턴: SafeAreaView 밖(root)에 절대위치로 그려야 하단이 진짜 화면 끝까지 붙는다.
  bgPark: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP.sm,
    paddingHorizontal: SP.lg,
    paddingVertical: SP.sm,
  },
  backButton: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  title: { color: C.text, fontSize: 18, fontWeight: '800' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP.sm,
    marginHorizontal: SP.lg,
    paddingHorizontal: SP.lg,
    minHeight: 50,
    borderRadius: R.xl,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.white,
  },
  input: { flex: 1, color: C.text, fontSize: 14 },
  center: { paddingVertical: SP.xl, alignItems: 'center' },
  status: { color: C.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: SP.xl },
  list: { paddingHorizontal: SP.lg, paddingTop: SP.md, gap: SP.xs },
  row: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP.md,
    paddingVertical: SP.sm,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: R.md,
    backgroundColor: C.pinkLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, gap: 3 },
  name: { color: C.text, fontSize: 15, fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: SP.sm },
  category: { color: C.textSub, fontSize: 12, fontWeight: '600', flexShrink: 1 },
  distance: { color: C.pink, fontSize: 12, fontWeight: '700' },
  address: { color: C.textMuted, fontSize: 11 },
});
