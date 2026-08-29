import React from 'react';
import { Text, TextInput, TouchableOpacity } from 'react-native';
import { DS } from '../constants/theme';
import type { RecommendationLocation } from '../shared/recommendation/contracts';

jest.mock('../lib/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

const mockGetSession = jest.fn().mockResolvedValue({
  data: { session: { user: { id: '11111111-1111-4111-8111-111111111111' } } },
});

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: jest.fn() } } }),
    },
  },
}));

jest.mock('../lib/recentLocations', () => ({
  loadRecentLocations: jest.fn().mockResolvedValue([]),
  saveRecentLocation: jest.fn().mockResolvedValue([]),
  isSameRecommendationLocation: (left: any, right: any) => (
    !!left && !!right && left.source === right.source
      && (left.kakaoPlaceId && right.kakaoPlaceId
        ? left.kakaoPlaceId === right.kakaoPlaceId
        : left.latitude === right.latitude && left.longitude === right.longitude)
  ),
}));

const { loadRecentLocations } = jest.requireMock('../lib/recentLocations') as {
  loadRecentLocations: { mockResolvedValue: (value: RecommendationLocation[]) => unknown };
};

type TestNode = { props: Record<string, any> };
type TestRendererInstance = {
  root: {
    findByProps: (props: Record<string, unknown>) => TestNode;
    findByType: (type: unknown) => TestNode;
    findAllByType: (type: unknown) => TestNode[];
  };
  unmount: () => void;
};
const TestRenderer = require('react-test-renderer') as {
  act: (callback: () => void | Promise<void>) => void | Promise<void>;
  create: (element: React.ReactElement) => TestRendererInstance;
};
const { act, create } = TestRenderer;
const { LocationSelector } = require('../components/recommendation/location-selector') as typeof import('../components/recommendation/location-selector');

const suggestion: RecommendationLocation = {
  source: 'kakao',
  kakaoPlaceId: '123',
  label: '강남역',
  address: '서울 강남구 강남대로',
  latitude: 37.4979,
  longitude: 127.0276,
  kind: 'station',
};

const noIdLocation: RecommendationLocation = {
  source: 'kakao',
  label: '성수동1가',
  address: '서울 성동구 성수동1가',
  latitude: 37.5417253860375,
  longitude: 127.043351028535,
  kind: 'neighborhood',
};

const otherNoIdLocation: RecommendationLocation = {
  source: 'kakao',
  label: '연남동',
  address: '서울 마포구 연남동',
  latitude: 37.5655,
  longitude: 126.9254,
  kind: 'neighborhood',
};

