import { resolveScreenName } from '../lib/analytics-screen';
import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const INTENTIONALLY_UNTRACKED_ROUTES = new Set([
  'index',
  'mode-flow/feeling',
  'mode-flow/result',
  'mode-flow/bucketlist',
  'shot',
]);

function collectProductionRoutes(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectProductionRoutes(path);
    if (!entry.isFile() || !entry.name.endsWith('.tsx') || entry.name === '_layout.tsx') return [];
    return [relative(join(__dirname, '..', 'app'), path).replace(/\.tsx$/, '').split(sep).join('/')];
  });
}

describe('resolveScreenName', () => {
  it.each([
    [['(auth)', 'index'], 'auth_login'],
    [['(tabs)', 'index'], 'home'],
    [['(tabs)', 'account'], 'settings'],
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

  it('classifies every production route as tracked or intentionally excluded', () => {
    const productionRoutes = collectProductionRoutes(join(__dirname, '..', 'app'));

    for (const route of productionRoutes) {
      const screenName = resolveScreenName(route.split('/'));
      expect(screenName !== null || INTENTIONALLY_UNTRACKED_ROUTES.has(route)).toBe(true);
    }

    for (const route of INTENTIONALLY_UNTRACKED_ROUTES) {
      expect(resolveScreenName(route.split('/'))).toBeNull();
    }
  });
});
