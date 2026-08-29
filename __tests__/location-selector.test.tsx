import React from 'react';
import { LocateFixed, MapPin, Navigation } from '../components/iconography';
import type { RecommendationLocation } from '../shared/recommendation/contracts';

type TestNode = { props: Record<string, any> };
type TestRendererInstance = {
  root: { findByProps: (props: Record<string, unknown>) => TestNode; findAllByType: (type: unknown) => TestNode[] };
};
const TestRenderer = require('react-test-renderer') as {
  act: (callback: () => void | Promise<void>) => void | Promise<void>;
  create: (element: React.ReactElement) => TestRendererInstance;
};
const { act, create } = TestRenderer;

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
  loadRecentLocations: jest.fn(),
  saveRecentLocation: jest.fn(),
  isSameRecommendationLocation: (left: any, right: any) => (
    !!left && !!right && left.source === right.source
      && (left.kakaoPlaceId && right.kakaoPlaceId
        ? left.kakaoPlaceId === right.kakaoPlaceId
        : left.latitude === right.latitude && left.longitude === right.longitude)
  ),
}));

const { loadRecentLocations } = require('../lib/recentLocations') as {
  loadRecentLocations: jest.Mock;
};
const { LocationSelector } = require('../components/recommendation/location-selector') as typeof import('../components/recommendation/location-selector');

const currentLocation: RecommendationLocation = {
  source: 'current',
  label: 'location.gpsActive',
  latitude: 37.5,
  longitude: 127.0,
  kind: 'current',
};

const searchedLocation: RecommendationLocation = {
  source: 'kakao',
  kakaoPlaceId: 'place-1',
  label: '홍대입구역 2호선',
  latitude: 37.55,
  longitude: 126.92,
  kind: 'station',
};

describe('LocationSelector location controls', () => {
  it('renders the current-location control with the default Figma colors', async () => {
    loadRecentLocations.mockResolvedValue([currentLocation, searchedLocation]);
    let renderer!: TestRendererInstance;
    await act(async () => {
      renderer = create(<LocationSelector value={null} onChange={jest.fn()} />);
      await Promise.resolve();
    });

    expect(loadRecentLocations).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');

    expect(renderer.root.findAllByType(Navigation)).toHaveLength(1);
    const currentButton = renderer.root.findByProps({ testID: 'location-current-button' });
    expect(currentButton.props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ backgroundColor: '#FFFFFF' }),
    ]));
    expect(currentButton.props.children[0].props.color).toBe('#8A8075');
    expect(currentButton.props.children[1].props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ color: '#8A8075' }),
    ]));
    // Recent locations are vertically stacked cards; MapPin is reserved for search results.
    expect(renderer.root.findAllByType(MapPin)).toHaveLength(0);
  });

  it('uses the Navigation icon (not LocateFixed) for the current-location search button', async () => {
    loadRecentLocations.mockResolvedValue([]);
    let renderer!: TestRendererInstance;
    await act(async () => {
      renderer = create(<LocationSelector value={null} onChange={jest.fn()} />);
      await Promise.resolve();
    });

    expect(renderer.root.findAllByType(Navigation)).toHaveLength(1);
    expect(renderer.root.findAllByType(LocateFixed)).toHaveLength(0);
  });
});
