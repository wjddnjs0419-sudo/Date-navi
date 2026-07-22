import React from 'react';
import { loadRecentPlaceSearches } from '../lib/recentPlaceSearches';

const mockInvoke = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ x: '127.05', y: '37.54', categoryCode: 'CE7' }),
  useRouter: () => ({ back: jest.fn() }),
}));

jest.mock('../lib/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
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

beforeEach(() => {
  jest.useFakeTimers();
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue({ data: { places: [] }, error: null });
});

afterEach(() => {
  jest.useRealTimers();
});

async function render() {
  let tree!: ReturnType<typeof TR.create>;
  await TR.act(async () => { tree = TR.create(<PlaceSearchScreen />); });
  await TR.act(async () => { jest.advanceTimersByTime(400); });
  await TR.act(async () => {});
  return tree;
}

describe('장소 검색 화면 — categoryCode 자동 검색', () => {
  it('categoryCode가 있으면 텍스트를 입력하지 않아도 카테고리 검색을 호출한다', async () => {
    await render();
    expect(mockInvoke).toHaveBeenCalledWith('place-search', {
      body: expect.objectContaining({ queries: [], categoryCodes: ['CE7'] }),
    });
  });
});

describe('장소 검색 화면 — 최근 검색 저장', () => {
  beforeEach(async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    await AsyncStorage.clear();
  });

  it('검색어를 입력해 debounce가 발화하면 최근 검색에 저장한다', async () => {
    const { act, create } = TR;
    let tree: ReturnType<typeof create>;
    await act(async () => { tree = create(<PlaceSearchScreen />); });
    await act(async () => { jest.advanceTimersByTime(400); }); // categoryCode 자동검색 소진

    const TextInput = require('react-native').TextInput;
    const input = (tree!.root as any).findAllByType(TextInput)[0];
    await act(async () => { input.props.onChangeText('성수 맛집'); });
    await act(async () => { jest.advanceTimersByTime(400); });

    expect(await loadRecentPlaceSearches()).toContain('성수 맛집');
  });
});
