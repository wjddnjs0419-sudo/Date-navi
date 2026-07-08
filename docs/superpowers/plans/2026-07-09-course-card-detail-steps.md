# 코스 카드 상세 화면 steps 표시 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **이 프로젝트 실행 방식 관련 사용자 지시:** 단계별로 subagent를 불러 리뷰하지 말 것. 모든 태스크가 끝난 뒤 한 번에 리뷰한다.
>
> **⚠️ 사용자 지시: 이 플랜은 다음 세션에서 실행한다. 지금 세션에서는 실행하지 말 것.**

**Goal:** 코스 카드(`make_course`)를 저장할 때 실제 `steps`(단계별 동선) 데이터를 DB에 함께 저장하고, 카드 상세 화면(`app/card/[id].tsx`)이 `card.mode === 'make_course'`일 때 일반 템플릿 대신 코스 전용 단계 UI를 보여주게 한다. 이번 수정 이전에 저장된 카드는 `summary` 텍스트 파싱 폴백으로 최대한 복원해서 보여준다.

**Architecture:** `date_cards`에 `steps jsonb` 컬럼을 추가한다. `course-result.tsx`의 두 저장 함수(`handleSave`/`handleSendToPartner`)와 `card/[id].tsx`의 재추천(`handleGenerateAlt`)이 이 컬럼에 실제 steps를 저장한다. `course-result.tsx`에 로컬로 있던 `CourseStepList`(+`StepCard`/`StepConnector`) 컴포넌트를 `components/ui.tsx`로 옮겨 양쪽 화면이 공유한다. `lib/course.ts`에 `resolveDisplaySteps()`를 추가해 "steps 있으면 그대로, 없으면 summary 파싱" 로직을 한 곳에 모은다.

**Tech Stack:** TypeScript/React Native(Expo), Supabase Postgres, Jest.

**참고 스펙:** [docs/superpowers/specs/2026-07-09-course-card-detail-steps-design.md](../specs/2026-07-09-course-card-detail-steps-design.md)

**Supabase 프로젝트:** `wqjguifsmtblgrhdfnji`

---

### Task 1: DB 마이그레이션 — `date_cards.steps` 컬럼 추가

**Files:**
- Create: `supabase/migrations/20260709000000_add_date_cards_steps.sql`

- [ ] **Step 1: 마이그레이션 SQL 작성**

```sql
alter table public.date_cards add column if not exists steps jsonb;
comment on column public.date_cards.steps is
  'make_course 카드의 단계별 동선(CourseStep[]). feeling/next_meet 카드는 null. 이 컬럼 추가 이전에 저장된 코스 카드도 null — 상세 화면에서 summary 파싱 폴백으로 표시.';
```

- [ ] **Step 2: 원격 프로젝트에 적용**

`mcp__plugin_supabase_supabase__apply_migration` (`project_id: wqjguifsmtblgrhdfnji`, `name: add_date_cards_steps`, `query`: 위 SQL 전체).

- [ ] **Step 3: 컬럼 생성 확인**

`mcp__plugin_supabase_supabase__list_tables` (`project_id: wqjguifsmtblgrhdfnji`, `schemas: ["public"]`, `verbose: true`)로 `date_cards`에 `steps`(jsonb, nullable) 컬럼이 있는지 확인.

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/20260709000000_add_date_cards_steps.sql
git commit -m "feat(db): add date_cards.steps column for course step data"
```

---

### Task 2: `lib/course.ts` — `resolveDisplaySteps()` 추가 (TDD)

**Files:**
- Modify: `lib/course.ts`
- Test: `__tests__/course.test.ts`

- [ ] **Step 1: 실패하는 테스트 추가**

`__tests__/course.test.ts` 끝(파일 마지막)에 추가:

```ts
import { parseStepsFromSummary, resolveDisplaySteps } from '../lib/course';

