import { pickLatestReaction, formatReactionText, type ReactionRow } from '../lib/partnerReaction';

describe('pickLatestReaction', () => {
  it('빈 배열이면 null', () => {
    expect(pickLatestReaction([])).toBeNull();
  });

  it('가장 최근(created_at) row를 고른다', () => {
    const rows: ReactionRow[] = [
      { card_id: 'a', reaction_type: 'like', condition_tag: null, created_at: '2026-07-01T00:00:00Z' },
      { card_id: 'b', reaction_type: 'love', condition_tag: null, created_at: '2026-07-05T00:00:00Z' },
      { card_id: 'c', reaction_type: 'burden', condition_tag: null, created_at: '2026-07-03T00:00:00Z' },
    ];
    expect(pickLatestReaction(rows)?.card_id).toBe('b');
  });

  it('한 건이면 그대로 반환', () => {
    const row: ReactionRow = { card_id: 'solo', reaction_type: 'like', condition_tag: null, created_at: '2026-07-01T00:00:00Z' };
    expect(pickLatestReaction([row])).toEqual(row);
  });
});

describe('formatReactionText', () => {
  const labels = {
    condition: (tag: string) => ({
      change_place: '장소만 바꾸면', closer: '가까우면', indoor: '실내면', budget_adjust: '예산 조정되면',
    } as Record<string, string>)[tag],
    reaction: (type: string) => ({
      love: '완전 끌려', like: '좋아', burden: '부담돼', next_time: '다음에',
    } as Record<string, string>)[type],
  };

  it('condition_tag가 있으면 조건+반응 문구를 합친다 (기존 목업 문자열과 동일해야 함)', () => {
    const row: ReactionRow = { card_id: 'x', reaction_type: 'like', condition_tag: 'closer', created_at: '2026-07-01T00:00:00Z' };
    expect(formatReactionText(row, labels)).toBe('가까우면 좋아');
  });

  it('condition_tag가 없으면 반응 라벨만 반환', () => {
    const row: ReactionRow = { card_id: 'x', reaction_type: 'love', condition_tag: null, created_at: '2026-07-01T00:00:00Z' };
    expect(formatReactionText(row, labels)).toBe('완전 끌려');
  });

  it('다른 reaction_type도 정확히 매핑된다', () => {
    const row: ReactionRow = { card_id: 'x', reaction_type: 'burden', condition_tag: null, created_at: '2026-07-01T00:00:00Z' };
    expect(formatReactionText(row, labels)).toBe('부담돼');
  });
});
