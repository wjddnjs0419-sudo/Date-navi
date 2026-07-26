import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Phase 10 replacement/detail wiring', () => {
  const root = join(__dirname, '..');
  const edge = readFileSync(join(root, 'supabase/functions/replacement-candidates/index.ts'), 'utf8');
  const screen = readFileSync(join(root, 'app/mode-flow/course-result.tsx'), 'utf8');

  it('keeps candidate lookup authenticated and bounded, then makes selection travel through recommend-date attestation', () => {
    expect(edge).toContain("request.method === 'OPTIONS'");
    expect(edge).toContain('authenticate');
    expect(edge).toContain('original_request,latest_request');
    expect(edge).toContain('session?.latest_request ?? session?.original_request');
    expect(edge).toContain('rankReplacementCandidates');
    expect(edge).toContain('const top = ranked.top.map(toReplacementCandidateDisplay)');
    expect(edge).toContain('const additional = ranked.additional.map(toReplacementCandidateDisplay)');
    expect(edge).not.toContain('limit: 15');
    expect(screen).toContain("'replacement-candidates'");
    expect(screen).toContain('replacement: { stepId: targetStepId, kakaoPlaceId, ...(pickedName ? { pickedName } : {}) }');
    expect(screen).toContain("attestationRequestId: request.requestId");
  });

  it('opens Kakao place pages (reviews/map) directly in the branded in-app browser without scraping third-party reviews', () => {
    expect(screen).toContain('openPlaceInBrowser');
    expect(screen).toContain('placeReviews');
    expect(screen).not.toContain('buildNaverMapUrl');
    expect(screen).not.toContain('naverReviews');
    // 상세 진입도 중간 화면 없이 바로 카카오 place로 연결(place-detail 경유 제거).
    expect(screen).not.toContain("pathname: '/mode-flow/place-detail'");
    expect(screen).not.toMatch(/review.*scrap|scrap.*review|persist.*review/i);
  });

  it('searches only the target step category instead of every category in the multi-step course', () => {
    expect(edge).toContain('courseSteps: [{ id: target.step_id, category: target.category, label: target.label }]');
    expect(edge).not.toContain('courseSteps: rows.map((row) => ({ id: row.step_id, category: row.category, label: row.label }))');
  });

  it('filters the target category before ranking and keeps client input unable to choose a history variant', () => {
    expect(edge).toContain('const categoryCompatibleCandidates = search.candidates');
    expect(edge).toContain('.filter((candidate) => candidateMatchesCategory(candidate, target.category));');
    expect(edge).toContain('const requiredTargetIntents = effectiveStepIntents(currentRequest)');
    expect(edge).toContain('requiredTargetIntents.every((intent) => placeMatchesStepIntent(candidate, intent))');
    expect(edge).toContain("bodySchema = z.object({ sessionId:");
    expect(edge).toContain("targetStepId: z.string().trim().min(1).max(80) }).strict()");
    expect(edge).not.toContain('historyVariant:');
  });

  it('inherits the persisted session arm, loads treatment history with this session excluded, and preserves a response on loader failure', () => {
    expect(edge).toContain("select('original_request,latest_request,metadata')");
    expect(edge).toContain('storedReplacementHistoryVariant(session?.metadata)');
    expect(edge).toContain('activeSessionId: parsed.data.sessionId');
    expect(edge).toContain("historyLoad = 'failed'");
    expect(edge).toContain("effectiveVariant = 'control'");
    expect(edge).toContain("event: 'replacement_candidates_served'");
    expect(edge).toContain('topThreeRepeatCount');
    expect(edge).toContain('loaderStatus: historyLoad');
    expect(edge).toContain('toReplacementCandidateDisplay');
    expect(edge).not.toContain('scoreBreakdown: ranked');
  });

});