describe('resolveDisplaySteps', () => {
  it('steps가 있으면 그대로 반환', () => {
    const steps = [{ label: '카페' }, { label: '산책' }];
    expect(resolveDisplaySteps({ steps, summary: '아무 요약' })).toEqual(steps);
  });
  it('steps가 없으면 summary를 파싱해서 반환', () => {
    const out = resolveDisplaySteps({ summary: '1단계: 카페 → 2단계: 산책' });
    expect(out).toHaveLength(2);
    expect(out[0].label).toBe('카페');
  });
  it('steps가 빈 배열이면 summary를 파싱해서 반환', () => {
    const out = resolveDisplaySteps({ steps: [], summary: '1단계: 브런치' });
    expect(out).toHaveLength(1);
  });
  it('steps도 없고 summary도 파싱 불가면 빈 배열', () => {
    expect(resolveDisplaySteps({ summary: '그냥 한 줄 요약' })).toEqual([]);
  });
  it('steps도 summary도 없으면 빈 배열', () => {
    expect(resolveDisplaySteps({})).toEqual([]);
  });
});
```

(파일 최상단 import 줄 `import { parseStepsFromSummary } from '../lib/course';`을 위 import로 교체 — `resolveDisplaySteps` 추가.)

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx jest __tests__/course.test.ts -t "resolveDisplaySteps"`
Expected: FAIL — `resolveDisplaySteps`가 아직 export 안 됨(모듈 에러).

- [ ] **Step 3: `lib/course.ts`에 함수 추가**

`lib/course.ts` 전체를 다음으로 교체:

```ts
// place_* 필드는 make_course candidate 단계에서 실제 장소가 결합될 때만 채워진다 (V2 §16, 하위호환).
export type CourseStep = { label: string; desc?: string; place_name?: string; place_address?: string; map_url?: string };

/**
 * "1단계: A → 2단계: B → 3단계: C" 형태의 요약을 단계 배열로 분해한다.
 * 단계 표기를 못 찾으면 빈 배열을 반환한다.
 */
export function parseStepsFromSummary(summary?: string): CourseStep[] {
  if (!summary) return [];
  const parts = summary.split('→');
  const steps: CourseStep[] = [];
  for (const part of parts) {
    const m = part.match(/\d+\s*단계\s*[:：]\s*(.+)/);
    if (m && m[1].trim()) steps.push({ label: m[1].trim() });
  }
  return steps;
}

// 카드 상세 표시용: steps가 있으면 그대로, 없으면 summary 텍스트 파싱으로 최대한 복원한다.
// place_name 등 장소 결합 정보는 텍스트 파싱으로 복원 불가 — 파싱 폴백은 label만 채운다.
export function resolveDisplaySteps(card: { steps?: CourseStep[] | null; summary?: string }): CourseStep[] {
  if (card.steps && card.steps.length > 0) return card.steps;
  return parseStepsFromSummary(card.summary);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx jest __tests__/course.test.ts`
Expected: PASS

- [ ] **Step 5: 타입체크**

Run: `npm run validate 2>&1 | grep -E "lib/course.ts|course.test.ts"`
Expected: 출력 없음

- [ ] **Step 6: 커밋**

```bash
git add lib/course.ts __tests__/course.test.ts
git commit -m "feat(course): add resolveDisplaySteps helper (steps-or-summary-parse fallback)"
```

---

### Task 3: `CourseStepList`(+`StepCard`/`StepConnector`)를 `components/ui.tsx`로 이동

**Files:**
- Modify: `components/ui.tsx`
- Modify: `app/mode-flow/course-result.tsx`

`course-result.tsx`의 `C`(`../../constants/colors`)와 `ui.tsx`의 `C`(`../constants/theme`)는 같은 객체다 — `constants/theme.ts`가 `export { C } from './colors';`로 재수출하므로 색상 키 호환 문제 없음.

- [ ] **Step 1: `components/ui.tsx` 상단 import에 `ChevronDown` 추가**

`components/ui.tsx:6`:

```ts
import { ChevronLeft, Pencil, X, Sparkles, Check, MapPin, LocateFixed, ChevronDown } from 'lucide-react-native';
```

- [ ] **Step 2: `components/ui.tsx`에 `CourseStep` 타입 import 추가**

