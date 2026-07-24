import { overrideCardContent, overrideCardTitle } from '../lib/card-i18n';

// 사용자가 제목을 직접 정하면 표시 언어와 무관하게 그 제목이 보여야 한다.
// content_i18n 의 모든 언어 블록 title 을 커스텀 제목으로 덮어쓴다.
describe('overrideCardTitle', () => {
  const i18n = {
    ko: { title: '낙성대역 2호선 데이트 코스', summary: '요약' },
    en: { title: 'Nakseongdae date course', summary: 'sum' },
  };

  test('모든 언어 블록의 title 을 커스텀 제목으로 바꾼다', () => {
    const out = overrideCardTitle(i18n, '우리 100일') as typeof i18n;
    expect(out.ko.title).toBe('우리 100일');
    expect(out.en.title).toBe('우리 100일');
  });

  test('title 외 필드(summary 등)는 보존한다', () => {
    const out = overrideCardTitle(i18n, '우리 100일') as typeof i18n;
    expect(out.ko.summary).toBe('요약');
    expect(out.en.summary).toBe('sum');
  });

  test('원본 객체를 변경하지 않는다', () => {
    overrideCardTitle(i18n, '우리 100일');
    expect(i18n.ko.title).toBe('낙성대역 2호선 데이트 코스');
  });

  test('content_i18n 이 없으면(null/비객체) 그대로 반환한다', () => {
    expect(overrideCardTitle(null, '제목')).toBeNull();
    expect(overrideCardTitle(undefined, '제목')).toBeUndefined();
    expect(overrideCardTitle('broken', '제목')).toBe('broken');
  });
});

// 수정 화면은 제목과 요약을 함께 편집하므로 두 필드 모두 언어 블록에 덮어써야 한다.
describe('overrideCardContent', () => {
  const i18n = {
    ko: { title: '옛 제목', summary: '옛 요약', why_recommended: '이유' },
    en: { title: 'old title', summary: 'old summary', why_recommended: 'why' },
  };

  test('전달한 필드만 모든 언어 블록에 덮어쓴다', () => {
    const out = overrideCardContent(i18n, { title: '새 제목', summary: '새 요약' }) as typeof i18n;
    expect(out.ko).toEqual({ title: '새 제목', summary: '새 요약', why_recommended: '이유' });
    expect(out.en).toEqual({ title: '새 제목', summary: '새 요약', why_recommended: 'why' });
  });

  test('필드가 비어 있으면 원본을 그대로 반환한다', () => {
    expect(overrideCardContent(i18n, {})).toBe(i18n);
    expect(overrideCardContent(null, { title: 'x' })).toBeNull();
  });
});
