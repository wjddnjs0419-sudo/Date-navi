# Candidates·Plans 구조 갭 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `우리 후보`(candidates) 화면의 필터 체계를 목업(전체/서로 좋아요/내가 저장/상대가 저장 + 정렬) 기준으로 재구성하고, `데이트 계획`(plans) 화면에 예정/조율 중/완료 상태 탭을 추가한다.

**Architecture:** 두 화면 모두 기존 Supabase 직접 쿼리 + 클라이언트 분류 패턴을 유지한다. 새 분류 로직(필터 매칭, 정렬, 조율중 판정)은 순수 함수로 분리해 유닛 테스트로 검증하고, 화면 컴포넌트는 그 함수의 결과만 렌더한다. 사진(썸네일) 연동은 API 키가 아직 없어 이번 플랜의 스코프에서 완전히 제외한다 — 관련 컬럼/코드도 추가하지 않는다(반쪽 구현 방지).

**Tech Stack:** React Native(Expo Router), Supabase JS, react-i18next, Jest + react-test-renderer.

**세션 결정 사항 (사용자 확인 완료):**
- 사진: 이번 플랜에서 완전히 제외. 다음에 Google Places API 키가 준비되면 별도 플랜으로 진행.
- candidates 필터: 목업 체계(전체/서로 좋아요/내가 저장/상대가 저장)로 전면 교체. "내가 저장"/"상대가 저장"은 `source==='manual'` 카드에 한해 `created_by` 기준으로 판정한다(AI 카드는 "좋아요 미정"으로 표시) — AI 카드는 특정 파트너가 "저장"한 게 아니라 둘을 위해 생성된 카드이므로.
- plans "조율 중" = 파트너에게 제안(`soft_messages.card_id`)했지만 아직 상대가 반응(`reactions`)하지 않은, `status='active'` 카드.
- "필터" 고급 버튼(목업 우측 아이콘)은 내용이 정의되어 있지 않아 이번 스코프에서 제외 — 필터 탭 4종 + 정렬 드롭다운만 구현.
- "조율 중" 카드는 아직 날짜/시간이 확정되지 않은 제안 단계이므로 목업의 날짜·시간 표시 대신 "상대의 응답을 기다리는 중" 상태 문구로 대체한다(우리 데이터 모델상 날짜 확정은 곧 status='confirmed' 전환과 동시에 일어나 "조율 중" 카드엔 confirmed_date가 없음).

---

## Task 1 — candidates: `created_by` 로드 + 새 필터/배지 순수 함수

**Files:**
- Modify: `app/(tabs)/candidates.tsx`
- Test: `__tests__/candidates-filter-logic.test.ts` (신규)

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// __tests__/candidates-filter-logic.test.ts
import { matchesFilter, cardBadgeStatus, sortCards } from '../app/(tabs)/candidates';

const base = {
  id: 'c1', title: '', summary: '', estimated_time: '', estimated_budget: '',
  tags: [], mode: 'make_course', source: 'ai' as const, created_at: '2026-07-01T00:00:00Z',
  created_by: 'u1',
  myReaction: null, partnerReaction: null,
  myConditionTag: null, partnerConditionTag: null,
};

describe('matchesFilter', () => {
  it('all은 항상 true', () => {
    expect(matchesFilter(base, 'all', 'u1')).toBe(true);
  });

  it('mutual은 둘 다 love/like일 때만 true', () => {
    const mutual = { ...base, myReaction: 'love' as const, partnerReaction: 'like' as const };
    expect(matchesFilter(mutual, 'mutual', 'u1')).toBe(true);
    expect(matchesFilter(base, 'mutual', 'u1')).toBe(false);
  });

  it('mine은 source=manual + created_by===me 일 때만 true', () => {
    const mine = { ...base, source: 'manual' as const, created_by: 'u1' };
    const aiCard = { ...base, source: 'ai' as const, created_by: 'u1' };
    expect(matchesFilter(mine, 'mine', 'u1')).toBe(true);
    expect(matchesFilter(aiCard, 'mine', 'u1')).toBe(false);
  });

  it('partner는 source=manual + created_by!==me 일 때만 true', () => {
    const partnerCard = { ...base, source: 'manual' as const, created_by: 'u2' };
    expect(matchesFilter(partnerCard, 'partner', 'u1')).toBe(true);
    expect(matchesFilter({ ...partnerCard, created_by: 'u1' }, 'partner', 'u1')).toBe(false);
  });
});

describe('cardBadgeStatus', () => {
  it('상호 긍정 반응이면 mutual', () => {
    const mutual = { ...base, myReaction: 'love' as const, partnerReaction: 'like' as const };
    expect(cardBadgeStatus(mutual, 'u1')).toBe('mutual');
  });

  it('manual + 내가 만든 카드면 mine', () => {
    expect(cardBadgeStatus({ ...base, source: 'manual' as const, created_by: 'u1' }, 'u1')).toBe('mine');
  });

  it('manual + 상대가 만든 카드면 partner', () => {
    expect(cardBadgeStatus({ ...base, source: 'manual' as const, created_by: 'u2' }, 'u1')).toBe('partner');
  });

  it('ai 카드이고 상호 긍정 아니면 undecided', () => {
    expect(cardBadgeStatus(base, 'u1')).toBe('undecided');
  });
});

