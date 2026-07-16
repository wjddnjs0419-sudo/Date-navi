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
    expect(screen).toContain('replacement: { stepId: targetStepId, kakaoPlaceId }');
    expect(screen).toContain("attestationRequestId: request.requestId");
  });

  it('offers external Naver/Kakao verification actions without scraping or persisting third-party review content', () => {
    expect(screen).toContain('buildNaverSearchUrl');
    expect(screen).toContain('buildKakaoMapUrl');
    expect(screen).toContain('WebBrowser.openBrowserAsync');
    expect(screen).toContain('naverReviews');
    expect(screen).toContain('kakaoMap');
    expect(screen).not.toMatch(/review.*scrap|scrap.*review|persist.*review/i);
    expect(detail).toContain('WebBrowser.openBrowserAsync');
    expect(detail).toContain('detailNotice');
  });

  it('searches only the target step category instead of every category in the multi-step course', () => {
    expect(edge).toContain('courseSteps: [{ id: target.step_id, category: target.category, label: target.label }]');
    expect(edge).not.toContain('courseSteps: rows.map((row) => ({ id: row.step_id, category: row.category, label: row.label }))');
  });

  it('curates the deterministic candidate pool with Haiku and falls back to deterministic order on failure', () => {
    expect(edge).toContain('invokeGenerateAiSelection');
    expect(edge).toContain('buildReplacementSelectionPrompt');
    expect(edge).toContain('REPLACEMENT_SELECT_PROMPT_VERSION');
    expect(edge).toContain("action: 'replacement_select'");
    expect(edge).toContain('selectCuratedReplacementCandidates');
    expect(edge).toContain('ranked.pool');
    expect(edge).toMatch(/let top = ranked\.top;\s*\n\s*let additional = ranked\.additional;/);
    expect(edge).toMatch(/}\s*catch\s*{\s*\n\s*\/\/ AI curation failed/);
  });
});
