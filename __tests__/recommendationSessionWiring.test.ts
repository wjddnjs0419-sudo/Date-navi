import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

describe('Phase 8 structured session wiring', () => {
  it('wraps the root navigation stack in the recommendation session provider', () => {
    const source = read('app/_layout.tsx');
    expect(source).toContain('<RecommendationSessionProvider>');
    expect(source).toContain('</RecommendationSessionProvider>');
  });

  it('persists structured course response before ID-only result navigation', () => {
    const source = read('app/mode-flow/generating.tsx');
    expect(source).toContain('persistRecommendationSession');
    expect(source).toContain('buildStructuredCourseResultParams');
    expect(source).not.toMatch(/pathname:\s*isCourse[\s\S]{0,260}cards:\s*JSON\.stringify/);
  });

  it('prepares the structured request in memory and sends no input JSON to generating', () => {
    const source = read('app/mode-flow/course.tsx');
    expect(source).toContain('prepareRecommendationRequest');
    expect(source).toContain('buildStructuredGeneratingParams');
    expect(source).not.toMatch(/pathname:\s*['"]\/mode-flow\/generating['"][\s\S]{0,220}JSON\.stringify/);
  });

  it('uses the prepared request identity and full Phase 7 response without legacy fallback', () => {
    const source = read('app/mode-flow/generating.tsx');
    expect(source).toContain('getPreparedRecommendationRequest');
    expect(source).toContain('requestRecommendationResponse');
    expect(source).toContain('request.requestId');
    expect(source).not.toMatch(/requestRecommendationCards\(/);
  });

  it('cancels the actual structured Edge request without routing or persisting a partial result', () => {
    const source = read('app/mode-flow/generating.tsx');
    expect(source).toContain('requestRecommendationResponse(request, { signal: requestToken.signal })');
    expect(source).toContain('requestToken.signal.aborted');
    expect(source).toContain("?.name === 'AbortError'");
    expect(source).toContain('const snapshot = await persistRecommendationSession(request.requestId)');
  });

  it('offers an edit/back escape when a memory-only structured request is missing', () => {
    const source = read('app/mode-flow/generating.tsx');
    expect(source).toContain("router.replace('/mode-flow/course'");
    expect(source).toContain("modeFlow.generating.courseEdit");
  });

  it('hydrates course-result by IDs and never parses cards/input JSON route params', () => {
    const source = read('app/mode-flow/course-result.tsx');
    expect(source).toContain('parseStructuredCourseResultParams');
    expect(source).toContain('loadRecommendationSession');
    expect(source).not.toContain('JSON.parse(cardsParam');
    expect(source).not.toMatch(/useLocalSearchParams<\{[^}]*\b(input|cards)\b/);
  });
});
