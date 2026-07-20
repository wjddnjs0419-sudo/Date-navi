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
import { ChevronLeft, Search } from 'lucide-react-native';
import { C, R, SP } from '../../constants/theme';
import { useI18n } from '../../lib/i18n';
import { supabase } from '../../lib/supabase';
import { publishPickedPlace } from '../../lib/place-pick-bridge';

type Place = {
  placeId: string;
  name: string;
  category: string;
  address: string;
  url: string;
  x: string;
  y: string;
};

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
    if (!q) {
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
            queries: [q],
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

  const showEmpty = !loading && !error && query.trim().length > 0 && results.length === 0;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity
          accessibilityRole="button"
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
        renderItem={({ item }) => (
          <View style={s.row}>
            <View style={s.copy}>
              <Text style={s.name}>{item.name}</Text>
              <Text style={s.address} numberOfLines={1}>
                {item.address}
              </Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => onPick(item)}
              style={s.pickButton}
            >
              <Text style={s.pickButtonText}>{t('modeFlow.placeSearch.pick')}</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
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
    paddingHorizontal: SP.md,
    minHeight: 48,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.white,
  },
  input: { flex: 1, color: C.text, fontSize: 14 },
  center: { paddingVertical: SP.xl, alignItems: 'center' },
  status: { color: C.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: SP.xl },
  list: { paddingHorizontal: SP.lg, paddingTop: SP.sm },
  row: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP.sm,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: SP.sm,
  },
  copy: { flex: 1, gap: 2 },
  name: { color: C.text, fontSize: 14, fontWeight: '700' },
  address: { color: C.textMuted, fontSize: 11 },
  pickButton: {
    minHeight: 44,
    borderRadius: R.md,
    backgroundColor: C.pink,
    paddingHorizontal: SP.lg,
    justifyContent: 'center',
  },
  pickButtonText: { color: C.white, fontSize: 12, fontWeight: '800' },
});
