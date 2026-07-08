import { FALLBACK_CARDS_BY_LANGUAGE } from '../lib/ai';

describe('FALLBACK_CARDS_BY_LANGUAGE', () => {
  it('estimated_budget은 항상 빈 문자열이다 (예산은 AI 추천 근거에서 제외)', () => {
    for (const cards of Object.values(FALLBACK_CARDS_BY_LANGUAGE)) {
      for (const card of cards) {
        expect(card.estimated_budget).toBe('');
      }
    }
  });
});
