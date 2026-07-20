# 수동 장소 지정 (Phase 0 + Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 레거시 수동 카드 생성을 제거하고, 결과 화면 교체 시트에서 사용자가 카카오를 직접 검색해 고른 실제 장소로 스텝을 교체하는 기능을 추가한다. 저장물은 AI 코스와 동일한 `make_course` 카드.

**Architecture:** Phase 0은 순수 제거(레거시 진입점·화면·테스트 정리). Phase 1은 (a) 신규 전체화면 장소검색 라우트(`place-search` edge 재사용), (b) `recommend-date` 핸들러가 사용자 지정 장소를 이름+좌표로 카카오 재검색해 실재 검증 후 `search.candidates`에 주입하는 서버 변경, (c) 결과 화면 교체 시트에 [추천 후보 | 직접 검색] 세그먼트 탭 추가. 저장은 기존 `replace` RPC 흐름 그대로.

**Tech Stack:** Expo Router, React Native, TypeScript, Zod, Supabase Edge Functions (Deno), Jest.

**설계 문서:** `docs/superpowers/specs/2026-07-20-manual-place-pick-design.md`

**디자인 제약(전 태스크):** 신규 UI에 이모티콘 금지, 색깔 채운 뱃지/태그 금지, 기존 스타일·컴포넌트 재사용, i18n ko/en 동시 갱신, 변경마다 루트에서 `npm run validate`.

---

## Phase 0 — 레거시 수동 추가 제거

파일 맵:
- Modify: `app/(tabs)/candidates.tsx` — "직접 추가" 버튼 + 필요 시 미사용 `Plus` import 제거
- Delete: `app/card/new.tsx` — 수동 카드 생성 화면(파일 삭제로 expo-router `/card/new` 라우트 자동 제거)
- Modify: `__tests__/identityWiring.test.ts` — 삭제된 파일 참조·카운트 조정
- 유지: `locales/*.json`의 `candidates.addManual` 키 — manual-source 카드 뱃지(candidates.tsx:400)가 계속 사용하므로 **삭제하지 않음**

### Task 0.1: 회귀 테스트를 새 현실에 맞게 갱신 (RED→GREEN)

**Files:**
- Modify: `__tests__/identityWiring.test.ts:19-35`

- [ ] **Step 1: 현재 카운트 확인 (baseline)**

Run: `npx jest __tests__/identityWiring.test.ts -t "writes identity"`
Expected: PASS (현행 기준: aiPayloads 4, manualPayloads 1). 이 숫자를 기록.

- [ ] **Step 2: card/new.tsx 참조 제거하도록 테스트 수정**

`__tests__/identityWiring.test.ts`의 두 번째 `it` 블록을 아래로 교체. (card/new.tsx 라인 삭제, manual 관련 단언 제거, ai 카운트는 Step 4에서 실측값으로 확정)

```ts
  it('writes identity in AI inserts while structured course confirmation avoids duplicate direct writes', () => {
    const payloads = [
      ...dateCardInsertPayloads('app/mode-flow/result.tsx'),
      ...dateCardInsertPayloads('app/mode-flow/course-result.tsx'),
      ...dateCardInsertPayloads('app/card/[id].tsx'),
      ...dateCardInsertPayloads('app/(tabs)/candidates.tsx'),
    ];
    const aiPayloads = payloads.filter(payload => /source:\s*'ai'/.test(payload));
    const manualPayloads = payloads.filter(payload => /source:\s*'manual'/.test(payload));

    expect(manualPayloads).toHaveLength(0);
    expect(aiPayloads.every(payload => /\.\.\.writeRecommendationIdentity\(/.test(payload))).toBe(true);
    expect(readSource('app/mode-flow/course-result.tsx')).not.toContain(".from('date_cards').insert");
  });
```

- [ ] **Step 3: 실행해서 실패 확인 (card/new.tsx 아직 존재 → manualPayloads 1)**

Run: `npx jest __tests__/identityWiring.test.ts -t "writes identity"`
Expected: FAIL — `expect(manualPayloads).toHaveLength(0)` 가 1 받아서 실패 (card/new.tsx가 아직 목록엔 없지만 candidates.tsx엔 manual insert 없음 → 실제로는 이미 0일 수 있음). 결과 로그의 실제 aiPayloads 길이를 기록.

