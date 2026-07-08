import { buildFeelingInput, buildCourseInput } from '../lib/modeForm';

describe('mode별 FeelingInput 빌더', () => {
  it('feeling: 분위기 mood + freeText 반영', () => {
    const input = buildFeelingInput({ mood: 'quiet', freeText: '조용한 데이트', duration: '1h' });
    expect(input.mood).toBe('quiet');
    expect(input.freeText).toBe('조용한 데이트');
  });
  it('모든 빌더가 location을 전달한다', () => {
    expect(buildFeelingInput({ mood: 'quiet', duration: '1h', location: '연남동' }).location).toBe('연남동');
    expect(buildCourseInput({ idea: '한강', duration: '', location: '여의도' }).location).toBe('여의도');
  });
  it('location 공백/미입력은 undefined로 정규화', () => {
    expect(buildFeelingInput({ mood: 'quiet', duration: '1h' }).location).toBeUndefined();
    expect(buildCourseInput({ idea: '한강', duration: '', location: '  ' }).location).toBeUndefined();
  });
  it('모든 빌더가 coords를 전달한다', () => {
    const coords = { x: '127.05', y: '37.54' };
    expect(buildFeelingInput({ mood: 'quiet', duration: '1h', coords }).coords).toEqual(coords);
    expect(buildCourseInput({ idea: '한강', duration: '', coords }).coords).toEqual(coords);
  });
  it('coords 미지정 시 undefined', () => {
    expect(buildFeelingInput({ mood: 'quiet', duration: '1h' }).coords).toBeUndefined();
    expect(buildCourseInput({ idea: '한강', duration: '' }).coords).toBeUndefined();
  });
  it('coords가 있으면 location 텍스트는 버린다 (GPS placeholder 저장 방지)', () => {
    const coords = { x: '127.05', y: '37.54' };
    expect(buildFeelingInput({ mood: 'quiet', duration: '1h', location: '내 위치 사용 중', coords }).location).toBeUndefined();
    expect(buildCourseInput({ idea: '한강', duration: '', location: '내 위치 사용 중', coords }).location).toBeUndefined();
  });

  it('feeling: budget 필드가 결과 객체에 없다', () => {
    const input = buildFeelingInput({ mood: 'quiet', duration: '1h' });
    expect('budget' in input).toBe(false);
  });

  it('course: 아이디어 freeText 반영, duration 빈 값은 undefined', () => {
    const input = buildCourseInput({ idea: '한강 피크닉', duration: '' });
    expect(input.freeText).toBe('한강 피크닉');
    expect(input.duration).toBeUndefined();
    const input2 = buildCourseInput({ idea: ' 야경 ', duration: 'half_day' });
    expect(input2.freeText).toBe('야경');
    expect(input2.duration).toBe('half_day');
  });

  it('feeling: duration 미지정이면 undefined', () => {
    const input = buildFeelingInput({ mood: 'quiet' });
    expect(input.duration).toBeUndefined();
  });
});
