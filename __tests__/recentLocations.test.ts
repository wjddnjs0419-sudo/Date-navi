import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  RECENT_LOCATIONS_KEY,
  loadRecentLocations,
  saveRecentLocation,
} from '../lib/recentLocations';
import type { RecommendationLocation } from '../shared/recommendation/contracts';

const place = (id: string, label = `장소 ${id}`): RecommendationLocation => ({
  source: 'kakao',
  kakaoPlaceId: id,
  label,
  address: `서울 주소 ${id}`,
  latitude: 37.5 + Number(id) / 100,
  longitude: 127 + Number(id) / 100,
  kind: 'place',
});

describe('recent locations', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it('stores and restores RecommendationLocation values', async () => {
    await saveRecentLocation(place('1', '서울숲'));

    await expect(loadRecentLocations()).resolves.toEqual([place('1', '서울숲')]);
  });

  it('moves a reselected Kakao place to the front without duplicating it', async () => {
    await saveRecentLocation(place('1'));
    await saveRecentLocation(place('2'));
    await saveRecentLocation(place('1', '장소 1 새 이름'));

    const recent = await loadRecentLocations();
    expect(recent.map((item) => item.kakaoPlaceId)).toEqual(['1', '2']);
    expect(recent[0].label).toBe('장소 1 새 이름');
  });

  it('keeps only the five most recent valid locations', async () => {
    for (let index = 1; index <= 7; index += 1) {
      await saveRecentLocation(place(String(index)));
    }

    const recent = await loadRecentLocations();
    expect(recent.map((item) => item.kakaoPlaceId)).toEqual(['7', '6', '5', '4', '3']);
  });

  it('recovers safely from malformed local data', async () => {
    await AsyncStorage.setItem(RECENT_LOCATIONS_KEY, '{not-json');

    await expect(loadRecentLocations()).resolves.toEqual([]);
  });
});
