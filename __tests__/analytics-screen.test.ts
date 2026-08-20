import { resolveScreenName } from '../lib/analytics-screen';

describe('resolveScreenName', () => {
  it.each([
    [['(auth)', 'index'], 'auth_login'],
    [['(tabs)', 'index'], 'home'],
    [['(tabs)', 'mode'], 'date_mode_picker'],
    [['mode-flow', 'course'], 'course_builder'],
    [['mode-flow', 'course-result'], 'course_recommendation_result'],
    [['card', '[id]'], 'date_card_detail'],
    [['card', 'memory', '[id]'], 'memory_detail'],
    [['share', 'send'], 'proposal_send'],
    [['account', 'notifications'], 'notifications'],
  ] as const)('maps %p to %s', (segments, screenName) => {
    expect(resolveScreenName(segments)).toBe(screenName);
  });

  it.each([
    { segments: [] },
    { segments: ['index'] },
    { segments: ['mode-flow', 'feeling'] },
    { segments: ['mode-flow', 'result'] },
    { segments: ['mode-flow', 'bucketlist'] },
    { segments: ['shot'] },
    { segments: ['unknown'] },
  ])('excludes $segments from screen tracking', ({ segments }) => {
    expect(resolveScreenName(segments)).toBeNull();
  });
});