- [ ] **Step 4: aiPayloads 길이 단언 추가**

Step 3 로그의 실제 aiPayloads 길이 N으로 아래 한 줄을 `manualPayloads` 단언 위에 추가:

```ts
    expect(aiPayloads).toHaveLength(N);
```

Run: `npx jest __tests__/identityWiring.test.ts -t "writes identity"`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add __tests__/identityWiring.test.ts
git commit -m "test: identityWiring에서 card/new 레거시 참조 제거"
```

### Task 0.2: candidates 탭 "직접 추가" 버튼 제거

**Files:**
- Modify: `app/(tabs)/candidates.tsx:306-319` (버튼), import 라인

- [ ] **Step 1: 버튼 JSX 제거**

`app/(tabs)/candidates.tsx`의 `headerRow`(306-319)를 아래로 교체 — `TouchableOpacity`(311-318) 삭제:

```tsx
          <View style={s.headerRow}>
            <View>
              <Text style={s.pageTitle}>{t('candidates.pageTitle')}</Text>
              <Text style={s.countText}>{t('candidates.countText', { count: cards.length })}</Text>
            </View>
          </View>
```

- [ ] **Step 2: 미사용 import·스타일 정리**

`Plus`가 이 파일에서 더 이상 안 쓰이면 `lucide-react-native` import에서 제거. `s.addBtn`/`s.addBtnText` 스타일이 다른 곳에서 안 쓰이면 StyleSheet에서 제거.

Run: `rg -n "Plus|addBtn" app/\(tabs\)/candidates.tsx`
Expected: 남은 참조 없음(있으면 유지).

- [ ] **Step 3: 타입 검증**

Run: `npm run validate`
Expected: PASS (에러 0)

- [ ] **Step 4: 커밋**

```bash
git add app/\(tabs\)/candidates.tsx
git commit -m "feat: candidates 탭 직접 추가 버튼 제거"
```

### Task 0.3: 레거시 수동 생성 화면 삭제

**Files:**
- Delete: `app/card/new.tsx`

- [ ] **Step 1: 남은 참조 없음 재확인**

Run: `rg -n "card/new" --glob '!node_modules'`
Expected: 결과 없음 (Task 0.1·0.2에서 제거 완료).

- [ ] **Step 2: 파일 삭제**

```bash
git rm app/card/new.tsx
```

- [ ] **Step 3: 타입 검증 + 전체 테스트**

Run: `npm run validate && npx jest __tests__/identityWiring.test.ts`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git commit -m "feat: 레거시 수동 카드 생성 화면(card/new) 제거"
```

---

## Phase 1 — 직접 검색 장소 교체 (결과 화면)

**핵심 아키텍처 (확정):**
- `search.candidates`는 `PlaceCandidate[]`. `candidateId`는 랭킹 위치 기반 `candidate_NNN`(요청 내 임시 ID). 카카오는 place-id 단건조회 불가, **키워드+좌표 검색만** 가능(`fetchKakaoSearchPage`, endpoint `keyword`).
- 사용자가 `place-search`로 고른 장소는 `{placeId, x, y, name, address, category}` 형태. 이를 `replacement`에 `pickedName`으로 함께 실어 보낸다.
- 핸들러는 `searchCandidates` 직후, `replacement.pickedName`이 있고 그 `kakaoPlaceId`가 풀에 없으면 → **`pickedName`을 스텝 좌표 근처에서 카카오 키워드 재검색** → 반환 doc 중 `id === kakaoPlaceId`인 것을 찾아(=서버 실재·좌표 검증, client 좌표 불신) `PlaceCandidate`로 만들어 `search.candidates`에 append.
- 카테고리 정합은 유지: 주입 candidate가 스텝 category와 안 맞으면 기존 422. 검색 화면이 스텝 category로 bias하므로 대개 일치.

**필드 매핑 주의:** place-search edge 응답은 `placeId`/`x`(lng)/`y`(lat)/`address`, recommendation 도메인은 `kakaoPlaceId`/`longitude`/`latitude`/`roadAddress`. 파이프하는 코드는 반드시 매핑.

