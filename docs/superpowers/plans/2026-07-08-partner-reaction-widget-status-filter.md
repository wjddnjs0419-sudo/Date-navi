# 홈 화면 "파트너 반응" 위젯 — 상태 필터 적용 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 홈 화면 "파트너 반응" 위젯이 확정(`confirmed`)되거나 추억 기록이 끝난(`done`) 후보의 반응은 더 이상 보여주지 않게 한다.

**Architecture:** `date_cards.status`가 `active`인 카드만 반응 후보 풀에 남기는 순수 함수 `filterActiveCards`를 `lib/partnerReaction.ts`에 추가하고, `app/(tabs)/index.tsx`의 홈 데이터 로딩 로직에서 그 함수로 걸러낸 카드만 대상으로 파트너 반응을 조회한다.

**Tech Stack:** React Native / Expo, Supabase JS, Jest (`__tests__/*.test.ts`)

**설계 문서:** `docs/superpowers/specs/2026-07-08-partner-reaction-widget-status-filter-design.md`

---

### Task 1: `filterActiveCards` 순수 함수 (TDD)

**Files:**
- Modify: `lib/partnerReaction.ts`
- Test: `__tests__/partnerReaction.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`__tests__/partnerReaction.test.ts` 맨 아래에 추가:

```ts
describe('filterActiveCards', () => {
  it('빈 배열이면 빈 배열', () => {
    expect(filterActiveCards([])).toEqual([]);
  });

  it('status가 active인 카드만 남긴다', () => {
    const cards: CardStatusRow[] = [
      { id: 'a', title: '카페 데이트', status: 'active' },
      { id: 'b', title: '확정된 데이트', status: 'confirmed' },
      { id: 'c', title: '추억 완료된 데이트', status: 'done' },
      { id: 'd', title: '다른 활성 후보', status: 'active' },
    ];
    expect(filterActiveCards(cards).map(c => c.id)).toEqual(['a', 'd']);
  });

  it('active 카드가 없으면 빈 배열', () => {
    const cards: CardStatusRow[] = [
      { id: 'a', title: '확정됨', status: 'confirmed' },
      { id: 'b', title: '완료됨', status: 'done' },
    ];
    expect(filterActiveCards(cards)).toEqual([]);
  });
});
```

파일 맨 위 import 줄도 갱신:

```ts
import { pickLatestReaction, formatReactionText, filterActiveCards, type ReactionRow, type CardStatusRow } from '../lib/partnerReaction';
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- partnerReaction`
Expected: FAIL — `filterActiveCards is not defined` (또는 `CardStatusRow`를 찾을 수 없다는 타입/임포트 에러)

- [ ] **Step 3: 최소 구현 작성**

`lib/partnerReaction.ts` 맨 아래에 추가:

```ts
export type CardStatusRow = {
  id: string;
  title: string;
  status: string;
};

