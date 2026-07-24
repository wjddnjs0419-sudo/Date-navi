# 반응 UI 통일 + 코스 확정 흐름 연결 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** share/reaction의 옛 8버튼 반응 UI를 card/[id]와 동일한 4종으로 통일하고, candidates "코스 확정 가기" 배너를 실제 코스 확정 흐름(share/mutual → 카드 선택 → /card/confirm)에 연결한다.

**Architecture:** 반응 4종 그리드를 순수 컴포넌트 `ReactionPicker`로 추출해 card/[id]·share/reaction이 공유한다. 반응 상수(`ReactionType`/`REACTIONS`/`REACTION_ICONS`)는 `lib/reactions.ts`로 분리한다. share/mutual에 단일 선택 라디오를 추가하고 확정 CTA가 선택된 카드로 이동한다. DB 스키마 변경 없음.

**Tech Stack:** React Native + Expo Router, TypeScript, jest + react-test-renderer, 자체 i18n(`useI18n`의 `strings` 트리).

**설계 문서:** `docs/superpowers/specs/2026-07-24-reaction-unify-course-confirm-design.md`

---

## 파일 구조

- Create: `lib/reactions.ts` — 반응 상수(`ReactionType`, `REACTIONS`, `REACTION_ICONS`). card/[id]에서 이관.
- Create: `components/ReactionPicker.tsx` — 4종 반응 2×2 그리드 순수 컴포넌트.
- Create: `__tests__/reaction-picker.test.tsx` — ReactionPicker 단위 테스트.
- Modify: `app/card/[id].tsx` — 상수 import처 변경 + 재-export 유지, 인라인 그리드 → ReactionPicker.
- Modify: `app/share/reaction.tsx` — 8버튼·note 제거, ReactionPicker 사용.
- Modify: `app/(tabs)/candidates.tsx` — 배너 onPress → `/share/mutual` push.
- Modify: `app/share/mutual.tsx` — mutual 카드 라디오 단일 선택 + CTA가 selectedId 사용.
- Modify: `locales/ko/share.json`, `locales/en/share.json` — reaction.noteLabel/notePlaceholder/options 제거.
- Modify: `__tests__/share-reaction-screen.test.tsx`, `__tests__/share-mutual-screen.test.tsx` — 계약 갱신.

---

## Task 1: 반응 상수를 `lib/reactions.ts`로 분리

기존 `app/card/[id].tsx`가 `ReactionType`·`REACTIONS`·`REACTION_ICONS`를 정의·export하고 `__tests__/card-detail-hero.test.tsx`가 card/[id]에서 이를 import한다. 공유 컴포넌트가 route 파일을 import하지 않도록 상수를 lib로 옮기되, card/[id]는 재-export해 기존 import를 깨지 않는다.

**Files:**
- Create: `lib/reactions.ts`
- Modify: `app/card/[id].tsx` (상단 상수 정의 블록, 약 44-64행)
- Test: `__tests__/card-detail-hero.test.tsx` (기존, import처는 그대로 card/[id] 유지)

- [ ] **Step 1: `lib/reactions.ts` 생성**

```ts
import { Flame, Smile, Meh, Clock } from 'lucide-react-native';
import { C } from '../constants/colors';

export type ReactionType = 'love' | 'like' | 'burden' | 'next_time';

export const REACTIONS: { type: ReactionType; color: string; bg: string }[] = [
  { type: 'love', color: C.danger, bg: C.pinkLight },
  { type: 'like', color: C.creamFg, bg: C.cream },
  { type: 'burden', color: C.coolGray, bg: C.gray },
  { type: 'next_time', color: C.lavenderFg, bg: C.lavender },
];

// 이모지 대신 아이콘 — 알림 본문처럼 텍스트뿐인 자리에서는 이모지를 그대로 쓴다.
export const REACTION_ICONS: Record<ReactionType, typeof Clock> = {
  love: Flame,
  like: Smile,
  burden: Meh,
  next_time: Clock,
};
```

- [ ] **Step 2: `app/card/[id].tsx`에서 상수 정의 제거 + import·재-export로 교체**

44행의 `type ReactionType = ...`, 51-56행의 `const REACTIONS = ...`, 59-64행의 `export const REACTION_ICONS = ...`를 삭제하고, 파일 상단 import 블록에 추가:

