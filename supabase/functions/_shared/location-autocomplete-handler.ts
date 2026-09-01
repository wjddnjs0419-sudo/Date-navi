export type LocationDocument = {
  id?: string;
  placeName: string;
  categoryName: string;
  categoryGroupCode: string;
  addressName: string;
  roadAddressName: string;
  x: string;
  y: string;
};

export type LocationSearchFetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export class LocationAutocompleteProviderError extends Error {
  constructor() {
    super('Location search failed');
    this.name = 'LocationAutocompleteProviderError';
  }
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function keywordDocument(value: unknown): LocationDocument | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const document = value as Record<string, unknown>;
  if (typeof document.placeName === 'string') {
    const placeName = stringValue(document.placeName);
    const x = stringValue(document.x);
    const y = stringValue(document.y);
    if (!placeName || !x || !y) return null;
    return {
      id: stringValue(document.id) || undefined,
      placeName,
      categoryName: stringValue(document.categoryName),
      categoryGroupCode: stringValue(document.categoryGroupCode),
      addressName: stringValue(document.addressName),
      roadAddressName: stringValue(document.roadAddressName),
      x,
      y,
    };
  }
  const placeName = stringValue(document.place_name);
  const id = stringValue(document.id);
  const x = stringValue(document.x);
  const y = stringValue(document.y);
  if (!id || !placeName || !x || !y) return null;
  return {
    id,
    placeName,
    categoryName: stringValue(document.category_name),
    categoryGroupCode: stringValue(document.category_group_code),
    addressName: stringValue(document.address_name),
    roadAddressName: stringValue(document.road_address_name),
    x,
    y,
  };
}

function addressDocument(value: unknown): LocationDocument | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const document = value as Record<string, unknown>;
  const address = document.address;
  if (!address || typeof address !== 'object' || Array.isArray(address)) return null;
  const addressRecord = address as Record<string, unknown>;
  const placeName = stringValue(addressRecord.region_3depth_name)
    || stringValue((document.road_address as Record<string, unknown> | null | undefined)?.region_3depth_name)
    || stringValue(document.address_name);
  const x = stringValue(document.x);
  const y = stringValue(document.y);
  if (!placeName || !x || !y) return null;
  return {
    placeName,
    categoryName: '지역 > 주소',
    categoryGroupCode: '',
    addressName: stringValue(addressRecord.address_name),
    roadAddressName: '',
    x,
    y,
  };
}

async function jsonObject(response: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await response.json();
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export async function handleLocationAutocomplete(
  query: string,
  fetcher: LocationSearchFetcher = fetch,
  kakaoRestApiKey = '',
): Promise<LocationDocument[]> {
  const normalized = query.trim().slice(0, 80);
  if (Array.from(normalized).length < 2) return [];

  const headers = kakaoRestApiKey ? { Authorization: `KakaoAK ${kakaoRestApiKey}` } : undefined;
  const keywordUrl = new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
  keywordUrl.searchParams.set('query', normalized);
  keywordUrl.searchParams.set('size', '15');
  keywordUrl.searchParams.set('sort', 'accuracy');
  const addressUrl = new URL('https://dapi.kakao.com/v2/local/search/address.json');
  addressUrl.searchParams.set('query', normalized);
  addressUrl.searchParams.set('size', '10');

  const [keywordResponse, addressResponse] = await Promise.all([
    fetcher(keywordUrl, headers ? { headers } : undefined),
    fetcher(addressUrl, headers ? { headers } : undefined),
  ]);
  if (!keywordResponse.ok && !addressResponse.ok) throw new LocationAutocompleteProviderError();

  const [keywordJson, addressJson] = await Promise.all([
    jsonObject(keywordResponse),
    jsonObject(addressResponse),
  ]);
  const keywordDocuments = keywordResponse.ok && Array.isArray(keywordJson.documents)
    ? keywordJson.documents.map(keywordDocument).filter((item): item is LocationDocument => !!item)
    : [];
  const addressDocuments = addressResponse.ok && Array.isArray(addressJson.documents)
    ? addressJson.documents.map(addressDocument).filter((item): item is LocationDocument => !!item)
    : [];
  return [...keywordDocuments, ...addressDocuments];
}
