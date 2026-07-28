import { readFile, writeFile as nodeWriteFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  buildFoodIntentArtifacts,
  collectFoodRows,
  collectFoodRowsFromStandardData,
  renderFoodIntentModule,
  type FoodSourceRow,
  type FoodIntentOverrides,
} from './food-intent-sync-lib';

const ENDPOINT = 'https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02';

type FetchResponse = { ok: boolean; status: number; json(): Promise<unknown> };
type SyncPaths = { raw: string; generated: string; excluded: string; module: string };
type WriteFile = (path: string, content: string) => Promise<unknown>;

async function writeArtifacts({
  rows, rawPayload, dataset, endpoint, now, overrides, paths, writeFile,
}: {
  rows: readonly FoodSourceRow[];
  rawPayload: unknown;
  dataset: string;
  endpoint: string;
  now: () => Date;
  overrides: FoodIntentOverrides;
  paths: SyncPaths;
  writeFile: WriteFile;
}) {
  const { entries, excluded } = buildFoodIntentArtifacts(rows, overrides);
  const generated = {
    schemaVersion: 1,
    generatedAt: now().toISOString(),
    source: {
      dataset,
      endpoint,
      totalSourceRows: rows.length,
      acceptedCount: entries.length,
      excludedCount: excluded.length,
    },
    entries,
  };
  await Promise.all([
    writeFile(paths.raw, JSON.stringify(rawPayload, null, 2) + '\n'),
    writeFile(paths.generated, JSON.stringify(generated, null, 2) + '\n'),
    writeFile(paths.excluded, JSON.stringify(excluded, null, 2) + '\n'),
    writeFile(paths.module, renderFoodIntentModule(entries)),
  ]);
  return generated;
}

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
  writeFile?: WriteFile;
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
  return writeArtifacts({
    rows, rawPayload: { pages }, dataset: '식품의약품안전처_식품영양성분DB정보',
    endpoint: 'FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02', now, overrides, paths, writeFile,
  });
}

export async function syncFoodIntentsFromStandardData({
  payload, now = () => new Date(), overrides, paths, writeFile = nodeWriteFile,
}: {
  payload: unknown;
  now?: () => Date;
  overrides: FoodIntentOverrides;
  paths: SyncPaths;
  writeFile?: WriteFile;
}) {
  const rows = collectFoodRowsFromStandardData(payload);
  return writeArtifacts({
    rows, rawPayload: payload, dataset: '전국통합식품영양성분정보_음식_표준데이터',
    endpoint: 'local standard-data JSON', now, overrides, paths, writeFile,
  });
}

async function main() {
  const sourceJsonArg = process.argv.find((arg) => arg.startsWith('--source-json='));
  const pageArg = process.argv.find((arg) => arg.startsWith('--page-size='));
  const pageSize = pageArg ? Number(pageArg.slice('--page-size='.length)) : 1000;
  const root = process.cwd();
  const overrides = JSON.parse(await readFile(resolve(root, 'data/food-intents-overrides.json'), 'utf8')) as FoodIntentOverrides;
  const paths = {
    raw: resolve(root, 'data/food-source-raw.json'),
    generated: resolve(root, 'data/food-intents.generated.json'),
    excluded: resolve(root, 'data/food-intents-excluded.json'),
    module: resolve(root, 'supabase/functions/_shared/food-intents.generated.ts'),
  };
  const generated = sourceJsonArg
    ? await syncFoodIntentsFromStandardData({
      payload: JSON.parse(await readFile(sourceJsonArg.slice('--source-json='.length), 'utf8')), overrides, paths,
    })
    : await syncFoodIntents({
      fetchImpl: (url) => fetch(url), serviceKey: process.env.FOOD_NTR_CPNT_DB_SERVICE_KEY ?? '', pageSize, overrides, paths,
    });
  console.log(`Synced ${generated.entries.length} food intents from ${generated.source.totalSourceRows} rows.`);
}

if (process.argv[1]?.endsWith('sync-food-intents.ts')) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
