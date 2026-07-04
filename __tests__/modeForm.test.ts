import { buildLightInput, buildPickInput, buildFeelingInput, buildCourseInput } from '../lib/modeForm';

describe('mode별 FeelingInput 빌더', () => {
  it('light: 저예산·근거리 고정', () => {
    const input = buildLightInput({ duration: '1h' });
    expect(input.budget).toBe('low');
    expect(input.distance).toBe('near');
    expect(input.duration).toBe('1h');
    expect(input.freeText).toBeUndefined();
  });
  it('pick: 조건 그대로, freeText 없음', () => {
    const input = buildPickInput({ energy: 'low', budget: 'medium', distance: 'near', duration: '2-3h' });
    expect(input.budget).toBe('medium');
    expect(input.freeText).toBeUndefined();
  });
  it('feeling: 분위기 mood + freeText 반영', () => {
    const input = buildFeelingInput({ mood: 'quiet', freeText: '조용한 데이트', budget: 'low', duration: '1h' });
    expect(input.mood).toBe('quiet');
    expect(input.freeText).toBe('조용한 데이트');
  });
  it('모든 빌더가 location을 전달한다', () => {
    expect(buildLightInput({ duration: '1h', location: '성수동' }).location).toBe('성수동');
    expect(buildPickInput({ energy: 'low', budget: 'medium', distance: 'near', duration: '2-3h', location: '홍대' }).location).toBe('홍대');
    expect(buildFeelingInput({ mood: 'quiet', budget: 'low', duration: '1h', location: '연남동' }).location).toBe('연남동');
    expect(buildCourseInput({ idea: '한강', budget: '', duration: '', location: '여의도' }).location).toBe('여의도');
  });
  it('location 공백/미입력은 undefined로 정규화', () => {
    expect(buildLightInput({ duration: '1h', location: '  ' }).location).toBeUndefined();
    expect(buildFeelingInput({ mood: 'quiet', budget: 'low', duration: '1h' }).location).toBeUndefined();
  });
  it('모든 빌더가 coords를 전달한다', () => {
    const coords = { x: '127.05', y: '37.54' };
    expect(buildLightInput({ duration: '1h', coords }).coords).toEqual(coords);
    expect(buildPickInput({ energy: 'low', budget: 'medium', distance: 'near', duration: '2-3h', coords }).coords).toEqual(coords);
    expect(buildFeelingInput({ mood: 'quiet', budget: 'low', duration: '1h', coords }).coords).toEqual(coords);
    expect(buildCourseInput({ idea: '한강', budget: '', duration: '', coords }).coords).toEqual(coords);
  });
  it('coords 미지정 시 undefined', () => {
    expect(buildLightInput({ duration: '1h' }).coords).toBeUndefined();
    expect(buildCourseInput({ idea: '한강', budget: '', duration: '' }).coords).toBeUndefined();
  });
  it('coords가 있으면 location 텍스트는 버린다 (GPS placeholder 저장 방지)', () => {
    const coords = { x: '127.05', y: '37.54' };
    expect(buildLightInput({ duration: '1h', location: '내 위치 사용 중', coords }).location).toBeUndefined();
    expect(buildPickInput({ energy: 'low', budget: 'medium', distance: 'near', duration: '2-3h', location: '내 위치 사용 중', coords }).location).toBeUndefined();
    expect(buildFeelingInput({ mood: 'quiet', budget: 'low', duration: '1h', location: '내 위치 사용 중', coords }).location).toBeUndefined();
    expect(buildCourseInput({ idea: '한강', budget: '', duration: '', location: '내 위치 사용 중', coords }).location).toBeUndefined();
  });

  it('course: 아이디어 freeText + 예산/시간 반영, 빈 값은 기본값', () => {
    const input = buildCourseInput({ idea: '한강 피크닉', budget: '', duration: '' });
    expect(input.freeText).toBe('한강 피크닉');
    expect(input.budget).toBe('medium');
    expect(input.duration).toBe('2-3h');
    const input2 = buildCourseInput({ idea: ' 야경 ', budget: 'high', duration: 'half_day' });
    expect(input2.freeText).toBe('야경');
    expect(input2.budget).toBe('high');
  });
});
