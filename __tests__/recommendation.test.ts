import { RECOMMENDATION_CONFIG } from '../lib/recommendationConfig';
import {
  resolveIntentMode,
  deterministicFields,
  buildCandidatesBlock,
  buildFeelingSelectPrompt,
  buildCourseSelectPrompt,
  assembleFeelingCards,
  assembleCourseCards,
  buildDeterministicFallback,
  usedCandidateIds,
  collectPlaceIds,
  COURSE_STEP_COUNT_BY_DURATION,
} from '../lib/recommendation';
import { DURATION_MAP } from '../lib/prompt';
import type { Candidate } from '../lib/candidate';
import type { PlanIntent } from '../lib/intent';
import type { FeelingInput } from '../lib/ai';

const cands: Candidate[] = [
  { candidateId: 'candidate_001', placeId: 'p1', name: 'A카페', category: '카페', address: '서울 성수', x: '127', y: '37', mapUrl: 'http://a', matchedQueries: ['카페'], matchedIntentSignals: [], score: 6 },
  { candidateId: 'candidate_002', placeId: 'p2', name: 'B식당', category: '음식점', address: '서울 성수', x: '127', y: '37', mapUrl: 'http://b', matchedQueries: ['맛집'], matchedIntentSignals: [], score: 3 },
];
const intent: PlanIntent = { purpose: 'meal', placeTypes: ['cafe'], atmosphere: ['quiet'], duration: '2-3h', searchQueries: ['카페'], positiveSignals: [], negativeSignals: [] };
const input: FeelingInput = { energy: 'medium', distance: 'any', mood: 'comfortable', duration: '2-3h', avoid: [] };

describe('RECOMMENDATION_CONFIG', () => {
  it('exposes claude/final limits', () => {
    expect(RECOMMENDATION_CONFIG.haikuCandidateLimit).toBe(15);
    expect(RECOMMENDATION_CONFIG.finalRecommendationCount).toBe(3);
    expect(RECOMMENDATION_CONFIG.rankedCandidateLimit).toBe(20);
  });
});

describe('resolveIntentMode', () => {
  it('maps make_course to course', () => {
    expect(resolveIntentMode('make_course')).toBe('make_course');
  });
  it.each(['feeling', 'pick_for_me', 'light', 'next_meet', 'anything'])(
    'maps %s to feeling', (m) => expect(resolveIntentMode(m)).toBe('feeling'),
  );
});

describe('deterministicFields', () => {
  it('estimated_budget은 항상 빈 문자열 (예산은 AI 추천 근거에서 제외)', () => {
    const f = deterministicFields(input, 'ko');
    expect(f.estimated_budget).toBe('');
  });
  it('duration이 있으면 duration map으로 estimated_time을 채운다', () => {
    const f = deterministicFields({ ...input, duration: '2-3h' }, 'ko');
    expect(f.estimated_time).toBe('2~3시간');
  });
  it('duration이 없으면 estimated_time도 빈 문자열', () => {
    const f = deterministicFields({ ...input, duration: undefined }, 'ko');
    expect(f.estimated_time).toBe('');
  });
  it('알 수 없는 duration 값은 원본 그대로 폴백', () => {
    const f = deterministicFields({ ...input, duration: 'x' }, 'ko');
    expect(f.estimated_time).toBe('x');
  });
  it('uses EN maps', () => {
    const f = deterministicFields({ ...input, duration: '1h' }, 'en');
    expect(f.estimated_time).toBe('About 1 hour');
  });
});

describe('candidate prompts', () => {
  it('block lists candidate_id + name + category', () => {
    const b = buildCandidatesBlock(cands, 'ko');
    expect(b).toContain('candidate_001');
    expect(b).toContain('A카페');
    expect(b).toContain('카페');
  });
  it('feeling prompt asks JSON recommendations w/ candidate_id, no estimated fields', () => {
    const p = buildFeelingSelectPrompt(cands, intent, input, undefined, 'ko');
    expect(p).toContain('candidate_id');
    expect(p).toContain('recommendations');
    expect(p).not.toContain('estimated_time');
    expect(p).not.toContain('estimated_budget');
  });
  it('course prompt requests steps with optional candidate_id', () => {
    const p = buildCourseSelectPrompt(cands, intent, input, undefined, 'ko');
    expect(p).toContain('steps');
    expect(p).toContain('candidate_id');
  });
  it('caps candidates to haikuCandidateLimit', () => {
    const many: Candidate[] = Array.from({ length: 20 }, (_, i) => ({ ...cands[0], candidateId: `candidate_${String(i + 1).padStart(3, '0')}`, placeId: `p${i}` }));
    const b = buildCandidatesBlock(many, 'ko');
    expect((b.match(/candidate_/g) ?? []).length).toBeLessThanOrEqual(15);
  });
});

