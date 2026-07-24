import { readFileSync } from 'node:fs';
import { join } from 'node:path';

it('코스 확정 가기 배너가 /share/mutual로 이동한다', () => {
  const src = readFileSync(join(process.cwd(), 'app/(tabs)/candidates.tsx'), 'utf8');
  expect(src).toContain("router.push('/share/mutual'");
  const bannerIdx = src.indexOf('confirmBannerCta');
  expect(bannerIdx).toBeGreaterThan(-1);
  const around = src.slice(bannerIdx - 500, bannerIdx + 500);
  expect(around).not.toContain("handleFilterChange('mutual')");
});
