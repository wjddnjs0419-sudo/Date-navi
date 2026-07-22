# place_search 카테고리 자동검색 버그 + 검색 전 상태(최근검색/추천지역) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `app/mode-flow/place-search.tsx`에서 (1) `categoryCode`가 있을 때 검색어 없이도 카테고리 검색이 자동으로 뜨도록 버그를 고치고, (2) 검색 전(빈 검색어) 상태에 목업(`UI RENEW/DATE_NAVI_P2_INDIVIDUAL_SCREENS/02_place_search.png`)의 "최근 검색" + "추천 지역" 칩을 채워 넣는다.

**Architecture:** 기존 화면의 debounce-검색 useEffect 구조는 그대로 두고, 트리거 조건만 "검색어 있음" → "검색어 있음 OR categoryCode 있음"으로 확장한다. 최근 검색어는 AsyncStorage에 저장하는 새 순수 모듈(`lib/recentPlaceSearches.ts`, 기존 `lib/recentLocations.ts`와 동일 패턴)로 분리해 유닛 테스트로 검증하고, 화면은 그 모듈의 결과만 렌더한다. 추천 지역은 목업과 동일한 고정 리스트를 i18n 키(배열)로 관리한다. 사진·별점은 데이터 소스가 없어 이번 스코프에서 제외한다(다른 phase와 동일 결정).

**Tech Stack:** React Native(Expo Router), `@react-native-async-storage/async-storage`(jest 전역 mock 이미 설정됨), react-i18next, Jest + react-test-renderer.

**목업 대조 메모(구현 전 확인 완료):** `02_place_search.png` 기준 — 검색 전 상태는 위에서부터 "최근 검색"(칩 3개, 예: 성수 맛집·한강 카페·홍대 데이트) → "추천 지역"(칩 5개: 성수동·한강·연남동·잠실·이태원) 순서. 검색 결과 카드엔 사진 썸네일+별점+리뷰수가 있지만 이 데이터가 없어 이번 스코프에서 제외 — 기존처럼 카테고리 아이콘(MapPin)+거리만 유지한다.

---

## Task 1 — `lib/recentPlaceSearches.ts` 최근 검색어 저장 모듈