describe('LocationSelector', () => {
  const activeRenderers: TestRendererInstance[] = [];

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => activeRenderers.splice(0).forEach((renderer) => renderer.unmount()));
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('debounces eligible searches and selects a returned suggestion', async () => {
    const search = jest.fn().mockResolvedValue([suggestion]);
    const onChange = jest.fn();
    let renderer!: TestRendererInstance;
    await act(async () => {
      renderer = create(<LocationSelector value={null} onChange={onChange} search={search} />);
      activeRenderers.push(renderer);
    });
    const input = renderer.root.findByProps({ accessibilityLabel: 'location.searchAccessibility' });

    act(() => input.props.onChangeText('강'));
    act(() => jest.advanceTimersByTime(300));
    expect(search).not.toHaveBeenCalled();

    act(() => input.props.onChangeText('강남'));
    act(() => jest.advanceTimersByTime(299));
    expect(search).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(search).toHaveBeenCalledWith('강남');

    const row = renderer.root.findAllByType(TouchableOpacity).find(
      (node: TestNode) => node.props.accessibilityLabel === 'location.suggestionAccessibility',
    );
    expect(row).toBeDefined();
    await act(async () => row!.props.onPress());

    expect(onChange).toHaveBeenCalledWith(suggestion);
  });

  it('renders its input as an accessible 44pt target', async () => {
    let renderer!: TestRendererInstance;
    await act(async () => {
      renderer = create(<LocationSelector value={null} onChange={jest.fn()} search={jest.fn()} />);
      activeRenderers.push(renderer);
    });

    const input = renderer.root.findByType(TextInput);
    expect(input.props.accessibilityLabel).toBe('location.searchAccessibility');
    expect(input.props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ height: 44, minHeight: 44, lineHeight: undefined, textAlignVertical: 'center' }),
    ]));

    act(() => input.props.onChangeText('chicken'));
    const englishInput = renderer.root.findByType(TextInput);
    expect(englishInput.props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ transform: [{ translateY: -DS.spacing.xs }] }),
    ]));
  });

  it('keeps the location screen focused on search and recent location cards', async () => {
    loadRecentLocations.mockResolvedValue([suggestion]);
    let renderer!: TestRendererInstance;
    await act(async () => {
      renderer = create(<LocationSelector value={null} onChange={jest.fn()} search={jest.fn()} required />);
      activeRenderers.push(renderer);
      await Promise.resolve();
    });

    const labels = renderer.root.findAllByType(Text).map((node) => node.props.children);
    expect(labels).toContain('location.recentTitle');
    expect(labels).not.toContain('location.popularTitle');
    expect(labels).not.toContain('location.requiredLabel');
    expect(labels).not.toContain('location.label');
  });

  it('renders recent locations as vertically stacked cards and selects the whole card', async () => {
    loadRecentLocations.mockResolvedValue([suggestion]);
    const onChange = jest.fn();
    let renderer!: TestRendererInstance;
    await act(async () => {
      renderer = create(<LocationSelector value={null} onChange={onChange} search={jest.fn()} />);
      activeRenderers.push(renderer);
      await Promise.resolve();
    });

    const row = renderer.root.findAllByType(TouchableOpacity).find(
      (node: TestNode) => node.props.testID === `location-recent-${suggestion.kakaoPlaceId}`,
    );
    expect(row).toBeDefined();
    expect(row!.props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ minHeight: 52, backgroundColor: '#FFFFFF' }),
    ]));
    await act(async () => { await row!.props.onPress(); });
    expect(onChange).toHaveBeenCalledWith(suggestion);
  });

  it('does not mark an ID-less recent location selected before the user chooses one', async () => {
    loadRecentLocations.mockResolvedValue([noIdLocation, otherNoIdLocation]);
    let renderer!: TestRendererInstance;
    await act(async () => {
      renderer = create(<LocationSelector value={null} onChange={jest.fn()} search={jest.fn()} />);
      activeRenderers.push(renderer);
      await Promise.resolve();
    });

    const rows = [noIdLocation, otherNoIdLocation].map((location) => (
      renderer.root.findByProps({ testID: `location-recent-${location.latitude}:${location.longitude}` })
    ));
    expect(rows.map((row) => row.props.accessibilityState.selected)).toEqual([false, false]);
  });

  it('hides query A suggestions immediately when eligible query B starts debouncing', async () => {
    const search = jest.fn()
      .mockResolvedValueOnce([suggestion])
      .mockImplementationOnce(() => new Promise<RecommendationLocation[]>(() => {}));
    let renderer!: TestRendererInstance;
    await act(async () => {
      renderer = create(<LocationSelector value={null} onChange={jest.fn()} search={search} />);
      activeRenderers.push(renderer);
    });
    const input = renderer.root.findByProps({ accessibilityLabel: 'location.searchAccessibility' });

    act(() => input.props.onChangeText('성수'));
    await act(async () => {
      jest.advanceTimersByTime(300);
      await Promise.resolve();
    });
    const suggestionRows = () => renderer.root.findAllByType(TouchableOpacity).filter(
      (node: TestNode) => node.props.accessibilityLabel === 'location.suggestionAccessibility',
    );
    expect(suggestionRows()).toHaveLength(1);

    act(() => input.props.onChangeText('홍대'));

    expect(suggestionRows()).toHaveLength(0);
    expect(search).toHaveBeenCalledTimes(1);
  });
});
