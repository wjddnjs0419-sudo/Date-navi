import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loadRecentPlaceSearches,
  saveRecentPlaceSearch,
  RECENT_PLACE_SEARCHES_LIMIT,
} from '../lib/recentPlaceSearches';

const userA = '11111111-1111-4111-8111-111111111111';
const userB = '22222222-2222-4222-8222-222222222222';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('recentPlaceSearches', () => {
  it('아무것도 저장 안 했으면 빈 배열', async () => {
    expect(await loadRecentPlaceSearches(userA)).toEqual([]);
  });

  it('저장한 검색어를 최신순으로 반환한다', async () => {
    await saveRecentPlaceSearch(userA, '성수 맛집');
    const result = await saveRecentPlaceSearch(userA, '한강 카페');
    expect(result).toEqual(['한강 카페', '성수 맛집']);
  });

  it('같은 검색어를 다시 저장하면 중복 대신 맨 앞으로 옮긴다', async () => {
    await saveRecentPlaceSearch(userA, '성수 맛집');
    await saveRecentPlaceSearch(userA, '한강 카페');
    const result = await saveRecentPlaceSearch(userA, '성수 맛집');
    expect(result).toEqual(['성수 맛집', '한강 카페']);
  });

  it(`최근 ${RECENT_PLACE_SEARCHES_LIMIT}개만 유지한다`, async () => {
    for (let i = 0; i < RECENT_PLACE_SEARCHES_LIMIT + 2; i++) {
      await saveRecentPlaceSearch(userA, `검색어${i}`);
    }
    const result = await loadRecentPlaceSearches(userA);
    expect(result.length).toBe(RECENT_PLACE_SEARCHES_LIMIT);
    expect(result[0]).toBe(`검색어${RECENT_PLACE_SEARCHES_LIMIT + 1}`);
  });

  it('공백만 있는 입력은 무시한다', async () => {
    const before = await loadRecentPlaceSearches(userA);
    const after = await saveRecentPlaceSearch(userA, '   ');
    expect(after).toEqual(before);
  });

  it('keeps recent search terms separate for different signed-in users', async () => {
    await saveRecentPlaceSearch(userA, '성수 맛집');
    await saveRecentPlaceSearch(userB, '한강 카페');

    await expect(loadRecentPlaceSearches(userA)).resolves.toEqual(['성수 맛집']);
    await expect(loadRecentPlaceSearches(userB)).resolves.toEqual(['한강 카페']);
  });

  it('does not read or write recent search terms without a signed-in user', async () => {
    await saveRecentPlaceSearch(null, '성수 맛집');
    await expect(loadRecentPlaceSearches(null)).resolves.toEqual([]);
  });
});
