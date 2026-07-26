// __tests__/placeReview.test.ts
import {
  initialPlaceSatisfactions,
  togglePlaceSatisfaction,
  placeFeedbackRpcArgs,
} from '../lib/placeReview';

const stepIds = ['s1', 's2', 's3'];

describe('initialPlaceSatisfactions (별점 유도, 비대칭 전파)', () => {
  it('별점 4 이상이면 전 장소 긍정 미리 선택', () => {
    expect(initialPlaceSatisfactions(4, stepIds)).toEqual({ s1: 'good', s2: 'good', s3: 'good' });
    expect(initialPlaceSatisfactions(5, stepIds)).toEqual({ s1: 'good', s2: 'good', s3: 'good' });
  });
  it('별점 3 이하면 아무것도 선택하지 않는다 — 낮은 별점을 장소에 전파하지 않는다', () => {
    expect(initialPlaceSatisfactions(3, stepIds)).toEqual({});
    expect(initialPlaceSatisfactions(1, stepIds)).toEqual({});
  });
});

describe('togglePlaceSatisfaction', () => {
  it('같은 값을 다시 탭하면 해제된다', () => {
    expect(togglePlaceSatisfaction('good', 'good')).toBeUndefined();
  });
  it('다른 값을 탭하면 뒤집힌다', () => {
    expect(togglePlaceSatisfaction('good', 'bad')).toBe('bad');
    expect(togglePlaceSatisfaction(undefined, 'bad')).toBe('bad');
  });
});

describe('placeFeedbackRpcArgs', () => {
  it('긍정은 revisit 태그로 저장된다(소비 측 behaviorScoreFor 배선)', () => {
    expect(placeFeedbackRpcArgs({ sessionId: 'sess', stepId: 's1', satisfaction: 'good', priceLevel: 2 }))
      .toEqual({
        p_session_id: 'sess', p_step_id: 's1', p_visited: true,
        p_tags: ['revisit'], p_price_level: 2, p_satisfaction: true,
      });
  });
  it('부정은 revisit 없는 방문 기록이다', () => {
    expect(placeFeedbackRpcArgs({ sessionId: 'sess', stepId: 's1', satisfaction: 'bad', priceLevel: null }))
      .toEqual({
        p_session_id: 'sess', p_step_id: 's1', p_visited: true,
        p_tags: [], p_price_level: null, p_satisfaction: false,
      });
  });
  it('가격만 답한 경우 만족도는 무응답으로 남는다 — 부정으로 집계되지 않는다', () => {
    // revisit 태그 유무만으로는 "별로였다"와 구별되지 않아 만족도 비율이 잘못 깎인다.
    expect(placeFeedbackRpcArgs({ sessionId: 'sess', stepId: 's1', satisfaction: undefined, priceLevel: 3 }))
      .toEqual({
        p_session_id: 'sess', p_step_id: 's1', p_visited: true,
        p_tags: [], p_price_level: 3, p_satisfaction: null,
      });
  });
  it('만족도도 가격도 없으면 보낼 것이 없다 → null', () => {
    expect(placeFeedbackRpcArgs({ sessionId: 'sess', stepId: 's1', satisfaction: undefined, priceLevel: null }))
      .toBeNull();
  });
});
