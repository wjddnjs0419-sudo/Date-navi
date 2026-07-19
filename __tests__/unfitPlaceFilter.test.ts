import {
  UNFIT_CATEGORY_GROUP_CODES,
  UNFIT_CATEGORY_NAME_KEYWORDS,
  isUnfitDatePlace,
} from '../supabase/functions/_shared/recommendation-category';

const facts = (categoryGroupCode: string, categoryName = '') => ({ categoryGroupCode, categoryName });

describe('isUnfitDatePlace', () => {
  it('rejects every blocked category group code', () => {
    for (const code of UNFIT_CATEGORY_GROUP_CODES) {
      expect(isUnfitDatePlace(facts(code))).toBe(true);
    }
  });

  it('rejects blocked name keywords even inside an allowed group code', () => {
    for (const keyword of UNFIT_CATEGORY_NAME_KEYWORDS) {
      expect(isUnfitDatePlace(facts('CE7', `카페 > ${keyword}`))).toBe(true);
    }
  });

  it('keeps legitimate date places (food, cafe, culture, attraction)', () => {
    expect(isUnfitDatePlace(facts('FD6', '음식점 > 한식'))).toBe(false);
    expect(isUnfitDatePlace(facts('CE7', '음식점 > 카페 > 디저트'))).toBe(false);
    expect(isUnfitDatePlace(facts('CT1', '문화시설 > 전시'))).toBe(false);
    expect(isUnfitDatePlace(facts('AT4', '관광명소 > 공원'))).toBe(false);
  });

  it('passes empty fields without throwing', () => {
    expect(isUnfitDatePlace(facts('', ''))).toBe(false);
  });

  it('blocks the well-known unfit groups explicitly', () => {
    expect(UNFIT_CATEGORY_GROUP_CODES.has('HP8')).toBe(true); // 병원
    expect(UNFIT_CATEGORY_GROUP_CODES.has('PM9')).toBe(true); // 약국
    expect(UNFIT_CATEGORY_GROUP_CODES.has('AD5')).toBe(true); // 숙박(모텔)
    expect(UNFIT_CATEGORY_GROUP_CODES.has('CE7')).toBe(false); // 카페는 허용
    expect(UNFIT_CATEGORY_GROUP_CODES.has('FD6')).toBe(false); // 음식점은 허용
  });
});
