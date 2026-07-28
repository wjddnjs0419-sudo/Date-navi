export type FoodIntentEntry = {
  canonicalTerm: string;
  aliases: string[];
  searchExpansions: string[];
  cuisineCategory?: string;
};

export type FoodIntentOverrides = {
  include: FoodIntentEntry[];
  excludeCanonicalTerms: string[];
  aliasesByCanonicalTerm: Record<string, string[]>;
  searchExpansionsByCanonicalTerm: Record<string, string[]>;
  cuisineCategoryByCanonicalTerm: Record<string, string>;
};

export type FoodSourceRow = { sourceName: string };
export type ExcludedFoodRow = { sourceName: string; normalizedName: string; reason: string };
export type FoodIntentArtifacts = { entries: FoodIntentEntry[]; excluded: ExcludedFoodRow[] };

const NON_RESTAURANT_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/(?:원재료|농산물|수산물|축산물|분말|추출물|농축액|시럽|소스|조미료|첨가물)/, 'ingredient'],
  [/(?:mg|g|ml|kcal|%|1회\s*제공량|영양성분)/i, 'nutrition_or_volume'],
  [/(?:주식회사|㈜|유한회사|브랜드|상품|제조|제품)/, 'brand_or_product'],
];

const unique = (values: readonly string[]): string[] => [...new Set(values.filter(Boolean))];

export function normalizeFoodName(sourceName: string): string {
  return sourceName.normalize('NFKC')
    .replace(/[[(][^\])]*[\])]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function collectFoodRows(payload: unknown): FoodSourceRow[] {
  const root = (payload ?? {}) as { header?: { resultCode?: unknown; resultMsg?: unknown }; body?: { items?: unknown } };
  const code = root.header?.resultCode;
  if (typeof code === 'string' && code !== '00') {
    throw new Error(`Food API returned ${code}: ${String(root.header?.resultMsg ?? '')}`);
  }
  const items = root.body?.items;
  if (!Array.isArray(items)) throw new Error('Food API response missing body.items');
  return items.map((item) => {
    const name = (item as { FOOD_NM_KR?: unknown }).FOOD_NM_KR;
    if (typeof name !== 'string' || !name.trim()) throw new Error('Food API row missing FOOD_NM_KR');
    return { sourceName: name };
  });
}

export function buildFoodIntentArtifacts(rows: readonly FoodSourceRow[], overrides: FoodIntentOverrides): FoodIntentArtifacts {
  const excluded: ExcludedFoodRow[] = [];
  const accepted: Array<{ sourceName: string; normalizedName: string }> = [];
  const excludedCanonicals = new Set(overrides.excludeCanonicalTerms.map(normalizeFoodName));
  for (const row of rows) {
    const normalizedName = normalizeFoodName(row.sourceName);
    const pattern = NON_RESTAURANT_PATTERNS.find(([regex]) => regex.test(normalizedName));
    const reason = pattern?.[1]
      ?? (!/^[가-힣 ]{2,30}$/.test(normalizedName) ? 'not_a_korean_menu_name' : undefined)
      ?? (excludedCanonicals.has(normalizedName) ? 'manual_exclude' : undefined);
    if (reason) excluded.push({ sourceName: row.sourceName, normalizedName, reason });
    else accepted.push({ sourceName: row.sourceName, normalizedName });
  }

  const canonicalFor = new Map<string, string>();
  for (const entry of overrides.include) {
    const canonical = normalizeFoodName(entry.canonicalTerm);
    for (const name of [canonical, ...entry.aliases.map(normalizeFoodName)]) canonicalFor.set(name, canonical);
  }
  for (const [canonical, aliases] of Object.entries(overrides.aliasesByCanonicalTerm)) {
    const normalizedCanonical = normalizeFoodName(canonical);
    canonicalFor.set(normalizedCanonical, normalizedCanonical);
    for (const alias of aliases) canonicalFor.set(normalizeFoodName(alias), normalizedCanonical);
  }

  const groups = new Map<string, string[]>();
  for (const row of accepted) {
    const canonical = canonicalFor.get(row.normalizedName) ?? row.normalizedName;
    groups.set(canonical, [...(groups.get(canonical) ?? []), row.normalizedName]);
  }
  for (const entry of overrides.include) {
    const canonical = normalizeFoodName(entry.canonicalTerm);
    groups.set(canonical, [...(groups.get(canonical) ?? []), canonical, ...entry.aliases.map(normalizeFoodName)]);
  }

  const entries = [...groups.entries()].map(([groupCanonical, members]) => {
    const included = overrides.include.find((entry) => normalizeFoodName(entry.canonicalTerm) === groupCanonical);
    const canonicalTerm = included ? normalizeFoodName(included.canonicalTerm) : [...new Set(members)].sort((a, b) => a.length - b.length || a.localeCompare(b, 'ko-KR'))[0];
    const aliases = unique([
      ...members,
      ...(included?.aliases ?? []).map(normalizeFoodName),
      ...(overrides.aliasesByCanonicalTerm[canonicalTerm] ?? []).map(normalizeFoodName),
    ]).filter((term) => term !== canonicalTerm);
    const searchExpansions = unique([
      ...(included?.searchExpansions ?? []),
      ...(overrides.searchExpansionsByCanonicalTerm[canonicalTerm] ?? []),
    ]).filter((term) => term !== canonicalTerm).slice(0, 2);
    const cuisineCategory = included?.cuisineCategory ?? overrides.cuisineCategoryByCanonicalTerm[canonicalTerm];
    return { canonicalTerm, aliases, searchExpansions, ...(cuisineCategory ? { cuisineCategory } : {}) };
  }).sort((a, b) => a.canonicalTerm.localeCompare(b.canonicalTerm, 'ko-KR'));

  return { entries, excluded };
}

export function renderFoodIntentModule(entries: readonly FoodIntentEntry[]): string {
  return `// Generated by npm run sync:food-intents. Do not edit manually.\n\nexport const GENERATED_FOOD_INTENTS = ${JSON.stringify(entries, null, 2)} as const;\n`;
}
