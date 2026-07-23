# candidates 히어로 수정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** make_course 카드 상세의 빈 히어로 박스를 코스 요약으로 채우고, 하트/반응을 재탭으로 해제 가능하게 만든다.

**Architecture:** 반응 해제 결정은 순수 함수 `shouldUnreactOnTap()`로 분리해 단위 테스트한다. supabase delete는 화면 본체 `handleUnreact()`가 수행한다. 히어로 표시는 프레젠테이션 컴포넌트 `CandidateHeroCard`가 `placeName` → PlaceRow / `steps` → 코스 요약 / 둘 다 없음 → 미렌더로 분기한다.

**Tech Stack:** React Native, expo-router, Supabase JS, i18next(`{{count}}` 보간), jest + react-test-renderer

---

## File Structure

- `app/card/[id].tsx` — 순수 헬퍼 `shouldUnreactOnTap` export 추가, `CandidateHeroCard`에 `steps` prop + 코스 요약 분기, 화면 본체에 `handleUnreact` + `handleReactionTap` 배선
- `locales/ko/card.json`, `locales/en/card.json` — `heroCourseCount` 키 추가
- `__tests__/card-detail-hero.test.tsx` — 헬퍼·코스 요약·미렌더 테스트 추가

---

## Task 1: 반응 해제 결정 순수 함수

**Files:**
- Modify: `app/card/[id].tsx` (새 export, `ReactionType` 정의 아래)
- Test: `__tests__/card-detail-hero.test.tsx`

- [ ] **Step 1: Write the failing test**

`card-detail-hero.test.tsx` 최상단 `describe('CandidateHeroCard', ...)` **앞에** 추가. `shouldUnreactOnTap`을 구조분해로 가져온다 — line 19의 require를 다음으로 교체:

```tsx
const { CandidateHeroCard, shouldUnreactOnTap } = require('../app/card/[id]') as typeof import('../app/card/[id]');
```

그리고 파일 하단(마지막 `});` 뒤)에 새 describe 추가:

```tsx
describe('shouldUnreactOnTap', () => {
  it('unreacts when tapping the already-selected reaction', () => {
    expect(shouldUnreactOnTap('love', 'love')).toBe(true);
    expect(shouldUnreactOnTap('burden', 'burden')).toBe(true);
  });
  it('does not unreact when tapping a different or first reaction', () => {
    expect(shouldUnreactOnTap('love', 'like')).toBe(false);
    expect(shouldUnreactOnTap(null, 'love')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest card-detail-hero -t shouldUnreactOnTap`
Expected: FAIL — `shouldUnreactOnTap is not a function`

- [ ] **Step 3: Write minimal implementation**

`app/card/[id].tsx`의 `type ReactionType = ...` 줄 바로 아래에 추가:

```tsx
// 재탭으로 반응을 해제할지 결정한다 — 같은 반응을 다시 누르면 해제.
export function shouldUnreactOnTap(current: ReactionType | null, tapped: ReactionType): boolean {
  return current === tapped;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest card-detail-hero -t shouldUnreactOnTap`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/card/\[id\].tsx __tests__/card-detail-hero.test.tsx
git commit -m "feat(card): add shouldUnreactOnTap toggle decision helper"
```

---

## Task 2: handleUnreact + 재탭 배선

**Files:**
- Modify: `app/card/[id].tsx` (화면 본체 `handleReact` 아래, onPress 핸들러들)

이 태스크는 supabase delete 통합 로직이라 단위 테스트 대상이 아니다(기존 `handleReact`도 미테스트). Task 1의 헬퍼가 결정 로직을 커버한다. TypeScript 컴파일과 수동 배선 정확성으로 검증한다.

- [ ] **Step 1: `handleUnreact`와 `handleReactionTap` 추가**

`app/card/[id].tsx`에서 `handleReact` 함수(현재 line 204-222)의 닫는 `}` 바로 다음에 추가:

```tsx
  async function handleUnreact() {
    if (saving || !myUserId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('reactions')
        .delete()
        .eq('card_id', id)
        .eq('user_id', myUserId);
      if (error) throw error;
      setMyReaction(null);
      setMyConditionTag(null);
    } catch {
      Alert.alert(alertTitle, s.card.saveError);
    } finally {
      setSaving(false);
    }
  }

  // 같은 반응 재탭 → 해제, 아니면 설정. 하트와 반응 그리드가 공유한다.
  function handleReactionTap(type: ReactionType) {
    if (shouldUnreactOnTap(myReaction, type)) handleUnreact();
    else handleReact(type);
  }