파일 맵:
- Modify: `shared/recommendation/schemas.ts:91-94` — `replacement`에 `pickedName?` 추가
- Create: `supabase/functions/_shared/resolve-picked-place.ts` — 이름+좌표 키워드 재검색 → `PlaceCandidate | null`
- Modify: `supabase/functions/_shared/recommend-date-handler.ts:160-162` 직후 — 주입 호출
- Create: `app/mode-flow/place-search.tsx` — 전체화면 장소 검색(화면 ②)
- Modify: `app/mode-flow/course-result.tsx` — 교체 시트 [추천 후보 | 직접 검색] 세그먼트 + `replaceWithCandidate` name 파라미터
- Modify: `locales/ko.json`, `locales/en.json` — 신규 문구

### Task 1.0: 스파이크 — 엣지 테스트 인프라 + 키워드 재검색 실증

**목적:** verbatim 서버 코드를 쓰기 전에 미확인 인프라를 확정한다. **이 태스크 산출물은 이 계획서에 발견사항을 기록**하고, 필요하면 후속 태스크 코드를 조정.

- [ ] **Step 1: 엣지 함수 테스트 러너 파악**

Run: `rg -n "deno test|Deno.test|\"test\"" supabase package.json | head -30` 및 `fd -e ts . supabase/functions/_shared/__tests__ 2>/dev/null | head`
기록: Deno 테스트 파일 위치·명령(`deno test ...`)과 기존 카카오 검색 테스트가 `fetcher`를 어떻게 목킹하는지.

- [ ] **Step 2: 재사용 심볼 export 여부 확인**

Run: `rg -n "export (function|const|type) (normalizeDocument|fetchKakaoSearchPage|rankPlaceCandidates)|type KakaoSearchQuery|type PlaceCandidate" supabase/functions/_shared/recommendation-search.ts supbase/functions/_shared/recommendation-ranking.ts 2>/dev/null; rg -n "export" supabase/functions/_shared/recommendation-search.ts | rg "normalizeDocument|fetchKakaoSearchPage|KakaoSearchQuery"`
기록: `normalizeDocument`·`fetchKakaoSearchPage`·`KakaoSearchQuery`·`PlaceCandidate`가 import 가능한지. 아니면 재검색·매핑을 로컬 복제해야 하는지, `KakaoSearchQuery`의 정확한 필드(`source`/`queryText`/`page`/`queryId` 등).

- [ ] **Step 3: 키워드 재검색이 지정 장소를 surface하는지 실증 (throwaway 테스트)**

기존 카카오 검색 테스트의 목 fetcher 패턴을 복사해, `fetchKakaoSearchPage({ endpoint keyword, queryText: '블루보틀 성수', ... }, center, key, mockFetcher)`가 `documents`에 `id === '<대상 placeId>'`를 포함함을 확인하는 임시 테스트 작성·실행.
Expected: PASS — 이름+좌표 검색이 해당 place를 반환. 실패 시(이름이 흔해 페이지에 안 잡힘) → `size`↑ 또는 `sort` 조정, 그래도 안 되면 후속 태스크에서 "카테고리 검색 결과 + 이름 필터" 폴백 채택.

- [ ] **Step 4: 발견사항을 이 계획서 Phase 1 머리말에 1~3줄로 기록하고 커밋**

```bash
git add docs/superpowers/plans/2026-07-20-manual-place-pick-phase0-1.md
git commit -m "docs: Phase 1 스파이크 발견사항 기록"
```

### Task 1.1: `replacement` 스키마에 `pickedName` 추가 (RED→GREEN)

**Files:**
- Modify: `shared/recommendation/schemas.ts:91-94`
- Test: 기존 스키마 테스트 파일(스파이크 Step 1에서 위치 확인; 예 `shared/recommendation/__tests__/schemas.test.ts`)

- [ ] **Step 1: 실패 테스트 작성**

스키마 테스트 파일에 추가:

