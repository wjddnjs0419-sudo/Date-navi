import { buildNaverMapSearchUrl } from '../shared/recommendation/naver-map-link';

describe('Naver map search links', () => {
  it('searches by place name only when a name is available', () => {
    expect(buildNaverMapSearchUrl('티티티', '부산광역시 수영구 광안해변로 123'))
      .toBe('https://map.naver.com/p/search/%ED%8B%B0%ED%8B%B0%ED%8B%B0');
  });

  it('falls back to the address only when the place name is empty', () => {
    expect(buildNaverMapSearchUrl('  ', '부산광역시 수영구 광안해변로 123'))
      .toBe(`https://map.naver.com/p/search/${encodeURIComponent('부산광역시 수영구 광안해변로 123')}`);
  });
});
