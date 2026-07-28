import { collectFoodRows, collectFoodRowsFromStandardData, buildFoodIntentArtifacts } from '../scripts/food-intent-sync-lib';
import { syncFoodIntents, syncFoodIntentsFromStandardData } from '../scripts/sync-food-intents';

describe('food intent curation', () => {
  it('reads the official API envelope and rejects API errors', () => {
    expect(collectFoodRows({
      body: { totalCount: 2, items: [{ FOOD_NM_KR: '야채곱창' }, { FOOD_NM_KR: '치킨' }] },
    })).toEqual([{ sourceName: '야채곱창' }, { sourceName: '치킨' }]);
    expect(() => collectFoodRows({
      header: { resultCode: '30', resultMsg: 'SERVICE ERROR' }, body: { items: [] },
    })).toThrow('Food API returned 30: SERVICE ERROR');
  });

  it('groups aliases through overrides and excludes ingredients', () => {
    const artifacts = buildFoodIntentArtifacts([
      { sourceName: '야채곱창(조리식품)' },
      { sourceName: '곱창구이' },
      { sourceName: '닭가슴살 원재료' },
    ], {
      include: [{ canonicalTerm: '곱창', aliases: ['야채곱창', '곱창구이'], searchExpansions: ['곱창집'] }],
      excludeCanonicalTerms: [], aliasesByCanonicalTerm: {}, searchExpansionsByCanonicalTerm: {}, cuisineCategoryByCanonicalTerm: {},
    });
    expect(artifacts.entries).toEqual([expect.objectContaining({
      canonicalTerm: '곱창', aliases: expect.arrayContaining(['야채곱창', '곱창구이']), searchExpansions: ['곱창집'],
    })]);
    expect(artifacts.excluded).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceName: '닭가슴살 원재료', reason: 'ingredient' }),
    ]));
  });

  it('uses representative food names as canonical terms from standard-data JSON', () => {
    const rows = collectFoodRowsFromStandardData({ records: [
      { 식품명: '곱창구이_소고기', 대표식품명: '곱창구이', 데이터구분명: '음식' },
      { 식품명: '닭가슴살', 대표식품명: '닭가슴살', 데이터구분명: '식품' },
    ] });
    expect(rows).toEqual([{ sourceName: '곱창구이_소고기', canonicalName: '곱창구이' }]);
    const artifacts = buildFoodIntentArtifacts(rows, {
      include: [], excludeCanonicalTerms: [], aliasesByCanonicalTerm: {}, searchExpansionsByCanonicalTerm: {}, cuisineCategoryByCanonicalTerm: {},
    });
    expect(artifacts.entries).toEqual([expect.objectContaining({
      canonicalTerm: '곱창구이', aliases: ['곱창구이 소고기'],
    })]);
  });
});

describe('food intent sync', () => {
  const overrides = { include: [], excludeCanonicalTerms: [], aliasesByCanonicalTerm: {}, searchExpansionsByCanonicalTerm: {}, cuisineCategoryByCanonicalTerm: {} };

  it('paginates, keeps secrets out of artifacts, and writes only after complete fetch', async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ body: { totalCount: 3, items: [{ FOOD_NM_KR: '치킨' }, { FOOD_NM_KR: '곱창' }] } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ body: { totalCount: 3, items: [{ FOOD_NM_KR: '양꼬치' }] } }) });
    const files: Record<string, string> = {};
    await syncFoodIntents({ fetchImpl, serviceKey: 'secret-key', now: () => new Date('2026-07-28T00:00:00.000Z'), pageSize: 2, overrides,
      paths: { raw: 'food-source-raw.json', generated: 'food-intents.generated.json', excluded: 'food-intents-excluded.json', module: 'food-intents.generated.ts' },
      writeFile: async (path, content) => { files[path] = content; },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const query = new URL(String(fetchImpl.mock.calls[0][0])).searchParams;
    expect(query.get('serviceKey')).toBe('secret-key');
    expect(query.get('type')).toBe('json');
    expect(query.get('pageNo')).toBe('1');
    expect(query.get('numOfRows')).toBe('2');
    expect(JSON.parse(files['food-intents.generated.json']).entries).toHaveLength(3);
    expect(files['food-intents.generated.ts']).toContain('GENERATED_FOOD_INTENTS');
    expect(JSON.stringify(files)).not.toContain('secret-key');
  });

  it('does not write artifacts when a later page fails', async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ body: { totalCount: 2, items: [{ FOOD_NM_KR: '치킨' }] } }) })
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });
    const writeFile = jest.fn();
    await expect(syncFoodIntents({ fetchImpl, serviceKey: 'key', pageSize: 1, overrides,
      paths: { raw: 'raw', generated: 'generated', excluded: 'excluded', module: 'module' }, writeFile,
    })).rejects.toThrow('Food API request failed: 503');
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('writes artifacts from a local standard-data JSON without a service key', async () => {
    const files: Record<string, string> = {};
    await syncFoodIntentsFromStandardData({
      payload: { records: [{ 식품명: '닭갈비', 대표식품명: '닭갈비', 데이터구분명: '음식' }] },
      now: () => new Date('2026-07-28T00:00:00.000Z'), overrides,
      paths: { raw: 'raw', generated: 'generated', excluded: 'excluded', module: 'module' },
      writeFile: async (path, content) => { files[path] = content; },
    });
    expect(JSON.parse(files.generated).source.dataset).toContain('전국통합식품영양성분정보');
    expect(JSON.parse(files.generated).entries[0].canonicalTerm).toBe('닭갈비');
    expect(files.raw).toContain('대표식품명');
  });
});
