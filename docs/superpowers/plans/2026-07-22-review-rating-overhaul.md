# review 화면 별점(1~5) + 감정 5종 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `app/card/review.tsx`에 목업(`09_review.png`)의 "전체 별점"(1~5점 별) 바를 추가하고, 감정 선택지를 4개(love/good/ok/change)에서 5개(최고였어요/좋았어요/무난했어요/아쉬웠어요/별로였어요)로 확장한다.

**Architecture:** 감정 선택은 지금도 DB에 원문 그대로 저장되지 않고 `want_again` boolean으로만 변환돼 저장되므로, 키 이름을 바꾸는 건 순수 코드/문구 변경이다(마이그레이션 불필요). 별점(1~5)은 지금까지 없던 새 데이터라 `date_memories`에 `rating integer` 컬럼을 추가하는 마이그레이션이 필요하다. 두 입력 모두 필수로 유지한다(목업이 같은 화면에서 나란히 요구).

**Tech Stack:** React Native(Expo Router), Supabase(Postgres migration), react-i18next, Jest + react-test-renderer.

**목업 대조 메모(구현 전 확인 완료):** `09_review.png` — 헤딩 "어땠나요?" → "전체 별점"(별 5개, 탭으로 1~5점 선택) → 감정 5종 아이콘 그리드(최고였어요/좋았어요/무난했어요/아쉬웠어요/별로였어요) → "AI 요약 도움" 카드. **AI 요약 카드는 이번 스코프에서 제외**(새 AI 백엔드 필요, 사용자 확정) — 이 계획은 별점 바 + 감정 5종까지만 다룬다.

---

## Task 1 — `date_memories.rating` 컬럼 마이그레이션