```ts
it('accepts an optional pickedName on replacement', () => {
  const parsed = recommendationRequestSchema.safeParse({
    ...validCourseRequest(),               // 기존 테스트 헬퍼 재사용
    replacement: { stepId: 's1', kakaoPlaceId: 'k1', pickedName: '블루보틀 성수' },
  });
  expect(parsed.success).toBe(true);
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx jest -t "optional pickedName"`
Expected: FAIL — `.strict()`가 `pickedName`을 unrecognized key로 거부.

- [ ] **Step 3: 스키마 수정**

`shared/recommendation/schemas.ts:91-94`를 교체:

```ts
    replacement: z.object({
      stepId: boundedText(80),
      kakaoPlaceId: boundedText(120),
      pickedName: boundedText(120).optional(),
    }).strict().optional(),
```

- [ ] **Step 4: 통과 확인 + 타입 검증**

Run: `npx jest -t "optional pickedName" && npm run validate`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add shared/recommendation/schemas.ts <스키마 테스트 파일>
git commit -m "feat: replacement에 pickedName(수동 지정 장소 검색 시드) 추가"
```

### Task 1.2: 지정 장소 → PlaceCandidate 리졸버 (RED→GREEN)

**Files:**
- Create: `supabase/functions/_shared/resolve-picked-place.ts`
- Test: `supabase/functions/_shared/__tests__/resolve-picked-place.test.ts` (스파이크 Step 1의 러너/경로 규약 따름)

**계약:** 이름+center로 키워드 검색 → doc 중 `id === kakaoPlaceId` 매칭 → `PlaceCandidate` 반환(못 찾으면 `null`). `candidateId`는 호출자가 고유값 주입하도록 인자로 받음. 카카오 doc 매핑은 스파이크 Step 2에서 확인한 `normalizeDocument`를 import(가능 시) 하거나 동일 필드매핑 복제.

- [ ] **Step 1: 실패 테스트 작성**

```ts
// mockFetcher: 지정 좌표/쿼리에 documents 배열 반환 (스파이크에서 확인한 KakaoDocument 형태)
it('returns a category-correct candidate for the matching kakaoPlaceId', async () => {
  const fetcher = makeMockKakaoFetcher([
    { id: 'k1', place_name: '블루보틀 성수', category_group_code: 'CE7',
      category_group_name: '카페', category_name: '카페 > 커피전문점',
      address_name: '서울 성동구', road_address_name: '서울 성동구 아차산로 7',
      x: '127.05', y: '37.54', place_url: 'http://place/k1' },
  ]);
  const candidate = await resolvePickedPlaceCandidate({
    name: '블루보틀 성수', kakaoPlaceId: 'k1',
    center: { latitude: 37.54, longitude: 127.05 },
    candidateId: 'candidate_099', kakaoRestApiKey: 'x', fetcher,
  });
  expect(candidate?.kakaoPlaceId).toBe('k1');
  expect(candidate?.candidateId).toBe('candidate_099');
  expect(candidate?.categoryGroupCode).toBe('CE7');
  expect(candidate?.latitude).toBe(37.54);
});

it('returns null when no document matches the id', async () => {
  const fetcher = makeMockKakaoFetcher([{ id: 'other', place_name: 'x', x: '127', y: '37' }]);
  const candidate = await resolvePickedPlaceCandidate({
    name: 'x', kakaoPlaceId: 'k1', center: { latitude: 37, longitude: 127 },
    candidateId: 'candidate_099', kakaoRestApiKey: 'x', fetcher,
  });
  expect(candidate).toBeNull();
});
```

- [ ] **Step 2: 실패 확인**

Run: (스파이크에서 확인한 명령) `deno test supabase/functions/_shared/__tests__/resolve-picked-place.test.ts` 또는 jest 경로
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 리졸버 구현**

`supabase/functions/_shared/resolve-picked-place.ts` 생성. `fetchKakaoSearchPage`(import 가능 시) + `normalizeDocument` 재사용하여 아래 계약 구현:

```ts
import { fetchKakaoSearchPage, normalizeDocument, type KakaoFetch } from './recommendation-search.ts';
import type { PlaceCandidate } from './recommendation-ranking.ts';

