import { matchesFilter, cardBadgeStatus, sortCards } from '../app/(tabs)/candidates';

const base = {
  id: 'c1', title: '', summary: '', estimated_time: '', estimated_budget: '',
  tags: [], mode: 'make_course', source: 'ai' as const, created_at: '2026-07-01T00:00:00Z',
  created_by: 'u1',
  myReaction: null, partnerReaction: null,
  myConditionTag: null, partnerConditionTag: null,
};

describe('matchesFilter', () => {
  it('all은 항상 true', () => {
    expect(matchesFilter(base, 'all', 'u1')).toBe(true);
  });

  it('mutual은 둘 다 love/like일 때만 true', () => {
    const mutual = { ...base, myReaction: 'love' as const, partnerReaction: 'like' as const };
    expect(matchesFilter(mutual, 'mutual', 'u1')).toBe(true);
    expect(matchesFilter(base, 'mutual', 'u1')).toBe(false);
  });

  it('mine은 source=manual + created_by===me 일 때만 true', () => {
    const mine = { ...base, source: 'manual' as const, created_by: 'u1' };
    const aiCard = { ...base, source: 'ai' as const, created_by: 'u1' };
    expect(matchesFilter(mine, 'mine', 'u1')).toBe(true);
    expect(matchesFilter(aiCard, 'mine', 'u1')).toBe(false);
  });

  it('partner는 source=manual + created_by!==me 일 때만 true', () => {
    const partnerCard = { ...base, source: 'manual' as const, created_by: 'u2' };
    expect(matchesFilter(partnerCard, 'partner', 'u1')).toBe(true);
    expect(matchesFilter({ ...partnerCard, created_by: 'u1' }, 'partner', 'u1')).toBe(false);
  });
});

describe('cardBadgeStatus', () => {
  it('상호 긍정 반응이면 mutual', () => {
    const mutual = { ...base, myReaction: 'love' as const, partnerReaction: 'like' as const };
    expect(cardBadgeStatus(mutual, 'u1')).toBe('mutual');
  });

  it('manual + 내가 만든 카드면 mine', () => {
    expect(cardBadgeStatus({ ...base, source: 'manual' as const, created_by: 'u1' }, 'u1')).toBe('mine');
  });

  it('manual + 상대가 만든 카드면 partner', () => {
    expect(cardBadgeStatus({ ...base, source: 'manual' as const, created_by: 'u2' }, 'u1')).toBe('partner');
  });

  it('ai 카드이고 상호 긍정 아니면 undecided', () => {
    expect(cardBadgeStatus(base, 'u1')).toBe('undecided');
  });
});

describe('sortCards', () => {
  const older = { ...base, id: 'a', created_at: '2026-07-01T00:00:00Z' };
  const newer = { ...base, id: 'b', created_at: '2026-07-10T00:00:00Z' };

  it('newest는 최신이 먼저', () => {
    expect(sortCards([older, newer], 'newest').map(c => c.id)).toEqual(['b', 'a']);
  });

  it('oldest는 오래된 게 먼저', () => {
    expect(sortCards([newer, older], 'oldest').map(c => c.id)).toEqual(['a', 'b']);
  });
});
