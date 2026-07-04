import { distanceToRadius, formatPlacesBlock, detectPlaceFocus, type KakaoPlace } from '../lib/place';

describe('distanceToRadius', () => {
  it('near는 1km', () => {
    expect(distanceToRadius('near')).toBe(1000);
  });
  it('any는 3km', () => {
    expect(distanceToRadius('any')).toBe(3000);
  });
  it('far는 5km', () => {
    expect(distanceToRadius('far')).toBe(5000);
  });
  it('알 수 없는 값은 기본 3km', () => {
    expect(distanceToRadius('weird')).toBe(3000);
  });
});

describe('formatPlacesBlock', () => {
  const places: KakaoPlace[] = [
    { name: '성수동 카페', category: '카페', address: '서울 성동구 연무장길 1', url: 'http://place/1', x: '127.0', y: '37.5' },
    { name: '연무장 술집', category: '술집', address: '서울 성동구 연무장길 2', url: 'http://place/2', x: '127.1', y: '37.6' },
  ];

  it('빈 목록이면 빈 문자열', () => {
    expect(formatPlacesBlock([], 'ko')).toBe('');
  });

  it('실제 장소명·주소·카테고리를 모두 포함한다', () => {
    const block = formatPlacesBlock(places, 'ko');
    expect(block).toContain('성수동 카페');
    expect(block).toContain('서울 성동구 연무장길 1');
    expect(block).toContain('카페');
    expect(block).toContain('연무장 술집');
  });

  it('map_url을 채울 수 있도록 장소 url을 포함한다', () => {
    const block = formatPlacesBlock(places, 'ko');
    expect(block).toContain('http://place/1');
    expect(block).toContain('http://place/2');
  });

  it('제공된 실제 장소만 쓰라는 지침을 포함한다', () => {
    const block = formatPlacesBlock(places, 'ko');
    expect(block).toMatch(/실제|목록/);
  });

  it('영어 모드에서도 지침을 포함한다', () => {
    const block = formatPlacesBlock(places, 'en');
    expect(block).toMatch(/real|list/i);
    expect(block).toContain('성수동 카페');
  });

  it('focusLabel을 주면 카테고리 고정 지침이 추가된다', () => {
    const block = formatPlacesBlock(places, 'ko', '카페');
    expect(block).toContain('카페');
    expect(block).toMatch(/카드 3개 모두|모든 카드/);
  });

  it('focusLabel이 없으면 카테고리 고정 지침이 없다', () => {
    const block = formatPlacesBlock(places, 'ko');
    expect(block).not.toMatch(/카드 3개 모두|모든 카드/);
  });

  it('영어 모드에서 focusLabel을 주면 카테고리 고정 지침이 추가된다', () => {
    const block = formatPlacesBlock(places, 'en', 'cafe');
    expect(block).toMatch(/all 3 cards/i);
  });
});

describe('detectPlaceFocus', () => {
  it('"카페" 언급 시 카페 카테고리로 감지', () => {
    expect(detectPlaceFocus('카페 추천해줘')).toEqual({ code: 'CE7', label: '카페' });
  });

  it('"맛집" 언급 시 음식점 카테고리로 감지', () => {
    expect(detectPlaceFocus('오늘은 맛집 가고 싶어')).toEqual({ code: 'FD6', label: '음식점' });
  });

  it('"술집" 언급 시 키워드 검색으로 감지', () => {
    expect(detectPlaceFocus('술집 한잔')).toEqual({ query: '술집', label: '술집' });
  });

  it('"전시" 언급 시 문화시설 카테고리로 감지', () => {
    expect(detectPlaceFocus('전시 보러 가자')).toEqual({ code: 'CT1', label: '문화시설' });
  });

  it('"산책" 언급 시 관광명소 카테고리로 감지', () => {
    expect(detectPlaceFocus('가볍게 산책하고 싶어')).toEqual({ code: 'AT4', label: '관광명소' });
  });

  it('일치하는 키워드가 없으면 null', () => {
    expect(detectPlaceFocus('그냥 아무거나 좋아')).toBeNull();
  });

  it('freeText가 없으면 null', () => {
    expect(detectPlaceFocus(undefined)).toBeNull();
  });

  it('"액티비티" 언급 시 액티비티 키워드 검색으로 감지', () => {
    expect(detectPlaceFocus('액티비티 하고 싶어')).toEqual({ query: '액티비티', label: '액티비티' });
  });

  it('"방탈출" 언급 시 액티비티 키워드 검색으로 감지', () => {
    expect(detectPlaceFocus('방탈출 가자')).toEqual({ query: '액티비티', label: '액티비티' });
  });

  it('"스포츠" 언급 시 스포츠 키워드 검색으로 감지', () => {
    expect(detectPlaceFocus('스포츠 즐기고 싶어')).toEqual({ query: '스포츠', label: '스포츠' });
  });

  it('"볼링" 언급 시 액티비티 키워드 검색으로 감지', () => {
    expect(detectPlaceFocus('볼링 치러 가자')).toEqual({ query: '액티비티', label: '액티비티' });
  });

  it('"노래방" 언급 시 액티비티 키워드 검색으로 감지', () => {
    expect(detectPlaceFocus('노래방 가자')).toEqual({ query: '액티비티', label: '액티비티' });
  });

  it('"영화" 언급 시 액티비티 키워드 검색으로 감지', () => {
    expect(detectPlaceFocus('영화 보고 싶어')).toEqual({ query: '액티비티', label: '액티비티' });
  });

  it('"피크닉" 언급 시 액티비티 키워드 검색으로 감지', () => {
    expect(detectPlaceFocus('피크닉 가고 싶어')).toEqual({ query: '액티비티', label: '액티비티' });
  });

  it('"보드게임카페"는 카페가 아니라 액티비티로 감지된다 (부분 문자열 "카페" 오매칭 방지)', () => {
    expect(detectPlaceFocus('보드게임카페 가자')).toEqual({ query: '액티비티', label: '액티비티' });
  });

  it('"축구" 언급 시 스포츠 키워드 검색으로 감지', () => {
    expect(detectPlaceFocus('축구 하고 싶어')).toEqual({ query: '스포츠', label: '스포츠' });
  });

  it('"야구" 언급 시 스포츠 키워드 검색으로 감지', () => {
    expect(detectPlaceFocus('야구 보러 가자')).toEqual({ query: '스포츠', label: '스포츠' });
  });

  it('"농구" 언급 시 스포츠 키워드 검색으로 감지', () => {
    expect(detectPlaceFocus('농구 하러 가자')).toEqual({ query: '스포츠', label: '스포츠' });
  });

  it('"배드민턴" 언급 시 스포츠 키워드 검색으로 감지', () => {
    expect(detectPlaceFocus('배드민턴 치자')).toEqual({ query: '스포츠', label: '스포츠' });
  });

  it('"수영" 언급 시 스포츠 키워드 검색으로 감지', () => {
    expect(detectPlaceFocus('수영 하러 가자')).toEqual({ query: '스포츠', label: '스포츠' });
  });

  it('"탁구" 언급 시 스포츠 키워드 검색으로 감지', () => {
    expect(detectPlaceFocus('탁구 치자')).toEqual({ query: '스포츠', label: '스포츠' });
  });
});