describe('duration이 프롬프트에 미치는 영향', () => {
  it('course_select: duration=1h면 2단계 지침', () => {
    const p = buildCourseSelectPrompt(cands, intent, { ...input, duration: '1h' }, undefined, 'ko');
    expect(p).toContain('2단계');
  });
  it('course_select: duration=2-3h면 3단계 지침', () => {
    const p = buildCourseSelectPrompt(cands, intent, { ...input, duration: '2-3h' }, undefined, 'ko');
    expect(p).toContain('3단계');
  });
  it('course_select: duration=half_day/full_day면 4단계 지침', () => {
    const pHalf = buildCourseSelectPrompt(cands, intent, { ...input, duration: 'half_day' }, undefined, 'ko');
    const pFull = buildCourseSelectPrompt(cands, intent, { ...input, duration: 'full_day' }, undefined, 'ko');
    expect(pHalf).toContain('4단계');
    expect(pFull).toContain('4단계');
  });
  it('course_select: duration 없으면 단계 수 지침 생략', () => {
    const p = buildCourseSelectPrompt(cands, intent, { ...input, duration: undefined }, undefined, 'ko');
    expect(p).not.toMatch(/\d단계로 구성/);
  });
  it('feeling_select: duration이 있으면 참고 문맥으로만 포함', () => {
    const p = buildFeelingSelectPrompt(cands, intent, { ...input, duration: '2-3h' }, undefined, 'ko');
    expect(p).toContain('가능 시간: 2~3시간');
  });
  it('feeling_select: duration 없으면 생략', () => {
    const p = buildFeelingSelectPrompt(cands, intent, { ...input, duration: undefined }, undefined, 'ko');
    expect(p).not.toContain('가능 시간');
  });

  it('COURSE_STEP_COUNT_BY_DURATION의 키 집합은 DURATION_MAP과 항상 같다 (독립적으로 드리프트 방지)', () => {
    expect(Object.keys(COURSE_STEP_COUNT_BY_DURATION).sort()).toEqual(Object.keys(DURATION_MAP).sort());
  });
});

describe('assembleFeelingCards', () => {
  it('keeps only recs whose candidate_id exists; merges place + deterministic fields', () => {
    const recs = [
      { candidate_id: 'candidate_001', title: '조용한 카페', summary: 's', why_recommended: 'w', tags: ['a'] },
      { candidate_id: 'ghost_999', title: 'x', summary: 'y', why_recommended: 'z', tags: [] },
    ];
    const cards = assembleFeelingCards(recs, cands, input, [], 'ko');
    expect(cards).toHaveLength(1);
    expect(cards[0].place_name).toBe('A카페');
    expect(cards[0].map_url).toBe('http://a');
    expect(cards[0].estimated_budget).toBe('');
  });
  it('drops duplicate candidate_id', () => {
    const recs = [
      { candidate_id: 'candidate_001', title: 't1', summary: 's', why_recommended: 'w', tags: [] },
      { candidate_id: 'candidate_001', title: 't2', summary: 's', why_recommended: 'w', tags: [] },
    ];
    expect(assembleFeelingCards(recs, cands, input, [], 'ko')).toHaveLength(1);
  });
  it('excludes candidate whose placeId is in previousPlaceIds', () => {
    const recs = [{ candidate_id: 'candidate_001', title: 't', summary: 's', why_recommended: 'w', tags: [] }];
    expect(assembleFeelingCards(recs, cands, input, ['p1'], 'ko')).toHaveLength(0);
  });
});

describe('assembleCourseCards', () => {
  it('resolves place steps, keeps action steps, drops ghost place steps', () => {
    const recs = [{ title: '코스', summary: 's', why_recommended: 'w', tags: ['t'], steps: [
      { candidate_id: 'candidate_001', label: '카페', desc: 'd1' },
      { label: '산책', desc: 'd2' },
      { candidate_id: 'ghost', label: 'x', desc: 'd3' },
    ] }];
    const cards = assembleCourseCards(recs, cands, input, [], 'ko');
    expect(cards).toHaveLength(1);
    expect(cards[0].steps).toHaveLength(2);
    expect(cards[0].steps![0].place_name).toBe('A카페');
    expect(cards[0].steps![1].label).toBe('산책');
  });
  it('drops a course that has zero valid place steps', () => {
    const recs = [{ title: 'c', summary: 's', why_recommended: 'w', tags: [], steps: [{ candidate_id: 'ghost', label: 'x' }] }];
    expect(assembleCourseCards(recs, cands, input, [], 'ko')).toHaveLength(0);
  });
});

describe('buildDeterministicFallback', () => {
  it('skips used/previous placeIds', () => {
    const cards = buildDeterministicFallback(cands, intent, input, ['p2'], new Set(['candidate_001']), 2, 'ko');
    expect(cards).toHaveLength(0);
  });
  it('produces cards with only data-verifiable copy (no vibe claims)', () => {
    const cards = buildDeterministicFallback(cands, intent, input, [], new Set(), 1, 'ko');
    expect(cards).toHaveLength(1);
    expect(cards[0].place_name).toBe('A카페');
    expect(cards[0].summary).not.toMatch(/조용|저렴/);
  });
});

describe('helpers', () => {
  it('usedCandidateIds collects non-empty ids', () => {
    expect(usedCandidateIds([{ candidate_id: 'candidate_001' }, {}, { candidate_id: 'candidate_002' }])).toEqual(['candidate_001', 'candidate_002']);
  });
  it('collectPlaceIds maps card place_name back to candidate placeId', () => {
    const cards = assembleFeelingCards([{ candidate_id: 'candidate_001', title: 't', summary: 's', why_recommended: 'w', tags: [] }], cands, input, [], 'ko');
    expect(collectPlaceIds(cards, cands)).toEqual(['p1']);
  });
});