describe('sortCards', () => {
  const older = { ...base, id: 'a', created_at: '2026-07-01T00:00:00Z' };
  const newer = { ...base, id: 'b', created_at: '2026-07-10T00:00:00Z' };

  it('newest는 최신이 먼저', () => {
    expect(sortCards([older, newer], 'newest').map(c => c.id)).toEqual(['b', 'a']);
  });

  it('oldest는 오래된 게 먼저', () => {
    expect(sortCards([newer, older], 'oldest').map(c => c.id)).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx jest candidates-filter-logic -t "" `
Expected: FAIL — `matchesFilter`/`cardBadgeStatus`/`sortCards`가 `app/(tabs)/candidates.tsx`에서 export되지 않음.

- [ ] **Step 3: `CardWithReactions` 타입에 `created_by` 추가, 쿼리에 필드 추가, 순수 함수 export**

`app/(tabs)/candidates.tsx`의 타입/쿼리/필터 섹션을 아래로 교체한다.

```ts
type ReactionType = 'love' | 'like' | 'burden' | 'next_time';
type ConditionTag = 'change_place' | 'closer' | 'indoor';

export type CardWithReactions = {
  id: string; title: string; summary: string;
  estimated_time: string; estimated_budget: string;
  tags: string[]; mode: string; source: string; created_at: string;
  created_by: string;
  myReaction: ReactionType | null; partnerReaction: ReactionType | null;
  myConditionTag: ConditionTag | null; partnerConditionTag: ConditionTag | null;
};
type BucketItem = {
  id: string; item: string; status: string;
  user_id: string; created_at: string;
  myReaction: 'love' | 'next_time' | null;
  partnerReaction: 'love' | 'next_time' | null;
};
export type FilterTab = 'all' | 'mutual' | 'mine' | 'partner' | 'bucket';
export type SortOrder = 'newest' | 'oldest';

const POSITIVE_REACTIONS: ReactionType[] = ['love', 'like'];
const isPositive = (r: ReactionType | null) => !!r && POSITIVE_REACTIONS.includes(r);

// 필터 탭 매칭. 'mine'/'partner'는 직접 추가한(source=manual) 카드에만 적용된다 —
// AI 카드는 특정 파트너가 "저장"한 게 아니라 둘을 위해 생성된 카드라 대상이 아니다.
export function matchesFilter(c: CardWithReactions, f: FilterTab, myId: string): boolean {
  if (f === 'all') return true;
  if (f === 'mutual') return isPositive(c.myReaction) && isPositive(c.partnerReaction);
  if (f === 'mine') return c.source === 'manual' && c.created_by === myId;
  if (f === 'partner') return c.source === 'manual' && c.created_by !== myId;
  return false; // bucket은 별도 상태(bucketItems)로 처리됨
}

// 카드 상단 배지에 쓰이는 단일 상태. matchesFilter와 동일한 우선순위(mutual 우선)를 따른다.
export function cardBadgeStatus(c: CardWithReactions, myId: string): 'mutual' | 'mine' | 'partner' | 'undecided' {
  if (isPositive(c.myReaction) && isPositive(c.partnerReaction)) return 'mutual';
  if (c.source === 'manual') return c.created_by === myId ? 'mine' : 'partner';
  return 'undecided';
}

export function sortCards(list: CardWithReactions[], order: SortOrder): CardWithReactions[] {
  const sorted = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return order === 'oldest' ? sorted : sorted.reverse();
}
```

`loadCards()` 안의 Supabase select와 매핑도 `created_by`를 포함하도록 수정한다:

```ts
      const { data: rawCardRows } = await supabase
        .from('date_cards')
        .select('id, title, summary, estimated_time, estimated_budget, tags, mode, source, created_by, created_at, content_i18n')
        .eq('couple_id', profile.couple_id)
        .eq('status', 'active')
        .order('created_at', { ascending: false });
```

(`localizeCardContent`가 반환하는 객체는 이미 원본 필드를 spread하므로 `created_by`는 자동으로 살아남는다. `setCards`의 매핑 리터럴에도 변화 없음 — `...card`로 이미 포함됨.)

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npx jest candidates-filter-logic -t ""`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add app/\(tabs\)/candidates.tsx __tests__/candidates-filter-logic.test.ts
git commit -m "feat(candidates): 목업 필터 체계용 순수 분류 함수 추가"
```

---

## Task 2 — candidates: 필터 칩 4종 + 배지 렌더링 교체

**Files:**
- Modify: `app/(tabs)/candidates.tsx`
- Modify: `__tests__/candidates-screen-contract.test.tsx`
- Modify: `locales/ko/candidates.json`, `locales/en/candidates.json`
- Modify: `components/ui.tsx` (Badge에 `blue`/`orange` 톤 추가)

- [ ] **Step 1: 계약 테스트를 새 필터 라벨 기준으로 고쳐써서 실패시키기**

`__tests__/candidates-screen-contract.test.tsx`의 필터 칩 테스트를 교체:

```tsx
  it('필터 칩(전체/서로 좋아요/내가 저장/상대가 저장)을 렌더한다', async () => {
    const tree = await render();
    expect(tree.root.findAllByType(Chip).length).toBeGreaterThanOrEqual(4);
    const txt = allText(tree);
    expect(txt).toContain('candidates.filterAll');
    expect(txt).toContain('candidates.filterMutual');
    expect(txt).toContain('candidates.filterMine');
    expect(txt).toContain('candidates.filterPartner');
  });

  it('AI 카드(둘 다 좋아요)는 상단 배지에 서로 좋아요 상태를 렌더한다', async () => {
    const tree = await render();
    expect(allText(tree)).toContain('candidates.badgeMutual');
  });
```

같은 파일의 `date_cards` mock 데이터에 `created_by: 'u1'`을 추가한다(현재 `source: 'ai'`이므로 mutual 배지 경로를 테스트).

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx jest candidates-screen-contract`
Expected: FAIL — `candidates.filterMutual` 등 텍스트 없음, `candidates.badgeMutual` 없음.

- [ ] **Step 3: 로케일 키 추가**

`locales/ko/candidates.json`에서 `filterBoth`/`filterConditional`/`filterNextTime`을 지우고 아래로 교체(다른 키는 유지):

```json
    "filterAll": "전체",
    "filterMutual": "서로 좋아요",
    "filterMine": "내가 저장",
    "filterPartner": "상대가 저장",
    "filterBucket": "다음에 만나면",
    "sortNewest": "최신순",
    "sortOldest": "오래된순",
    "badgeMutual": "서로 좋아요",
    "badgeMine": "내가 저장",
    "badgePartner": "상대가 저장",
    "badgeUndecided": "좋아요 미정",
```

`locales/en/candidates.json` 동일 위치, `filterBoth`/`filterConditional`/`filterNextTime` 제거 후:

```json
    "filterAll": "All",
    "filterMutual": "Both liked",
    "filterMine": "I saved it",
    "filterPartner": "Partner saved it",
    "filterBucket": "Next meetup",
    "sortNewest": "Newest",
    "sortOldest": "Oldest",
    "badgeMutual": "Both liked",
    "badgeMine": "I saved it",
    "badgePartner": "Partner saved it",
    "badgeUndecided": "Not decided yet",
```

- [ ] **Step 4: Badge 컴포넌트에 blue/orange 톤 추가**

`components/ui.tsx`의 `BadgeTone`/`BADGE_TONES`를 수정:

```ts
type BadgeTone = 'gray' | 'pink' | 'mint' | 'lavender' | 'blue' | 'orange';
const BADGE_TONES: Record<BadgeTone, { bg: string; fg: string }> = {
  gray: { bg: C.gray, fg: C.textSub },
  pink: { bg: C.pinkLight, fg: C.pinkDeep },
  mint: { bg: C.mint, fg: C.mintFg },
  lavender: { bg: C.lavender, fg: C.lavenderFg },
  blue: { bg: '#E8F1FC', fg: C.catCafe },
  orange: { bg: C.cream, fg: C.creamFg },
};
```

- [ ] **Step 5: candidates.tsx 필터/배지 렌더 로직 교체**

`FILTER_LABEL`/`FILTERS`를 교체:

```ts
  const FILTER_LABEL: Record<FilterTab, string> = {
    all: t('candidates.filterAll'),
    mutual: t('candidates.filterMutual'),
    mine: t('candidates.filterMine'),
    partner: t('candidates.filterPartner'),
    bucket: t('candidates.filterBucket'),
  };
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  ...
  const FILTERS: FilterTab[] = isDateModeEnabled('next_meet')
    ? ['all', 'mutual', 'mine', 'partner', 'bucket']
    : ['all', 'mutual', 'mine', 'partner'];
```

`filterCount`/`filtered` 계산을 교체:

```ts
  function filterCount(f: FilterTab): number {
    if (f === 'all') return cards.length;
    if (f === 'bucket') return bucketItems.length;
    return cards.filter(c => matchesFilter(c, f, currentUserId ?? '')).length;
  }

  const filtered = sortCards(
    activeFilter === 'all' ? cards : cards.filter(c => matchesFilter(c, activeFilter, currentUserId ?? '')),
    sortOrder,
  );
```

카드 렌더 블록에서 기존 `bothLove`/배지 JSX를 배지 상태 기반으로 교체:

```tsx
                  {filtered.map((card) => {
                    const { Icon: IconComponent, bg, fg } = getCardStyle(card.tags);
                    const badgeStatus = cardBadgeStatus(card, currentUserId ?? '');
                    const status = reactionStatus(card);
                    const StatusIcon = status.icon === 'spark' ? Sparkles : Heart;
                    const conditions = [card.myConditionTag, card.partnerConditionTag]
                      .filter((c): c is ConditionTag => c != null);
                    const BADGE_TONE_BY_STATUS = { mutual: 'pink', mine: 'blue', partner: 'orange', undecided: 'gray' } as const;
                    return (
                      <SwipeableCard
                        key={card.id}
                        onPress={() => router.push(`/card/${card.id}` as any)}
                        onEdit={() => router.push(`/card/edit/${card.id}` as any)}
                        onDelete={() => confirmDelete(card.id)}
                      >
                      <SoftCard>
                        <View style={s.cardRow}>
                          <View style={[s.cardIcon, { backgroundColor: bg }]}>
                            <IconComponent size={24} strokeWidth={1.8} color={fg} />
                          </View>
                          <View style={s.flex1}>
                            <View style={s.cardTitleRow}>
                              <Text style={s.cardTitle}>{card.title}</Text>
                              <Badge tone={BADGE_TONE_BY_STATUS[badgeStatus]}>
                                {t(`candidates.badge${badgeStatus.charAt(0).toUpperCase()}${badgeStatus.slice(1)}`)}
                              </Badge>
                            </View>
                            <View style={s.chips}>
                              {(card.tags ?? []).slice(0, 3).map((tag, tagIndex) => (
                                <Chip key={`${card.id}-${tag}-${tagIndex}`} tone="gray">{tag}</Chip>
                              ))}
                            </View>
                          </View>
                        </View>
```

(나머지 카드 본문 — summary/estimated_time/statusRow/conditionLine — 은 그대로 둔다. `bothLove`/`badgeRow` 변수·스타일은 더 이상 쓰이지 않으므로 삭제한다.)

- [ ] **Step 6: 테스트 실행 → 통과 확인**

Run: `npx jest candidates-screen-contract candidates-filter-logic`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add app/\(tabs\)/candidates.tsx components/ui.tsx locales/ko/candidates.json locales/en/candidates.json __tests__/candidates-screen-contract.test.tsx
git commit -m "feat(candidates): 필터 칩을 목업 체계(전체/서로좋아요/내가저장/상대가저장)로 교체"
```

---

## Task 3 — 재사용 가능한 `SortDropdown` 컴포넌트

**Files:**
- Modify: `components/ui.tsx`
- Test: `__tests__/sort-dropdown.test.tsx` (신규)

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// __tests__/sort-dropdown.test.tsx
import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { SortDropdown } from '../components/ui';

const TR = require('react-test-renderer') as {
  act: (cb: () => void | Promise<void>) => Promise<void>;
  create: (el: React.ReactElement) => { root: { findAllByType: (t: unknown) => { props: any }[] } };
};

describe('SortDropdown', () => {
  const options = [{ value: 'newest', label: '최신순' }, { value: 'oldest', label: '오래된순' }];

  it('선택된 옵션 라벨을 트리거에 표시한다', async () => {
    let tree!: ReturnType<typeof TR.create>;
    await TR.act(async () => {
      tree = TR.create(<SortDropdown value="newest" options={options} onChange={() => {}} />);
    });
    const texts = tree.root.findAllByType(Text).map(n => n.props.children).flat(Infinity);
    expect(texts).toContain('최신순');
  });

  it('옵션을 누르면 onChange가 그 value로 호출된다', async () => {
    const onChange = jest.fn();
    let tree!: ReturnType<typeof TR.create>;
    await TR.act(async () => {
      tree = TR.create(<SortDropdown value="newest" options={options} onChange={onChange} />);
    });
    await TR.act(async () => {
      tree.root.findAllByType(TouchableOpacity)[0].props.onPress();
    });
    await TR.act(async () => {
      const oldestOption = tree.root.findAllByType(TouchableOpacity)
        .find(n => n.props.testID === 'sort-option-oldest');
      oldestOption?.props.onPress();
    });
    expect(onChange).toHaveBeenCalledWith('oldest');
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx jest sort-dropdown`
Expected: FAIL — `SortDropdown`이 `components/ui.tsx`에서 export되지 않음.

- [ ] **Step 3: `MoreMenu`와 동일한 measure+Modal 패턴으로 구현**

`components/ui.tsx`에 추가(파일 상단에 이미 있는 `ChevronDown` import를 재사용; 없으면 lucide import에 추가):

```tsx
// ─── SortDropdown ─────────────────────────────────────────────────────────────
export function SortDropdown<T extends string>({
  value, options, onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuTop, setMenuTop] = useState(0);
  const triggerRef = useRef<View>(null);
  const current = options.find(o => o.value === value) ?? options[0];

  function openMenu() {
    triggerRef.current?.measureInWindow((_x, y, _w, h) => {
      setMenuTop(y + h + 4);
      setOpen(true);
    });
  }

  return (
    <>
      <TouchableOpacity
        ref={triggerRef as any}
        accessibilityRole="button"
        onPress={openMenu}
        style={sortDropdownS.trigger}
      >
        <Text style={sortDropdownS.triggerText}>{current.label}</Text>
        <ChevronDown size={14} color={C.textSub} strokeWidth={2} />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={sortDropdownS.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[sortDropdownS.menu, { top: menuTop }]} onPress={() => {}}>
            {options.map((opt, i) => (
              <View key={opt.value}>
                {i > 0 && <View style={sortDropdownS.divider} />}
                <TouchableOpacity
                  accessibilityRole="button"
                  testID={`sort-option-${opt.value}`}
                  onPress={() => { setOpen(false); onChange(opt.value); }}
                  style={sortDropdownS.item}
                >
                  <Text style={[sortDropdownS.itemText, opt.value === value && sortDropdownS.itemTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
const sortDropdownS = StyleSheet.create({
  trigger: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    minHeight: 36, paddingHorizontal: 12,
    borderRadius: 18, borderWidth: 1, borderColor: C.border, backgroundColor: C.white,
  },
  triggerText: { fontSize: 12, fontWeight: '600', color: C.textSub },
  backdrop: { flex: 1 },
  menu: {
    position: 'absolute', left: 20, width: 140,
    backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.border,
    shadowColor: C.shadow, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 16,
    elevation: 6, overflow: 'hidden',
  },
  item: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14 },
  itemText: { fontSize: 13, fontWeight: '600', color: C.textSub },
  itemTextActive: { color: C.pinkDeep, fontWeight: '700' },
  divider: { height: 1, backgroundColor: C.border },
});
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npx jest sort-dropdown`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add components/ui.tsx __tests__/sort-dropdown.test.tsx
git commit -m "feat(ui): 재사용 가능한 SortDropdown 컴포넌트 추가"
```

---

## Task 4 — candidates 화면에 정렬 드롭다운 배선

**Files:**
- Modify: `app/(tabs)/candidates.tsx`
- Modify: `__tests__/candidates-screen-contract.test.tsx`

- [ ] **Step 1: 실패하는 테스트 추가**

`__tests__/candidates-screen-contract.test.tsx`에 추가:

```tsx
  it('정렬 드롭다운(최신순)을 렌더한다', async () => {
    const tree = await render();
    expect(allText(tree)).toContain('candidates.sortNewest');
  });
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx jest candidates-screen-contract`
Expected: FAIL

- [ ] **Step 3: 필터 칩 스크롤 위/아래에 정렬 드롭다운 배치**

`app/(tabs)/candidates.tsx` 상단 import에 `SortDropdown`, `SortOrder` 추가:

```ts
import { SoftCard, Chip, Badge, SwipeableCard, MetaChipRow, SortDropdown } from '../../components/ui';
```

필터 `ScrollView` 바로 아래(제안 배너 위)에 삽입:

```tsx
          {activeFilter !== 'bucket' && (
            <View style={s.sortRow}>
              <SortDropdown
                value={sortOrder}
                options={[
                  { value: 'newest' as SortOrder, label: t('candidates.sortNewest') },
                  { value: 'oldest' as SortOrder, label: t('candidates.sortOldest') },
                ]}
                onChange={setSortOrder}
              />
            </View>
          )}
```

스타일 추가:

```ts
  sortRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 },
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npx jest candidates-screen-contract`
Expected: PASS

- [ ] **Step 5: 전체 테스트 스위트 + tsc 확인**

Run: `npm run validate && npx jest`
Expected: 모두 PASS

- [ ] **Step 6: 커밋**

```bash
git add app/\(tabs\)/candidates.tsx __tests__/candidates-screen-contract.test.tsx
git commit -m "feat(candidates): 최신순/오래된순 정렬 드롭다운 배선"
```

---

## Task 5 — plans: "조율 중" 판정 순수 함수

**Files:**
- Modify: `app/plans/index.tsx`
- Test: `__tests__/plans-coordinating-logic.test.ts` (신규)

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// __tests__/plans-coordinating-logic.test.ts
import { computeCoordinatingIds, planTabOf } from '../app/plans/index';

describe('computeCoordinatingIds', () => {
  it('제안은 있지만 상대 반응이 없으면 조율 중', () => {
    const proposals = [{ card_id: 'card1', user_id: 'u1' }];
    const reactions: { card_id: string; user_id: string }[] = [];
    expect(computeCoordinatingIds(proposals, reactions)).toEqual(new Set(['card1']));
  });

  it('제안자 본인의 반응만 있으면 여전히 조율 중', () => {
    const proposals = [{ card_id: 'card1', user_id: 'u1' }];
    const reactions = [{ card_id: 'card1', user_id: 'u1' }];
    expect(computeCoordinatingIds(proposals, reactions)).toEqual(new Set(['card1']));
  });

  it('상대(제안자 아닌 사람)가 반응하면 조율 중에서 빠진다', () => {
    const proposals = [{ card_id: 'card1', user_id: 'u1' }];
    const reactions = [{ card_id: 'card1', user_id: 'u2' }];
    expect(computeCoordinatingIds(proposals, reactions)).toEqual(new Set());
  });
});

describe('planTabOf', () => {
  const coordinating = new Set(['c1']);

  it('status=done이면 done', () => {
    expect(planTabOf({ id: 'c9', status: 'done' }, coordinating)).toBe('done');
  });

  it('status=confirmed면 upcoming', () => {
    expect(planTabOf({ id: 'c9', status: 'confirmed' }, coordinating)).toBe('upcoming');
  });

  it('status=active이고 조율중 목록에 있으면 coordinating', () => {
    expect(planTabOf({ id: 'c1', status: 'active' }, coordinating)).toBe('coordinating');
  });

  it('status=active인데 조율중 목록에 없으면 null(계획 화면에 안 보임)', () => {
    expect(planTabOf({ id: 'c2', status: 'active' }, coordinating)).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx jest plans-coordinating-logic`
Expected: FAIL — 함수 미정의.

- [ ] **Step 3: `app/plans/index.tsx`에 순수 함수 추가**

파일 상단, `groupByMonth` 함수 위에 추가:

```ts
export type PlanTab = 'upcoming' | 'coordinating' | 'done';

// soft_messages(제안) + reactions(반응)로 "조율 중"(제안했지만 상대가 아직 반응 안 함) 카드 id 집합을 구한다.
// 같은 카드에 여러 제안이 있으면 마지막 제안자를 기준으로 판정한다.
export function computeCoordinatingIds(
  proposals: { card_id: string; user_id: string }[],
  reactions: { card_id: string; user_id: string }[],
): Set<string> {
  const proposerByCard = new Map<string, string>();
  for (const p of proposals) proposerByCard.set(p.card_id, p.user_id);

  const result = new Set<string>();
  for (const [cardId, proposerId] of proposerByCard) {
    const reactedByRecipient = reactions.some(r => r.card_id === cardId && r.user_id !== proposerId);
    if (!reactedByRecipient) result.add(cardId);
  }
  return result;
}

export function planTabOf(
  card: { id: string; status: string },
  coordinatingIds: Set<string>,
): PlanTab | null {
  if (card.status === 'done') return 'done';
  if (card.status === 'confirmed') return 'upcoming';
  if (card.status === 'active' && coordinatingIds.has(card.id)) return 'coordinating';
  return null;
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npx jest plans-coordinating-logic`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add app/plans/index.tsx __tests__/plans-coordinating-logic.test.ts
git commit -m "feat(plans): 조율 중 판정 순수 함수 추가"
```

---

## Task 6 — plans: 쿼리 확장 + 탭 상태

**Files:**
- Modify: `app/plans/index.tsx`
- Modify: `__tests__/plans-screen-contract.test.tsx`
- Modify: `locales/ko/plans.json`, `locales/en/plans.json`

- [ ] **Step 1: 계약 테스트를 탭 3종 기준으로 확장해서 실패시키기**

`__tests__/plans-screen-contract.test.tsx`의 supabase mock에 `soft_messages`/`reactions` 테이블 분기와 `status` 필드를 추가하고, 탭 렌더 테스트를 추가한다:

```tsx
jest.mock('../lib/supabase', () => {
  const makeBuilder = (result: unknown) => {
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      not: () => builder,
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () => result,
      then: (resolve: (v: unknown) => void) => resolve(result),
    };
    return builder;
  };
  return {
    supabase: {
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
      from: (table: string) => {
        if (table === 'date_planner_profiles') {
          return makeBuilder({ data: { couple_id: 'c1' } });
        }
        if (table === 'date_cards') {
          return makeBuilder({
            data: [
              {
                id: 'p1', title: '성수동 감성 데이트 코스', tags: ['식사', '카페'], status: 'confirmed',
                confirmed_date: '2026-07-22', confirmed_time: '오후 2:00', confirmed_place: '성수동',
              },
              {
                id: 'p2', title: '와인 바 데이트', tags: ['와인'], status: 'active',
                confirmed_date: null, confirmed_time: null, confirmed_place: null,
              },
            ],
          });
        }
        if (table === 'soft_messages') {
          return makeBuilder({ data: [{ card_id: 'p2', user_id: 'u1' }] });
        }
        if (table === 'reactions') {
          return makeBuilder({ data: [] });
        }
        return makeBuilder({ data: [] });
      },
    },
  };
});
```

테스트 케이스 추가:

```tsx
  it('상태 탭(예정/조율 중/완료)을 렌더한다', async () => {
    const tree = await render();
    const txt = allText(tree);
    expect(txt).toContain('plans.tabUpcoming');
    expect(txt).toContain('plans.tabCoordinating');
    expect(txt).toContain('plans.tabDone');
  });

  it('기본 탭(예정)엔 confirmed 카드만 보인다', async () => {
    const tree = await render();
    const rows = tree.root.findAllByType(PlanListRow);
    expect(rows.length).toBe(1);
    expect(rows[0].props.title).toBe('성수동 감성 데이트 코스');
  });
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx jest plans-screen-contract`
Expected: FAIL

- [ ] **Step 3: 로케일 키 추가**

`locales/ko/plans.json`에 추가:

```json
    "tabUpcoming": "예정",
    "tabCoordinating": "조율 중",
    "tabDone": "완료",
    "coordinatingStatus": "상대의 응답을 기다리는 중",
    "emptyCoordinating": "조율 중인 데이트가 없어요",
    "emptyDone": "완료한 데이트가 없어요"
```

`locales/en/plans.json`에 추가:

```json
    "tabUpcoming": "Upcoming",
    "tabCoordinating": "Coordinating",
    "tabDone": "Done",
    "coordinatingStatus": "Waiting for your partner's response",
    "emptyCoordinating": "No dates being coordinated",
    "emptyDone": "No completed dates yet"
```

- [ ] **Step 4: `app/plans/index.tsx` 쿼리·상태 확장**

`PlanCard` 타입과 로드 로직을 교체:

```ts
type PlanCard = {
  id: string;
  title: string;
  tags: string[];
  status: string;
  confirmed_date: string | null;
  confirmed_time: string | null;
  confirmed_place: string | null;
};
```

`useFocusEffect` 내부 로드 블록을 교체:

```ts
          const { data: rows } = await supabase
            .from('date_cards')
            .select('id, title, tags, status, confirmed_date, confirmed_time, confirmed_place')
            .eq('couple_id', profile.couple_id)
            .in('status', ['active', 'confirmed', 'done'])
            .order('confirmed_date', { ascending: true, nullsFirst: false })
            .order('created_at', { ascending: false });

          const cardRows: PlanCard[] = (rows ?? []).map((r) => ({ ...r, tags: r.tags ?? [] }));

          const activeIds = cardRows.filter((c) => c.status === 'active').map((c) => c.id);
          let coordinatingIds = new Set<string>();
          if (activeIds.length) {
            const { data: proposals } = await supabase
              .from('soft_messages')
              .select('card_id, user_id')
              .eq('couple_id', profile.couple_id)
              .in('card_id', activeIds)
              .not('card_id', 'is', null);
            if (proposals?.length) {
              const { data: rx } = await supabase
                .from('reactions')
                .select('card_id, user_id')
                .in('card_id', proposals.map((p) => p.card_id));
              coordinatingIds = computeCoordinatingIds(proposals, rx ?? []);
            }
          }

          setPlans(cardRows);
          setCoordinatingIds(coordinatingIds);
```

state 선언부에 추가:

```ts
  const [plans, setPlans] = useState<PlanCard[]>([]);
  const [coordinatingIds, setCoordinatingIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<PlanTab>('upcoming');
  const [loading, setLoading] = useState(true);
```

탭별 분류/카운트를 `groups` 계산 위에 추가:

```ts
  const byTab = useMemo(() => {
    const result: Record<PlanTab, PlanCard[]> = { upcoming: [], coordinating: [], done: [] };
    for (const p of plans) {
      const tab = planTabOf(p, coordinatingIds);
      if (tab) result[tab].push(p);
    }
    return result;
  }, [plans, coordinatingIds]);

  const groups = useMemo(() => groupByMonth(byTab[activeTab]), [byTab, activeTab]);
```

- [ ] **Step 5: 테스트 실행 → 통과 확인**

Run: `npx jest plans-screen-contract plans-coordinating-logic`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add app/plans/index.tsx __tests__/plans-screen-contract.test.tsx locales/ko/plans.json locales/en/plans.json
git commit -m "feat(plans): active+제안 카드까지 쿼리 확장, 탭별 분류 상태 추가"
```

---

## Task 7 — plans: 탭 UI + 조율중 화면

**Files:**
- Modify: `app/plans/index.tsx`
- Modify: `__tests__/plans-screen-contract.test.tsx`

- [ ] **Step 1: 조율중 탭 전환 시 상태 문구가 보인다는 테스트 추가**

```tsx
  it('조율 중 탭을 누르면 상대 응답 대기 문구를 보여준다', async () => {
    const tree = await render();
    const tabs = tree.root.findAllByType(TouchableOpacity);
    const coordinatingTab = tabs.find((n) => n.props.testID === 'plans-tab-coordinating');
    await TR.act(async () => { coordinatingTab?.props.onPress(); });
    expect(allText(tree)).toContain('plans.coordinatingStatus');
  });
```

파일 상단 import에 `TouchableOpacity` 추가.

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx jest plans-screen-contract`
Expected: FAIL

- [ ] **Step 3: 탭 바 렌더 + 조율중 전용 렌더 분기 추가**

`app/plans/index.tsx`의 `import` 목록에 `TouchableOpacity` 추가, heading 블록 아래에 탭 바 삽입:

```tsx
        <View style={s.tabBar}>
          {(['upcoming', 'coordinating', 'done'] as PlanTab[]).map((tab) => (
            <TouchableOpacity
              key={tab}
              testID={`plans-tab-${tab}`}
              onPress={() => setActiveTab(tab)}
              style={[s.tabBtn, activeTab === tab && s.tabBtnActive]}
              activeOpacity={0.85}
            >
              <Text style={[s.tabBtnText, activeTab === tab && s.tabBtnTextActive]}>
                {t(`plans.tab${tab.charAt(0).toUpperCase()}${tab.slice(1)}`)} {byTab[tab].length}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
```

기존 `plans.length === 0` empty 분기를 `byTab[activeTab].length === 0`으로, 본문 렌더를 탭별로 교체:

```tsx
        {loading ? (
          <ActivityIndicator color={C.pink} style={s.loader} />
        ) : byTab[activeTab].length === 0 ? (
          <View style={s.emptyWrap}>
            <View style={s.emptyIcon}>
              <CalendarHeart size={44} strokeWidth={1.5} color={C.pinkDeep} />
            </View>
            <Text style={s.emptyTitle}>
              {activeTab === 'upcoming' ? t('plans.emptyTitle')
                : activeTab === 'coordinating' ? t('plans.emptyCoordinating')
                : t('plans.emptyDone')}
            </Text>
            {activeTab === 'upcoming' && <Text style={s.emptySub}>{t('plans.emptySub')}</Text>}
          </View>
        ) : activeTab === 'coordinating' ? (
          <View style={s.coordinatingList}>
            {byTab.coordinating.map((p) => (
              <SoftCard key={p.id} style={s.groupCard}>
                <PlanListRow
                  title={p.title}
                  dateLabel={t('plans.coordinatingStatus')}
                  days={0}
                  onPress={() => router.push(`/card/${p.id}` as any)}
                />
              </SoftCard>
            ))}
          </View>
        ) : (
          <View style={s.timeline}>
            {groups.map((group) => (
              <View key={group.key} style={s.group}>
                {group.key !== 'undated' && (
                  <SectionLabel>
                    {t('plans.monthLabel', { month: group.month, year: group.year })}
                  </SectionLabel>
                )}
                <SoftCard style={s.groupCard}>
                  {group.items.map((p, i) => {
                    const dateLabel = [
                      p.confirmed_date ? formatDateLabel(p.confirmed_date, '', language) : '',
                      p.confirmed_time ?? '',
                    ].filter(Boolean).join(' ');
                    return (
                      <View key={p.id}>
                        {i > 0 && <View style={s.rowDivider} />}
                        <PlanListRow
                          title={p.title}
                          dateLabel={dateLabel || t('plans.noDateTimePlace')}
                          days={daysUntilIso(p.confirmed_date)}
                          onPress={() => router.push(`/card/${p.id}` as any)}
                        />
                      </View>
                    );
                  })}
                </SoftCard>
              </View>
            ))}
          </View>
        )}
```

`PlanListRow`의 `days={0}`은 조율중 카드엔 날짜가 없어 D-day 배지를 의미 없게 만든다 — `PlanListRow`에 `showDday?: boolean`(기본 true) prop을 추가해 조율중 행에서만 숨긴다.

`components/ui.tsx`의 `PlanListRow`를 수정:

```tsx
export function PlanListRow({
  title, dateLabel, days, imageSource, onPress, showDday = true,
}: {
  title: string;
  dateLabel: string;
  days: number;
  imageSource?: ImageSourcePropType;
  onPress: () => void;
  showDday?: boolean;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={planRowS.row}>
      {imageSource
        ? <Image source={imageSource} style={planRowS.thumb} />
        : <View style={planRowS.thumbPlaceholder} />}
      <View style={planRowS.body}>
        <Text style={planRowS.title} numberOfLines={1}>{title}</Text>
        <View style={planRowS.dateRow}>
          <Calendar size={13} color={C.textSub} strokeWidth={2} />
          <Text style={planRowS.date}>{dateLabel}</Text>
        </View>
      </View>
      <View style={planRowS.right}>
        {showDday && <DdayBadge days={days} />}
        <ChevronRight size={18} color={C.textLight} strokeWidth={2} />
      </View>
    </TouchableOpacity>
```

조율중 렌더 블록의 `PlanListRow`에 `showDday={false}` 추가.

`plans/index.tsx` 스타일에 추가:

```ts
  tabBar: { flexDirection: 'row', gap: SP.sm, marginBottom: SP.lg },
  tabBtn: {
    flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center',
    borderRadius: R.btn, borderWidth: 1, borderColor: C.border, backgroundColor: C.white,
  },
  tabBtnActive: { backgroundColor: C.pinkLight, borderColor: C.pinkBorder },
  tabBtnText: { fontSize: 13, fontWeight: '600', color: C.textSub },
  tabBtnTextActive: { color: C.pinkDeep, fontWeight: '700' },
  coordinatingList: { gap: SP.sm },
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npx jest plans-screen-contract plans-coordinating-logic`
Expected: PASS

- [ ] **Step 5: 전체 검증**

Run: `npm run validate && npx jest`
Expected: 전부 PASS

- [ ] **Step 6: 커밋**

```bash
git add app/plans/index.tsx components/ui.tsx __tests__/plans-screen-contract.test.tsx
git commit -m "feat(plans): 예정/조율 중/완료 탭 UI 추가"
```

---

## Task 8 — 시뮬레이터 실렌더 검증 (ss-verify)

- [ ] candidates 화면: 필터 4종 전환 + 정렬 드롭다운 동작을 시뮬레이터에서 육안 확인.
- [ ] plans 화면: 예정/조율 중/완료 탭 전환, 조율 중 빈 상태·목록 상태 육안 확인.
- [ ] `/ss-verify` 실행해 두 화면 점수 확인, 80 미만이면 수정 후 재확인.
- [ ] `RESULT.md`에 세션 기록 추가, `PLAN.md` Pending Approval 갱신.

---

## Self-Review 메모 (작성자용, 실행 불필요)

- 사진/썸네일: 의도적으로 스코프 제외(위 결정 사항 참조) — `PlanListRow`의 `imageSource`는 기존 그대로 미사용 플레이스홀더.
- "필터" 고급 버튼: 목업엔 있으나 내용 미정의라 제외 — 필요해지면 별도 플랜.
- `card/confirm.tsx`의 확정 흐름(날짜 저장 시 즉시 status='confirmed')은 변경하지 않음 — "조율 중"은 순수 조회 계층에서만 판정.