export async function resolvePickedPlaceCandidate(input: {
  name: string;
  kakaoPlaceId: string;
  center: { latitude: number; longitude: number };
  candidateId: string;
  kakaoRestApiKey: string;
  fetcher?: KakaoFetch;
}): Promise<PlaceCandidate | null> {
  const outcome = await fetchKakaoSearchPage(
    { /* 스파이크 Step 2에서 확인한 KakaoSearchQuery 형태: keyword 검색 */
      source: 'keyword', queryText: input.name, page: 1 } as any,
    { source: 'kakao', kakaoPlaceId: input.kakaoPlaceId, label: input.name,
      latitude: input.center.latitude, longitude: input.center.longitude, kind: 'place' } as any,
    input.kakaoRestApiKey,
    input.fetcher,
  );
  if (outcome.status !== 'success') return null;
  const match = outcome.documents.find((doc) => (doc as { id?: string }).id === input.kakaoPlaceId);
  if (!match) return null;
  const normalized = normalizeDocument(match);       // EvidencedKakaoPlace 필드 매핑
  if (!normalized) return null;
  return {
    ...normalized,
    matchedSearchEvidence: [],
    candidateId: input.candidateId,
    distanceFromSearchCenterMeters: 0,
    score: 0,
    scoreBreakdown: { intent: 0, distance: 0, budget: 0, preference: 0, routeFit: 0, diversity: 0, behavior: 0, penalty: 0 },
  };
}
```

> 주: `KakaoSearchQuery`/`RecommendationLocation` 실제 필드는 스파이크 Step 2 결과로 확정해 `as any`를 제거한다. `normalizeDocument`가 미export면 그 필드매핑(recommendation-search.ts:197-223: id→kakaoPlaceId, place_name→name, y→latitude, x→longitude, category_group_code/name, address_name→address, road_address_name→roadAddress, place_url→mapUrl, 좌표 유효성 검사)을 이 파일에 복제.

- [ ] **Step 4: 통과 확인**

Run: (스파이크 명령)
Expected: PASS (두 테스트)

- [ ] **Step 5: 커밋**

```bash
git add supabase/functions/_shared/resolve-picked-place.ts supabase/functions/_shared/__tests__/resolve-picked-place.test.ts
git commit -m "feat: 지정 장소 이름+좌표 재검색 → PlaceCandidate 리졸버"
```

### Task 1.3: 핸들러가 지정 장소를 candidates에 주입 (RED→GREEN)

**Files:**
- Modify: `supabase/functions/_shared/recommend-date-handler.ts:160-162` 직후
- Test: 기존 handler 테스트 파일(스파이크에서 위치·목킹 확인)

- [ ] **Step 1: 실패 테스트 작성**

`replacement.pickedName`이 있고 그 place가 초기 `searchCandidates` 결과에 없을 때, 핸들러가 리졸버로 주입해 교체가 성공하는 시나리오. 기존 handler 테스트의 dependencies 목(`searchCandidates`)을 재사용하되 대상 place를 제외한 풀을 반환하고, 카카오 fetcher 목이 그 place를 반환하도록 구성. 결과 응답의 target step이 지정 kakaoPlaceId를 갖는지 단언.

```ts
it('injects a user-picked place into candidates when replacement.pickedName is set', async () => {
  const result = await handleRecommendDate(buildReplacementRequestWithPickedName(), depsWithPickedPlaceKakaoMock());
  expect(result.status).toBe(200);
  const target = result.body.course.steps.find(s => s.stepId === 'target');
  expect(target?.kakaoPlaceId).toBe('picked-1');
});
```

- [ ] **Step 2: 실패 확인**

Run: (스파이크 명령, handler 테스트)
Expected: FAIL — 주입 로직 없어 `forced` undefined → 422.

- [ ] **Step 3: 핸들러에 주입 로직 추가**

`recommend-date-handler.ts` 160-162의 `search = await dependencies.searchCandidates(...)` 직후, 카테고리 게이트(173) 이전에 삽입:

```ts
    if (serverRequest.replacement?.pickedName
        && !search.candidates.some((c) => c.kakaoPlaceId === serverRequest.replacement?.kakaoPlaceId)) {
      const targetStep = serverRequest.courseSteps.find((s) => s.id === serverRequest.replacement?.stepId);
      const center = targetStep
        ? { latitude: serverRequest.location.latitude, longitude: serverRequest.location.longitude }
        : null;
      if (center) {
        const injected = await resolvePickedPlaceCandidate({
          name: serverRequest.replacement.pickedName,
          kakaoPlaceId: serverRequest.replacement.kakaoPlaceId,
          center,
          candidateId: `candidate_${String(search.candidates.length + 1).padStart(3, '0')}`,
          kakaoRestApiKey: Deno.env.get('KAKAO_REST_API_KEY') ?? '',
          fetcher: dependencies.kakaoFetcher, // 목킹 가능하도록 dependencies에 노출; 없으면 fetch
        });
        if (injected) search.candidates = [...search.candidates, injected];
      }
    }
