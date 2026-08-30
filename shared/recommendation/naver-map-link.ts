const NAVER_MAP_HOSTS = new Set([
  'map.naver.com',
  'm.place.naver.com',
  'place.naver.com',
  'pcmap.place.naver.com',
]);

export function isNaverMapUrl(rawUrl: string | null | undefined): boolean {
  if (!rawUrl?.trim()) return false;
  try {
    const url = new URL(rawUrl.trim());
    return (url.protocol === 'https:' || url.protocol === 'http:')
      && NAVER_MAP_HOSTS.has(url.hostname.toLocaleLowerCase());
  } catch {
    return false;
  }
}

export function buildNaverMapSearchUrl(name?: string, address?: string): string | undefined {
  const query = name?.trim() || address?.trim();
  if (!query) return undefined;
  return `https://map.naver.com/p/search/${encodeURIComponent(query)}`;
}

export function resolveNaverMapUrl(input: {
  link?: string | null;
  name?: string;
  address?: string;
}): string | undefined {
  const link = input.link?.trim();
  return isNaverMapUrl(link) ? link : buildNaverMapSearchUrl(input.name, input.address);
}