```ts
import { ReactionType, REACTIONS, REACTION_ICONS } from '../../lib/reactions';
```

기존 외부 소비자(`card-detail-hero.test.tsx`가 `require('../app/card/[id]')`로 `REACTION_ICONS`를 읽음)를 위해 파일 내 적절한 위치(다른 export 근처)에 재-export 추가:

```ts
export { REACTION_ICONS } from '../../lib/reactions';
export type { ReactionType } from '../../lib/reactions';
```

> 주의: `import`한 이름을 다시 `export`하면 중복 선언이 된다. import 라인에서는 `REACTIONS`만 값으로 가져오고(내부 렌더에서 사용), `REACTION_ICONS`·`ReactionType`은 `export { ... } from`·`export type { ... } from` 재-export 라인으로만 노출한 뒤 필요한 곳에서 참조한다. `REACTION_ICONS`를 내부에서도 쓰면(59행 이후 사용처 확인) 값 import에 포함하고 재-export는 생략한다. tsc가 통과하는 형태로 맞춘다.

- [ ] **Step 3: 테스트 실행 — 회귀 없음 확인**

Run: `npx jest card-detail-hero -t "REACTION_ICONS" && npx tsc --noEmit`
Expected: PASS, tsc 클린. (`REACTION_ICONS.love === Flame` 등 기존 단언 유지)

- [ ] **Step 4: Commit**

```bash
git add lib/reactions.ts "app/card/[id].tsx"
git commit -m "refactor(reactions): 반응 상수를 lib/reactions.ts로 분리"
```

---

## Task 2: `ReactionPicker` 순수 컴포넌트 생성

card/[id]의 인라인 반응 그리드(361-383행)를 라벨을 prop으로 받는 순수 컴포넌트로 추출한다. i18n `strings` 트리에 의존하지 않아 테스트가 쉽다.

**Files:**
- Create: `components/ReactionPicker.tsx`
- Test: `__tests__/reaction-picker.test.tsx`

- [ ] **Step 1: 실패 테스트 작성**

```tsx
import React from 'react';
import TR from 'react-test-renderer';
import { TouchableOpacity, Text } from 'react-native';
import { ReactionPicker } from '../components/ReactionPicker';
import { REACTIONS } from '../lib/reactions';

const labelFor = (t: string) => `label-${t}`;

describe('ReactionPicker', () => {
  it('4종 반응을 모두 렌더한다', () => {
    let tree: TR.ReactTestRenderer;
    TR.act(() => {
      tree = TR.create(<ReactionPicker selected={null} onSelect={() => {}} labelFor={labelFor} />);
    });
    const labels = tree!.root.findAllByType(Text).map(n => n.props.children);
    for (const r of REACTIONS) {
      expect(labels).toContain(`label-${r.type}`);
    }
  });

  it('선택된 타입 탭 콜백을 호출한다', () => {
    const onSelect = jest.fn();
    let tree: TR.ReactTestRenderer;
    TR.act(() => {
      tree = TR.create(<ReactionPicker selected={null} onSelect={onSelect} labelFor={labelFor} />);
    });
    const btns = tree!.root.findAllByType(TouchableOpacity);
    TR.act(() => { btns[0].props.onPress(); });
    expect(onSelect).toHaveBeenCalledWith(REACTIONS[0].type);
  });

  it('selected에 해당하는 버튼에 testID 접미사 -selected가 붙는다', () => {
    let tree: TR.ReactTestRenderer;
    TR.act(() => {
      tree = TR.create(<ReactionPicker selected="love" onSelect={() => {}} labelFor={labelFor} />);
    });
    expect(tree!.root.findByProps({ testID: 'reaction-love-selected' })).toBeTruthy();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx jest reaction-picker -v`
Expected: FAIL ("Cannot find module '../components/ReactionPicker'")

- [ ] **Step 3: `components/ReactionPicker.tsx` 구현**

