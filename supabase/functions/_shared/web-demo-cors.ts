const PRODUCTION_ORIGINS = new Set([
  'https://date-navi.vercel.app',
]);

const KNOWN_VERCEL_PROJECT_PREFIXES = ['date-navi', 'date-navi-web'];

function configuredProjectPrefix(configuredOrigin: string | undefined): string | undefined {
  if (!configuredOrigin) return undefined;
  try {
    const url = new URL(configuredOrigin);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.vercel.app')) return undefined;
    return url.hostname.slice(0, -'.vercel.app'.length).toLowerCase();
  } catch {
    return undefined;
  }
}

export function allowedWebDemoOrigin(
  origin: string | null,
  configuredOrigin?: string,
): string | undefined {
  if (!origin) return undefined;
  if (PRODUCTION_ORIGINS.has(origin) || origin === configuredOrigin) return origin;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.vercel.app')) return undefined;
  const projectPrefixes = [
    ...KNOWN_VERCEL_PROJECT_PREFIXES,
    ...(configuredProjectPrefix(configuredOrigin) ? [configuredProjectPrefix(configuredOrigin)!] : []),
  ];
  return projectPrefixes.some((prefix) => url.hostname.startsWith(`${prefix}-`)) ? origin : undefined;
}
