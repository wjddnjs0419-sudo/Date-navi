# 코스 모드 전용 결과 화면 (동선 트레일) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `make_course` 모드 결과를 가로 S자 핑크 동선 트레일로 보여주고, 한 화면당 후보 1개를 좌우 스와이프로 전환하는 전용 화면을 만든다.

**Architecture:** 순수 로직(steps 파싱, 트레일 좌표 계산, 입력 빌더)을 `lib/course.ts`·`lib/modeForm.ts`에 두고 단위 테스트한다. 신규 화면 `app/mode-flow/course-result.tsx`는 기존 result.tsx의 데이터·저장 경로를 재사용하되, 가로 페이저 + `CourseTrail`(react-native-svg) 렌더만 추가한다. 입력 `course.tsx`는 공용 패턴(BackBar/BigButton/C 토큰/buildCourseInput)으로 정렬한다.

**Tech Stack:** React Native, Expo Router, react-native-svg, TypeScript, Jest (jest-expo)

---

## File Structure

- **Create** `lib/course.ts` — 순수 함수: `parseStepsFromSummary`, `computeTrailNodes`, `buildTrailPath`. CourseStep·TrailNode 타입.
- **Modify** `lib/ai.ts` — `DateCard`에 `steps?` 추가, `CourseStep` re-export.
- **Modify** `lib/modeForm.ts` — `buildCourseInput` 추가.
- **Modify** `lib/prompt.ts` — make_course MODE_EMPHASIS(ko/en)에 steps JSON 출력 지침.
- **Create** `app/mode-flow/course-result.tsx` — 전용 결과 화면 + `CourseTrail` 컴포넌트.
- **Modify** `app/mode-flow/course.tsx` — 공용 패턴 정렬 + push 대상 변경.
- **Modify** `app/mode-flow/_layout.tsx` — `course-result` 라우트 등록(필요 시).
- **Create** `__tests__/course.test.ts` — 순수 함수 테스트.
- **Modify** `__tests__/modeForm.test.ts` — `buildCourseInput` 테스트 추가.

각 작업 후 루트에서 `npm run validate`(tsc --noEmit) 통과 확인.

---

## Task 1: CourseStep 타입과 steps 파싱

**Files:**
- Create: `lib/course.ts`
- Modify: `lib/ai.ts:45-52`
- Test: `__tests__/course.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

Create `__tests__/course.test.ts`:

```ts
import { parseStepsFromSummary } from '../lib/course';

