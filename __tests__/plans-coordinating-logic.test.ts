import { computeCoordinatingIds, planTabOf } from '../app/plans/index';

describe('computeCoordinatingIds', () => {
  it('제안은 있지만 상대 반응이 없으면 조율 중', () => {
    const proposals = [{ card_id: 'card1', user_id: 'u1' }];
    const reactions: { card_id: string; user_id: string }[] = [];
    expect(computeCoordinatingIds(proposals, reactions)).toEqual(new Set(['card1']));
  });

  it('제안자 본인의 반응만 있으면 여전히 조율 중', () => {
    const proposals = [{ card_id: 'card1', user_id: 'u1' }];
    const reactions = [{ card_id: 'card1', user_id: 'u1' }];
    expect(computeCoordinatingIds(proposals, reactions)).toEqual(new Set(['card1']));
  });

  it('상대(제안자 아닌 사람)가 반응하면 조율 중에서 빠진다', () => {
    const proposals = [{ card_id: 'card1', user_id: 'u1' }];
    const reactions = [{ card_id: 'card1', user_id: 'u2' }];
    expect(computeCoordinatingIds(proposals, reactions)).toEqual(new Set());
  });
});

describe('planTabOf', () => {
  const coordinating = new Set(['c1']);

  it('status=done이면 done', () => {
    expect(planTabOf({ id: 'c9', status: 'done' }, coordinating)).toBe('done');
  });

  it('status=confirmed면 upcoming', () => {
    expect(planTabOf({ id: 'c9', status: 'confirmed' }, coordinating)).toBe('upcoming');
  });

  it('status=active이고 조율중 목록에 있으면 coordinating', () => {
    expect(planTabOf({ id: 'c1', status: 'active' }, coordinating)).toBe('coordinating');
  });

  it('status=active인데 조율중 목록에 없으면 null(계획 화면에 안 보임)', () => {
    expect(planTabOf({ id: 'c2', status: 'active' }, coordinating)).toBeNull();
  });
});
