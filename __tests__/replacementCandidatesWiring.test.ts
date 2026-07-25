import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Phase 10 replacement/detail wiring', () => {
  const root = join(__dirname, '..');
  const edge = readFileSync(join(root, 'supabase/functions/replacement-candidates/index.ts'), 'utf8');
  const screen = readFileSync(join(root, 'app/mode-flow/course-result.tsx'), 'utf8');
  const detail = readFileSync(join(root, 'app/mode-flow/place-detail.tsx'), 'utf8');

  it('keeps candidate lookup authenticated and bounded, then makes selection travel through recommend-date attestation', () => {
    expect(edge).toContain("request.method === 'OPTIONS'");
    expect(edge).toContain('authenticate');
    expect(edge).toContain('original_request,latest_request');
    expect(edge).toContain('session?.latest_request ?? session?.original_request');
    expect(edge).toContain('rankReplacementCandidates');
    expect(edge).toContain('limit: 15');
    expect(screen).toContain("'replacement-candidates'");
    expect(screen).toContain('replacement: { stepId: targetStepId, kakaoPlaceId, ...(pickedName ? { pickedName } : {}) }');
    expect(screen).toContain("attestationRequestId: request.requestId");
  });

  it('offers a single Kakao place verification action via the branded in-app browser without scraping third-party reviews', () => {
    expect(screen).toContain('openPlaceInBrowser');
    expect(screen).toContain('placeReviews');
    expect(screen).not.toContain('buildNaverMapUrl');
    expect(screen).not.toContain('naverReviews');
    expect(screen).not.toMatch(/review.*scrap|scrap.*review|persist.*review/i);
    expect(detail).toContain('openPlaceInBrowser');
    expect(detail).toContain('detailNotice');
    expect(detail).not.toContain('buildNaverMapUrl');
  });

  it('searches only the target step category instead of every category in the multi-step course', () => {
    expect(edge).toContain('courseSteps: [{ id: target.step_id, category: target.category, label: target.label }]');
    expect(edge).not.toContain('courseSteps: rows.map((row) => ({ id: row.step_id, category: row.category, label: row.label }))');
  });

});