export function filterActiveCards(cards: CardStatusRow[]): CardStatusRow[] {
  return cards.filter(card => card.status === 'active');
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- partnerReaction`
Expected: PASS (6개 테스트 전부 — 기존 `pickLatestReaction`/`formatReactionText` 3+3개 + 신규 3개)

- [ ] **Step 5: 커밋**

```bash
git add lib/partnerReaction.ts __tests__/partnerReaction.test.ts
git commit -m "$(cat <<'EOF'
feat: add filterActiveCards to exclude non-active cards from reaction pool

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 홈 화면에 상태 필터 적용

**Files:**
- Modify: `app/(tabs)/index.tsx:18` (import)
- Modify: `app/(tabs)/index.tsx:105-138` (파트너 반응 조회 블록)

- [ ] **Step 1: import에 `filterActiveCards`, `CardStatusRow` 추가**

`app/(tabs)/index.tsx:18`, 기존:

```ts
import { pickLatestReaction, formatReactionText } from '../../lib/partnerReaction';
```

변경 후:

```ts
import { pickLatestReaction, formatReactionText, filterActiveCards } from '../../lib/partnerReaction';
```

- [ ] **Step 2: 카드 조회에 `status` 컬럼 추가 + 필터 적용**

`app/(tabs)/index.tsx:105-138`, 기존:

```ts
                const { data: allCards } = await supabase
                  .from('date_cards')
                  .select('id, title')
                  .eq('couple_id', myProfile.couple_id);

                if (allCards?.length) {
                  const { data: rxRows } = await supabase
                    .from('reactions')
                    .select('card_id, reaction_type, condition_tag, created_at')
                    .eq('user_id', partnerId)
                    .in('card_id', allCards.map(c => c.id))
                    .order('created_at', { ascending: false })
                    .limit(1);

                  const latest = pickLatestReaction(rxRows ?? []);
                  const cardTitle = latest ? allCards.find(c => c.id === latest.card_id)?.title : undefined;
                  setPartnerReaction(latest && cardTitle ? {
                    cardId: latest.card_id,
                    cardTitle,
                    text: formatReactionText(latest, {
                      condition: (tag) => t(`card.conditionTags.${tag}.label`) || undefined,
                      reaction: (type) => t(`candidates.rxLabel.${type}`),
                    }),
                    timeAgo: relativeTime(latest.created_at, {
                      justNow: t('notifications.timeJustNow'),
                      minutes: t('notifications.timeMinutes'),
                      hours: t('notifications.timeHours'),
                      yesterday: t('notifications.timeYesterday'),
                      days: t('notifications.timeDays'),
                    }),
                  } : null);
                } else {
                  setPartnerReaction(null);
                }
```

변경 후 (`select`에 `status` 추가, `allCards` 대신 `activeCards`로 필터링 후 사용):

```ts
                const { data: allCards } = await supabase
                  .from('date_cards')
                  .select('id, title, status')
                  .eq('couple_id', myProfile.couple_id);

                const activeCards = filterActiveCards(allCards ?? []);

                if (activeCards.length) {
                  const { data: rxRows } = await supabase
                    .from('reactions')
                    .select('card_id, reaction_type, condition_tag, created_at')
                    .eq('user_id', partnerId)
                    .in('card_id', activeCards.map(c => c.id))
                    .order('created_at', { ascending: false })
                    .limit(1);

                  const latest = pickLatestReaction(rxRows ?? []);
                  const cardTitle = latest ? activeCards.find(c => c.id === latest.card_id)?.title : undefined;
                  setPartnerReaction(latest && cardTitle ? {
                    cardId: latest.card_id,
                    cardTitle,
                    text: formatReactionText(latest, {
                      condition: (tag) => t(`card.conditionTags.${tag}.label`) || undefined,
                      reaction: (type) => t(`candidates.rxLabel.${type}`),
                    }),
                    timeAgo: relativeTime(latest.created_at, {
                      justNow: t('notifications.timeJustNow'),
                      minutes: t('notifications.timeMinutes'),
                      hours: t('notifications.timeHours'),
                      yesterday: t('notifications.timeYesterday'),
                      days: t('notifications.timeDays'),
                    }),
                  } : null);
                } else {
                  setPartnerReaction(null);
                }
```

- [ ] **Step 3: 타입체크**

Run: `npm run validate`
Expected: 에러 없음 (`tsc --noEmit` 통과)

- [ ] **Step 4: 전체 테스트 스위트 통과 확인**

Run: `npm test`
Expected: PASS — 기존 테스트 전부 + Task 1에서 추가한 3개 포함, 회귀 없음

- [ ] **Step 5: 커밋**

```bash
git add "app/(tabs)/index.tsx"
git commit -m "$(cat <<'EOF'
fix: hide partner-reaction widget once its card is confirmed or done

Query never filtered by date_cards.status, so the home widget kept
showing reactions for cards already confirmed or moved to memories,
duplicating the 다가오는 데이트 section.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 시뮬레이터 수동 검증

**Files:** 없음 (코드 변경 없음, 확인만)

- [ ] **Step 1: 앱 실행**

`run` 스킬 또는 기존 방식으로 iOS 시뮬레이터에서 앱 실행.

- [ ] **Step 2: 회귀 확인 — 활성 후보 반응은 그대로 뜨는지**

파트너 계정으로 활성(active) 후보에 반응 남기기 → 내 계정 홈 화면에 위젯이 뜨는지 확인.

- [ ] **Step 3: 확정 후 사라지는지 확인**

그 후보를 확정(`card/confirm.tsx`에서 저장)하기 → 홈으로 돌아왔을 때 위젯이 사라지는지 확인 (다른 active 후보 반응이 없다는 전제 하에).

- [ ] **Step 4: 추억 기록 완료 후에도 안 뜨는지 확인**

확정된 데이트를 추억 기록(`status: 'done'`)까지 진행 → 홈에서 위젯이 계속 안 뜨는지 확인.

- [ ] **Step 5: 대체 확인 — 다른 active 후보 반응으로 교체되는지**

두 개 이상의 active 후보에 반응이 있는 상태 만들기 → 그중 하나를 확정 → 남은 active 후보의 반응이 위젯에 뜨는지 확인.

이 태스크는 코드 변경이 없으므로 커밋 없음. 사용자가 직접 확인 후 다음 단계로 진행.
