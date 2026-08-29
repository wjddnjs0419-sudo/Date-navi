import type { NormalizedPlace } from './place-provider.ts';
import { dedupeNormalizedPlaces } from './place-dedup.ts';

export type DiscoveryResult = {
  places: NormalizedPlace[];
  attemptsRun: number;
  fallbackUsed: boolean;
  fewerResults: boolean;
};

export type DiscoveryPoolSnapshot = {
  phase: 'primary' | 'fallback';
  attemptIndex: number;
  attemptPlaces: readonly NormalizedPlace[];
  discovered: readonly NormalizedPlace[];
  deduped: readonly NormalizedPlace[];
  qualified: readonly NormalizedPlace[];
  sufficient: boolean;
};

export async function discoverQualifiedPlaces(input: {
  primaryAttempts: Array<() => Promise<NormalizedPlace[]>>;
  fallbackAttempts: Array<() => Promise<NormalizedPlace[]>>;
  qualify: (place: NormalizedPlace) => boolean;
  minQualifiedCandidates: number;
  isSufficient?: (places: readonly NormalizedPlace[]) => boolean;
  onPoolUpdated?: (snapshot: DiscoveryPoolSnapshot) => void;
}): Promise<DiscoveryResult> {
  const discovered: NormalizedPlace[] = [];
  let places: NormalizedPlace[] = [];
  let attemptsRun = 0;
  const isSufficient = () => places.length >= input.minQualifiedCandidates
    && (input.isSufficient?.(places) ?? true);
  const run = async (phase: DiscoveryPoolSnapshot['phase'], attempts: Array<() => Promise<NormalizedPlace[]>>) => {
    for (const [attemptIndex, attempt] of attempts.entries()) {
      if (isSufficient()) break;
      attemptsRun += 1;
      const attemptPlaces = await attempt();
      discovered.push(...attemptPlaces);
      // Every expansion starts from the complete discovery pool. This is
      // intentionally before qualification: a fallback result never bypasses
      // request-scoped duplicate control or the hard eligibility/quality gate
      // represented by `qualify`.
      const deduped = dedupeNormalizedPlaces(discovered).places;
      places = deduped.filter(input.qualify);
      input.onPoolUpdated?.({
        phase,
        attemptIndex,
        attemptPlaces,
        discovered,
        deduped,
        qualified: places,
        sufficient: isSufficient(),
      });
    }
  };

  await run('primary', input.primaryAttempts);
  const fallbackUsed = !isSufficient();
  if (fallbackUsed) await run('fallback', input.fallbackAttempts);
  return {
    places,
    attemptsRun,
    fallbackUsed,
    fewerResults: !isSufficient(),
  };
}
