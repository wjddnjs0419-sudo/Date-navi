# memories 전체/베스트 필터 탭 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `app/(tabs)/memories.tsx`에 "전체"/"베스트"(다시 하고 싶은 추억) 필터 탭을 추가한다.

**Architecture:** 기존 `loadMemories()`가 이미 전체 `items`를 한 번에 불러오므로, 새 쿼리 없이 클라이언트 필터링(순수 함수)만 추가한다. 화면 레이아웃(리스트 카드)은 그대로 두고 `FlatList` 위에 탭 바만 얹는다.

**Tech Stack:** React Native(Expo Router), react-i18next, Jest + react-test-renderer.

**목업 대조 메모(구현 전 확인 완료):** `UI RENEW/DATE_NAVI_P1_INDIVIDUAL_SCREENS/06_memories.png`는 전체/베스트/기념일/장소별 4탭 + 포토그리드 레이아웃이지만, 이번 스코프는 **전체/베스트 2탭만, 기존 리스트 카드 레이아웃 유지**로 사용자가 확정했다(기념일·장소별은 분류 기준 데이터가 없어 별도 논의 필요, 포토그리드 전환은 요청받지 않음). 완료 후 스크린샷은 "2탭/리스트형"이 의도된 축소 스코프임을 인지하고 대조한다.

---

## Task 1 — 필터 탭 렌더 + 필터링 테스트 추가

**Files:**
- Modify: `__tests__/memories-screen-contract.test.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

`date_memories` mock에 `want_again: false`인 두 번째 항목을 추가:

```tsx
        if (table === 'date_memories') {
          return makeBuilder({
            data: [
              {
                id: 'm1', card_id: 'card1', title: '성수동 감성 데이트', review: '카페가 특히 좋았어요',
                want_again: true, created_at: '2026-07-15T00:00:00Z', photo_url: null,
              },
              {
                id: 'm2', card_id: 'card2', title: '한강 피크닉', review: '그냥 그랬어요',
                want_again: false, created_at: '2026-07-10T00:00:00Z', photo_url: null,
              },
            ],
          });
        }
```

`date_cards` mock도 `card2` 항목을 추가:

```tsx
        if (table === 'date_cards') {
          return makeBuilder({
            data: [
              { id: 'card1', title: '성수동 감성 데이트', mode: 'make_course', estimated_time: '약 3시간', estimated_budget: '5만원', tags: ['산책', '카페'] },
              { id: 'card2', title: '한강 피크닉', mode: 'make_course', estimated_time: '약 2시간', estimated_budget: '2만원', tags: ['한강'] },
            ],
          });
        }
```

새 테스트 케이스 추가:

```tsx
  it('필터 탭(전체/베스트)을 렌더한다', async () => {
    const tree = await render();
    const txt = allText(tree);
    expect(txt).toContain('memories.filterAll');
    expect(txt).toContain('memories.filterBest');
  });

  it('기본 탭(전체)은 두 추억을 모두 보여준다', async () => {
    const tree = await render();
    const txt = allText(tree);
    expect(txt).toContain('성수동 감성 데이트');
    expect(txt).toContain('한강 피크닉');
  });

  it('베스트 탭을 누르면 want_again=true인 추억만 보여준다', async () => {
    const tree = await render();
    const { TouchableOpacity } = require('react-native');
    const bestTab = tree.root.findAllByType(TouchableOpacity).find((n) => n.props.testID === 'memories-tab-best');
    await TR.act(async () => { bestTab?.props.onPress(); });
    const txt = allText(tree);
    expect(txt).toContain('성수동 감성 데이트');
    expect(txt).not.toContain('한강 피크닉');
  });
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx jest memories-screen-contract`
Expected: FAIL — `memories.filterAll`/`memories.filterBest` 텍스트 없음, `memories-tab-best` testID 없음.

- [ ] **Step 3: 로케일 키 추가**

`locales/ko/memories.json`의 `untitled` 다음 줄에 추가:

```json
    "untitled": "추억",
    "filterAll": "전체",
    "filterBest": "베스트"
