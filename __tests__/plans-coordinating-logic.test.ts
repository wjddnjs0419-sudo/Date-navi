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

  it('같은 카드에 여러 제안이 있으면 마지막 제안자를 기준으로 판정한다', () => {
    // u1이 먼저 제안, u2가 나중에 다시 제안 → 마지막 제안자는 u2.
    // u1(원래 제안자)이 반응해도 그건 "제안자 아닌 사람"이 아니므로 여전히 조율 중이어야 한다.
    const proposals = [
      { card_id: 'card1', user_id: 'u1' },
      { card_id: 'card1', user_id: 'u2' },
    ];
    const reactions = [{ card_id: 'card1', user_id: 'u1' }];
    expect(computeCoordinatingIds(proposals, reactions)).toEqual(new Set(['card1']));
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