```

- [ ] **Step 2: 하트 onToggleLove 배선**

`CandidateHeroCard` 호출부(현재 line 347)의 `onToggleLove`를 교체:

```tsx
            onToggleLove={() => handleReactionTap('love')}
```

- [ ] **Step 3: 반응 그리드 onPress 배선**

반응 그리드의 `onPress={() => handleReact(r.type)}`(현재 line 406)를 교체:

```tsx
                  onPress={() => handleReactionTap(r.type)}
```

- [ ] **Step 4: TypeScript 검증**

Run: `npm run validate`
Expected: 에러 없음 (exit 0)

- [ ] **Step 5: Commit**

```bash
git add app/card/\[id\].tsx
git commit -m "feat(card): allow untoggling reactions by re-tapping heart or grid"
```

---

## Task 3: i18n heroCourseCount 키

**Files:**
- Modify: `locales/ko/card.json`, `locales/en/card.json`

- [ ] **Step 1: ko 키 추가**

`locales/ko/card.json`에서 `"confirmButton": "이번 데이트로 정할까요? →",` 줄 다음에 추가:

```json
    "heroCourseCount": "{{count}}곳 코스",
```

- [ ] **Step 2: en 키 추가**

`locales/en/card.json`에서 `"confirmButton": "Make this the date? →",` 줄 다음에 추가:

```json
    "heroCourseCount": "{{count}}-stop course",
```

- [ ] **Step 3: JSON 유효성 검증**

Run: `node -e "require('./locales/ko/card.json'); require('./locales/en/card.json'); console.log('ok')"`
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add locales/ko/card.json locales/en/card.json
git commit -m "chore(i18n): add card.heroCourseCount for course summary hero"
```

---

## Task 4: CandidateHeroCard 코스 요약 분기

**Files:**
- Modify: `app/card/[id].tsx` (`CandidateHeroCard` + `heroS` 스타일 + 호출부 steps 전달)
- Test: `__tests__/card-detail-hero.test.tsx`

- [ ] **Step 1: 테스트 mock의 t()가 count 보간을 처리하도록 수정**

`card-detail-hero.test.tsx`의 mock `t`(현재 line 8)를 params 지원으로 교체:

```tsx
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key} ${JSON.stringify(params)}` : key,
```

- [ ] **Step 2: 코스 요약/미렌더 실패 테스트 추가**

`describe('CandidateHeroCard', ...)` 안 마지막 `it(...)` 다음에 추가:

```tsx
  it('renders a course summary when steps exist and no place is attached', () => {
    let tree!: ReturnType<typeof TR.create>;
    TR.act(() => {
      tree = TR.create(
        <CandidateHeroCard
          myLove={false}
          onToggleLove={() => {}}
          onConfirm={() => {}}
          steps={[{ label: '카페' }, { label: '스타벅스' }, { label: '추가 장소' }]}
        />,
      );
    });
    expect(texts(tree)).toContain('카페 → 스타벅스 → 추가 장소');
    expect(texts(tree)).toContain('card.heroCourseCount {"count":3}');
  });

  it('renders no hero card when neither place nor steps exist', () => {
    let tree!: ReturnType<typeof TR.create>;
    TR.act(() => {
      tree = TR.create(<CandidateHeroCard myLove={false} onToggleLove={() => {}} onConfirm={() => {}} />);
    });
    const t = texts(tree);
    expect(t).not.toContain('card.heroCourseCount');
    // 하트 버튼(love 라벨)도 없어야 한다
    expect(tree.root.findAllByProps({ accessibilityLabel: '완전 끌려' })).toHaveLength(0);
    // 확정 CTA는 여전히 있어야 한다
    expect(t).toContain('이번 데이트로 정할까요? →');
  });