```tsx
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { C } from '../constants/colors';
import { REACTIONS, REACTION_ICONS, ReactionType } from '../lib/reactions';

export function ReactionPicker({
  selected,
  onSelect,
  labelFor,
}: {
  selected: ReactionType | null;
  onSelect: (type: ReactionType) => void;
  labelFor: (type: ReactionType) => string;
}) {
  return (
    <View style={s.grid}>
      {REACTIONS.map(r => {
        const isSel = selected === r.type;
        const Icon = REACTION_ICONS[r.type];
        return (
          <TouchableOpacity
            key={r.type}
            testID={`reaction-${r.type}${isSel ? '-selected' : ''}`}
            style={[
              s.btn,
              { backgroundColor: isSel ? r.bg : C.gray },
              isSel && s.btnSelected,
              isSel && { borderColor: r.color },
            ]}
            onPress={() => onSelect(r.type)}
            activeOpacity={0.75}
          >
            <Icon size={26} color={isSel ? r.color : C.textSub} strokeWidth={2} />
            <Text style={[s.label, isSel && s.labelSelected, isSel && { color: r.color }]}>
              {labelFor(r.type)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  btn: {
    width: '47%', flexGrow: 1, alignItems: 'center', gap: 6,
    paddingVertical: 16, borderRadius: 16, borderWidth: 1.5, borderColor: 'transparent',
  },
  btnSelected: {},
  label: { fontSize: 13, color: C.textSub, fontWeight: '600' },
  labelSelected: { fontWeight: '700' },
});
```

> 스타일 수치는 card/[id]의 기존 `reactionGrid`/`reactionBtn`/`reactionLabel`과 시각적으로 동일하게 맞춘다. Task 3에서 card/[id] 실렌더로 회귀를 확인하므로, 이 값이 기존과 어긋나면 Task 3에서 조정한다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx jest reaction-picker -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add components/ReactionPicker.tsx __tests__/reaction-picker.test.tsx
git commit -m "feat(reactions): 공유 ReactionPicker 컴포넌트 추가"
```

---

## Task 3: card/[id] 반응 그리드를 ReactionPicker로 교체 (회귀)

**Files:**
- Modify: `app/card/[id].tsx` (360-383행 `reactionGrid` 블록)
- Test: `__tests__/card-detail-hero.test.tsx` (기존 회귀 스위트 재사용)

- [ ] **Step 1: 인라인 그리드를 ReactionPicker로 교체**

360-383행의 `<View style={styles.reactionGrid}>...</View>` 전체를 다음으로 교체:

```tsx
<ReactionPicker
  selected={myReaction}
  onSelect={handleReactionTap}
  labelFor={(type) => s.card.reactionLabels[type].label}
/>
```

상단 import에 추가: `import { ReactionPicker } from '../../components/ReactionPicker';`
더 이상 참조되지 않는 `styles.reactionGrid`/`reactionBtn`/`reactionBtnSelected`/`reactionLabel`/`reactionLabelSelected` 스타일은 제거한다(다른 참조 없음을 grep으로 확인 후).

> `handleReactionTap`은 기존에 재탭 해제(`shouldUnreactOnTap`)를 처리한다. ReactionPicker는 탭된 타입만 넘기므로 해제 동작이 그대로 보존된다.

- [ ] **Step 2: 회귀 테스트 + 타입 확인**

Run: `npx jest card-detail-hero card-reaction-optimistic -v && npx tsc --noEmit`
Expected: PASS, tsc 클린.

- [ ] **Step 3: Commit**

```bash
git add "app/card/[id].tsx"
git commit -m "refactor(card): 반응 그리드를 ReactionPicker로 교체"
```

---

## Task 4: share/reaction 8버튼·note 제거 → ReactionPicker

**Files:**
- Modify: `app/share/reaction.tsx`
- Modify: `locales/ko/share.json`, `locales/en/share.json`
- Test: `__tests__/share-reaction-screen.test.tsx`

- [ ] **Step 1: 실패 테스트 작성/갱신** (`__tests__/share-reaction-screen.test.tsx`에 추가)

```tsx
it('옛 8버튼 옵션을 렌더하지 않고 4종 반응만 쓴다', () => {
  const src = require('fs').readFileSync(require('path').join(process.cwd(), 'app/share/reaction.tsx'), 'utf8');
  expect(src).not.toContain('REACTION_OPTIONS');
  expect(src).not.toContain("options.full");
  expect(src).toContain('ReactionPicker');
});