describe('parseStepsFromSummary', () => {
  it('"N단계: … → …" 문자열을 steps로 분해', () => {
    const out = parseStepsFromSummary('1단계: 한강 피크닉 → 2단계: 카페 → 3단계: 야경 산책');
    expect(out).toHaveLength(3);
    expect(out[0].label).toBe('한강 피크닉');
    expect(out[2].label).toBe('야경 산책');
  });

  it('단계 표기가 없으면 빈 배열', () => {
    expect(parseStepsFromSummary('그냥 한 줄 요약')).toEqual([]);
  });

  it('빈 입력은 빈 배열', () => {
    expect(parseStepsFromSummary('')).toEqual([]);
    expect(parseStepsFromSummary(undefined)).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx jest course.test.ts`
Expected: FAIL — Cannot find module '../lib/course'

- [ ] **Step 3: 최소 구현**

Create `lib/course.ts`:

```ts
export type CourseStep = { label: string; desc?: string };

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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx jest course.test.ts`
Expected: PASS

- [ ] **Step 5: DateCard에 steps 추가**

Modify `lib/ai.ts` — `DateCard` 타입에 필드 추가하고 CourseStep을 re-export:

```ts
import type { CourseStep } from './course';
export type { CourseStep };

export type DateCard = {
  title: string;
  summary: string;
  estimated_time: string;
  estimated_budget: string;
  tags: string[];
  why_recommended: string;
  steps?: CourseStep[];
};
```

(`import type { CourseStep }`는 파일 상단 기존 import 블록에 추가한다.)

- [ ] **Step 6: validate**

Run: `npm run validate`
Expected: 에러 없음

- [ ] **Step 7: 커밋**

```bash
git add lib/course.ts lib/ai.ts __tests__/course.test.ts
git commit -m "feat: CourseStep 타입 + summary 단계 파서"
```

---

## Task 2: 트레일 좌표 계산 (serpentine)

**Files:**
- Modify: `lib/course.ts`
- Test: `__tests__/course.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`__tests__/course.test.ts`에 추가:

```ts
import { computeTrailNodes } from '../lib/course';

describe('computeTrailNodes', () => {
  const opts = { nodesPerRow: 2, rowHeight: 140, padX: 40, padY: 60 };

  it('노드 수만큼 좌표를 반환', () => {
    const nodes = computeTrailNodes(4, 320, opts);
    expect(nodes).toHaveLength(4);
  });

  it('첫 행은 좌→우, 둘째 행은 우→좌 (serpentine)', () => {
    const nodes = computeTrailNodes(4, 320, opts);
    // row0: x 증가
    expect(nodes[0].x).toBeLessThan(nodes[1].x);
    // row1: x 감소 (반전)
    expect(nodes[2].x).toBeGreaterThan(nodes[3].x);
    // 행이 바뀌면 y 증가
    expect(nodes[2].y).toBeGreaterThan(nodes[0].y);
  });

  it('단계 증가 시 행이 아래로 추가되어 y가 커진다', () => {
    const few = computeTrailNodes(2, 320, opts);
    const many = computeTrailNodes(6, 320, opts);
    const maxYfew = Math.max(...few.map(n => n.y));
    const maxYmany = Math.max(...many.map(n => n.y));
    expect(maxYmany).toBeGreaterThan(maxYfew);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx jest course.test.ts -t computeTrailNodes`
Expected: FAIL — computeTrailNodes is not a function

- [ ] **Step 3: 최소 구현**

`lib/course.ts`에 추가:

```ts
export type TrailNode = { x: number; y: number };
export type TrailOpts = { nodesPerRow: number; rowHeight: number; padX: number; padY: number };

/**
 * 가로 S자(serpentine)로 노드 좌표를 계산한다.
 * 각 행은 nodesPerRow개를 균등 배치하고, 홀수 행은 좌우를 반전한다.
 */
export function computeTrailNodes(stepCount: number, width: number, opts: TrailOpts): TrailNode[] {
  const { nodesPerRow, rowHeight, padX, padY } = opts;
  const usable = Math.max(1, width - padX * 2);
  const gap = nodesPerRow > 1 ? usable / (nodesPerRow - 1) : 0;
  const nodes: TrailNode[] = [];
  for (let i = 0; i < stepCount; i++) {
    const row = Math.floor(i / nodesPerRow);
    const col = i % nodesPerRow;
    const order = row % 2 === 0 ? col : nodesPerRow - 1 - col;
    const x = padX + order * gap;
    const y = padY + row * rowHeight;
    nodes.push({ x, y });
  }
  return nodes;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx jest course.test.ts -t computeTrailNodes`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/course.ts __tests__/course.test.ts
git commit -m "feat: serpentine 트레일 좌표 계산"
```

---

## Task 3: 트레일 SVG path 빌더

**Files:**
- Modify: `lib/course.ts`
- Test: `__tests__/course.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`__tests__/course.test.ts`에 추가:

```ts
import { buildTrailPath } from '../lib/course';

describe('buildTrailPath', () => {
  it('첫 노드는 M으로 시작, 이후 노드마다 곡선 명령 포함', () => {
    const d = buildTrailPath([{ x: 10, y: 10 }, { x: 100, y: 10 }, { x: 100, y: 150 }]);
    expect(d.startsWith('M 10 10')).toBe(true);
    expect(d).toMatch(/[CQ]/); // 베지어 곡선 명령
  });

  it('노드 1개 이하면 빈 문자열', () => {
    expect(buildTrailPath([])).toBe('');
    expect(buildTrailPath([{ x: 0, y: 0 }])).toBe('');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx jest course.test.ts -t buildTrailPath`
Expected: FAIL — buildTrailPath is not a function

- [ ] **Step 3: 최소 구현**

`lib/course.ts`에 추가:

```ts
/**
 * 노드들을 잇는 둥근 곡선 SVG path(d)를 만든다.
 * 연속 노드 사이를 중간점 기준 2차 베지어(Q)로 둥글게 연결한다.
 */
export function buildTrailPath(nodes: TrailNode[]): string {
  if (nodes.length < 2) return '';
  let d = `M ${nodes[0].x} ${nodes[0].y}`;
  for (let i = 1; i < nodes.length; i++) {
    const prev = nodes[i - 1];
    const cur = nodes[i];
    const cx = prev.x;
    const cy = cur.y;
    // prev에서 수직/수평으로 꺾이는 굽이를 Q로 둥글게
    d += ` Q ${cx} ${cy} ${cur.x} ${cur.y}`;
  }
  return d;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx jest course.test.ts -t buildTrailPath`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/course.ts __tests__/course.test.ts
git commit -m "feat: 트레일 곡선 SVG path 빌더"
```

---

## Task 4: buildCourseInput

**Files:**
- Modify: `lib/modeForm.ts`
- Test: `__tests__/modeForm.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`__tests__/modeForm.test.ts`의 describe 안에 추가:

```ts
import { buildCourseInput } from '../lib/modeForm';

it('course: 아이디어 freeText + 예산/시간 반영, 빈 값은 기본값', () => {
  const input = buildCourseInput({ idea: '한강 피크닉', budget: '', duration: '' });
  expect(input.freeText).toBe('한강 피크닉');
  expect(input.budget).toBe('medium');
  expect(input.duration).toBe('2-3h');
  const input2 = buildCourseInput({ idea: ' 야경 ', budget: 'high', duration: 'half_day' });
  expect(input2.freeText).toBe('야경');
  expect(input2.budget).toBe('high');
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx jest modeForm.test.ts`
Expected: FAIL — buildCourseInput is not exported

- [ ] **Step 3: 최소 구현**

`lib/modeForm.ts`에 추가:

```ts
type CourseArgs = { idea: string; budget: string; duration: string };

export function buildCourseInput(a: CourseArgs): FeelingInput {
  return {
    energy: 'medium',
    budget: a.budget || 'medium',
    distance: 'any',
    mood: 'comfortable',
    duration: a.duration || '2-3h',
    avoid: [],
    freeText: a.idea.trim() || undefined,
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx jest modeForm.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/modeForm.ts __tests__/modeForm.test.ts
git commit -m "feat: buildCourseInput 입력 빌더"
```

---

## Task 5: 프롬프트에 steps 출력 지침

**Files:**
- Modify: `lib/prompt.ts:94`, `lib/prompt.ts:100`
- Test: `__tests__/prompt.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`__tests__/prompt.test.ts`에 추가(파일 상단 import는 기존 buildPrompt 사용):

```ts
import { MODE_EMPHASIS, MODE_EMPHASIS_EN } from '../lib/prompt';

describe('make_course 프롬프트', () => {
  it('ko 지침에 steps 출력 요구가 포함', () => {
    expect(MODE_EMPHASIS.make_course).toContain('steps');
  });
  it('en 지침에 steps 출력 요구가 포함', () => {
    expect(MODE_EMPHASIS_EN.make_course).toContain('steps');
  });
});
```

(`MODE_EMPHASIS`/`MODE_EMPHASIS_EN`는 `lib/prompt.ts`에서 이미 `export const`로 노출됨 — 추가 export 불필요.)

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx jest prompt.test.ts -t make_course`
Expected: FAIL — steps 미포함

- [ ] **Step 3: 지침 수정**

`lib/prompt.ts:94` (ko) 교체:

```ts
  make_course: '\n\n【모드 특별 지침】\n아이디어를 구체적인 코스로 정리해주세요. 각 카드에 "steps" 배열을 추가하고, 시간 순서대로 3~4개 단계를 [{ "label": "장소/행동 (12자 이내)", "desc": "한 줄 보충 (20자 이내)" }] 형식으로 넣으세요. summary는 한 줄 요약을 유지하고, tags에 준비물, why_recommended에 대체안을 포함하세요.',
```

`lib/prompt.ts:100` (en) 교체:

```ts
  make_course: '\n\n【Mode guidance】\nTurn the idea into a concrete course. Add a "steps" array to each card with 3-4 ordered steps in the form [{ "label": "place/action (<=12 chars)", "desc": "one-line note (<=20 chars)" }]. Keep summary as a one-line summary, put things to prepare in tags, and a backup plan in why_recommended.',
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx jest prompt.test.ts -t make_course`
Expected: PASS

- [ ] **Step 5: validate**

Run: `npm run validate`
Expected: 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add lib/prompt.ts __tests__/prompt.test.ts
git commit -m "feat: make_course 프롬프트 steps 배열 출력 지침"
```

---

## Task 6: course.tsx 입력 화면 공용 패턴 정렬

**Files:**
- Modify: `app/mode-flow/course.tsx` (전체 교체)

- [ ] **Step 1: 화면 교체**

`app/mode-flow/course.tsx` 전체를 아래로 교체. 필드(아이디어·예산·시간)·i18n 문자열은 유지하되 배경 크림, `BackBar`/`BigButton`/`C` 토큰, `buildCourseInput`을 사용하고 push 대상을 `course-result`로 바꾼다:

```tsx
import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { buildCourseInput } from '../../lib/modeForm';
import { useI18n } from '../../lib/i18n';
import { C } from '../../constants/colors';
import { BackBar, BigButton } from '../../components/ui';

export default function CourseScreen() {
  const router = useRouter();
  const { strings: s } = useI18n();
  const c = s.course;

  const [idea, setIdea] = useState('');
  const [budget, setBudget] = useState('');
  const [duration, setDuration] = useState('');

  function handleGenerate() {
    if (!idea.trim()) {
      Alert.alert(c.errorEmpty);
      return;
    }
    const input = buildCourseInput({ idea, budget, duration });
    router.push({
      pathname: '/mode-flow/course-result',
      params: { mode: 'make_course', input: JSON.stringify(input) },
    } as any);
  }

  return (
    <SafeAreaView style={s2.safe} edges={['top']}>
      <BackBar />
      <ScrollView contentContainerStyle={s2.content} keyboardShouldPersistTaps="handled">
        <Text style={s2.modeLabel}>{c.modeLabel}</Text>
        <Text style={s2.title}>{c.title}</Text>

        <Text style={s2.sectionLabel}>{c.ideaLabel}</Text>
        <TextInput
          style={s2.ideaInput}
          placeholder={c.ideaPlaceholder}
          placeholderTextColor={C.textFaint}
          value={idea}
          onChangeText={setIdea}
          multiline
          maxLength={200}
        />
        <Text style={s2.hint}>{c.ideaHint}</Text>

        <Text style={s2.sectionLabel}>{c.budgetLabel}</Text>
        <View style={s2.optionRow}>
          {c.budgetOptions.map(opt => {
            const sel = budget === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[s2.optionCard, sel && s2.optionSelected]}
                onPress={() => setBudget(opt.value)}
                activeOpacity={0.7}
              >
                <Text style={s2.optionEmoji}>{opt.emoji}</Text>
                <Text style={[s2.optionLabel, sel && s2.optionLabelSelected]}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={s2.sectionLabel}>{c.durationLabel}</Text>
        <View style={s2.optionRow}>
          {c.durationOptions.map(opt => {
            const sel = duration === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[s2.optionCard, sel && s2.optionSelected]}
                onPress={() => setDuration(opt.value)}
                activeOpacity={0.7}
              >
                <Text style={s2.optionEmoji}>{opt.emoji}</Text>
                <Text style={[s2.optionLabel, sel && s2.optionLabelSelected]}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={{ height: 24 }} />
        <BigButton onPress={handleGenerate} variant={idea.trim() ? 'primary' : 'disabled'}>{c.generateButton}</BigButton>
      </ScrollView>
    </SafeAreaView>
  );
}

const s2 = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF8F3' },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 60 },
  modeLabel: { fontSize: 13, color: C.pinkDeep, fontWeight: '600', marginBottom: 8 },
  title: { fontSize: 24, fontWeight: '700', lineHeight: 32, color: C.text, marginBottom: 28 },
  sectionLabel: { fontSize: 15, fontWeight: '600', color: C.text, marginBottom: 12 },
  ideaInput: {
    borderWidth: 1.5, borderColor: C.border, borderRadius: 14, padding: 16,
    fontSize: 15, color: C.text, minHeight: 96, textAlignVertical: 'top',
    marginBottom: 8, backgroundColor: C.white,
  },
  hint: { fontSize: 13, color: C.textMuted, marginBottom: 28 },
  optionRow: { flexDirection: 'row', gap: 10, marginBottom: 28 },
  optionCard: {
    flex: 1, alignItems: 'center', backgroundColor: C.white, borderRadius: 14,
    paddingVertical: 16, paddingHorizontal: 4, borderWidth: 2, borderColor: 'transparent', gap: 6,
  },
  optionSelected: { backgroundColor: C.pinkLight, borderColor: C.pinkBorder },
  optionEmoji: { fontSize: 22 },
  optionLabel: { fontSize: 13, fontWeight: '600', color: C.textSub, textAlign: 'center' },
  optionLabelSelected: { color: C.pinkDeep },
});
```

참고: `BigButton`은 `disabled` prop이 없고 `variant`('primary'|'secondary'|'text'|'disabled')로 비활성 스타일을 처리한다. 빈 입력 가드는 `handleGenerate` 내부 `Alert`로 이미 처리됨.

- [ ] **Step 2: validate**

Run: `npm run validate`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add app/mode-flow/course.tsx
git commit -m "refactor: course 입력 화면 공용 패턴 정렬 + course-result 라우팅"
```

---

## Task 7: CourseTrail 컴포넌트 + course-result 화면

**Files:**
- Create: `app/mode-flow/course-result.tsx`
- Modify: `app/mode-flow/_layout.tsx` (라우트 등록 필요 시)

- [ ] **Step 1: _layout 라우트 확인**

`app/mode-flow/_layout.tsx`는 `<Stack>`만 두는 파일 기반 자동 라우팅이다(명시 `Stack.Screen` 없음). 따라서 `course-result.tsx` 파일 생성만으로 라우트가 잡힌다 — `_layout.tsx` 수정 불필요.

- [ ] **Step 2: 화면 + 트레일 작성**

Create `app/mode-flow/course-result.tsx`:

```tsx
import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, useWindowDimensions, NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { generateDateCards, getUserPreferences, type DateCard, type FeelingInput } from '../../lib/ai';
import { computeTrailNodes, buildTrailPath, parseStepsFromSummary, type CourseStep } from '../../lib/course';
import { supabase } from '../../lib/supabase';
import { logEvent } from '../../lib/analytics';
import { useI18n } from '../../lib/i18n';
import { Clock, Wallet, Send, Bookmark } from 'lucide-react-native';
import { C } from '../../constants/colors';
import { BackBar, BigButton, Badge } from '../../components/ui';

const TRAIL_OPTS = { nodesPerRow: 2, rowHeight: 150, padX: 48, padY: 56 };

function CourseTrail({ steps, width }: { steps: CourseStep[]; width: number }) {
  if (steps.length < 2) {
    return (
      <View style={{ gap: 10, paddingVertical: 16 }}>
        {steps.map((st, i) => (
          <Text key={i} style={trail.fallbackStep}>{i + 1}. {st.label}</Text>
        ))}
      </View>
    );
  }
  const nodes = computeTrailNodes(steps.length, width, TRAIL_OPTS);
  const d = buildTrailPath(nodes);
  const rows = Math.ceil(steps.length / TRAIL_OPTS.nodesPerRow);
  const height = TRAIL_OPTS.padY * 2 + (rows - 1) * TRAIL_OPTS.rowHeight;
  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Path d={d} stroke={C.pink} strokeWidth={4} fill="none" strokeLinecap="round" />
        {nodes.map((n, i) => (
          <Circle key={i} cx={n.x} cy={n.y} r={14} fill={C.white} stroke={C.pink} strokeWidth={3} />
        ))}
      </Svg>
      {nodes.map((n, i) => (
        <View key={i} style={[trail.node, { left: n.x - 14, top: n.y - 14 }]}>
          <Text style={trail.nodeNum}>{i + 1}</Text>
        </View>
      ))}
      {nodes.map((n, i) => (
        <View key={`l${i}`} style={[trail.labelBox, { left: n.x - 60, top: n.y + 18, width: 120 }]}>
          <Text style={trail.labelText} numberOfLines={1}>{steps[i].label}</Text>
          {!!steps[i].desc && <Text style={trail.descText} numberOfLines={1}>{steps[i].desc}</Text>}
        </View>
      ))}
    </View>
  );
}

export default function CourseResultScreen() {
  const { mode, input } = useLocalSearchParams<{ mode: string; input: string }>();
  const router = useRouter();
  const { language } = useI18n();
  const { width } = useWindowDimensions();

  const [cards, setCards] = useState<DateCard[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const parsed: FeelingInput = JSON.parse(input ?? '{}');
        const prefs = await getUserPreferences();
        await logEvent('mode_selected', { mode: mode ?? 'make_course' });
        const result = await generateDateCards(parsed, mode ?? 'make_course', prefs, language);
        setCards(result);
        await logEvent('ai_card_created', { mode: mode ?? 'make_course', card_count: result.length });
      } catch {
        setErrorMsg('코스를 만드는 중 문제가 생겼어요.');
      } finally {
        setLoading(false);
      }
    })();
  }, [input, language, mode]);

  function stepsOf(card: DateCard): CourseStep[] {
    return card.steps && card.steps.length > 0 ? card.steps : parseStepsFromSummary(card.summary);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from('date_planner_profiles').select('couple_id').eq('user_id', user.id).maybeSingle();
      if (!profile?.couple_id) return;
      const parsed: FeelingInput = JSON.parse(input ?? '{}');
      const rows = cards.map(card => ({
        id: Math.random().toString(36).slice(2) + Date.now().toString(36),
        couple_id: profile.couple_id,
        created_by: user.id,
        mode: mode ?? 'make_course',
        input_json: parsed,
        source: 'ai',
        title: card.title,
        summary: card.summary,
        estimated_time: card.estimated_time,
        estimated_budget: card.estimated_budget,
        tags: card.tags,
        why_recommended: card.why_recommended,
      }));
      const { error } = await supabase.from('date_cards').insert(rows);
      if (error) throw error;
      setSaved(true);
    } catch {
      setErrorMsg('저장 중 오류가 발생했어요.');
    } finally {
      setSaving(false);
    }
  }

  function onScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    setPage(Math.round(e.nativeEvent.contentOffset.x / width));
  }

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={C.pink} />
        <Text style={s.loadingText}>둘에게 맞는 코스를{'\n'}짜는 중이에요</Text>
      </View>
    );
  }

  if (errorMsg !== '' && cards.length === 0) {
    return (
      <SafeAreaView style={s.center}>
        <Text style={s.errTitle}>잠깐 문제가 생겼어요</Text>
        <BigButton onPress={() => router.back()} style={{ marginTop: 24 }}>다시 시도하기</BigButton>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <BackBar />
      <View style={s.headerArea}>
        <Badge tone="pink">AI 코스</Badge>
        <Text style={s.heading}>이런 코스는 어때요?</Text>
        <Text style={s.sub}>밀어서 후보 3개를 비교해보세요.</Text>
      </View>

      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
      >
        {cards.map((card, i) => {
          const steps = stepsOf(card);
          return (
            <ScrollView key={i} style={{ width }} contentContainerStyle={s.page}>
              <Text style={s.cardTitle}>{card.title}</Text>
              <View style={s.metaRow}>
                <View style={s.metaItem}><Clock size={13} color={C.textMuted} /><Text style={s.metaText}>{card.estimated_time}</Text></View>
                <View style={s.metaItem}><Wallet size={13} color={C.textMuted} /><Text style={s.metaText}>{card.estimated_budget}</Text></View>
              </View>

              <CourseTrail steps={steps} width={width - 40} />

              <View style={s.btnRow}>
                <TouchableOpacity style={s.sendBtn} onPress={() => router.push('/share/send' as any)}>
                  <Send size={14} color={C.white} /><Text style={s.sendText}>상대에게 보내기</Text>
                </TouchableOpacity>
                {!saved && (
                  <TouchableOpacity style={s.saveBtn} onPress={handleSave} disabled={saving}>
                    {saving ? <ActivityIndicator size="small" color={C.pinkDeep} />
                      : <><Bookmark size={14} color={C.pinkDeep} /><Text style={s.saveText}>저장</Text></>}
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          );
        })}
      </ScrollView>

      <View style={s.dots}>
        {cards.map((_, i) => (
          <View key={i} style={[s.dot, i === page && s.dotOn]} />
        ))}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF8F3' },
  center: { flex: 1, backgroundColor: '#FFF8F3', alignItems: 'center', justifyContent: 'center', padding: 32 },
  loadingText: { fontSize: 14, color: C.textSub, marginTop: 16, textAlign: 'center' },
  errTitle: { fontSize: 20, fontWeight: '700', color: C.text, textAlign: 'center' },
  headerArea: { paddingHorizontal: 20, gap: 6, marginBottom: 8 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, marginTop: 6 },
  sub: { fontSize: 13, color: C.textSub },
  page: { paddingHorizontal: 20, paddingBottom: 40 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: C.text, marginTop: 8 },
  metaRow: { flexDirection: 'row', gap: 14, marginTop: 8, marginBottom: 8 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: C.textMuted },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  sendBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14, paddingVertical: 12, backgroundColor: C.pink },
  sendText: { fontSize: 13, fontWeight: '600', color: C.white },
  saveBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: C.white, borderWidth: 1.5, borderColor: C.pinkBorder },
  saveText: { fontSize: 13, fontWeight: '600', color: C.pinkDeep },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 16 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.border },
  dotOn: { backgroundColor: C.pink, width: 18 },
});

const trail = StyleSheet.create({
  node: { position: 'absolute', width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  nodeNum: { fontSize: 12, fontWeight: '700', color: C.pinkDeep },
  labelBox: { position: 'absolute', alignItems: 'center' },
  labelText: { fontSize: 12, fontWeight: '600', color: C.text, textAlign: 'center' },
  descText: { fontSize: 10, color: C.textMuted, textAlign: 'center', marginTop: 1 },
  fallbackStep: { fontSize: 14, color: C.text },
});
```

주의:
- `Badge`/`BackBar`/`BigButton`이 실제 `components/ui.tsx`에 존재하고 위 props를 받는지 확인 후 맞춘다.
- `C.textFaint`/`C.textMuted`/`C.border`/`C.textSub` 등 토큰이 `constants/colors.ts`에 있는지 확인하고 없으면 가까운 토큰으로 대체.

- [ ] **Step 3: validate**

Run: `npm run validate`
Expected: 에러 없음. 타입/토큰 불일치는 위 주의대로 수정 후 재실행.

- [ ] **Step 4: 커밋**

```bash
git add app/mode-flow/course-result.tsx
git commit -m "feat: 코스 동선 트레일 결과 화면(course-result)"
```

---

## Task 8: 전체 검증

- [ ] **Step 1: 전체 테스트**

Run: `npx jest`
Expected: 전체 PASS

- [ ] **Step 2: validate**

Run: `npm run validate`
Expected: 에러 없음

- [ ] **Step 3: 수동 확인 (가능 시)**

앱 실행 → 모드 탭 → "코스로 정리해줘" → 입력 후 생성 → 동선 트레일 표시·좌우 스와이프·점 인디케이터 동작 확인.

- [ ] **Step 4: 최종 커밋(있으면)**

```bash
git add -A && git commit -m "test: 코스 트레일 전체 검증"
```

---

## Self-Review 메모

- 스펙 커버리지: 데이터(steps)=T1, 트레일 좌표=T2, 곡선=T3, 입력빌더=T4, 프롬프트=T5, 입력정렬=T6, 결과화면+트레일=T7. 전부 매핑됨.
- 검증된 의존성: `MODE_EMPHASIS/_EN` export됨 / `_layout.tsx`는 파일기반 자동 라우팅(수정 불필요) / `BigButton`은 variant 기반(disabled prop 없음) / `Badge`·`BackBar` 존재 / 토큰 `textSub`(#8A7F76)·`textMuted`·`textFaint`·`border` 모두 존재.
- DB `steps` 컬럼 미추가(스펙 6장 YAGNI 일치) — 저장 row에서 steps 제외.
