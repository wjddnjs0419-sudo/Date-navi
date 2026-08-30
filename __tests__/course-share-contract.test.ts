import {
  buildCourseShareMessage,
  buildCourseShareUrl,
  normalizeCourseShareToken,
  parseCourseShareDto,
  parseCourseShareTokenFromUrl,
  type CourseShareDto,
} from '../lib/course-share';

const dto: CourseShareDto = {
  title: '성수동 감성 데이트 코스',
  summary: '서울숲부터 카페까지 이어지는 코스예요.',
  estimated_time: '총 4시간',
  estimated_budget: '8만원대',
  steps: [
    { label: '식사', desc: '가볍게 시작해요', place_name: '한강 식당' },
    { label: '카페', place_name: '한강 카페' },
  ],
};

const token = 'a'.repeat(64);

describe('course external share contract', () => {
  it('accepts only a 256-bit hex share token', () => {
    expect(normalizeCourseShareToken(token.toUpperCase())).toBe(token);
    expect(normalizeCourseShareToken('a'.repeat(63))).toBeNull();
    expect(normalizeCourseShareToken('a'.repeat(64).replace(/a/, 'g'))).toBeNull();
    expect(normalizeCourseShareToken('card-1')).toBeNull();
  });

  it('builds and parses the same web route without query-string fallbacks', () => {
    const url = buildCourseShareUrl(token);

    expect(url).toBe(`https://date-navi.vercel.app/course/${token}`);
    expect(parseCourseShareTokenFromUrl(url)).toBe(token);
    expect(parseCourseShareTokenFromUrl(`${url}?utm_source=share`)).toBe(token);
    expect(parseCourseShareTokenFromUrl('https://date-navi.vercel.app/course/not-a-token')).toBeNull();
    expect(parseCourseShareTokenFromUrl('https://date-navi.vercel.app/invite?code=AAAA')).toBeNull();
    expect(parseCourseShareTokenFromUrl(`https://date-navi.vercel.app/course/${token}/extra`)).toBeNull();
  });

  it('formats an ordered, token-bearing native share message', () => {
    const message = buildCourseShareMessage(dto, token, 'ko');

    expect(message).toContain(dto.title);
    expect(message).toContain('1. 한강 식당');
    expect(message).toContain('2. 한강 카페');
    expect(message.indexOf('1. 한강 식당')).toBeLessThan(message.indexOf('2. 한강 카페'));
    expect(message).toContain(`https://date-navi.vercel.app/course/${token}`);
    expect(message).not.toContain('card-1');
  });

  it('drops internal fields while accepting only the public DTO shape', () => {
    const parsed = parseCourseShareDto({
      ...dto,
      couple_id: 'couple-secret',
      created_by: 'user-secret',
      request_id: 'request-secret',
      steps: [{ ...dto.steps[0], candidateId: 'candidate-secret', kakaoPlaceId: 'place-secret' }],
    });

    expect(parsed).toEqual({
      ...dto,
      steps: [{ label: '식사', desc: '가볍게 시작해요', place_name: '한강 식당' }],
    });
    expect(parsed).not.toHaveProperty('couple_id');
    expect(parsed).not.toHaveProperty('created_by');
    expect(parsed).not.toHaveProperty('request_id');
    expect(parsed?.steps[0]).not.toHaveProperty('candidateId');
    expect(parsed?.steps[0]).not.toHaveProperty('kakaoPlaceId');
    expect(parseCourseShareDto({ title: '', steps: [] })).toBeNull();
  });
});