```

`locales/en/memories.json`도 동일 위치(파일이 없다면 `locales/en/memories.json`을 열어 `untitled` 키 다음에 추가):

```json
    "untitled": "Memory",
    "filterAll": "All",
    "filterBest": "Best"
```

- [ ] **Step 4: `app/(tabs)/memories.tsx`에 탭 상태 + 필터링 추가**

`useState` 선언부 근처에 추가:

```ts
  const [activeFilter, setActiveFilter] = useState<'all' | 'best'>('all');
```

`wantAgainCount`/`thisMonthCount` 계산 다음, `stats` 배열 위에 추가:

```ts
  const filteredItems = activeFilter === 'best' ? items.filter((i) => i.want_again) : items;
```

`FlatList`의 `data={items}` → `data={filteredItems}`로 교체하고, `ListHeaderComponent`의 통계 카드(`s.statsCard` View) 바로 아래에 탭 바를 추가:

```tsx
            ListHeaderComponent={
              <>
                <View style={s.statsCard}>
                  {/* 기존 통계 카드 내용 그대로 */}
                </View>
                <View style={s.tabBar}>
                  {(['all', 'best'] as const).map((tab) => (
                    <TouchableOpacity
                      key={tab}
                      testID={`memories-tab-${tab}`}
                      onPress={() => setActiveFilter(tab)}
                      style={[s.tabBtn, activeFilter === tab && s.tabBtnActive]}
                      activeOpacity={0.85}
                    >
                      <Text style={[s.tabBtnText, activeFilter === tab && s.tabBtnTextActive]}>
                        {t(tab === 'all' ? 'memories.filterAll' : 'memories.filterBest')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            }
```

(기존 `<View style={s.statsCard}>...</View>` JSX 블록은 그대로 두고 `<>...</>` Fragment로 감싸 탭 바만 형제 요소로 추가하면 된다.)

스타일 추가:

```ts
  tabBar: { flexDirection: 'row', gap: SP.sm, marginBottom: SP.lg },
  tabBtn: {
    flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center',
    borderRadius: R.btn, borderWidth: 1, borderColor: C.border, backgroundColor: C.white,
  },
  tabBtnActive: { backgroundColor: C.pinkLight, borderColor: C.pinkBorder },
  tabBtnText: { fontSize: 13, fontWeight: '600', color: C.textSub },
  tabBtnTextActive: { color: C.pinkDeep, fontWeight: '700' },
```

- [ ] **Step 5: 테스트 실행 → 통과 확인**

Run: `npx jest memories-screen-contract memories.test`
Expected: PASS

- [ ] **Step 6: 전체 검증**

Run: `npm run validate && npx jest`
Expected: 모두 PASS

- [ ] **Step 7: 커밋**

```bash
git add app/\(tabs\)/memories.tsx __tests__/memories-screen-contract.test.tsx locales/ko/memories.json locales/en/memories.json
git commit -m "feat(memories): 전체/베스트 필터 탭 추가"
```

---

## Task 2 — 목업 대조 시각 검증

- [ ] 시뮬레이터에서 `/(tabs)/memories` 렌더, 탭 전환(전체↔베스트) 육안 확인.
- [ ] `06_memories.png`와 나란히 비교 — 색상/타이포/카드 스타일은 이미 목업 기반(RENEW)이라 일치할 것, 탭 개수(2 vs 4)와 레이아웃(리스트 vs 포토그리드) 차이는 의도된 축소 스코프임을 재확인.
- [ ] `/ss-verify` 실행해 점수 확인, 80 미만이면 수정 후 재확인.
- [ ] `RESULT.md`/`PLAN.md` 갱신 — "기념일"/"장소별" 탭과 포토그리드 레이아웃은 데이터 모델 설계가 필요해 다음 세션으로 이월된다고 명시.

---

## Self-Review 메모 (작성자용, 실행 불필요)

- "기념일"/"장소별" 탭, 포토그리드 레이아웃 전환은 사용자가 명시적으로 이번 스코프에서 제외 — 별도 논의 없이 착수하지 말 것.
- 탭 전환은 클라이언트 필터링뿐이라 재조회(loadMemories) 불필요 — `useFocusEffect`는 기존 그대로 둔다.
