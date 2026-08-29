import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createProviderNeutralReplacementCandidateId } from '../shared/recommendation/provider-neutral-candidate-id';

describe('provider-neutral replacement candidate IDs', () => {
  it('namespaces IDs by step and does not reuse an ID across repeated lists for one step', () => {
    const firstStepFirstCandidate = createProviderNeutralReplacementCandidateId('course-step-1');
    const firstStepSecondCandidate = createProviderNeutralReplacementCandidateId('course-step-1');
    const secondStepCandidate = createProviderNeutralReplacementCandidateId('course-step-2');

    expect(firstStepFirstCandidate).toContain('course-step-1');
    expect(firstStepSecondCandidate).toContain('course-step-1');
    expect(secondStepCandidate).toContain('course-step-2');
    expect(new Set([
      firstStepFirstCandidate,
      firstStepSecondCandidate,
      secondStepCandidate,
    ]).size).toBe(3);
    expect(firstStepFirstCandidate.length).toBeLessThanOrEqual(120);
    expect(firstStepSecondCandidate.length).toBeLessThanOrEqual(120);
    expect(secondStepCandidate.length).toBeLessThanOrEqual(120);
  });

  it('uses the factory in the provider-neutral replacement Edge Function', () => {
    const source = readFileSync(resolve(process.cwd(), 'supabase/functions/provider-neutral-replacements/index.ts'), 'utf8');

    expect(source).toContain('createProviderNeutralReplacementCandidateId');
    expect(source).not.toContain('`naver_replacement_${String(index + 1).padStart(3, \'0\')}`');
  });
});