```

> `dependencies`에 `kakaoFetcher?: KakaoFetch`가 없으면 추가(테스트 목킹용, 기본 `fetch`). import: `resolvePickedPlaceCandidate`.

- [ ] **Step 4: 통과 확인 + 타입 검증**

Run: (스파이크 명령) + `npm run validate`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add supabase/functions/_shared/recommend-date-handler.ts <handler 테스트>
git commit -m "feat: 핸들러가 지정 장소를 이름 재검색으로 candidates에 주입"
```

### Task 1.4: 전체화면 장소 검색 화면 (화면 ②)

**Files:**
- Create: `app/mode-flow/place-search.tsx`
- Modify: `locales/ko.json`, `locales/en.json` (`modeFlow.placeSearch.*`)

**설계:** expo-router 라우트 `/mode-flow/place-search`. params로 `{ x, y, categoryCode?, returnTo }` 받음. 검색 입력(디바운스 350ms) → `place-search` edge 호출(`{ coords:{x,y}, radius:3000, queries:[q], categoryCodes:[categoryCode] }`) → 결과 리스트(장소명 + 도로명주소, **색 뱃지·이모지 없음**, 기존 `replacementRow` 스타일 톤). 항목 선택 → 결과를 호출자에 반환. 반환 방식: expo-router는 콜백 전달 불가하므로, 선택 결과를 전역 store(기존 recommendation session store 패턴) 또는 `router.back()` + params 우회 대신 **가벼운 module-level 이벤트/ref**로 넘긴다(스파이크에서 기존 유사 패턴 있으면 그걸 따름; 없으면 `lib/place-pick-bridge.ts`에 `pendingPick` ref + subscribe 구현).

- [ ] **Step 1: 반환 브리지 유닛 테스트 (RED)**

`lib/place-pick-bridge.ts`의 계약 테스트:

```ts
it('delivers a picked place to a one-time subscriber', () => {
  const seen: PickedPlace[] = [];
  const unsub = subscribePickedPlace((p) => seen.push(p));
  publishPickedPlace({ kakaoPlaceId: 'k1', name: '블루보틀', address: '서울', longitude: 127, latitude: 37 });
  expect(seen).toHaveLength(1);
  unsub();
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx jest lib/place-pick-bridge`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 브리지 구현**

`lib/place-pick-bridge.ts`:

```ts
export type PickedPlace = { kakaoPlaceId: string; name: string; address: string; longitude: number; latitude: number };
type Listener = (place: PickedPlace) => void;
let listeners: Listener[] = [];
export function subscribePickedPlace(fn: Listener): () => void {
  listeners = [...listeners, fn];
  return () => { listeners = listeners.filter((l) => l !== fn); };
}
export function publishPickedPlace(place: PickedPlace): void {
  listeners.forEach((l) => l(place));
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx jest lib/place-pick-bridge`
Expected: PASS

- [ ] **Step 5: 검색 화면 구현**

`app/mode-flow/place-search.tsx` 생성. 기존 화면(course-result) import·스타일 규약, `constants/theme`(C/R/SP) 사용, lucide `Search`/`X` 아이콘(이모지 금지). 골격:

```tsx
// useLocalSearchParams<{ x: string; y: string; categoryCode?: string }>()
// const [q, setQ] = useState(''); const [results, setResults] = useState<Place[]>([]);
// 디바운스 useEffect: q 변하면 supabase.functions.invoke('place-search', {
//   body: { coords: { x, y }, radius: 3000, queries: [q], ...(categoryCode ? { categoryCodes: [categoryCode] } : {}) } })
//   → setResults(data.places ?? [])
// FlatList row: 장소명(Text) + 도로명주소(Text numberOfLines=1) + "선택" TouchableOpacity
//   onPress: publishPickedPlace({ kakaoPlaceId: place.placeId, name: place.name,
//     address: place.address, longitude: Number(place.x), latitude: Number(place.y) }); router.back();
```

(전체 코드는 course-result.tsx의 `replacementRow`/`replacementName`/`replacementAddress`/`pickButton` 스타일을 이 파일에 맞게 재현. `place.placeId`/`x`/`y` → 도메인 필드 매핑 주의.)

- [ ] **Step 6: i18n 추가 (ko/en 동시)**

`locales/ko.json`·`en.json`의 `modeFlow`에 `placeSearch` 추가:

```json
"placeSearch": { "title": "장소 검색", "placeholder": "가게 이름으로 검색", "empty": "검색 결과가 없어요", "pick": "선택" }
```
```json
"placeSearch": { "title": "Search places", "placeholder": "Search by name", "empty": "No results", "pick": "Select" }
```

- [ ] **Step 7: 타입 검증**

Run: `npm run validate`
Expected: PASS

- [ ] **Step 8: StyleSeed 게이트 + 커밋**

`/ss-score app/mode-flow/place-search.tsx` ≥80(미달 시 fix→재점수), 그 후:

```bash
git add app/mode-flow/place-search.tsx lib/place-pick-bridge.ts locales/ko.json locales/en.json <bridge 테스트>
git commit -m "feat: 전체화면 카카오 장소 검색 화면 + 선택 브리지"
```

### Task 1.5: 결과 화면 교체 시트에 [추천 후보 | 직접 검색] 탭

**Files:**
- Modify: `app/mode-flow/course-result.tsx` (교체 state·Modal·replaceWithCandidate·styles)
- Modify: `locales/ko.json`, `locales/en.json` (`modeFlow.courseResult.searchTab`/`recommendTab`)

- [ ] **Step 1: `replaceWithCandidate`에 pickedName 파라미터 추가**

`course-result.tsx:183`의 시그니처와 요청 바디 수정:

```tsx
  async function replaceWithCandidate(targetStepId: string, kakaoPlaceId: string, pickedName?: string) {
    if (!snapshot) return;
    setEditing(true);
    setEditError('');
    try {
      const request = {
        ...omitOneShotRequestFields(snapshot.request),
        requestId: createRecommendationRequestId(),
        sessionId: snapshot.sessionId,
        baseRequestId: snapshot.requestId,
        replacement: { stepId: targetStepId, kakaoPlaceId, ...(pickedName ? { pickedName } : {}) },
        lockedSteps: snapshot.steps.filter((step) => step.stepId !== targetStepId).map(toLockedStep),
        excludedPlaceIds: [...new Set([...(snapshot.request.excludedPlaceIds ?? []), ...snapshot.steps.map((step) => step.currentKakaoPlaceId)])],
      };
      // ...이하 기존과 동일 (requestRecommendationResponse → find → mutate 'replace' → setSnapshot → router.replace)
```

- [ ] **Step 2: 세그먼트 탭 state + 검색 진입/선택 구독**

교체 state 근처(77-79)에 추가: `const [replacementTab, setReplacementTab] = useState<'recommend' | 'search'>('recommend');`
`openReplacementPanel`(교체 시트 열 때)에서 `setReplacementTab('recommend')` 초기화.
검색 탭에서 "장소 검색하기" 누르면 스텝 좌표·category로 `/mode-flow/place-search` push, 그리고 화면 마운트 시 `subscribePickedPlace` 구독해 반환된 place로 `replaceWithCandidate(targetId, place.kakaoPlaceId, place.name)` 호출:

```tsx
  useEffect(() => {
    const unsub = subscribePickedPlace((place) => {
      if (replacementTargetId) void replaceWithCandidate(replacementTargetId, place.kakaoPlaceId, place.name);
    });
    return unsub;
  }, [replacementTargetId]);
```

- [ ] **Step 3: Modal에 세그먼트 탭 렌더**

