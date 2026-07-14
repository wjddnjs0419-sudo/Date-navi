import React from 'react';
import { Text, TextInput, TouchableOpacity } from 'react-native';
import type { RecommendationLocation } from '../shared/recommendation/contracts';

jest.mock('../lib/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

type TestNode = { props: Record<string, any> };
type TestRendererInstance = {
  root: {
    findByProps: (props: Record<string, unknown>) => TestNode;
    findByType: (type: unknown) => TestNode;
    findAllByType: (type: unknown) => TestNode[];
  };
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

describe('LocationSelector', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('debounces eligible searches and selects a returned suggestion', async () => {
    const search = jest.fn().mockResolvedValue([suggestion]);
    const onChange = jest.fn();
    let renderer!: TestRendererInstance;
    await act(async () => {
      renderer = create(<LocationSelector value={null} onChange={onChange} search={search} />);
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
    });

    const input = renderer.root.findByType(TextInput);
    expect(input.props.accessibilityLabel).toBe('location.searchAccessibility');
    expect(input.props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ minHeight: 44 }),
    ]));
  });

  it('uses a required location label only when the caller marks the selector required', async () => {
    let renderer!: TestRendererInstance;
    await act(async () => {
      renderer = create(<LocationSelector value={null} onChange={jest.fn()} search={jest.fn()} required />);
    });

    const labels = renderer.root.findAllByType(Text).map((node) => node.props.children);
    expect(labels).toContain('location.requiredLabel');
    expect(labels).not.toContain('location.label');
  });

  it('hides query A suggestions immediately when eligible query B starts debouncing', async () => {
    const search = jest.fn()
      .mockResolvedValueOnce([suggestion])
      .mockImplementationOnce(() => new Promise<RecommendationLocation[]>(() => {}));
    let renderer!: TestRendererInstance;
    await act(async () => {
      renderer = create(<LocationSelector value={null} onChange={jest.fn()} search={search} />);
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
