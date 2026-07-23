import { pickLatestReaction, formatReactionText, filterActiveCards, type ReactionRow, type CardStatusRow } from '../lib/partnerReaction';

describe('pickLatestReaction', () => {
  it('빈 배열이면 null', () => {
    expect(pickLatestReaction([])).toBeNull();
  });

  it('가장 최근(created_at) row를 고른다', () => {
    const rows: ReactionRow[] = [
      { card_id: 'a', reaction_type: 'like', created_at: '2026-07-01T00:00:00Z' },
      { card_id: 'b', reaction_type: 'love', created_at: '2026-07-05T00:00:00Z' },
      { card_id: 'c', reaction_type: 'burden', created_at: '2026-07-03T00:00:00Z' },
    ];
    expect(pickLatestReaction(rows)?.card_id).toBe('b');
  });

  it('한 건이면 그대로 반환', () => {
    const row: ReactionRow = { card_id: 'solo', reaction_type: 'like', created_at: '2026-07-01T00:00:00Z' };
    expect(pickLatestReaction([row])).toEqual(row);
  });
});

describe('formatReactionText', () => {
  const labels = {
    reaction: (type: string) => ({
      love: '완전 끌려', like: '좋아', burden: '부담돼', next_time: '다음에',
    } as Record<string, string>)[type],
  };

  it('반응 라벨만 반환한다 — 조건 접두사는 더 이상 없다', () => {
    const row: ReactionRow = { card_id: 'x', reaction_type: 'love', created_at: '2026-07-01T00:00:00Z' };
    expect(formatReactionText(row, labels)).toBe('완전 끌려');
  });

  it('다른 reaction_type도 정확히 매핑된다', () => {
    const row: ReactionRow = { card_id: 'x', reaction_type: 'burden', created_at: '2026-07-01T00:00:00Z' };
    expect(formatReactionText(row, labels)).toBe('부담돼');
  });
});

describe('filterActiveCards', () => {
  it('빈 배열이면 빈 배열', () => {
    expect(filterActiveCards([])).toEqual([]);
  });

  it('status가 active인 카드만 남긴다', () => {
    const cards: CardStatusRow[] = [
      { id: 'a', title: '카페 데이트', status: 'active' },
      { id: 'b', title: '확정된 데이트', status: 'confirmed' },
      { id: 'c', title: '추억 완료된 데이트', status: 'done' },
      { id: 'd', title: '다른 활성 후보', status: 'active' },
    ];
    expect(filterActiveCards(cards).map(c => c.id)).toEqual(['a', 'd']);
  });

  it('active 카드가 없으면 빈 배열', () => {
    const cards: CardStatusRow[] = [
      { id: 'a', title: '확정됨', status: 'confirmed' },
      { id: 'b', title: '완료됨', status: 'done' },
    ];
    expect(filterActiveCards(cards)).toEqual([]);
  });
});