**Files:**
- Create: `supabase/migrations/20260722100000_date_memories_add_rating.sql`
- Test: `__tests__/dateMemoriesRatingMigration.test.ts` (신규)

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// __tests__/dateMemoriesRatingMigration.test.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('date_memories rating 컬럼 마이그레이션', () => {
  const sql = readFileSync(
    join(__dirname, '../supabase/migrations/20260722100000_date_memories_add_rating.sql'),
    'utf8',
  ).toLowerCase();

  it('1~5점 범위의 rating 정수 컬럼을 추가한다', () => {
    expect(sql).toContain('alter table public.date_memories');
    expect(sql).toContain('add column if not exists rating integer');
    expect(sql).toContain('check (rating is null or (rating >= 1 and rating <= 5))');
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx jest dateMemoriesRatingMigration`
Expected: FAIL — 마이그레이션 파일이 없음.

- [ ] **Step 3: 마이그레이션 작성**

```sql
-- supabase/migrations/20260722100000_date_memories_add_rating.sql
-- 목업(09_review)의 "전체 별점"(1~5점) 저장용 컬럼.
alter table public.date_memories
  add column if not exists rating integer;

alter table public.date_memories
  drop constraint if exists date_memories_rating_check;

alter table public.date_memories
  add constraint date_memories_rating_check
  check (rating is null or (rating >= 1 and rating <= 5));
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npx jest dateMemoriesRatingMigration`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add supabase/migrations/20260722100000_date_memories_add_rating.sql __tests__/dateMemoriesRatingMigration.test.ts
git commit -m "feat(db): date_memories에 1~5점 rating 컬럼 추가"
```

(주의: 이 마이그레이션은 `mcp__plugin_supabase_supabase__apply_migration`으로 실제 프로젝트에 배포해야 컬럼이 생긴다 — 로컬 jest 테스트는 SQL 파일 내용만 검증하고 실제 DB에 적용하지 않는다. Task 3에서 `insert`가 이 컬럼을 쓰므로, 배포 순서를 지킬 것.)

---

## Task 2 — 감정 선택지 4→5 확장

**Files:**
- Modify: `app/card/review.tsx`
- Modify: `__tests__/card-review-icons.test.ts`
- Modify: `locales/ko/review.json`, `locales/en/review.json`

- [ ] **Step 1: 기존 테스트를 새 키 기준으로 고쳐써서 실패시키기**

`__tests__/card-review-icons.test.ts`의 세 번째 `it` 블록을 교체:

```ts
  it('gives each rating a distinct pastel tone (amazing/good/okay/meh/bad)', () => {
    expect(source).toMatch(/amazing:[\s\S]{0,40}C\.danger/);
    expect(source).toMatch(/good:[\s\S]{0,40}C\.creamFg/);
    expect(source).toMatch(/okay:[\s\S]{0,40}C\.mintFg/);
    expect(source).toMatch(/meh:[\s\S]{0,40}C\.lavenderFg/);
    expect(source).toMatch(/bad:[\s\S]{0,40}C\.grayFg/);
  });
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx jest card-review-icons`
Expected: FAIL — `amazing`/`okay`/`meh`/`bad` 키가 아직 코드에 없음(현재는 `love`/`good`/`ok`/`change`).

- [ ] **Step 3: 로케일 키 교체**

`locales/ko/review.json`의 `ratings` 배열을 교체:

```json
    "ratings": [
      { "key": "amazing", "label": "최고였어요" },
      { "key": "good", "label": "좋았어요" },
      { "key": "okay", "label": "무난했어요" },
      { "key": "meh", "label": "아쉬웠어요" },
      { "key": "bad", "label": "별로였어요" }
    ],
```

`locales/en/review.json`의 `ratings` 배열을 교체:

```json
    "ratings": [
      { "key": "amazing", "label": "Amazing" },
      { "key": "good", "label": "Good" },
      { "key": "okay", "label": "It was okay" },
      { "key": "meh", "label": "A bit disappointing" },
      { "key": "bad", "label": "Not great" }
    ],
```

- [ ] **Step 4: `app/card/review.tsx` 아이콘/톤/상태변수 교체**

임포트 교체:

```ts
import { Star, Smile, Meh, Frown, Angry, Camera } from 'lucide-react-native';
```

`RATING_ICONS`/`RATING_TONES`와 `rating` state를 교체(감정 선택 state는 별점과 이름이 겹치지 않도록 `mood`로 개명):

```ts
const MOOD_ICONS: Record<string, typeof Star> = {
  amazing: Star,
  good: Smile,
  okay: Meh,
  meh: Frown,
  bad: Angry,
};

// 목업(09_review)의 emoji 5종을 lock의 파스텔 톤 패밀리로 재현한다.
const MOOD_TONES: Record<string, { fg: string; bg: string }> = {
  amazing: { fg: C.danger, bg: C.pinkLight },
  good: { fg: C.creamFg, bg: C.cream },
  okay: { fg: C.mintFg, bg: C.mint },
  meh: { fg: C.lavenderFg, bg: C.lavender },
  bad: { fg: C.grayFg, bg: C.gray },
};
```

`useState` 선언부:

```ts
  const [mood, setMood] = useState<string | null>(null);
```

렌더의 `RATING_ICONS`/`RATING_TONES`/`rating` 참조를 `MOOD_ICONS`/`MOOD_TONES`/`mood`로 전부 교체(변수명만 바뀜, 구조 동일):

```tsx
          <View style={styles.ratingGrid}>
            {c.ratings.map((item: { key: keyof typeof MOOD_ICONS; label: string }) => {
              const sel = mood === item.key;
              const Icon = MOOD_ICONS[item.key];
              const tone = MOOD_TONES[item.key];
              return (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.ratingCard, sel && { backgroundColor: tone.bg, borderColor: tone.fg, borderWidth: 1.5 }]}
                  onPress={() => setMood(item.key)}
                  activeOpacity={0.75}
                >
                  <View style={[styles.ratingIconWrap, sel && { backgroundColor: C.white }]}>
                    <Icon size={18} color={sel ? tone.fg : C.textSub} strokeWidth={2} />
                  </View>
                  <Text style={[styles.ratingLabel, sel && { color: tone.fg, fontWeight: '600' }]}>{item.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
```

`handleSave`의 검증/파생 로직 교체:

```ts
    if (!mood) { Alert.alert('', c.noRatingError); return; }
    ...
    const wantAgain = mood === 'amazing' || mood === 'good';
```

(그리드가 5개라 `ratingCard`의 `width: '47%'` 2열 배치는 5번째 항목이 혼자 남는 줄이 된다 — 목업도 마지막 줄 1개만 있는 비대칭 그리드라 스타일 변경 불필요.)

- [ ] **Step 5: 테스트 실행 → 통과 확인**

Run: `npx jest card-review-icons`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add app/card/review.tsx __tests__/card-review-icons.test.ts locales/ko/review.json locales/en/review.json
git commit -m "feat(review): 감정 선택지 4종→5종(amazing/good/okay/meh/bad) 확장"
```

---

## Task 3 — "전체 별점"(1~5점) 바 추가

**Files:**
- Modify: `app/card/review.tsx`
- Test: `__tests__/card-review-screen-contract.test.tsx` (신규)
- Modify: `locales/ko/review.json`, `locales/en/review.json`

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// __tests__/card-review-screen-contract.test.tsx
import React from 'react';
import { TouchableOpacity, Text } from 'react-native';

const mockInsert = jest.fn(async () => ({ error: null }));
const mockUpdate = jest.fn(() => ({ eq: async () => ({ error: null }) }));
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'card-1' }),
  useRouter: () => ({ replace: mockReplace }),
  useFocusEffect: (cb: () => void) => require('react').useEffect(() => { cb(); }, []),
}));

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: async () => ({ granted: false }),
  launchImageLibraryAsync: async () => ({ canceled: true }),
}));

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

jest.mock('../lib/i18n', () => {
  const ko = require('../locales/ko/review.json').review;
  const common = { cancel: '취소', error: '오류', saving: '저장 중' };
  return {
    useI18n: () => ({
      strings: { review: ko, common, card: { memory: {} } },
    }),
  };
});

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: (table: string) => {
      if (table === 'date_planner_profiles') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { couple_id: 'c1' } }) }) }) };
      }
      if (table === 'date_memories') {
        return { insert: mockInsert };
      }
      if (table === 'date_cards') {
        return { update: mockUpdate };
      }
      return {};
    },
  },
}));

const TR = require('react-test-renderer') as {
  act: (cb: () => void | Promise<void>) => Promise<void>;
  create: (el: React.ReactElement) => { root: { findAllByType: (t: unknown) => { props: any }[] } };
};

const ReviewScreen = require('../app/card/review').default;

async function render() {
  let tree!: ReturnType<typeof TR.create>;
  await TR.act(async () => { tree = TR.create(<ReviewScreen />); });
  await TR.act(async () => {});
  return tree;
}

describe('데이트 후기 화면 — 별점 바', () => {
  it('전체 별점 라벨과 별 5개를 렌더한다', async () => {
    const tree = await render();
    const txt = tree.root.findAllByType(Text).map((n) => n.props.children).flat(Infinity).join(' ');
    expect(txt).toContain('전체 별점');
    const stars = tree.root.findAllByType(TouchableOpacity).filter((n) => String(n.props.testID ?? '').startsWith('review-star-'));
    expect(stars.length).toBe(5);
  });

  it('별점을 선택하지 않으면 저장 시 별점 에러를 띄운다(mood는 선택함)', async () => {
    const { Alert } = require('react-native');
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const tree = await render();

    const moodBtn = tree.root.findAllByType(TouchableOpacity).find((n) => n.props.testID === undefined && n.props.onPress?.toString().includes('setMood'));
    // mood 그리드는 testID가 없으므로 텍스트로 첫 번째 카드를 찾아 누른다.
    const firstMoodCard = tree.root.findAllByType(TouchableOpacity)[0];
    await TR.act(async () => { firstMoodCard.props.onPress(); });

    const saveBtn = tree.root.findAllByType(require('../components/ui').BigButton)[0];
    await TR.act(async () => { saveBtn.props.onPress(); });

    expect(Alert.alert).toHaveBeenCalledWith('', '별점을 선택해주세요.');
  });

  it('별 3번째를 누르면 rating=3으로 저장한다', async () => {
    const tree = await render();
    const stars = tree.root.findAllByType(TouchableOpacity).filter((n) => String(n.props.testID ?? '').startsWith('review-star-'));
    await TR.act(async () => { stars[2].props.onPress(); }); // 0-indexed → 3점

    const cards = tree.root.findAllByType(TouchableOpacity);
    await TR.act(async () => { cards[0].props.onPress(); }); // 첫 mood 선택

    const saveBtn = tree.root.findAllByType(require('../components/ui').BigButton)[0];
    await TR.act(async () => { saveBtn.props.onPress(); });

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ rating: 3 }));
  });
});
```

(이 테스트 파일은 처음 만드는 것이라 `TouchableOpacity` 순서 의존적인 부분은 실제 실행하며 조정이 필요할 수 있다 — 핵심 검증 대상은 "별 5개 렌더", "별점 없으면 에러", "선택한 별점이 insert에 반영"이다.)

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx jest card-review-screen-contract`
Expected: FAIL — `review-star-*` testID 없음, `rating` insert 필드 없음.

- [ ] **Step 3: 로케일 키 추가**

`locales/ko/review.json`에 추가:

```json
    "starRatingLabel": "전체 별점",
    "noStarRatingError": "별점을 선택해주세요."
```

`locales/en/review.json`에 추가:

```json
    "starRatingLabel": "Overall rating",
    "noStarRatingError": "Please pick a star rating."
```

- [ ] **Step 4: `app/card/review.tsx`에 별점 state·UI·검증·저장 배선**

임포트에 `Star`는 이미 있음(감정 아이콘에서 `Smile`로 대체됐으므로 별점 전용으로 재사용).

`useState` 선언부에 추가:

```ts
  const [rating, setRating] = useState(0); // 0 = 미선택, 1~5
```

`handleSave` 맨 앞 검증 순서 교체(별점 검증을 감정 검증보다 먼저 — 목업 순서와 동일):

```ts
  async function handleSave() {
    if (!rating) { Alert.alert('', c.noStarRatingError); return; }
    if (!mood) { Alert.alert('', c.noRatingError); return; }
    if (!myUserId || !coupleId) { Alert.alert('', s.common.coupleRequired); return; }
    if (saving) return;
    setSaving(true);
    try {
      const wantAgain = mood === 'amazing' || mood === 'good';

      const { error } = await supabase.from('date_memories').insert({
        couple_id: coupleId,
        card_id: id,
        user_id: myUserId,
        rating,
        review: reviewText.trim(),
        want_again: wantAgain,
        photo_url: photoUrl,
      });
```

렌더: heading 블록과 기존 `c.ratingLabel` 섹션 사이에 별점 바 삽입:

```tsx
          <Text style={styles.sectionLabel}>{c.starRatingLabel}</Text>
          <View style={styles.starRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <TouchableOpacity
                key={n}
                testID={`review-star-${n}`}
                accessibilityRole="button"
                accessibilityLabel={`${n}점`}
                onPress={() => setRating(n)}
                style={styles.starBtn}
              >
                <Star
                  size={28}
                  strokeWidth={1.8}
                  color={C.pinkDeep}
                  fill={n <= rating ? C.pinkDeep : 'transparent'}
                />
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>{c.ratingLabel}</Text>
```

(기존에 있던 단독 `<Text style={styles.sectionLabel}>{c.ratingLabel}</Text>`는 위 블록으로 교체되는 것 — 중복 생성하지 않도록 주의.)

스타일 추가:

```ts
  starRow: { flexDirection: 'row', gap: SP.sm, marginBottom: SP.xl },
  starBtn: { minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
```

- [ ] **Step 5: 테스트 실행 → 통과 확인**

Run: `npx jest card-review-screen-contract card-review-icons`
Expected: PASS

- [ ] **Step 6: 전체 검증**

Run: `npm run validate && npx jest`
Expected: 모두 PASS

- [ ] **Step 7: 커밋**

```bash
git add app/card/review.tsx __tests__/card-review-screen-contract.test.tsx locales/ko/review.json locales/en/review.json
git commit -m "feat(review): 전체 별점(1~5) 바 추가, date_memories.rating에 저장"
```

---

## Task 4 — 목업 대조 시각 검증

- [ ] `mcp__plugin_supabase_supabase__apply_migration`으로 Task 1 마이그레이션을 실제 프로젝트에 배포(사용자 승인 필요 — 원격 DB 변경).
- [ ] 시뮬레이터에서 `/card/review` 렌더(카드 상세→후기 진입 경로), 별점 탭+감정 5종 선택 동작 육안 확인.
- [ ] `09_review.png`와 나란히 비교 — 순서(별점→감정)·톤·간격 확인. AI 요약 카드 부재는 의도된 제외.
- [ ] `/ss-verify` 실행해 점수 확인, 80 미만이면 수정 후 재확인.
- [ ] `RESULT.md`/`PLAN.md` 갱신.

---

## Self-Review 메모 (작성자용, 실행 불필요)

- AI 요약 카드: 새 AI 백엔드 호출이 필요해 사용자가 명시적으로 이번 스코프에서 제외.
- `card/memory/edit/[id].tsx`·`card/memory/[id].tsx`(추억 수정/상세 화면)는 지금 `want_again`만 다루고 `rating`을 표시/수정하지 않는다 — 이번 계획 스코프 밖(요청받으면 후속 태스크).
- 마이그레이션은 배포(Task 4)까지 해야 실제로 `rating` insert가 성공한다 — 로컬 테스트(Task 1)는 SQL 파일 내용만 검증하므로 배포 전엔 실기기/스크린샷 모드가 아닌 실 Supabase 프로젝트에서 insert가 실패할 수 있음.
