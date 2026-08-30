import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveCourseShareRoute } from '../lib/course-share';

const token = 'c'.repeat(64);
const root = resolve(__dirname, '..');

describe('course share Universal Link routing', () => {
  it('maps a valid web link to the Expo Router route and leaves invite links alone', () => {
    expect(resolveCourseShareRoute(`https://date-navi.vercel.app/course/${token}`)).toBe(`/course/${token}`);
    expect(resolveCourseShareRoute(`https://date-navi.vercel.app/course/${token}?utm_source=share`)).toBe(`/course/${token}`);
    expect(resolveCourseShareRoute('https://date-navi.vercel.app/invite?code=DN-ABCD')).toBeNull();
    expect(resolveCourseShareRoute('https://date-navi.vercel.app/course/short-token')).toBeNull();
  });

  it('allows the course path in the same AASA document as the invite path', () => {
    const source = readFileSync(resolve(root, 'web/app/.well-known/apple-app-site-association/route.ts'), 'utf8');

    expect(source).toContain("{ '/': '/invite/*'");
    expect(source).toContain("{ '/': '/course/*'");
    expect(source).toContain('YQGRS8YK72.com.datenavi.app');
  });
});