`components/ui.tsx:11` 근처(`import type { GeoCoords } from '../lib/ai';` 다음 줄)에 추가:

```ts
import type { CourseStep } from '../lib/course';
```

- [ ] **Step 3: `components/ui.tsx` 파일 끝에 `StepConnector`/`StepCard`/`CourseStepList`와 `stepS` 스타일 추가**

파일 맨 끝에 추가(기존 `PlaceRow`가 이미 이 파일에 있으므로 그대로 참조 가능):

```ts
function StepConnector() {
  return (
    <View style={stepS.connector}>
      <View style={stepS.connectorLine} />
      <View style={stepS.connectorDot}>
        <ChevronDown size={12} color={C.pinkDeep} strokeWidth={2.5} />
      </View>
      <View style={stepS.connectorLine} />
    </View>
  );
}

function StepCard({ step, index }: { step: CourseStep; index: number }) {
  return (
    <View style={stepS.card}>
      <View style={stepS.titleRow}>
        <View style={stepS.badge}>
          <Text style={stepS.badgeNum}>{index + 1}</Text>
        </View>
        <Text style={stepS.title}>{step.label}</Text>
      </View>
      {!!step.desc && <Text style={stepS.desc}>{step.desc}</Text>}
      {!!step.place_name && (
        <PlaceRow
          name={step.place_name}
          address={step.place_address}
          url={step.map_url}
          size="compact"
          style={stepS.placeRow}
        />
      )}
    </View>
  );
}

// 코스 단계별 동선 표시 — course-result.tsx(추천 직후)와 card/[id].tsx(저장된 카드 재조회)가 공유한다.
export function CourseStepList({ steps, summary }: { steps: CourseStep[]; summary?: string }) {
  if (steps.length === 0) {
    if (!summary) return null;
    return (
      <View style={stepS.card}>
        <Text style={stepS.fallbackText}>{summary}</Text>
      </View>
    );
  }
  return (
    <View>
      {steps.map((step, i) => (
        <View key={i}>
          <StepCard step={step} index={i} />
          {i < steps.length - 1 && <StepConnector />}
        </View>
      ))}
    </View>
  );
}

const stepS = StyleSheet.create({
  card: {
    backgroundColor: C.white,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: C.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, borderColor: C.pink, backgroundColor: C.white,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  badgeNum: { fontSize: 11, fontWeight: '700', color: C.pink, lineHeight: 11 },
  title: { fontSize: 15, fontWeight: '700', color: C.text },
  desc: { fontSize: 12, color: C.textSub, marginTop: 3, marginLeft: 34 },
  placeRow: { marginTop: 9, marginLeft: 34 },
  connector: { alignItems: 'center', height: 30, justifyContent: 'center' },
  connectorLine: { width: 1.5, height: 8, backgroundColor: C.borderLight },
  connectorDot: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: C.pinkLight, alignItems: 'center', justifyContent: 'center',
  },
  fallbackText: { fontSize: 14, color: C.text, lineHeight: 20 },
});
```

- [ ] **Step 4: `course-result.tsx`에서 로컬 정의 제거하고 공유 컴포넌트 사용**

`app/mode-flow/course-result.tsx:1-71`(import 줄부터 로컬 `StepConnector`/`StepCard`/`CourseStepList` 정의까지)을 다음으로 교체:

```tsx
import { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, useWindowDimensions, Alert,
  type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { type DateCard, type FeelingInput } from '../../lib/ai';
import { resolveDisplaySteps } from '../../lib/course';
import { supabase } from '../../lib/supabase';
import { Clock, Wallet, Send, Bookmark } from 'lucide-react-native';
import { C } from '../../constants/colors';
import { BackBar, BigButton, Badge, PlaceRow, CourseStepList } from '../../components/ui';
import { useI18n } from '../../lib/i18n';
```

(`ChevronDown` import 삭제 — 더 이상 이 파일에서 안 씀. `parseStepsFromSummary` import를 `resolveDisplaySteps`로 교체.)

- [ ] **Step 5: `stepsOf()` 로컬 함수를 `resolveDisplaySteps` 호출로 교체**

