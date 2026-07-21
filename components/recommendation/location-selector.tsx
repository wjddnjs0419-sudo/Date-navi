import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { Check, Clock3, MapPin, Navigation } from 'lucide-react-native';
import { C, R, SP } from '../../constants/theme';
import { useI18n } from '../../lib/i18n';
import {
  LOCATION_SEARCH_DEBOUNCE_MS,
  createLatestLocationSearch,
  searchLocations,
  shouldSearchLocations,
} from '../../lib/locationSearch';
import { loadRecentLocations, saveRecentLocation } from '../../lib/recentLocations';
import type { RecommendationLocation } from '../../shared/recommendation/contracts';

type Props = {
  value: RecommendationLocation | null;
  onChange: (location: RecommendationLocation | null) => void;
  search?: (query: string) => Promise<RecommendationLocation[]>;
  required?: boolean;
  badge?: number;
};

export function LocationSelector({ value, onChange, search = searchLocations, required = false, badge }: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState(value?.label ?? '');
  const [suggestions, setSuggestions] = useState<RecommendationLocation[]>([]);
  const [recent, setRecent] = useState<RecommendationLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const latestSearch = useMemo(() => createLatestLocationSearch(search), [search]);

  useEffect(() => {
    let mounted = true;
    loadRecentLocations().then((locations) => {
      if (mounted) setRecent(locations);
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!shouldSearchLocations(query) || value?.label === query) {
      latestSearch.cancel();
      setSuggestions([]);
      setLoading(false);
      setSearchFailed(false);
      return undefined;
    }

    setSuggestions([]);
    setLoading(true);
    setSearchFailed(false);
    const timer = setTimeout(() => {
      latestSearch.search(query)
        .then((locations) => {
          if (locations === null) return;
          setSuggestions(locations);
          setLoading(false);
        })
        .catch(() => {
          setSuggestions([]);
          setLoading(false);
          setSearchFailed(true);
        });
    }, LOCATION_SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      latestSearch.cancel();
    };
  }, [latestSearch, query, value?.label]);

  function updateQuery(next: string) {
    setQuery(next);
    if (value) onChange(null);
  }

  async function selectLocation(location: RecommendationLocation) {
    setQuery(location.label);
    setSuggestions([]);
    onChange(location);
    try {
      setRecent(await saveRecentLocation(location));
    } catch {
      // Recent history is optional; selection remains valid if local storage is unavailable.
    }
  }

  async function selectCurrentLocation() {
    if (locating) return;
    if (value?.source === 'current') {
      setQuery('');
      onChange(null);
      return;
    }
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert(t('location.permissionTitle'), t('location.permissionBody'), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('common.settingsOpen'), onPress: () => Linking.openSettings() },
        ]);
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await selectLocation({
        source: 'current',
        label: t('location.gpsActive'),
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        kind: 'current',
      });
    } catch {
      Alert.alert(t('location.fetchError'), t('location.fetchErrorBody'));
    } finally {
      setLocating(false);
    }
  }

  const visibleLocations = shouldSearchLocations(query) ? suggestions : recent;
  const showingRecent = !shouldSearchLocations(query) && recent.length > 0;

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        {badge != null && (
          <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View>
        )}
        <Text style={styles.label}>{t(required ? 'location.requiredLabel' : 'location.label')}</Text>
      </View>
      <View style={styles.inputWrap}>
        <MapPin size={18} color={C.pink} strokeWidth={2} />
        <TextInput
          accessibilityLabel={t('location.searchAccessibility')}
          style={[styles.input, value?.source === 'current' && styles.currentInput]}
          placeholder={t('location.placeholder')}
          placeholderTextColor={C.textFaint}
          value={query}
          onChangeText={updateQuery}
          returnKeyType="search"
          autoCorrect={false}
        />
        {loading && <ActivityIndicator size="small" color={C.pink} />}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('location.currentAccessibility')}
          style={[styles.gpsButton, value?.source === 'current' && styles.gpsButtonActive]}
          activeOpacity={0.72}
          disabled={locating}
          onPress={selectCurrentLocation}
        >
          <Navigation size={18} color={value?.source === 'current' ? C.white : C.pinkDeep} strokeWidth={2} />
        </TouchableOpacity>
      </View>
      <Text style={styles.hint}>{t('location.autocompleteHint')}</Text>

      {searchFailed && <Text selectable style={styles.error}>{t('location.searchError')}</Text>}
      {showingRecent && (
        <View style={styles.sectionTitleRow}>
          <Clock3 size={14} color={C.textMuted} strokeWidth={2} />
          <Text style={styles.sectionTitle}>{t('location.recentTitle')}</Text>
        </View>
      )}
      {visibleLocations.length > 0 && (
        <View style={styles.list}>
          {visibleLocations.map((location) => {
            const selected = value?.source === location.source
              && value?.kakaoPlaceId === location.kakaoPlaceId
              && value?.latitude === location.latitude
              && value?.longitude === location.longitude;
            return (
              <TouchableOpacity
                key={`${location.source}:${location.kakaoPlaceId ?? `${location.latitude}:${location.longitude}`}`}
                accessibilityRole="button"
                accessibilityLabel={t('location.suggestionAccessibility', { name: location.label })}
                activeOpacity={0.72}
                style={styles.suggestion}
                onPress={() => selectLocation(location)}
              >
                {location.source === 'current'
                  ? <Navigation size={17} color={C.pinkDeep} strokeWidth={2} />
                  : <MapPin size={17} color={C.textSub} strokeWidth={2} />}
                <View style={styles.suggestionText}>
                  <Text style={styles.suggestionName} numberOfLines={1}>{location.label}</Text>
                  {!!location.address && (
                    <Text selectable style={styles.suggestionAddress} numberOfLines={2}>{location.address}</Text>
                  )}
                </View>
                {selected && <Check size={18} color={C.pinkDeep} strokeWidth={2.5} />}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: SP.xl },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: SP.sm, marginBottom: SP.sm },
  badge: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: C.pink,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { fontSize: 13, fontWeight: '800', color: C.white },
  label: { fontSize: 15, fontWeight: '700', color: C.text },
  inputWrap: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP.sm,
    backgroundColor: C.white,
    borderRadius: R.md,
    paddingHorizontal: SP.md,
    borderWidth: 1.5,
    borderColor: C.border,
  },
  input: { flex: 1, minHeight: 44, fontSize: 14, color: C.text, paddingVertical: 0 },
  currentInput: { color: C.pinkDeep, fontWeight: '600' },
  gpsButton: {
    width: 44,
    height: 44,
    borderRadius: R.md,
    backgroundColor: C.pinkLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gpsButtonActive: { backgroundColor: C.pink },
  hint: { fontSize: 11, color: C.textSub, paddingTop: SP.sm, lineHeight: 16 },
  error: { fontSize: 12, color: C.danger, paddingTop: SP.sm, lineHeight: 18 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: SP.xs, paddingTop: SP.md },
  sectionTitle: { fontSize: 12, color: C.textMuted, fontWeight: '600' },
  list: {
    marginTop: SP.sm,
    borderWidth: 1,
    borderColor: C.borderLight,
    borderRadius: R.md,
    overflow: 'hidden',
    backgroundColor: C.white,
  },
  suggestion: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP.sm,
    paddingHorizontal: SP.md,
    paddingVertical: SP.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.borderLight,
  },
  suggestionText: { flex: 1, minWidth: 0 },
  suggestionName: { fontSize: 14, fontWeight: '600', color: C.text },
  suggestionAddress: { fontSize: 11, color: C.textSub, lineHeight: 16, paddingTop: 2 },
});
