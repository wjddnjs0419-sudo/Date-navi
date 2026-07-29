import { RecommendationRequestError } from '../lib/recommend-date';

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

import { courseRateLimitNotice } from '../app/mode-flow/generating';

describe('course rate-limit notices', () => {
  const t = jest.fn((key: string, options?: Record<string, unknown>) => `${key}:${JSON.stringify(options ?? {})}`);

  beforeEach(() => t.mockClear());

  it.each([
    ['AI_REQUEST_ALREADY_RUNNING', {}, 'modeFlow.generating.rateLimit.alreadyRunningTitle'],
    ['AI_RATE_LIMITED', { retryAfterSeconds: 90, limitType: 'burst' as const }, 'modeFlow.generating.rateLimit.burstTitle'],
    ['AI_DAILY_LIMIT_REACHED', { limitType: 'daily' as const, resetsAt: '2026-07-30T15:00:00+09:00' }, 'modeFlow.generating.rateLimit.dailyTitle'],
  ] as const)('%s uses a distinct notice', (code, details, titleKey) => {
    const notice = courseRateLimitNotice(new RecommendationRequestError(code, details), t);
    expect(notice?.title).toContain(titleKey);
  });

  it('formats burst time as rounded minutes and seconds inputs', () => {
    courseRateLimitNotice(new RecommendationRequestError('AI_RATE_LIMITED', { limitType: 'burst', retryAfterSeconds: 91 }), t);
    expect(t).toHaveBeenCalledWith('modeFlow.generating.rateLimit.burstBody', { minutes: 1, seconds: 31 });
  });
});