it('한마디 입력란과 관련 i18n 키가 없다', () => {
  const src = require('fs').readFileSync(require('path').join(process.cwd(), 'app/share/reaction.tsx'), 'utf8');
  expect(src).not.toContain('noteLabel');
  expect(src).not.toContain('notePlaceholder');
  for (const lang of ['ko', 'en']) {
    const share = require('fs').readFileSync(require('path').join(process.cwd(), `locales/${lang}/share.json`), 'utf8');
    expect(share).not.toContain('noteLabel');
    expect(share).not.toContain('notePlaceholder');
  }
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx jest share-reaction-screen -v`
Expected: FAIL (아직 REACTION_OPTIONS·noteLabel 존재)

- [ ] **Step 3: `app/share/reaction.tsx` 수정**

- 16-25행 `const REACTION_OPTIONS = [...]` 삭제.
- `selectedId` state를 반응 타입 state로 교체: `const [selected, setSelected] = useState<ReactionType | null>(null);` (`import { ReactionType } from '../../lib/reactions';` 추가, `import { ReactionPicker } from '../../components/ReactionPicker';` 추가).
- `note`/`setNote` state, 174-181행 note 입력 UI(`SectionLabel` + `noteInputBox` + `TextInput`), `noteInputBox`/`noteInput` 스타일 삭제. (155-158행 `sentMessage` 버블·`noteBubble` 스타일은 유지 — 별개 기능)
- 반응 선택 UI를 `ReactionPicker`로 렌더:

```tsx
<ReactionPicker
  selected={selected}
  onSelect={setSelected}
  labelFor={(type) => s.card.reactionLabels[type].label}
/>
```

> reaction.tsx는 `useI18n()`에서 `strings`(별칭 `s`)를 구조분해해야 한다. 현재 `t`만 쓰면 `const { t, strings: s } = useI18n();`로 바꾼다.

- `handleSubmit` 수정: 옛 `REACTION_OPTIONS.find(...)?.type ?? 'like'` 대신 `selected`를 직접 사용. 미선택 시 조기 반환:

```ts
async function handleSubmit() {
  if (!cardId) { router.push('/share/mutual' as any); return; }
  if (!selected) return;
  setSaving(true);
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('reactions').upsert(
      { card_id: cardId, user_id: user.id, reaction_type: selected },
      { onConflict: 'card_id,user_id' },
    );
    router.push('/share/mutual' as any);
  } finally {
    setSaving(false);
  }
}
```

- 제출 버튼(`submitCta`)에 `disabled={!selected || saving}` 반영(BigButton이 disabled를 지원하지 않으면 `!selected`일 때 onPress 무동작으로 가드).

- [ ] **Step 4: i18n 키 삭제**

`locales/ko/share.json`·`locales/en/share.json`의 `reaction` 블록에서 `noteLabel`, `notePlaceholder`, 그리고 `options` 객체(full/good/niceFeel/closer/burdenToday/nextTime/ifMoneyComes/notFarWalk) 전체를 삭제한다. `partnerFallback`·`senderSent`·`justNow`·`heading`·`chooseReaction`·`submitCta`는 유지.

- [ ] **Step 5: 테스트 통과 + 타입 확인**

Run: `npx jest share-reaction-screen -v && npx tsc --noEmit`
Expected: PASS, tsc 클린. (기존 렌더 테스트가 옛 옵션 문구를 단언하면 함께 갱신)

- [ ] **Step 6: Commit**

```bash
git add app/share/reaction.tsx locales/ko/share.json locales/en/share.json __tests__/share-reaction-screen.test.tsx
git commit -m "feat(reaction): share/reaction을 4종 ReactionPicker로 통일, note 제거"
```

---

## Task 5: candidates 배너 → /share/mutual 연결

**Files:**
- Modify: `app/(tabs)/candidates.tsx` (491-497행 confirmBanner CTA)
- Test: `__tests__/candidates-confirm-banner.test.ts` (신규, 소스 계약)

- [ ] **Step 1: 실패 테스트 작성**

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

it('코스 확정 가기 배너가 /share/mutual로 이동한다', () => {
  const src = readFileSync(join(process.cwd(), 'app/(tabs)/candidates.tsx'), 'utf8');
  // 배너 CTA는 필터 변경이 아니라 mutual 화면으로 push 한다
  expect(src).toContain("router.push('/share/mutual'");
  const bannerIdx = src.indexOf('confirmBannerCta');
  const around = src.slice(bannerIdx - 400, bannerIdx + 400);
  expect(around).not.toContain("handleFilterChange('mutual')");
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx jest candidates-confirm-banner -v`
Expected: FAIL (아직 handleFilterChange('mutual'))

- [ ] **Step 3: 배너 onPress 교체**

493행 `onPress={() => handleFilterChange('mutual')}` → `onPress={() => router.push('/share/mutual' as any)}`.

> 주의: 필터 탭 배열의 `handleFilterChange(f)` 사용처(354행)는 그대로 둔다. 이번 변경은 하단 confirmBanner CTA 한 곳뿐이다.

- [ ] **Step 4: 통과 + 회귀 확인**

Run: `npx jest candidates-confirm-banner candidates-screen-contract burden-condition-removal -v && npx tsc --noEmit`
Expected: PASS, tsc 클린.

- [ ] **Step 5: Commit**

```bash
git add "app/(tabs)/candidates.tsx" __tests__/candidates-confirm-banner.test.ts
git commit -m "feat(candidates): 코스 확정 배너를 share/mutual로 연결"
```

---

## Task 6: share/mutual 단일 선택 라디오 + 선택 카드 확정

**Files:**
- Modify: `app/share/mutual.tsx`
- Modify: `locales/ko/share.json`, `locales/en/share.json` (라디오 접근성 라벨)
- Test: `__tests__/share-mutual-screen.test.tsx`

- [ ] **Step 1: 실패 테스트 작성/갱신** (`__tests__/share-mutual-screen.test.tsx`)

기존 테스트의 supabase mock은 mutual 카드 1개를 제공한다. mutual 카드 2개를 반환하도록 fixture를 확장하고 다음을 추가:

```tsx
it('mutual 카드에 라디오가 렌더되고 맨 위 카드가 기본 선택이다', async () => {
  let tree: any;
  await TR.act(async () => { tree = TR.create(<MutualScreen />); });
  await TR.act(async () => {});
  expect(tree.root.findByProps({ testID: 'mutual-radio-card-1-selected' })).toBeTruthy();
  expect(() => tree.root.findByProps({ testID: 'mutual-radio-card-2-selected' })).toThrow();
});

it('두 번째 카드 라디오를 누르면 선택이 바뀐다', async () => {
  let tree: any;
  await TR.act(async () => { tree = TR.create(<MutualScreen />); });
  await TR.act(async () => {});
  const radio2 = tree.root.findByProps({ testID: 'mutual-radio-card-2' });
  await TR.act(async () => { radio2.props.onPress(); });
  expect(tree.root.findByProps({ testID: 'mutual-radio-card-2-selected' })).toBeTruthy();
});

it('확정 CTA가 선택된 카드 id로 /card/confirm에 push한다', async () => {
  const push = jest.fn();
  // useRouter mock의 push를 이 테스트에서 캡처하도록 조정(아래 mock 참고)
  let tree: any;
  await TR.act(async () => { tree = TR.create(<MutualScreen />); });
  await TR.act(async () => {});
  const cta = tree.root.findByProps({ testID: 'mutual-confirm-cta' });
  await TR.act(async () => { cta.props.onPress(); });
  expect(push).toHaveBeenCalledWith('/card/confirm?id=card-1');
});
```

> 파일 상단 `useRouter` mock을 `const mockPush = jest.fn();` + `useRouter: () => ({ push: mockPush, replace: jest.fn() })`로 바꿔 push를 캡처한다. `BigButton`/라디오에 `testID`가 필요하므로 Step 3에서 부여한다.

- [ ] **Step 2: 실패 확인**

Run: `npx jest share-mutual-screen -v`
Expected: FAIL (라디오·testID 없음)

- [ ] **Step 3: `app/share/mutual.tsx` 수정**

- `firstMutualId` 계산 재사용 + state 추가:

```tsx
const firstMutualId = sections.mutual[0]?.id ?? null;
const [selectedId, setSelectedId] = useState<string | null>(null);
// mutual 목록 로드/변경 시 맨 위 카드로 기본 선택
useEffect(() => { setSelectedId(firstMutualId); }, [firstMutualId]);
```

(파일에 `useEffect`가 없으면 `import { useCallback, useEffect, useState } from 'react';`로 갱신)

- mutual 섹션 카드 렌더 시(SoftCard 매핑 내부, section === 'mutual'일 때만) 우상단에 라디오 추가. 카드 컨테이너에 `position: 'relative'`가 없으면 부여하고, 라디오는 absolute 우상단:

```tsx
{section === 'mutual' && (
  <TouchableOpacity
    testID={`mutual-radio-${card.id}${selectedId === card.id ? '-selected' : ''}`}
    style={s.radio}
    onPress={() => setSelectedId(card.id)}
    accessibilityLabel={t('share.mutual.selectCardLabel')}
    hitSlop={8}
  >
    <View style={[s.radioOuter, selectedId === card.id && s.radioOuterOn]}>
      {selectedId === card.id && <View style={s.radioInner} />}
    </View>
  </TouchableOpacity>
)}
```

라디오 스타일 추가:

```tsx
radio: { position: 'absolute', top: 12, right: 12, zIndex: 2 },
radioOuter: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
radioOuterOn: { borderColor: C.pinkDeep },
radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.pinkDeep },
```

> `C.line`이 없으면 프로젝트의 경계선 토큰(예: `C.gray`)으로 대체한다. 색상 토큰은 `constants/colors.ts` 확인.

- 하단 확정 CTA를 `selectedId` 기준으로 변경하고 testID 부여:

```tsx
<BigButton
  testID="mutual-confirm-cta"
  onPress={() => {
    if (selectedId) {
      router.push(`/card/confirm?id=${selectedId}` as any);
    } else {
      router.replace('/(tabs)/candidates' as any);
    }
  }}
>
  {t('share.mutual.confirmCta')}
</BigButton>
```

(`BigButton`이 `testID`를 지원하는지 확인 — 미지원이면 prop 통과 한 줄 추가 또는 외곽 View에 testID 부여)

- [ ] **Step 4: i18n 접근성 라벨 추가**

`locales/ko/share.json`·`locales/en/share.json`의 `mutual` 블록에 추가:
- ko: `"selectCardLabel": "이 후보로 선택"`
- en: `"selectCardLabel": "Select this date"`

- [ ] **Step 5: 통과 + 타입 확인**

Run: `npx jest share-mutual-screen -v && npx tsc --noEmit`
Expected: PASS, tsc 클린.

- [ ] **Step 6: Commit**

```bash
git add app/share/mutual.tsx locales/ko/share.json locales/en/share.json __tests__/share-mutual-screen.test.tsx
git commit -m "feat(mutual): 단일 선택 라디오로 확정 카드 선택"
```

---

## Task 7: 전체 검증

- [ ] **Step 1: 전체 스위트 + 타입**

Run: `npx jest && npx tsc --noEmit`
Expected: 전체 PASS, tsc 클린.

- [ ] **Step 2: StyleSeed 게이트** (UI 변경 화면: ReactionPicker, share/reaction, share/mutual)

`ss-score` Gate 모드로 각 화면 점수 확인(플로어 80). <80이면 fix-first 후 재점수. `styleseed-design-review`도 실행.

- [ ] **Step 3: i18n 동기 확인**

Run: `git diff --stat locales/`
Expected: ko/en 양쪽이 같은 키 세트로 변경됨(한쪽만 반영 금지).

- [ ] **Step 4: 실기기 확인 안내**

사용자가 Xcode Release 빌드로 확인:
1. 상대 제안 → share/reaction 4종 반응 정상, 한마디 입력란 없음.
2. candidates "코스 확정 가기" → share/mutual 이동.
3. mutual 카드 2개 이상 시 라디오로 선택, 확정 시 선택한 카드로 감.

---

## Self-Review 체크

- 스펙 커버리지: 작업 A(공유 컴포넌트 T2, card/[id] 교체 T3, share/reaction 통일 T4, note 제거 T4), 작업 B(배너 연결 T5, 라디오 선택 T6) — 전부 태스크 존재. ✅
- 스키마 변경 없음(비목표 준수). ✅
- 타입 일관성: `ReactionType`·`REACTIONS`·`REACTION_ICONS`는 `lib/reactions.ts` 단일 출처, `ReactionPicker` props(`selected`/`onSelect`/`labelFor`) 전 태스크 일치. ✅
- 미결/플레이스홀더 없음(토큰 대체 후보는 명시). ✅
