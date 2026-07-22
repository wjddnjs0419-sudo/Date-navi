import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loadRecentPlaceSearches,
  saveRecentPlaceSearch,
  RECENT_PLACE_SEARCHES_LIMIT,
} from '../lib/recentPlaceSearches';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('recentPlaceSearches', () => {
  it('아무것도 저장 안 했으면 빈 배열', async () => {
    expect(await loadRecentPlaceSearches()).toEqual([]);
  });

  it('저장한 검색어를 최신순으로 반환한다', async () => {
    await saveRecentPlaceSearch('성수 맛집');
    const result = await saveRecentPlaceSearch('한강 카페');
    expect(result).toEqual(['한강 카페', '성수 맛집']);
  });

  it('같은 검색어를 다시 저장하면 중복 대신 맨 앞으로 옮긴다', async () => {
    await saveRecentPlaceSearch('성수 맛집');
    await saveRecentPlaceSearch('한강 카페');
    const result = await saveRecentPlaceSearch('성수 맛집');
    expect(result).toEqual(['성수 맛집', '한강 카페']);
  });

  it(`최근 ${RECENT_PLACE_SEARCHES_LIMIT}개만 유지한다`, async () => {
    for (let i = 0; i < RECENT_PLACE_SEARCHES_LIMIT + 2; i++) {
      await saveRecentPlaceSearch(`검색어${i}`);
    }
    const result = await loadRecentPlaceSearches();
    expect(result.length).toBe(RECENT_PLACE_SEARCHES_LIMIT);
    expect(result[0]).toBe(`검색어${RECENT_PLACE_SEARCHES_LIMIT + 1}`);
  });

  it('공백만 있는 입력은 무시한다', async () => {
    const before = await loadRecentPlaceSearches();
    const after = await saveRecentPlaceSearch('   ');
    expect(after).toEqual(before);
  });
});