```

> 참고: 기존 `omits the place row when no place is attached` 테스트는 steps 없이 렌더하므로 이제 SoftCard가 미렌더된다. `서울 성동구`를 not.toContain 하는 단언은 그대로 통과한다(변경 불필요).

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx jest card-detail-hero`
Expected: 새 두 테스트 FAIL — 코스 요약 텍스트/미렌더 미구현. 하트 라벨이 여전히 렌더되어 미렌더 테스트도 실패.

- [ ] **Step 4: CandidateHeroCard 구현 교체**

`app/card/[id].tsx`의 import에 `CourseStep` 타입이 이미 있다(line 23). `MapPin`도 이미 import됨(line 14).

`CandidateHeroCard`의 props 타입에 `steps` 추가 — 현재 시그니처:

```tsx
export function CandidateHeroCard({
  placeName, placeAddress, placeUrl,
  myLove, onToggleLove,
  partnerReactionLabel,
  onConfirm,
}: {
  placeName?: string | null;
  placeAddress?: string | null;
  placeUrl?: string | null;
  myLove: boolean;
  onToggleLove: () => void;
  partnerReactionLabel?: string | null;
  onConfirm: () => void;
}) {
```

를 다음으로 교체:

```tsx
export function CandidateHeroCard({
  placeName, placeAddress, placeUrl,
  steps,
  myLove, onToggleLove,
  partnerReactionLabel,
  onConfirm,
}: {
  placeName?: string | null;
  placeAddress?: string | null;
  placeUrl?: string | null;
  steps?: CourseStep[];
  myLove: boolean;
  onToggleLove: () => void;
  partnerReactionLabel?: string | null;
  onConfirm: () => void;
}) {
```

그리고 함수 본문 상단(`const { strings: s } = useI18n();` 다음)에 파생값 추가하고, `return`의 `<SoftCard>` 블록을 조건부로 감싼다. 현재 return 본문:

```tsx
  const { strings: s } = useI18n();
  return (
    <View style={heroS.wrap}>
      <SoftCard style={heroS.card}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={s.card.reactionLabels.love.label}
          onPress={onToggleLove}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={heroS.loveBtn}
          activeOpacity={0.75}
        >
          <Heart size={18} color={myLove ? C.danger : C.textLight} fill={myLove ? C.danger : 'none'} strokeWidth={2} />
        </TouchableOpacity>
        {!!placeName && (
          <PlaceRow name={placeName} address={placeAddress ?? undefined} url={placeUrl ?? undefined} style={heroS.placeRow} />
        )}
      </SoftCard>

      <View style={heroS.partnerBubble}>
        <Text style={heroS.partnerText}>{partnerReactionLabel ?? s.card.partnerWaiting}</Text>
      </View>

      <BigButton accessibilityLabel={s.card.confirmButton} onPress={onConfirm}>
        {s.card.confirmButton}
      </BigButton>
    </View>
  );
```

를 다음으로 교체:

```tsx
  const { strings: s, t } = useI18n();
  const courseSteps = steps ?? [];
  const showCourse = !placeName && courseSteps.length > 0;
  const showHeroCard = !!placeName || showCourse;
  return (
    <View style={heroS.wrap}>
      {showHeroCard && (
        <SoftCard style={heroS.card}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={s.card.reactionLabels.love.label}
            onPress={onToggleLove}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={heroS.loveBtn}
            activeOpacity={0.75}
          >
            <Heart size={18} color={myLove ? C.danger : C.textLight} fill={myLove ? C.danger : 'none'} strokeWidth={2} />
          </TouchableOpacity>
          {!!placeName && (
            <PlaceRow name={placeName} address={placeAddress ?? undefined} url={placeUrl ?? undefined} style={heroS.placeRow} />
          )}
          {showCourse && (
            <View style={heroS.courseWrap}>
              <View style={heroS.courseCountRow}>
                <MapPin size={15} color={C.pinkDeep} strokeWidth={2} />
                <Text style={heroS.courseCount}>{t('card.heroCourseCount', { count: courseSteps.length })}</Text>
              </View>
              <Text style={heroS.courseChain} numberOfLines={1}>
                {courseSteps.map(step => step.label).join(' → ')}
              </Text>
            </View>
          )}
        </SoftCard>
      )}

      <View style={heroS.partnerBubble}>
        <Text style={heroS.partnerText}>{partnerReactionLabel ?? s.card.partnerWaiting}</Text>
      </View>

      <BigButton accessibilityLabel={s.card.confirmButton} onPress={onConfirm}>
        {s.card.confirmButton}
      </BigButton>
    </View>
  );
```

- [ ] **Step 5: heroS 스타일에 코스 요약 스타일 추가**

`const heroS = StyleSheet.create({ ... })`의 `placeRow` 항목 다음에 추가:

```tsx
  courseWrap: { paddingRight: SP.xxxl, gap: SP.xs },
  courseCountRow: { flexDirection: 'row', alignItems: 'center', gap: SP.xs },
  courseCount: { fontSize: 15, fontWeight: '700', color: C.text },
  courseChain: { fontSize: 13, color: C.textSub },
```

- [ ] **Step 6: 호출부에서 steps 전달**

`CardDetailScreen`의 `<CandidateHeroCard ...>` 호출부(현재 line 342-350)에서 `placeUrl` 다음 줄에 추가:

```tsx
            steps={resolveDisplaySteps(card)}
```

(`resolveDisplaySteps`는 이미 line 23에서 import됨.)

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx jest card-detail-hero`
Expected: 전체 PASS

- [ ] **Step 8: TypeScript 검증**

Run: `npm run validate`
Expected: 에러 없음 (exit 0)

- [ ] **Step 9: Commit**

```bash
git add app/card/\[id\].tsx __tests__/card-detail-hero.test.tsx
git commit -m "feat(card): show course summary in hero for make_course candidates"
```

---

## Task 5: 최종 검증

- [ ] **Step 1: 전체 테스트 스위트**

Run: `npx jest card-detail-hero`
Expected: 모든 테스트 PASS

- [ ] **Step 2: 전체 타입 검증**

Run: `npm run validate`
Expected: exit 0, 에러 없음

- [ ] **Step 3: StyleSeed 게이트 (UI 변경 파일)**

`app/card/[id].tsx`는 UI를 변경했으므로 세션 규칙에 따라 `ss-score`(Gate 모드, ≥80 목표)와 `styleseed-design-review`를 히어로 코스 요약 대상으로 실행. <80이면 fix-first 후 재점수(최대 3회).

---

## Self-Review

- **Spec coverage:** 하트 토글(Task 1·2) / 그리드 토글(Task 2) / 코스 요약(Task 4) / SoftCard 미렌더(Task 4) / i18n ko·en(Task 3) / 테스트 5종(Task 1·4) — 스펙 전 항목 대응.
- **Placeholder scan:** 모든 코드 스텝에 실제 코드 포함, TBD 없음.
- **Type consistency:** `shouldUnreactOnTap`, `handleUnreact`, `handleReactionTap`, `steps: CourseStep[]`, `heroCourseCount` 키 이름이 태스크 전반에서 일치. `CourseStep`·`resolveDisplaySteps`·`MapPin`은 기존 import 재사용.
- **주의:** Task 4 Step 1의 mock `t` 변경은 params 없는 기존 호출에 영향 없음(key 그대로 반환). 기존 4개 테스트 회귀 없음.
