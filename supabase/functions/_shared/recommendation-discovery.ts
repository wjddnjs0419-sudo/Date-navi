import type { NormalizedPlace } from './place-provider.ts';
import { dedupeNormalizedPlaces } from './place-dedup.ts';

export type DiscoveryResult = {
  places: NormalizedPlace[];
  attemptsRun: number;
  fallbackUsed: boolean;
  fewerResults: boolean;
};

export async function discoverQualifiedPlaces(input: {
  primaryAttempts: Array<() => Promise<NormalizedPlace[]>>;
  fallbackAttempts: Array<() => Promise<NormalizedPlace[]>>;
  qualify: (place: NormalizedPlace) => boolean;
  minQualifiedCandidates: number;
  isSufficient?: (places: readonly NormalizedPlace[]) => boolean;
}): Promise<DiscoveryResult> {
  const discovered: NormalizedPlace[] = [];
  let places: NormalizedPlace[] = [];
  let attemptsRun = 0;
  const isSufficient = () => places.length >= input.minQualifiedCandidates
    && (input.isSufficient?.(places) ?? true);
  const run = async (attempts: Array<() => Promise<NormalizedPlace[]>>) => {
    for (const attempt of attempts) {
      if (isSufficient()) break;
      attemptsRun += 1;
      discovered.push(...await attempt());
      // Every expansion starts from the complete discovery pool. This is
      // intentionally before qualification: a fallback result never bypasses
      // request-scoped duplicate control or the hard eligibility/quality gate
      // represented by `qualify`.
      const deduped = dedupeNormalizedPlaces(discovered).places;
      places = deduped.filter(input.qualify);
    }
  };

  await run(input.primaryAttempts);
  const fallbackUsed = !isSufficient();
  if (fallbackUsed) await run(input.fallbackAttempts);
  return {
    places,
    attemptsRun,
    fallbackUsed,
    fewerResults: !isSufficient(),
  };
}
