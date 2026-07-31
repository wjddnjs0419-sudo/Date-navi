import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Phase 10 replacement/detail wiring', () => {
  const root = join(__dirname, '..');
  const edge = readFileSync(join(root, 'supabase/functions/replacement-candidates/index.ts'), 'utf8');
  const handler = readFileSync(join(root, 'supabase/functions/_shared/replacement-candidates-handler.ts'), 'utf8');
  const screen = readFileSync(join(root, 'app/mode-flow/course-result.tsx'), 'utf8');

  it('keeps candidate lookup authenticated and bounded, then makes selection travel through recommend-date attestation', () => {
    expect(edge).toContain('handleReplacementCandidates');
    expect(edge).toContain('authenticate');
    expect(edge).toContain('original_request,latest_request');
    expect(handler).toContain('const baseRequest = latestRequest.success ? latestRequest : originalRequest');
    expect(handler).toContain('rankReplacementCandidates');
    expect(handler).toContain('const top = ranked.top.map(toReplacementCandidateDisplay)');
    expect(handler).toContain('const additional = ranked.additional.map(toReplacementCandidateDisplay)');
    expect(handler).not.toContain('limit: 15');
    expect(screen).toContain("'replacement-candidates'");
    expect(screen).toContain('candidateListAttestationId: replacementCandidateListAttestationId');
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
    expect(handler).toContain('courseSteps: [{');
    expect(handler).toContain('id: target.step_id');
    expect(handler).toContain('const targetIntentTags = targetInputStep?.intentTags ?? originalTargetStep?.intentTags');
    expect(handler).toContain('intentTags: targetIntentTags');
    expect(handler).not.toContain('courseSteps: rows.map((row) => ({ id: row.step_id, category: row.category, label: row.label }))');
  });

  it('filters the target category before ranking and keeps client input unable to choose a history variant', () => {
    expect(handler).toContain('.filter((candidate) => candidateMatchesCategory(candidate, target.category))');
    expect(handler).toContain('const requiredTargetIntents = effectiveStepIntents(currentRequest)');
    expect(handler).toContain('requiredTargetIntents.every((intent) => placeMatchesStepIntent(candidate, intent))');
    expect(handler).toContain('targetStepId: z.string().trim().min(1).max(80)');
    expect(handler).not.toContain('historyVariant:');
  });

  it('inherits the persisted session arm, loads treatment history with this session excluded, and preserves a response on loader failure', () => {
    expect(edge).toContain("select('original_request,latest_request,metadata')");
    expect(handler).toContain('storedReplacementHistoryVariant(session?.metadata)');
    expect(handler).toContain('activeSessionId: parsed.data.sessionId');
    expect(handler).toContain("loaderStatus = 'failed'");
    expect(handler).toContain("effectiveVariant: 'control'");
    expect(edge).toContain("event: 'replacement_candidates_served'");
    expect(handler).toContain('topThreeRepeatCount');
    expect(handler).toContain('loaderStatus');
    expect(handler).toContain('toReplacementCandidateDisplay');
    expect(handler).not.toContain('scoreBreakdown: ranked');
  });

  it('reads the shared operational experiment mode before allowing a stored Treatment arm to load history', () => {
    expect(edge).toContain("Deno.env.get('RECOMMENDATION_HISTORY_EXPERIMENT')");
    expect(edge).toContain('experimentMode: historyExperimentMode');
  });

});
