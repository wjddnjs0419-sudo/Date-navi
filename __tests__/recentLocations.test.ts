import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  RECENT_LOCATIONS_KEY,
  isSameRecommendationLocation,
  loadRecentLocations,
  recentLocationsKey,
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

const userA = '11111111-1111-4111-8111-111111111111';
const userB = '22222222-2222-4222-8222-222222222222';

const current = (): RecommendationLocation => ({
  source: 'current',
  label: '내 위치 사용 중',
  latitude: 37.5665,
  longitude: 126.978,
  kind: 'current',
});

const noIdLocation: RecommendationLocation = {
  source: 'kakao',
  label: '성수동1가',
  address: '서울 성동구 성수동1가',
  latitude: 37.5417253860375,
  longitude: 127.043351028535,
  kind: 'neighborhood',
};

const otherNoIdLocation: RecommendationLocation = {
  ...noIdLocation,
  label: '연남동',
  latitude: 37.5655,
  longitude: 126.9254,
};

describe('recent locations', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it('stores and restores RecommendationLocation values', async () => {
    await saveRecentLocation(userA, place('1', '서울숲'));

    await expect(loadRecentLocations(userA)).resolves.toEqual([place('1', '서울숲')]);
  });

  it('moves a reselected Kakao place to the front without duplicating it', async () => {
    await saveRecentLocation(userA, place('1'));
    await saveRecentLocation(userA, place('2'));
    await saveRecentLocation(userA, place('1', '장소 1 새 이름'));

    const recent = await loadRecentLocations(userA);
    expect(recent.map((item) => item.kakaoPlaceId)).toEqual(['1', '2']);
    expect(recent[0].label).toBe('장소 1 새 이름');
  });

  it('keeps only the five most recent valid locations', async () => {
    for (let index = 1; index <= 7; index += 1) {
      await saveRecentLocation(userA, place(String(index)));
    }

    const recent = await loadRecentLocations(userA);
    expect(recent.map((item) => item.kakaoPlaceId)).toEqual(['7', '6', '5', '4', '3']);
  });

  it('recovers safely from malformed local data', async () => {
    await AsyncStorage.setItem(RECENT_LOCATIONS_KEY, '{not-json');

    await expect(loadRecentLocations(userA)).resolves.toEqual([]);
  });

  it('never persists the current-location entry so denied GPS cannot be reused', async () => {
    await saveRecentLocation(userA, place('1'));
    const returned = await saveRecentLocation(userA, current());

    expect(returned.some((item) => item.source === 'current')).toBe(false);
    const reloaded = await loadRecentLocations(userA);
    expect(reloaded.some((item) => item.source === 'current')).toBe(false);
    expect(reloaded.map((item) => item.kakaoPlaceId)).toEqual(['1']);
  });

  it('drops any previously stored current-location entries on load', async () => {
    await AsyncStorage.setItem(
      recentLocationsKey(userA),
      JSON.stringify([current(), place('1')]),
    );

    const recent = await loadRecentLocations(userA);
    expect(recent.some((item) => item.source === 'current')).toBe(false);
    expect(recent.map((item) => item.kakaoPlaceId)).toEqual(['1']);
  });

  it('keeps recent locations separate for different signed-in users', async () => {
    await saveRecentLocation(userA, place('1', '서울숲'));
    await saveRecentLocation(userB, place('2', '한강공원'));

    await expect(loadRecentLocations(userA)).resolves.toEqual([place('1', '서울숲')]);
    await expect(loadRecentLocations(userB)).resolves.toEqual([place('2', '한강공원')]);
  });

  it('does not read or write recent locations without a signed-in user', async () => {
    await AsyncStorage.setItem(RECENT_LOCATIONS_KEY, JSON.stringify([place('1')]));

    await expect(loadRecentLocations(null)).resolves.toEqual([]);
    await expect(saveRecentLocation(null, place('2'))).resolves.toEqual([]);
    await expect(loadRecentLocations(null)).resolves.toEqual([]);
  });

  it('compares ID-less locations by coordinates and never treats null as selected', () => {
    expect(isSameRecommendationLocation(null, noIdLocation)).toBe(false);
    expect(isSameRecommendationLocation(noIdLocation, noIdLocation)).toBe(true);
    expect(isSameRecommendationLocation(noIdLocation, otherNoIdLocation)).toBe(false);
  });
});
