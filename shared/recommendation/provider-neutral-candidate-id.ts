const REPLACEMENT_CANDIDATE_PREFIX = 'provider_neutral_replacement';
const MAX_CANDIDATE_ID_LENGTH = 120;

function normalizeStepToken(stepId: string): string {
  const token = stepId.trim().replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 32);
  return token || 'step';
}

export function createProviderNeutralReplacementCandidateId(stepId: string): string {
  const id = `${REPLACEMENT_CANDIDATE_PREFIX}_${normalizeStepToken(stepId)}_${globalThis.crypto.randomUUID()}`;
  return id.slice(0, MAX_CANDIDATE_ID_LENGTH);
}
