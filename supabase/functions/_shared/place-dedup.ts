import type { NormalizedPlace, ProviderPlaceIdentity } from './place-provider.ts';

export type SuppressedPlace = {
  suppressed: ProviderPlaceIdentity;
  representative: ProviderPlaceIdentity;
  reason: 'same_provider_identity' | 'cross_provider_match';
};

export type DedupedPlaces = {
  places: NormalizedPlace[];
  suppressed: SuppressedPlace[];
};

const normalizeName = (name: string) => name.normalize('NFKC').toLocaleLowerCase()
  .replace(/\s+/g, '')
  .replace(/점$/, '');

const radians = (value: number) => value * Math.PI / 180;

function distanceMeters(a: NonNullable<NormalizedPlace['coordinates']>, b: NonNullable<NormalizedPlace['coordinates']>): number {
  const latitude = radians(b.latitude - a.latitude);
  const longitude = radians(b.longitude - a.longitude);
  const haversine = Math.sin(latitude / 2) ** 2
    + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(longitude / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(haversine));
}

function isCrossProviderDuplicate(a: NormalizedPlace, b: NormalizedPlace): boolean {
  if (a.identity.provider === b.identity.provider) return false;
  if (!a.coordinates || !b.coordinates || distanceMeters(a.coordinates, b.coordinates) > 100) return false;
  const aRoad = a.address?.road ?? a.address?.display;
  const bRoad = b.address?.road ?? b.address?.display;
  return Boolean(aRoad && bRoad && aRoad.normalize('NFKC') === bRoad.normalize('NFKC')
    && normalizeName(a.name) === normalizeName(b.name));
}

export function dedupeNormalizedPlaces(input: readonly NormalizedPlace[]): DedupedPlaces {
  const places: NormalizedPlace[] = [];
  const suppressed: SuppressedPlace[] = [];
  for (const place of input) {
    const representative = places.find((existing) => (
      existing.identity.provider === place.identity.provider
      && existing.identity.providerPlaceId === place.identity.providerPlaceId
    ) || isCrossProviderDuplicate(existing, place));
    if (!representative) {
      places.push(place);
      continue;
    }
    suppressed.push({
      suppressed: place.identity,
      representative: representative.identity,
      reason: representative.identity.provider === place.identity.provider
        ? 'same_provider_identity'
        : 'cross_provider_match',
    });
  }
  return { places, suppressed };
}
