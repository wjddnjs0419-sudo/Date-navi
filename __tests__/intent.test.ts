import { resolveIntent, type PlanIntent } from '../lib/intent';

describe('resolveIntent — feeling 모드', () => {
  it('"공부하기 좋은 조용한 카페" → study purpose + cafe + 확장 쿼리 + 부정 신호', () => {
    const intent = resolveIntent({
      mode: 'feeling',
      freeText: '공부하기 좋은 조용한 카페',
      mood: 'quiet',
      duration: '2-3h',
    });
    expect(intent.purpose).toBe('study');
    expect(intent.placeTypes).toContain('cafe');
    expect(intent.searchQueries).toContain('스터디카페');
    expect(intent.searchQueries).toContain('북카페');
    expect(intent.negativeSignals).toContain('술집');
    expect(intent.duration).toBe('2-3h');
  });

  it('"술 한잔 하고 싶어" → drink purpose + bar + 술집 쿼리', () => {
    const intent = resolveIntent({ mode: 'feeling', freeText: '술 한잔 하고 싶어', mood: 'fun', duration: '2-3h' });
    expect(intent.purpose).toBe('drink');
    expect(intent.placeTypes).toContain('bar');
    expect(intent.searchQueries).toContain('술집');
  });

  it('freeText 없으면 general_date + 폭넓은 placeTypes (2종 이상)', () => {
    const intent = resolveIntent({ mode: 'feeling', freeText: undefined, mood: 'romantic', duration: '2-3h' });
    expect(intent.purpose).toBe('general_date');
    expect(intent.placeTypes.length).toBeGreaterThanOrEqual(2);
  });

  it('mood를 atmosphere로 매핑한다 (quiet)', () => {
    const intent = resolveIntent({ mode: 'feeling', freeText: '카페', mood: 'quiet', duration: '1h' });
    expect(intent.atmosphere).toContain('quiet');
  });

  it('"영화보고 싶어"는 액티비티가 아니라 영화관으로 감지된다', () => {
    const intent = resolveIntent({ mode: 'feeling', freeText: '영화보고 싶어', mood: 'comfortable', duration: '2-3h' });
    expect(intent.searchQueries).toContain('영화관');
    expect(intent.searchQueries).not.toContain('액티비티');
  });

  it('"방탈출"은 여전히 액티비티로 감지된다 ("영화" 분리가 다른 액티비티 키워드에 영향 없음)', () => {
    const intent = resolveIntent({ mode: 'feeling', freeText: '방탈출 가고 싶어', mood: 'fun', duration: '2-3h' });
    expect(intent.searchQueries).toContain('액티비티');
  });

  it('"일식 먹고 싶어"는 meal purpose로 감지된다 (구체 음식 키워드)', () => {
    const intent = resolveIntent({ mode: 'feeling', freeText: '일식 먹고 싶어', mood: 'comfortable', duration: '2-3h' });
    expect(intent.purpose).toBe('meal');
    expect(intent.placeTypes).toContain('restaurant');
  });

  it('freeText 원문이 searchQueries에 항상 포함된다 (하드코딩 목록에 없는 키워드 대비)', () => {
    const intent = resolveIntent({ mode: 'feeling', freeText: '브라질리언 바베큐 먹고 싶어', mood: 'comfortable', duration: '2-3h' });
    expect(intent.searchQueries).toContain('브라질리언 바베큐 먹고 싶어');
  });

  it('freeText가 없으면 원문 추가도 없다', () => {
    const intent = resolveIntent({ mode: 'feeling', freeText: undefined, mood: 'comfortable', duration: '2-3h' });
    expect(intent.searchQueries).not.toContain(undefined);
    expect(intent.searchQueries.every(q => typeof q === 'string' && q.length > 0)).toBe(true);
  });
});

describe('resolveIntent — make_course 모드', () => {
  it('단일 카테고리로 좁히지 않는다 — "카페 가고 싶어"여도 placeTypes 2종 이상', () => {
    const intent = resolveIntent({ mode: 'make_course', freeText: '카페 가고 싶어', mood: 'comfortable', duration: 'half_day' });
    expect(intent.placeTypes).toContain('cafe');
    expect(intent.placeTypes.length).toBeGreaterThanOrEqual(2);
  });

  it('여러 활동을 언급하면 해당 placeType들을 모두 확보한다 — "브런치 먹고 산책"', () => {
    const intent = resolveIntent({ mode: 'make_course', freeText: '브런치 먹고 산책', mood: 'comfortable', duration: 'half_day' });
    expect(intent.placeTypes).toContain('restaurant');
    expect(intent.placeTypes).toContain('attraction');
  });

  it('searchQueries에 중복이 없다', () => {
    const intent: PlanIntent = resolveIntent({ mode: 'make_course', freeText: '카페 카페 브런치', mood: 'comfortable', duration: 'half_day' });
    const unique = new Set(intent.searchQueries);
    expect(unique.size).toBe(intent.searchQueries.length);
  });
});
