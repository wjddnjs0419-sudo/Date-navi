import React from 'react';
import { Text } from 'react-native';
import { Chip } from '../components/ui';
import { saveRecentPlaceSearch } from '../lib/recentPlaceSearches';

const mockInvoke = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ x: '127.05', y: '37.54' }),
  useRouter: () => ({ back: jest.fn() }),
}));

jest.mock('../lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string, opts?: { returnObjects?: boolean }) => {
      if (opts?.returnObjects && key === 'modeFlow.placeSearch.recommendedAreas') {
        return ['성수동', '한강', '연남동', '잠실', '이태원'];
      }
      return key;
    },
  }),
}));

jest.mock('../lib/place-pick-bridge', () => ({
  publishPickedPlace: jest.fn(),
}));

jest.mock('../components/illustration', () => ({
  Illustration: () => null,
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});

jest.mock('../lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
  },
}));

const TR = require('react-test-renderer') as {
  act: (cb: () => void | Promise<void>) => Promise<void>;
  create: (el: React.ReactElement) => { root: unknown };
};

const PlaceSearchScreen = require('../app/mode-flow/place-search').default;

beforeEach(async () => {
  jest.useFakeTimers();
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue({ data: { places: [] }, error: null });
  const AsyncStorage = require('@react-native-async-storage/async-storage');
  await AsyncStorage.clear();
});

afterEach(() => {
  jest.useRealTimers();
});

function allText(tree: { root: { findAllByType: (t: unknown) => { props: any }[] } }): string {
  return tree.root
    .findAllByType(Text)
    .map((n) => n.props.children)
    .flat(Infinity)
    .filter((c: unknown) => typeof c === 'string' || typeof c === 'number')
    .join(' ');
}

describe('장소 검색 화면 — 검색 전 상태(최근검색/추천지역)', () => {
  it('categoryCode가 없고 검색어도 없으면 최근 검색·추천 지역 칩을 보여준다', async () => {
    await saveRecentPlaceSearch('강남 데이트');

    let tree: ReturnType<typeof TR.create>;
    await TR.act(async () => { tree = TR.create(<PlaceSearchScreen />); });
    await TR.act(async () => {});

    const txt = allText(tree! as { root: { findAllByType: (t: unknown) => { props: any }[] } });
    expect(txt).toContain('modeFlow.placeSearch.recentSearchesTitle');
    expect(txt).toContain('modeFlow.placeSearch.recommendedAreasTitle');
    expect((tree!.root as any).findAllByType(Chip).length).toBeGreaterThanOrEqual(5);
  });
});
