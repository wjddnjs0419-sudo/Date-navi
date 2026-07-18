import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('kakao search cache edge wiring', () => {
  const root = join(__dirname, '..');
  const recommendDate = readFileSync(join(root, 'supabase/functions/recommend-date/index.ts'), 'utf8');
  const replacement = readFileSync(join(root, 'supabase/functions/replacement-candidates/index.ts'), 'utf8');

  it('routes recommend-date search through the service-role cache store and logs lookup metrics', () => {
    expect(recommendDate).toContain('createSupabaseKakaoSearchCacheStore');
    expect(recommendDate).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(recommendDate).toContain('cacheStore');
    expect(recommendDate).toContain('kakao_cache_lookup');
    expect(recommendDate).toContain('searchTotalMs');
  });

  it('routes replacement-candidates search through the same cache store and logs serving metrics', () => {
    expect(replacement).toContain('createSupabaseKakaoSearchCacheStore');
    expect(replacement).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(replacement).toContain('cacheStore');
    expect(replacement).toContain('replacement_candidates_served');
    expect(replacement).toContain('poolSize');
  });

  it('keeps the replacement sheet fully deterministic — no AI curation call', () => {
    expect(replacement).not.toContain('invokeGenerateAiSelection');
    expect(replacement).not.toContain('buildReplacementSelectionPrompt');
    expect(replacement).not.toContain('selectCuratedReplacementCandidates');
    expect(replacement).toContain('rankReplacementCandidates');
  });
});
