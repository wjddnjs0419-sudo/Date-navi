import React from 'react';

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