교체 Modal(440-475)의 `replacementNotice`(452) 위에 세그먼트 추가, 탭에 따라 리스트/검색진입 분기. 세그먼트는 기존 조건 패널·중립 톤 스타일 재사용, **색 뱃지 금지**:

```tsx
            <View style={s.tabRow}>
              <TouchableOpacity style={[s.tabBtn, replacementTab === 'recommend' && s.tabBtnOn]} onPress={() => setReplacementTab('recommend')}>
                <Text style={[s.tabText, replacementTab === 'recommend' && s.tabTextOn]}>{t('modeFlow.courseResult.recommendTab')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.tabBtn, replacementTab === 'search' && s.tabBtnOn]} onPress={() => setReplacementTab('search')}>
                <Text style={[s.tabText, replacementTab === 'search' && s.tabTextOn]}>{t('modeFlow.courseResult.searchTab')}</Text>
              </TouchableOpacity>
            </View>
```

`recommend` 탭: 기존 후보 리스트(453-472) 그대로. `search` 탭: 안내문 + "장소 검색하기" 버튼(스텝 좌표/category로 place-search push).

- [ ] **Step 4: 탭 스타일 추가 (중립, 색뱃지 없음)**

styles에 추가:

```tsx
  tabRow: { flexDirection: 'row', backgroundColor: C.gray, borderRadius: 12, padding: 3, gap: 3 },
  tabBtn: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  tabBtnOn: { backgroundColor: C.white },
  tabText: { fontSize: 12, fontWeight: '800', color: C.textSub },
  tabTextOn: { color: C.pinkDeep },
```

- [ ] **Step 5: i18n (ko/en 동시)**

`modeFlow.courseResult`에 `recommendTab`/`searchTab`/`searchCta` 추가:
```json
"recommendTab": "추천 후보", "searchTab": "직접 검색", "searchCta": "장소 검색하기"
```
```json
"recommendTab": "Suggestions", "searchTab": "Search", "searchCta": "Search a place"
```

- [ ] **Step 6: 타입 검증 + 전체 테스트**

Run: `npm run validate && npx jest`
Expected: PASS

- [ ] **Step 7: StyleSeed 게이트 + 커밋**

`/ss-score app/mode-flow/course-result.tsx` ≥80, styleseed-design-review 통과 후:

```bash
git add app/mode-flow/course-result.tsx locales/ko.json locales/en.json
git commit -m "feat: 결과 교체 시트에 직접 검색 탭 + 지정 장소 교체"
```

---

## Phase 2 (별도 계획)

입력 단계 장소 핀(화면 ①, `CourseStepEditor` 세그먼트 전환 + 다중 핀)은 Phase 1의 주입 메커니즘이 검증된 뒤 별도 계획으로 작성한다. 이유: 입력-시점 다중 핀은 요청 스키마에 per-step 핀 배열을 추가하고 핸들러가 첫 생성 시 여러 장소를 주입해야 하므로, Phase 1의 단일 주입이 실증된 코드 위에 얹는 게 안전.

---

## Self-Review (계획 작성자 점검)

- **스펙 커버리지:** 화면 ②(Task 1.4)·화면 ③(Task 1.5)·레거시 제거(Phase 0)·서버 주입(1.2/1.3)·스키마(1.1) 모두 태스크 존재. 화면 ①은 Phase 2로 명시 분리. ✅
- **미확정 코드:** Task 1.2/1.4의 `as any`·브리지 반환 방식·Deno 테스트 명령은 **Task 1.0 스파이크로 확정 후 제거**한다고 명시 — 플레이스홀더가 아니라 선행 검증 태스크로 처리. ✅
- **타입 일관성:** `resolvePickedPlaceCandidate` 시그니처(1.2)와 호출부(1.3) 일치, `replaceWithCandidate(targetStepId, kakaoPlaceId, pickedName?)` 시그니처(1.5 Step1)와 구독 호출(1.5 Step2) 일치, `PickedPlace` 필드(1.4)와 사용처 일치. ✅
- **필드 매핑:** place-search `placeId/x/y` → 도메인 `kakaoPlaceId/longitude/latitude` 매핑을 1.4 Step5·본문에 명시. ✅
