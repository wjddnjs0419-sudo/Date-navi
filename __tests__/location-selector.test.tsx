import React from 'react';
import { LocateFixed, MapPin, Navigation } from 'lucide-react-native';
import type { RecommendationLocation } from '../shared/recommendation/contracts';

type TestNode = { props: Record<string, any> };
type TestRendererInstance = {
  root: { findAllByType: (type: unknown) => TestNode[] };
};
const TestRenderer = require('react-test-renderer') as {
  act: (callback: () => void | Promise<void>) => void | Promise<void>;
  create: (element: React.ReactElement) => TestRendererInstance;
};
const { act, create } = TestRenderer;

jest.mock('../lib/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

jest.mock('../lib/recentLocations', () => ({
  loadRecentLocations: jest.fn(),
  saveRecentLocation: jest.fn(),
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

describe('LocationSelector recent-location icons', () => {
  it('renders a Navigation icon for the current-location row and MapPin for other rows', async () => {
    loadRecentLocations.mockResolvedValue([currentLocation, searchedLocation]);
    let renderer!: TestRendererInstance;
    await act(async () => {
      renderer = create(<LocationSelector value={null} onChange={jest.fn()} />);
      await Promise.resolve();
    });

    expect(renderer.root.findAllByType(Navigation)).toHaveLength(2);
    // MapPin also renders once for the search-bar leading icon, plus once per non-current row.
    expect(renderer.root.findAllByType(MapPin)).toHaveLength(2);
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
