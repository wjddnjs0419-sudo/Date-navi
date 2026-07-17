import { localizeCardContent } from '../lib/card-i18n';

const contentI18n = {
  ko: { title: '서울숲 데이트 코스', summary: '검증된 코스예요.', why_recommended: '후보에서 확인했어요.' },
  en: { title: 'Seoul Forest date course', summary: 'A verified course.', why_recommended: 'Verified from candidates.' },
};

const card = {
  id: 'card-1',
  title: '서울숲 데이트 코스',
  summary: '검증된 코스예요.',
  why_recommended: '후보에서 확인했어요.',
  tags: ['식사', '카페'],
  content_i18n: contentI18n,
};

describe('localizeCardContent', () => {
  it('overlays texts for the viewer language when content_i18n has them', () => {
    const localized = localizeCardContent(card, 'en');
    expect(localized.title).toBe('Seoul Forest date course');
    expect(localized.summary).toBe('A verified course.');
    expect(localized.why_recommended).toBe('Verified from candidates.');
    expect(localized.tags).toEqual(['식사', '카페']);
  });

  it('keeps stored texts when viewer language matches', () => {
    expect(localizeCardContent(card, 'ko')).toEqual(card);
  });

  it('falls back to stored texts when content_i18n is missing or malformed', () => {
    const legacy = { ...card, content_i18n: null };
    expect(localizeCardContent(legacy, 'en').title).toBe('서울숲 데이트 코스');

    const malformed = { ...card, content_i18n: { en: { title: 42 } } };
    expect(localizeCardContent(malformed, 'en').title).toBe('서울숲 데이트 코스');

    const empty = { ...card, content_i18n: { en: { title: '  ' } } };
    expect(localizeCardContent(empty, 'en').title).toBe('서울숲 데이트 코스');
  });

  it('overlays only the fields present for the language', () => {
    const partial = { ...card, content_i18n: { en: { title: 'Only title' } } };
    const localized = localizeCardContent(partial, 'en');
    expect(localized.title).toBe('Only title');
    expect(localized.summary).toBe('검증된 코스예요.');
  });
});