`app/mode-flow/course-result.tsx`의 `function stepsOf(card: DateCard): CourseStep[] { ... }` 정의를 삭제하고, 호출부(`const steps = stepsOf(card);`)를 다음으로 교체:

```tsx
              const steps = resolveDisplaySteps(card);
```

(`CourseStep` 타입 import도 더 이상 직접 안 쓰므로 정리.)

- [ ] **Step 6: 파일 끝의 `stepS` `StyleSheet.create` 블록 삭제**

`app/mode-flow/course-result.tsx` 맨 끝의 `const stepS = StyleSheet.create({ ... });` 블록 전체 삭제(`components/ui.tsx`로 이동했으므로 중복 제거).

- [ ] **Step 7: 타입체크**

Run: `npm run validate 2>&1 | grep -E "components/ui.tsx|course-result.tsx"`
Expected: 출력 없음

- [ ] **Step 8: 테스트 확인**

Run: `npm test`
Expected: 전체 통과(이 태스크는 로직 변경 없이 컴포넌트 위치만 옮긴 것이라 기존 테스트 영향 없음)

- [ ] **Step 9: 커밋**

```bash
git add components/ui.tsx app/mode-flow/course-result.tsx
git commit -m "refactor(ui): extract CourseStepList to shared components/ui.tsx"
```

---

### Task 4: `course-result.tsx` 저장 로직 — 실제 `steps` 저장

**Files:**
- Modify: `app/mode-flow/course-result.tsx`

- [ ] **Step 1: `handleSendToPartner()`의 insert에 `steps` 추가**

`app/mode-flow/course-result.tsx`의 `handleSendToPartner()` 안 `supabase.from('date_cards').insert({...})` 호출에서 `map_url: card.map_url ?? null,` 다음 줄에 추가:

```ts
        steps: card.steps ?? null,
```

- [ ] **Step 2: `handleSave()`의 insert에도 동일하게 추가**

`handleSave()` 안 `supabase.from('date_cards').insert({...})` 호출에서도 동일하게 `map_url: card.map_url ?? null,` 다음 줄에 추가:

```ts
        steps: card.steps ?? null,
```

- [ ] **Step 3: 타입체크**

Run: `npm run validate 2>&1 | grep "course-result.tsx"`
Expected: 출력 없음

- [ ] **Step 4: 커밋**

```bash
git add app/mode-flow/course-result.tsx
git commit -m "feat(course-result): persist steps when saving/sending a course card"
```

---

### Task 5: `card/[id].tsx` 재추천 — 새로 생성된 카드도 `steps` 저장

**Files:**
- Modify: `app/card/[id].tsx`

- [ ] **Step 1: `handleGenerateAlt()`의 insert에 `steps` 추가**

`app/card/[id].tsx`의 `handleGenerateAlt()` 안 `for (const nc of newCards) { await supabase.from('date_cards').insert({...}) }` 호출에서 `map_url: nc.map_url ?? null,` 다음 줄에 추가:

```ts
          steps: nc.steps ?? null,
```

- [ ] **Step 2: 타입체크**

Run: `npm run validate 2>&1 | grep "card/\[id\].tsx"`
Expected: 출력 없음

- [ ] **Step 3: 커밋**

```bash
git add "app/card/[id].tsx"
git commit -m "fix(card-detail): persist steps when regenerating a card via condition tag"
```

---

### Task 6: `card/[id].tsx` — `make_course` 카드에 코스 단계 UI 표시

**Files:**
- Modify: `app/card/[id].tsx`

`select('*')`로 전체 컬럼을 이미 조회하므로 Task 1의 마이그레이션 이후엔 별도 쿼리 수정 없이 `card.steps`가 자동으로 실려온다.

- [ ] **Step 1: import 추가**

`app/card/[id].tsx:18`(`import { PlaceRow } from '../../components/ui';`)을 다음으로 교체:

```ts
import { PlaceRow, CourseStepList } from '../../components/ui';
import { resolveDisplaySteps, type CourseStep } from '../../lib/course';
```

- [ ] **Step 2: `CardDetail` 타입에 `steps` 필드 추가**

