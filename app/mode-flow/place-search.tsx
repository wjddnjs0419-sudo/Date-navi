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
import { MapPin, Search } from '../../components/iconography';
import { C, DS, SP } from '../../constants/theme';
import { useI18n } from '../../lib/i18n';
import { supabase } from '../../lib/supabase';
import { publishPickedPlace } from '../../lib/place-pick-bridge';
import { loadRecentPlaceSearches, saveRecentPlaceSearch } from '../../lib/recentPlaceSearches';
import { Illustration } from '../../components/illustration';
import { Chip, Header, ScreenHeading } from '../../components/ui';
import { logEvent } from '../../lib/analytics';
import { buildPlaceSelectedParams, type PlaceSelectionContext } from '../../lib/analytics-course-actions';

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
  const { x, y, categoryCode, selectionContext } = useLocalSearchParams<{
    x: string;
    y: string;
    categoryCode?: string;
    selectionContext?: PlaceSelectionContext;
  }>();
  const router = useRouter();
  const { t } = useI18n();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    let mounted = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setUserId(session?.user.id ?? null);
    });
    void supabase.auth.getSession()
      .then(({ data }) => {
        if (mounted) setUserId(data.session?.user.id ?? null);
      })
      .catch(() => {
        if (mounted) setUserId(null);
      });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      setRecentSearches([]);
      return;
    }
    let mounted = true;
    void loadRecentPlaceSearches(userId).then((searches) => {
      if (mounted) setRecentSearches(searches);
    });
    return () => { mounted = false; };
  }, [userId]);

  const recommendedAreas = t('modeFlow.placeSearch.recommendedAreas', { returnObjects: true }) as string[];

  function pickSuggestion(term: string) {
    setQuery(term);
  }

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
      if (q && userId) {
        void saveRecentPlaceSearch(userId, q).then(setRecentSearches);
      }
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
  }, [query, x, y, categoryCode, userId]);

  const onPick = (place: Place) => {
    if (selectionContext === 'course_pin' || selectionContext === 'course_replace') {
      void logEvent('place_selected', buildPlaceSelectedParams(selectionContext));
    }
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
      <Header onBack={() => router.back()} />
      <ScreenHeading title={t('modeFlow.placeSearch.title')} />

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

      {!loading && !error && query.trim().length === 0 && !categoryCode && (
        <View style={s.suggestions}>
          {recentSearches.length > 0 && (
            <View style={s.suggestionGroup}>
              <Text style={s.suggestionTitle}>{t('modeFlow.placeSearch.recentSearchesTitle')}</Text>
              <View style={s.chipRow}>
                {recentSearches.map((term) => (
                  <Chip key={term} tone="gray" onPress={() => pickSuggestion(term)}>{term}</Chip>
                ))}
              </View>
            </View>
          )}
          <View style={s.suggestionGroup}>
            <Text style={s.suggestionTitle}>{t('modeFlow.placeSearch.recommendedAreasTitle')}</Text>
            <View style={s.chipRow}>
              {recommendedAreas.map((area) => (
                <Chip key={area} tone="pink" onPress={() => pickSuggestion(area)}>{area}</Chip>
              ))}
            </View>
          </View>
        </View>
      )}

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
              activeOpacity={0.88}
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
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP.sm,
    marginHorizontal: SP.screen,
    marginTop: SP.lg,
    paddingHorizontal: SP.lg,
    minHeight: SP.input,
    borderRadius: DS.radius.input,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.white,
  },
  input: { flex: 1, ...DS.typography.body, color: C.text },
  center: { paddingVertical: SP.xxl, alignItems: 'center' },
  status: { ...DS.typography.bodyCompact, color: C.textMuted, textAlign: 'center', paddingVertical: SP.xxl },
  suggestions: { paddingHorizontal: SP.screen, paddingTop: SP.lg, gap: SP.xxl },
  suggestionGroup: { gap: SP.sm },
  suggestionTitle: { ...DS.typography.bodyCompact, color: C.textSub, fontWeight: '700' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.xs },
  list: { paddingHorizontal: SP.screen, paddingTop: SP.md, gap: SP.xs },
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
    borderRadius: DS.radius.compact,
    backgroundColor: C.pinkLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, gap: SP.xs },
  name: { ...DS.typography.cardTitle, color: C.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: SP.sm },
  category: { ...DS.typography.bodySmall, color: C.textSub, fontWeight: '600', flexShrink: 1 },
  distance: { ...DS.typography.bodySmall, color: C.pink, fontWeight: '700' },
  address: { ...DS.typography.caption, color: C.textMuted },
});