**Files:**
- Create: `lib/recentPlaceSearches.ts`
- Test: `__tests__/recentPlaceSearches.test.ts` (신규)

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// __tests__/recentPlaceSearches.test.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loadRecentPlaceSearches,
  saveRecentPlaceSearch,
  RECENT_PLACE_SEARCHES_LIMIT,
} from '../lib/recentPlaceSearches';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('recentPlaceSearches', () => {
  it('아무것도 저장 안 했으면 빈 배열', async () => {
    expect(await loadRecentPlaceSearches()).toEqual([]);
  });

  it('저장한 검색어를 최신순으로 반환한다', async () => {
    await saveRecentPlaceSearch('성수 맛집');
    const result = await saveRecentPlaceSearch('한강 카페');
    expect(result).toEqual(['한강 카페', '성수 맛집']);
  });

  it('같은 검색어를 다시 저장하면 중복 대신 맨 앞으로 옮긴다', async () => {
    await saveRecentPlaceSearch('성수 맛집');
    await saveRecentPlaceSearch('한강 카페');
    const result = await saveRecentPlaceSearch('성수 맛집');
    expect(result).toEqual(['성수 맛집', '한강 카페']);
  });

  it(`최근 ${RECENT_PLACE_SEARCHES_LIMIT}개만 유지한다`, async () => {
    for (let i = 0; i < RECENT_PLACE_SEARCHES_LIMIT + 2; i++) {
      await saveRecentPlaceSearch(`검색어${i}`);
    }
    const result = await loadRecentPlaceSearches();
    expect(result.length).toBe(RECENT_PLACE_SEARCHES_LIMIT);
    expect(result[0]).toBe(`검색어${RECENT_PLACE_SEARCHES_LIMIT + 1}`);
  });

  it('공백만 있는 입력은 무시한다', async () => {
    const before = await loadRecentPlaceSearches();
    const after = await saveRecentPlaceSearch('   ');
    expect(after).toEqual(before);
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx jest recentPlaceSearches`
Expected: FAIL — `lib/recentPlaceSearches`가 존재하지 않음.

- [ ] **Step 3: 구현**

```ts
// lib/recentPlaceSearches.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

export const RECENT_PLACE_SEARCHES_KEY = 'datenavi.recentPlaceSearches';
export const RECENT_PLACE_SEARCHES_LIMIT = 5;

export async function loadRecentPlaceSearches(): Promise<string[]> {
  try {
    const stored = await AsyncStorage.getItem(RECENT_PLACE_SEARCHES_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .slice(0, RECENT_PLACE_SEARCHES_LIMIT);
  } catch {
    return [];
  }
}

export async function saveRecentPlaceSearch(term: string): Promise<string[]> {
  const trimmed = term.trim();
  if (!trimmed) return loadRecentPlaceSearches();
  const recent = await loadRecentPlaceSearches();
  const next = [trimmed, ...recent.filter((item) => item !== trimmed)]
    .slice(0, RECENT_PLACE_SEARCHES_LIMIT);
  await AsyncStorage.setItem(RECENT_PLACE_SEARCHES_KEY, JSON.stringify(next));
  return next;
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npx jest recentPlaceSearches`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/recentPlaceSearches.ts __tests__/recentPlaceSearches.test.ts
git commit -m "feat(place-search): 최근 검색어 저장 모듈 추가"
```

---

## Task 2 — categoryCode 있으면 검색어 없이도 자동 카테고리 검색

**Files:**
- Modify: `app/mode-flow/place-search.tsx`
- Test: `__tests__/place-search-screen-contract.test.tsx` (신규)

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// __tests__/place-search-screen-contract.test.tsx
import React from 'react';

const mockInvoke = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ x: '127.05', y: '37.54', categoryCode: 'CE7' }),
  useRouter: () => ({ back: jest.fn() }),
}));

jest.mock('../lib/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

jest.mock('../lib/place-pick-bridge', () => ({
  publishPickedPlace: jest.fn(),
}));

jest.mock('../components/illustration', () => ({
  Illustration: () => null,
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});

jest.mock('../lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
  },
}));

const TR = require('react-test-renderer') as {
  act: (cb: () => void | Promise<void>) => Promise<void>;
  create: (el: React.ReactElement) => { root: unknown };
};

const PlaceSearchScreen = require('../app/mode-flow/place-search').default;

beforeEach(() => {
  jest.useFakeTimers();
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue({ data: { places: [] }, error: null });
});

afterEach(() => {
  jest.useRealTimers();
});

async function render() {
  let tree!: ReturnType<typeof TR.create>;
  await TR.act(async () => { tree = TR.create(<PlaceSearchScreen />); });
  await TR.act(async () => { jest.advanceTimersByTime(400); });
  await TR.act(async () => {});
  return tree;
}