`app/card/[id].tsx:20-35`(`CardDetail` 타입)를 다음으로 교체:

```ts
type CardDetail = {
  id: string;
  title: string;
  summary: string;
  estimated_time: string;
  estimated_budget: string;
  tags: string[];
  why_recommended: string;
  place_name?: string | null;
  place_address?: string | null;
  map_url?: string | null;
  mode: string;
  created_at: string;
  steps?: CourseStep[] | null;
  // 원본 추천 입력. 조건 재생성 시 location/coords를 보존하려면 필요 (V2 §15).
  input_json?: Partial<FeelingInput> | null;
};
```

- [ ] **Step 3: 제목 아래 요약 표시를 조건부로 교체**

`app/card/[id].tsx:228-229`:

```tsx
          <Text style={styles.title}>{card.title}</Text>
          <Text style={styles.summary}>{card.summary}</Text>
```

를 다음으로 교체:

```tsx
          <Text style={styles.title}>{card.title}</Text>
          {card.mode === 'make_course' ? (
            <View style={styles.stepsWrap}>
              <CourseStepList steps={resolveDisplaySteps(card)} summary={card.summary} />
            </View>
          ) : (
            <Text style={styles.summary}>{card.summary}</Text>
          )}
```

- [ ] **Step 4: `stepsWrap` 스타일 추가**

`app/card/[id].tsx`의 `const styles = StyleSheet.create({ ... })`에서 `summary: { fontSize: 15, color: '#555', lineHeight: 22, marginBottom: 16 },` 다음 줄에 추가:

```ts
  stepsWrap: { marginBottom: 16 },
```

- [ ] **Step 5: 타입체크**

Run: `npm run validate 2>&1 | grep "card/\[id\].tsx"`
Expected: 출력 없음

- [ ] **Step 6: 커밋**

```bash
git add "app/card/[id].tsx"
git commit -m "feat(card-detail): show course step UI for make_course cards"
```

---

### Task 7: 전체 검증 + 실제 앱 수동 테스트

**Files:** 없음(검증 전용)

- [ ] **Step 1: 전체 테스트 스위트**

Run: `npm test`
Expected: 전체 통과

- [ ] **Step 2: 전체 타입체크**

Run: `npm run validate`
Expected: 에러 없음

- [ ] **Step 3: 실제 앱에서 수동 확인**

시뮬레이터에서 앱 리로드 후:
1. "코스로 정리해줘"로 새 코스 추천 생성 → 저장(하트/저장 버튼).
2. "우리 후보" 탭에서 방금 저장한 카드를 열어 상세 화면 진입 → 단계별 동선 UI(①②③ 배지 + 화살표 커넥터)가 보이는지 확인 — 일반 요약 텍스트가 아니라 코스 UI여야 함.
3. **이번 수정 전에 저장된 기존 코스 카드**(있다면)를 열어봐서, `steps` 컬럼이 비어있어도 `summary` 파싱 폴백으로 그럴싸하게 단계가 복원되는지(또는 파싱 불가능한 요약이면 요약 텍스트가 카드 형태로라도 보이는지) 확인.
4. "느낌만 말할게"로 만든 일반(feeling) 카드는 기존처럼 요약 텍스트로 보이는지(회귀 없는지) 확인.
5. 카드 상세에서 조건태그로 재추천(`handleGenerateAlt`)한 새 코스 카드도 상세 화면에서 단계 UI로 보이는지 확인.

- [ ] **Step 4: DB에서 steps 저장 확인**

`mcp__plugin_supabase_supabase__execute_sql` (`project_id: wqjguifsmtblgrhdfnji`):

```sql
select id, mode, steps
from public.date_cards
where mode = 'make_course'
order by created_at desc
limit 3;
```

Expected: 방금 저장한 코스 카드의 `steps`가 `null`이 아니라 실제 단계 배열 JSON으로 채워져 있는지 확인.

---

## 완료 후 리뷰

Task 1~7을 끝까지 진행한 뒤, 마지막에 한 번 `/code-review`로 전체 변경사항을 리뷰한다.
