import { readFile, writeFile as nodeWriteFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  buildFoodIntentArtifacts,
  collectFoodRows,
  renderFoodIntentModule,
  type FoodIntentOverrides,
} from './food-intent-sync-lib';

const ENDPOINT = 'https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02';

type FetchResponse = { ok: boolean; status: number; json(): Promise<unknown> };
type SyncPaths = { raw: string; generated: string; excluded: string; module: string };

export async function syncFoodIntents({
  fetchImpl,
  serviceKey,
  now = () => new Date(),
  pageSize = 1000,
  overrides,
  paths,
  writeFile = nodeWriteFile,
}: {
  fetchImpl: (url: string) => Promise<FetchResponse>;
  serviceKey: string;
  now?: () => Date;
  pageSize?: number;
  overrides: FoodIntentOverrides;
  paths: SyncPaths;
  writeFile?: (path: string, content: string) => Promise<unknown>;
}) {
  if (!serviceKey) throw new Error('FOOD_NTR_CPNT_DB_SERVICE_KEY is required');
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error('pageSize must be a positive integer');
  const pages: unknown[] = [];
  const rows = [] as ReturnType<typeof collectFoodRows>;
  let totalCount: number | undefined;
  let pageNo = 1;
  while (totalCount === undefined || rows.length < totalCount) {
    const url = new URL(ENDPOINT);
    url.searchParams.set('serviceKey', serviceKey);
    url.searchParams.set('type', 'json');
    url.searchParams.set('pageNo', String(pageNo));
    url.searchParams.set('numOfRows', String(pageSize));
    const response = await fetchImpl(url.toString());
    if (!response.ok) throw new Error(`Food API request failed: ${response.status}`);
    let payload: unknown;
    try { payload = await response.json(); } catch { throw new Error('Food API returned malformed JSON'); }
    const body = (payload as { body?: { totalCount?: unknown } }).body;
    if (totalCount === undefined) {
      if (typeof body?.totalCount !== 'number' || !Number.isFinite(body.totalCount) || body.totalCount < 0) {
        throw new Error('Food API response missing numeric body.totalCount');
      }
      totalCount = body.totalCount;
    }
    const pageRows = collectFoodRows(payload);
    if (pageRows.length === 0 && rows.length < totalCount) throw new Error(`Food API page ${pageNo} was unexpectedly empty`);
    pages.push(payload);
    rows.push(...pageRows);
    if (rows.length > totalCount) throw new Error('Food API returned more rows than totalCount');
    pageNo += 1;
  }
  if (rows.length !== totalCount) throw new Error(`Food API returned ${rows.length} rows, expected ${totalCount}`);
  const { entries, excluded } = buildFoodIntentArtifacts(rows, overrides);
  const generated = {
    schemaVersion: 1,
    generatedAt: now().toISOString(),
    source: {
      dataset: '식품의약품안전처_식품영양성분DB정보',
      endpoint: 'FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02',
      totalSourceRows: totalCount,
      acceptedCount: entries.length,
      excludedCount: excluded.length,
    },
    entries,
  };
  await Promise.all([
    writeFile(paths.raw, JSON.stringify({ pages }, null, 2) + '\n'),
    writeFile(paths.generated, JSON.stringify(generated, null, 2) + '\n'),
    writeFile(paths.excluded, JSON.stringify(excluded, null, 2) + '\n'),
    writeFile(paths.module, renderFoodIntentModule(entries)),
  ]);
  return generated;
}

async function main() {
  const serviceKey = process.env.FOOD_NTR_CPNT_DB_SERVICE_KEY ?? '';
  const pageArg = process.argv.find((arg) => arg.startsWith('--page-size='));
  const pageSize = pageArg ? Number(pageArg.slice('--page-size='.length)) : 1000;
  const root = process.cwd();
  const overrides = JSON.parse(await readFile(resolve(root, 'data/food-intents-overrides.json'), 'utf8')) as FoodIntentOverrides;
  const generated = await syncFoodIntents({
    fetchImpl: (url) => fetch(url), serviceKey, pageSize, overrides,
    paths: {
      raw: resolve(root, 'data/food-source-raw.json'),
      generated: resolve(root, 'data/food-intents.generated.json'),
      excluded: resolve(root, 'data/food-intents-excluded.json'),
      module: resolve(root, 'supabase/functions/_shared/food-intents.generated.ts'),
    },
  });
  console.log(`Synced ${generated.entries.length} food intents from ${generated.source.totalSourceRows} rows.`);
}

if (process.argv[1]?.endsWith('sync-food-intents.ts')) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