describe('장소 검색 화면 — categoryCode 자동 검색', () => {
  it('categoryCode가 있으면 텍스트를 입력하지 않아도 카테고리 검색을 호출한다', async () => {
    await render();
    expect(mockInvoke).toHaveBeenCalledWith('place-search', {
      body: expect.objectContaining({ queries: [], categoryCodes: ['CE7'] }),
    });
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx jest place-search-screen-contract`
Expected: FAIL — 현재 코드는 `query`가 빈 문자열이면 `invoke`를 아예 호출하지 않음(`mockInvoke`가 호출되지 않음).

- [ ] **Step 3: `app/mode-flow/place-search.tsx`의 검색 트리거 조건 수정**

```ts
  useEffect(() => {
    const q = query.trim();
    if (!q && !categoryCode) {
      setResults([]);
      setLoading(false);
      setError(false);
      return;
    }
    const handle = setTimeout(() => {
      const current = ++reqId.current;
      setLoading(true);
      setError(false);
      void supabase.functions
        .invoke('place-search', {
          body: {
            coords: { x, y },
            radius: 3000,
            queries: q ? [q] : [],
            ...(categoryCode ? { categoryCodes: [categoryCode] } : {}),
          },
        })
        .then(({ data, error: err }) => {
          if (current !== reqId.current) return;
          if (err) {
            setError(true);
            setResults([]);
          } else {
            setResults((data?.places ?? []) as Place[]);
          }
        })
        .catch(() => {
          if (current !== reqId.current) return;
          setError(true);
          setResults([]);
        })
        .finally(() => {
          if (current !== reqId.current) return;
          setLoading(false);
        });
    }, 350);
    return () => clearTimeout(handle);
  }, [query, x, y, categoryCode]);
```

(바뀐 건 가드 조건 `if (!q)` → `if (!q && !categoryCode)`, 그리고 `queries: [q]` → `queries: q ? [q] : []`뿐 — 나머지 로직은 동일.)

`showEmpty` 계산도 categoryCode 케이스를 포함하도록 수정:

```ts
  const showEmpty = !loading && !error && (query.trim().length > 0 || !!categoryCode) && results.length === 0;
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npx jest place-search-screen-contract`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add app/mode-flow/place-search.tsx __tests__/place-search-screen-contract.test.tsx
git commit -m "fix(place-search): categoryCode 있으면 검색어 없이도 카테고리 검색 자동 실행"
```

---

## Task 3 — 검색 확정 시 최근 검색어 저장 배선

**Files:**
- Modify: `app/mode-flow/place-search.tsx`
- Modify: `__tests__/place-search-screen-contract.test.tsx`

- [ ] **Step 1: 실패하는 테스트 추가**

```tsx
import { loadRecentPlaceSearches } from '../lib/recentPlaceSearches';

// ... 기존 describe 블록 아래에 추가
describe('장소 검색 화면 — 최근 검색 저장', () => {
  it('검색어를 입력해 debounce가 발화하면 최근 검색에 저장한다', async () => {
    const { act, create } = TR;
    let tree: ReturnType<typeof create>;
    await act(async () => { tree = create(<PlaceSearchScreen />); });
    await act(async () => { jest.advanceTimersByTime(400); }); // categoryCode 자동검색 소진

    const TextInput = require('react-native').TextInput;
    const input = tree!.root.findAllByType(TextInput)[0];
    await act(async () => { input.props.onChangeText('성수 맛집'); });
    await act(async () => { jest.advanceTimersByTime(400); });

    expect(await loadRecentPlaceSearches()).toContain('성수 맛집');
  });
});
```

(주의: `useLocalSearchParams` mock의 `categoryCode: 'CE7'`가 이 테스트에도 적용되므로, 렌더 직후 카테고리 자동검색이 한 번 발화한 뒤 텍스트 입력으로 두 번째 검색이 발화하는 흐름이 된다 — `mockInvoke`는 `beforeEach`에서 매번 리셋되므로 호출 여부 자체엔 영향 없음.)

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx jest place-search-screen-contract`
Expected: FAIL — 아직 저장 로직이 없어 `loadRecentPlaceSearches()`가 빈 배열.

- [ ] **Step 3: `app/mode-flow/place-search.tsx`에 저장 호출 배선**

임포트 추가:

```ts
import { saveRecentPlaceSearch } from '../../lib/recentPlaceSearches';
```

`setTimeout` 콜백 맨 앞, `setLoading(true)` 이전에 추가:

```ts
    const handle = setTimeout(() => {
      const current = ++reqId.current;
      if (q) void saveRecentPlaceSearch(q);
      setLoading(true);
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npx jest place-search-screen-contract`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add app/mode-flow/place-search.tsx __tests__/place-search-screen-contract.test.tsx
git commit -m "feat(place-search): 확정 검색어를 최근 검색에 저장"
```

---

## Task 4 — 검색 전 상태: 최근 검색 + 추천 지역 칩

**Files:**
- Modify: `app/mode-flow/place-search.tsx`
- Modify: `__tests__/place-search-screen-contract.test.tsx`
- Modify: `locales/ko/modeFlow.json`, `locales/en/modeFlow.json`

- [ ] **Step 1: 실패하는 테스트 추가**

```tsx
import { Chip } from '../components/ui';
import { Text } from 'react-native';

function allText(tree: { root: { findAllByType: (t: unknown) => { props: any }[] } }): string {
  return tree.root
    .findAllByType(Text)
    .map((n) => n.props.children)
    .flat(Infinity)
    .filter((c: unknown) => typeof c === 'string' || typeof c === 'number')
    .join(' ');
}

describe('장소 검색 화면 — 검색 전 상태(최근검색/추천지역)', () => {
  it('categoryCode가 없고 검색어도 없으면 최근 검색·추천 지역 칩을 보여준다', async () => {
    // 이 테스트만 categoryCode 없는 params가 필요하므로 파일 상단 mock을 재정의한다.
    jest.resetModules();
    jest.doMock('expo-router', () => ({
      useLocalSearchParams: () => ({ x: '127.05', y: '37.54' }),
      useRouter: () => ({ back: jest.fn() }),
    }));
    const FreshPlaceSearchScreen = require('../app/mode-flow/place-search').default;

    let tree: ReturnType<typeof TR.create>;
    await TR.act(async () => { tree = TR.create(<FreshPlaceSearchScreen />); });
    await TR.act(async () => {});

    const txt = allText(tree!);
    expect(txt).toContain('modeFlow.placeSearch.recentSearchesTitle');
    expect(txt).toContain('modeFlow.placeSearch.recommendedAreasTitle');
    expect(tree!.root.findAllByType(Chip).length).toBeGreaterThanOrEqual(5); // 추천 지역 5개
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx jest place-search-screen-contract`
Expected: FAIL — `recentSearchesTitle`/`recommendedAreasTitle` 텍스트 없음, `Chip` 렌더 없음.

- [ ] **Step 3: 로케일 키 추가**

`locales/ko/modeFlow.json`의 `placeSearch` 블록:

```json
    "placeSearch": {
      "title": "장소 검색",
      "placeholder": "가게 이름, 카테고리, 지역으로 검색",
      "empty": "검색 결과가 없어요",
      "error": "검색에 실패했어요. 다시 시도해 주세요",
      "pick": "선택",
      "back": "뒤로",
      "recentSearchesTitle": "최근 검색",
      "recommendedAreasTitle": "추천 지역",
      "recommendedAreas": ["성수동", "한강", "연남동", "잠실", "이태원"]
    }
```

`locales/en/modeFlow.json`의 `placeSearch` 블록:

```json
    "placeSearch": {
      "title": "Search places",
      "placeholder": "Search by name, category, or area",
      "empty": "No results",
      "error": "Search failed. Please try again",
      "pick": "Select",
      "back": "Back",
      "recentSearchesTitle": "Recent searches",
      "recommendedAreasTitle": "Recommended areas",
      "recommendedAreas": ["Seongsu-dong", "Han River", "Yeonnam-dong", "Jamsil", "Itaewon"]
    }
```

- [ ] **Step 4: `app/mode-flow/place-search.tsx`에 칩 UI 추가**

임포트 추가:

```ts
import { Chip } from '../../components/ui';
import { loadRecentPlaceSearches, saveRecentPlaceSearch } from '../../lib/recentPlaceSearches';
```

state·effect 추가(기존 `query`/`results` state 선언부 근처):

```ts
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  useEffect(() => {
    void loadRecentPlaceSearches().then(setRecentSearches);
  }, []);

  const recommendedAreas = t('modeFlow.placeSearch.recommendedAreas', { returnObjects: true }) as string[];

  function pickSuggestion(term: string) {
    setQuery(term);
  }
```

디버깅 저장 이후에도 목록을 갱신하도록, Task 3에서 추가한 저장 호출부를 아래로 교체:

```ts
      if (q) {
        void saveRecentPlaceSearch(q).then(setRecentSearches);
      }
```

검색 전 빈 상태 렌더 블록 — 기존 `{loading && (...)}` 앞, 검색 결과 `FlatList` 이전에 추가:

```tsx
      {!loading && !error && query.trim().length === 0 && !categoryCode && (
        <View style={s.suggestions}>
          {recentSearches.length > 0 && (
            <View style={s.suggestionGroup}>
              <Text style={s.suggestionTitle}>{t('modeFlow.placeSearch.recentSearchesTitle')}</Text>
              <View style={s.chipRow}>
                {recentSearches.map((term) => (
                  <Chip key={term} tone="gray" onPress={() => pickSuggestion(term)}>{term}</Chip>
                ))}
              </View>
            </View>
          )}
          <View style={s.suggestionGroup}>
            <Text style={s.suggestionTitle}>{t('modeFlow.placeSearch.recommendedAreasTitle')}</Text>
            <View style={s.chipRow}>
              {recommendedAreas.map((area) => (
                <Chip key={area} tone="pink" onPress={() => pickSuggestion(area)}>{area}</Chip>
              ))}
            </View>
          </View>
        </View>
      )}
```

스타일 추가:

```ts
  suggestions: { paddingHorizontal: SP.lg, paddingTop: SP.lg, gap: SP.xl },
  suggestionGroup: { gap: SP.sm },
  suggestionTitle: { color: C.textSub, fontSize: 13, fontWeight: '700' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.xs },
```

- [ ] **Step 5: 테스트 실행 → 통과 확인**

Run: `npx jest place-search-screen-contract recentPlaceSearches`
Expected: PASS

- [ ] **Step 6: 전체 검증**

Run: `npm run validate && npx jest`
Expected: 모두 PASS

- [ ] **Step 7: 커밋**

```bash
git add app/mode-flow/place-search.tsx __tests__/place-search-screen-contract.test.tsx locales/ko/modeFlow.json locales/en/modeFlow.json
git commit -m "feat(place-search): 검색 전 상태에 최근 검색·추천 지역 칩 추가"
```

---

## Task 5 — 목업 대조 시각 검증

- [ ] 시뮬레이터에서 `EXPO_PUBLIC_SCREENSHOT=1` + 제어서버로 `/mode-flow/place-search`(categoryCode 없는 경로, 있는 경로 둘 다) 렌더.
- [ ] 스크린샷을 `UI RENEW/DATE_NAVI_P2_INDIVIDUAL_SCREENS/02_place_search.png`와 나란히 놓고 비교: 섹션 순서(최근검색→추천지역), 칩 스타일, 검색창 문구 일치 여부 확인. 사진·별점 차이는 의도된 제외이므로 무시.
- [ ] `categoryCode`가 있는 진입 경로(course-result "직접 검색" CTA)도 실제로 카테고리 결과가 뜨는지 확인(카카오 실 API 키가 필요하므로, 스크린샷 모드에선 mock이 빈 배열을 주더라도 "빈 결과" 상태가 정상적으로 뜨는지까지만 확인 가능 — 실제 카테고리 데이터 확인은 실기기/개발 빌드에서).
- [ ] `/ss-verify` 실행해 점수 확인, 80 미만이면 수정 후 재확인.
- [ ] `RESULT.md`에 세션 기록 추가, `PLAN.md` Pending Approval 갱신.

---

## Self-Review 메모 (작성자용, 실행 불필요)

- 사진·별점: 목업엔 있으나 데이터 소스가 없어(Google Places API 키 미발급) 의도적으로 제외 — 다른 phase(memories/review 등)와 동일한 결정 기준.
- "현재 위치에서 검색" 배지·"전체 해제" 링크: 목업엔 있지만 이번 스코프 논의에서 요청받지 않아 제외. 필요해지면 별도 태스크.
- 추천 지역은 고정 리스트(하드코딩)로, 사용자 위치 기반 동적 추천이 아니다 — 목업과 동일한 정적 값이라 스코프 내.
- Task 2/3/4 테스트는 모두 같은 파일(`place-search-screen-contract.test.tsx`)에 누적되므로, 실제 실행 시 `beforeEach`의 `jest.useFakeTimers()`가 Task 4의 `jest.resetModules()` 재정의와 충돌하지 않는지 주의 — 문제 생기면 Task 4 테스트를 별도 파일로 분리해도 무방(계획의 의도는 "검증 대상"이지 파일 구조가 아님).
