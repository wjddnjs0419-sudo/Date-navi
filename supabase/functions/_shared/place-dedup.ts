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

const normalizePlaceText = (value: string) => value.normalize('NFKC').toLocaleLowerCase()
  .replace(/[()[\]{}.,·]/g, '')
  .replace(/\s+/g, '')
  .trim();

const normalizeName = (name: string) => normalizePlaceText(name)
  .replace(/(?:직영|본|지)?점$/u, '');

function canonicalAdministrativeToken(token: string): string {
  const aliases: Record<string, string> = {
    서울특별시: '서울', 서울시: '서울',
    부산광역시: '부산', 부산시: '부산',
    대구광역시: '대구', 대구시: '대구',
    인천광역시: '인천', 인천시: '인천',
    광주광역시: '광주', 광주시: '광주',
    대전광역시: '대전', 대전시: '대전',
    울산광역시: '울산', 울산시: '울산',
    세종특별자치시: '세종', 세종시: '세종',
  };
  return aliases[token] ?? token;
}

function addressKeys(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  const tokens = value.normalize('NFKC').toLocaleLowerCase()
    .replace(/[()[\]{}.,·]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(canonicalAdministrativeToken);
  const keys = [`full:${tokens.join('')}`];
  const numberedAddressKey = (kind: 'road' | 'parcel', locationPattern: RegExp) => {
    const locationIndex = tokens.findIndex((token) => locationPattern.test(token));
    if (locationIndex < 0) return;
    const numberIndex = tokens.findIndex((token, index) => index > locationIndex && /^[0-9]+(?:-[0-9]+)?$/u.test(token));
    if (numberIndex < 0) return;
    keys.push(`${kind}:${tokens.slice(0, numberIndex + 1).join('|')}`);
  };
  numberedAddressKey('road', /(?:대로|로|길)/u);
  numberedAddressKey('parcel', /(?:동|읍|면|리|가)$/u);
  return [...new Set(keys)];
}

function addressMatchKeys(place: NormalizedPlace): string[] {
  return [...new Set([
    ...addressKeys(place.address?.road),
    ...addressKeys(place.address?.display),
  ])];
}

const radians = (value: number) => value * Math.PI / 180;

function distanceMeters(a: NonNullable<NormalizedPlace['coordinates']>, b: NonNullable<NormalizedPlace['coordinates']>): number {
  const latitude = radians(b.latitude - a.latitude);
  const longitude = radians(b.longitude - a.longitude);
  const haversine = Math.sin(latitude / 2) ** 2
    + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(longitude / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(haversine));
}

export function isSamePhysicalPlace(a: NormalizedPlace, b: NormalizedPlace): boolean {
  if (a.identity.provider === b.identity.provider
    && a.identity.providerPlaceId === b.identity.providerPlaceId) return true;
  if (!a.coordinates || !b.coordinates || distanceMeters(a.coordinates, b.coordinates) > 100) return false;
  const bAddresses = new Set(addressMatchKeys(b));
  return addressMatchKeys(a).some((address) => bAddresses.has(address))
    && normalizeName(a.name) === normalizeName(b.name);
}

export function dedupeNormalizedPlaces(input: readonly NormalizedPlace[]): DedupedPlaces {
  const places: NormalizedPlace[] = [];
  const suppressed: SuppressedPlace[] = [];
  for (const place of input) {
    const representative = places.find((existing) => (
      isSamePhysicalPlace(existing, place)
    ));
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
