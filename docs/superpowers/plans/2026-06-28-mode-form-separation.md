# 데이트 모드 폼/프롬프트 분리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기획(Proposal.md 5.3)대로 카드형 3모드(앱이 골라줘/느낌만 말할게/가볍게)의 입력폼과 AI 프롬프트를 차별화하고, mode id 매핑·라우팅 버그를 수정한다.

**Architecture:** 순수 프롬프트 로직(buildPrompt + MODE 매핑)을 supabase 비의존 모듈 `lib/prompt.ts`로 추출해 jest로 단위 테스트한다. mode별 `FeelingInput` 빌더는 `lib/modeForm.ts`로 분리해 테스트한다. 입력 화면은 mode별 파일(pick/feeling/light)로 분리한다.

**Tech Stack:** React Native (Expo Router), TypeScript, jest-expo (신규).

---

## 사전 메모

- 현재 working tree에는 우리 작업과 **무관한** 미커밋 변경(Gemini→Supabase 마이그레이션, mood_tags)이 다수 떠있다. 커밋 시 **우리 작업 파일만 선별 `git add`** 한다. `git add .` / `git commit -am` 금지.
- `lib/ai.ts`도 무관 변경이 있으므로, 우리 로직은 신규 파일(`lib/prompt.ts`, `lib/modeForm.ts`)로 최대한 격리하고 `lib/ai.ts`는 import 한 줄만 바꾼다.
- 검증 명령: 타입은 `npm run validate` (= `tsc --noEmit`), 테스트는 `npx jest`.
- `FeelingInput`의 모든 필드는 `string` 타입(union 아님)이라 새 mood/chip 값 추가 시 타입 변경 불필요. 단, 라벨이 필요하면 `MOOD_MAP`에 추가한다.

## File Structure

- `lib/prompt.ts` (신규) — `buildPrompt`, `MODE_CONTEXT(_EN)`, `MODE_EMPHASIS(_EN)`, 각 `*_MAP(_EN)` 상수. supabase 비의존 순수 함수.
- `lib/modeForm.ts` (신규) — mode별 `FeelingInput` 빌더(`buildFeelingInputForLight` 등).
- `lib/ai.ts` (수정) — 위 상수/함수 정의 제거 후 `lib/prompt.ts`에서 import. `generateDateCards`/`generateSoftMessage` 본문은 유지.
- `app/mode-flow/pick.tsx` (신규) — 앱이 골라줘 조건칩 폼.
- `app/mode-flow/feeling.tsx` (수정) — 느낌만 말할게: 자유텍스트 + 분위기칩.
- `app/mode-flow/light.tsx` (신규) — 가볍게: 최소 입력.
- `app/(tabs)/mode.tsx` (수정) — mode별 라우팅 분기 + soft_message 경로 수정.
- `__tests__/prompt.test.ts` (신규) — buildPrompt 단위 테스트.
- `__tests__/modeForm.test.ts` (신규) — 빌더 단위 테스트.
- `jest.config.js`, `package.json` (수정) — jest-expo 설정.

---

### Task 1: jest-expo 테스트 인프라 구축

**Files:**
- Modify: `package.json`
- Create: `jest.config.js`
- Create: `__tests__/smoke.test.ts`

- [ ] **Step 1: jest-expo 설치**

```bash
npx expo install -- --save-dev jest-expo jest @types/jest
```

(expo install이 devDep 플래그를 못 받으면 `npm i -D jest-expo jest @types/jest` 사용.)

- [ ] **Step 2: jest.config.js 작성**

```js
module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg))',
  ],
};
```

- [ ] **Step 3: package.json에 test 스크립트 추가**

`scripts`에 추가:

```json
"test": "jest"
```

- [ ] **Step 4: 스모크 테스트 작성**

`__tests__/smoke.test.ts`:

```ts
describe('jest 동작 확인', () => {
  it('1 + 1 = 2', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: 테스트 실행해 통과 확인**

Run: `npx jest __tests__/smoke.test.ts`
Expected: PASS (1 passed)

- [ ] **Step 6: 커밋**

```bash
git add package.json package-lock.json jest.config.js __tests__/smoke.test.ts
git commit -m "test: jest-expo 테스트 인프라 추가"
```

---

### Task 2: 프롬프트 로직 추출 + mode 키 정합 + emphasis 신설 (TDD)

DB 저장값(`mode.tsx` id)과 프롬프트 키를 일치시키고, 순수 로직을 `lib/prompt.ts`로 옮긴다.

**Files:**
- Create: `lib/prompt.ts`
- Modify: `lib/ai.ts`
- Test: `__tests__/prompt.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`__tests__/prompt.test.ts`:

```ts
import { buildPrompt } from '../lib/prompt';
import type { FeelingInput } from '../lib/ai';

const base: FeelingInput = {
  energy: 'low', budget: 'low', distance: 'near',
  mood: 'comfortable', duration: '1h', avoid: [],
};

describe('buildPrompt mode별 차별화 (ko)', () => {
  it('pick_for_me: 조건 충실/무난 지침 포함', () => {
    const p = buildPrompt(base, 'pick_for_me');
    expect(p).toContain('계획이 귀찮');
    expect(p).toContain('실패 확률');
  });

  it('feeling: 감정/분위기 구체화 지침 포함', () => {
    const p = buildPrompt(base, 'feeling');
    expect(p).toContain('끌리는 분위기');
    expect(p).toContain('감성');
  });

  it('light: 저예산/근거리 지침 포함', () => {
    const p = buildPrompt(base, 'light');
    expect(p).toContain('피곤');
    expect(p).toContain('저예산');
  });

  it('make_course: 단계별 동선 지침 포함', () => {
    const p = buildPrompt(base, 'make_course');
    expect(p).toContain('1단계');
  });
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `npx jest __tests__/prompt.test.ts`
Expected: FAIL ("Cannot find module '../lib/prompt'")

- [ ] **Step 3: lib/prompt.ts 생성 (ai.ts에서 이동 + 키 정합 + emphasis 신설)**

`lib/ai.ts`에서 다음 정의를 잘라내 `lib/prompt.ts`로 옮기고 각각 `export` 한다: `ENERGY_MAP`, `BUDGET_MAP`, `DISTANCE_MAP`, `MOOD_MAP`, `DURATION_MAP`, `AVOID_MAP`(및 `_EN` 버전), `MODE_CONTEXT(_EN)`, `MODE_EMPHASIS(_EN)`, `PLANNING_STYLE_MAP(_EN)`, `MOOD_PREF_MAP(_EN)`, `buildPreferencesBlock`, `buildPrompt`. 파일 상단에 `import type { AppLanguage } from './i18n';` 와 `import type { FeelingInput, UserPreferences } from './ai';` 를 추가한다.

이동하면서 `MODE_CONTEXT`/`MODE_CONTEXT_EN`/`MODE_EMPHASIS`/`MODE_EMPHASIS_EN`의 키를 DB 저장값에 맞춰 수정한다:

```ts
export const MODE_CONTEXT: Record<string, string> = {
  pick_for_me: '계획이 귀찮아서 앱이 대신 골라주길 원하는 커플',
  feeling: '끌리는 분위기만 알고 있는 커플',
  light: '피곤하고 부담 없이 가볍게 하고 싶은 커플',
  next_meet: '다음 만남을 위해 미리 계획을 세우고 싶은 커플',
  make_course: '아이디어는 있지만 코스로 구체화가 필요한 커플',
};

export const MODE_CONTEXT_EN: Record<string, string> = {
  pick_for_me: 'A couple that wants the app to pick because planning feels tiring',
  feeling: 'A couple that only knows the vibe they want',
  light: 'A couple that wants something easy and light',
  next_meet: 'A couple saving ideas for their next meeting',
  make_course: 'A couple with ideas that need to be turned into a plan',
};

export const MODE_EMPHASIS: Record<string, string> = {
  pick_for_me: '\n\n【모드 특별 지침】\n입력한 조건에 충실하면서 무난하고 실패 확률이 낮은, 둘 다 만족할 가능성이 높은 후보를 우선 추천하세요. 특별한 준비 없이 쉽게 실행 가능한 데이트를 강조하세요.',
  feeling: '\n\n【모드 특별 지침】\n사용자가 남긴 러프한 분위기와 감정을 감성적이고 구체적인 데이트 카드로 변환하세요. 자유 메모의 뉘앙스를 적극 반영하고, 분위기가 살아나는 장면을 그리듯 추천하세요.',
  light: '\n\n【모드 특별 지침】\n저예산, 근거리, 짧은 시간, 체력 소모가 적은 데이트를 우선 추천하세요. 이동 거리가 짧고 특별한 준비 없이도 즐길 수 있는 가볍고 편안한 후보를 강조하세요.',
  make_course: '\n\n【모드 특별 지침】\n아이디어를 구체적인 코스로 정리해주세요. summary 필드에 "1단계: … → 2단계: … → 3단계: …" 형식의 단계별 동선을 포함하고, tags에 준비할 것을 넣고, why_recommended에 대체안을 포함하세요.',
};

export const MODE_EMPHASIS_EN: Record<string, string> = {
  pick_for_me: '\n\n【Mode guidance】\nPrioritize safe, reliable options that satisfy both partners and stay faithful to the given conditions. Emphasize dates that need no special preparation and are easy to execute.',
  feeling: '\n\n【Mode guidance】\nTurn the rough vibe and emotions the user left into a concrete, emotionally resonant date card. Actively reflect the nuance of the free-text note and paint a vivid scene.',
  light: '\n\n【Mode guidance】\nPrioritize low-budget, nearby, short, low-effort dates. Suggest options that require no special preparation and are easy on the body.',
  make_course: '\n\n【Mode guidance】\nTurn the idea into a concrete step-by-step course. In the summary field, include steps like "Step 1: … → Step 2: … → Step 3: …", put things to prepare in tags, and include a backup plan in why_recommended.',
};
```

`buildPrompt` 함수 본문은 그대로 유지(시그니처: `buildPrompt(input: FeelingInput, mode: string, prefs?: UserPreferences, language: AppLanguage = 'ko')`). `special_date`/`low_risk`/`feeling_only`/`light_date`/`next_time` 키는 제거된다.

- [ ] **Step 4: lib/ai.ts에서 import 연결**

`lib/ai.ts` 상단에 추가:

```ts
import { buildPrompt } from './prompt';
```

`lib/ai.ts`에 남은 `generateDateCards`/`generateSoftMessage`/`buildSoftMessagePrompt`는 그대로 둔다. (`buildSoftMessagePrompt`가 위 `*_MAP`을 쓰면 그 함수도 `lib/prompt.ts`로 함께 옮기거나 필요한 상수를 import 한다. soft message는 reasons 기반이라 대개 무관 — 의존 여부를 grep으로 확인 후 처리.)

- [ ] **Step 5: 테스트 실행해 통과 확인**

Run: `npx jest __tests__/prompt.test.ts`
Expected: PASS (4 passed)

- [ ] **Step 6: 타입체크**

Run: `npm run validate`
Expected: 에러 없음

- [ ] **Step 7: 커밋**

```bash
git add lib/prompt.ts lib/ai.ts __tests__/prompt.test.ts
git commit -m "fix: mode id 정합 + 프롬프트 로직 lib/prompt.ts 추출

feeling_only/light_date 키 불일치로 죽어있던 mode별 프롬프트 차별화 복구.
pick_for_me/feeling emphasis 신설."
```

---

### Task 3: mode별 FeelingInput 빌더 + 분위기 mood 매핑 (TDD)

**Files:**
- Create: `lib/modeForm.ts`
- Modify: `lib/prompt.ts` (`MOOD_MAP`/`MOOD_MAP_EN`에 분위기 값 추가)
- Test: `__tests__/modeForm.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`__tests__/modeForm.test.ts`:

```ts
import { buildLightInput, buildPickInput, buildFeelingInput } from '../lib/modeForm';

describe('mode별 FeelingInput 빌더', () => {
  it('light: 저예산·근거리 고정', () => {
    const input = buildLightInput({ duration: '1h' });
    expect(input.budget).toBe('low');
    expect(input.distance).toBe('near');
    expect(input.duration).toBe('1h');
    expect(input.freeText).toBeUndefined();
  });

  it('pick: 조건 그대로, freeText 없음', () => {
    const input = buildPickInput({ energy: 'low', budget: 'medium', distance: 'near', duration: '2-3h' });
    expect(input.budget).toBe('medium');
    expect(input.freeText).toBeUndefined();
  });

  it('feeling: 분위기 mood + freeText 반영', () => {
    const input = buildFeelingInput({ mood: 'quiet', freeText: '조용한 데이트', budget: 'low', duration: '1h' });
    expect(input.mood).toBe('quiet');
    expect(input.freeText).toBe('조용한 데이트');
  });
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `npx jest __tests__/modeForm.test.ts`
Expected: FAIL ("Cannot find module '../lib/modeForm'")

- [ ] **Step 3: lib/modeForm.ts 작성**

```ts
import type { FeelingInput } from './ai';

type PickArgs = { energy: string; budget: string; distance: string; duration: string };
type FeelingArgs = { mood: string; budget: string; duration: string; freeText?: string };
type LightArgs = { duration: string };

export function buildPickInput(a: PickArgs): FeelingInput {
  return {
    energy: a.energy, budget: a.budget, distance: a.distance,
    mood: 'comfortable', duration: a.duration, avoid: [],
  };
}

export function buildFeelingInput(a: FeelingArgs): FeelingInput {
  return {
    energy: 'medium', budget: a.budget, distance: 'any',
    mood: a.mood, duration: a.duration, avoid: [],
    freeText: a.freeText?.trim() || undefined,
  };
}

export function buildLightInput(a: LightArgs): FeelingInput {
  return {
    energy: 'low', budget: 'low', distance: 'near',
    mood: 'comfortable', duration: a.duration, avoid: [],
  };
}
```

- [ ] **Step 4: lib/prompt.ts의 MOOD_MAP에 분위기 값 추가**

`MOOD_MAP`에 추가:

```ts
  quiet: '조용하고 차분하게',
  new: '새롭고 색다르게',
```

`MOOD_MAP_EN`에 추가:

```ts
  quiet: 'Quiet and calm',
  new: 'Fresh and new',
```

(기존 `comfortable`/`fun`/`romantic`는 유지.)

- [ ] **Step 5: 테스트 실행해 통과 확인**

Run: `npx jest __tests__/modeForm.test.ts`
Expected: PASS (3 passed)

- [ ] **Step 6: 커밋**

```bash
git add lib/modeForm.ts lib/prompt.ts __tests__/modeForm.test.ts
git commit -m "feat: mode별 FeelingInput 빌더 + 분위기 mood 매핑 추가"
```

---

### Task 4: 앱이 골라줘 화면 (pick.tsx)

조건칩만 — 자유텍스트 없음.

**Files:**
- Create: `app/mode-flow/pick.tsx`

- [ ] **Step 1: pick.tsx 작성**

`app/mode-flow/feeling.tsx`(현재 버전)를 토대로, **자유텍스트 입력(`freeInputWrap`/`freeInput`/`freeText` state)을 제거**하고, 컨디션 선택을 명시적 칩으로 추가한다. `handleGenerate`는 `buildPickInput`을 사용한다.

```tsx
import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { buildPickInput } from '../../lib/modeForm';
import { C } from '../../constants/colors';
import { BackBar, BigButton, Chip } from '../../components/ui';

const ENERGY = [
  { v: 'low', label: '피곤해' },
  { v: 'medium', label: '보통' },
  { v: 'high', label: '쌩쌩해' },
];
const DISTANCES = [
  { v: 'near', label: '가까이' },
  { v: 'any', label: '상관없음' },
];
const BUDGETS = [
  { v: 'low', label: '아끼기' },
  { v: 'medium', label: '적당히' },
  { v: 'high', label: '특별하게' },
];
const DURATIONS = [
  { v: '1h', label: '1시간' },
  { v: '2-3h', label: '2~3시간' },
  { v: 'half_day', label: '반나절' },
  { v: 'full_day', label: '하루' },
];

export default function PickScreen() {
  const router = useRouter();
  const [energy, setEnergy] = useState('medium');
  const [distance, setDistance] = useState('near');
  const [budget, setBudget] = useState('low');
  const [duration, setDuration] = useState('2-3h');

  function handleGenerate() {
    const input = buildPickInput({ energy, budget, distance, duration });
    router.push({
      pathname: '/mode-flow/generating',
      params: { mode: 'pick_for_me', input: JSON.stringify(input) },
    } as any);
  }

  function Row({ label, items, value, onSelect }: {
    label: string; items: { v: string; label: string }[]; value: string; onSelect: (v: string) => void;
  }) {
    return (
      <>
        <Text style={s.sectionLabel}>{label}</Text>
        <View style={s.row}>
          {items.map(it => (
            <TouchableOpacity
              key={it.v}
              onPress={() => onSelect(it.v)}
              activeOpacity={0.7}
              style={[s.btn, value === it.v && s.btnOn]}
            >
              <Text style={[s.btnText, value === it.v && s.btnTextOn]}>{it.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFF8F3' }}>
      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          <BackBar />
          <View style={{ marginTop: 16 }}>
            <Text style={s.heading}>조건만 알려주세요{'\n'}앱이 골라드릴게요</Text>
            <Text style={s.subText}>고민 없이 조건만 고르면 후보 3개를 뽑아드려요.</Text>
          </View>
          <Row label="컨디션" items={ENERGY} value={energy} onSelect={setEnergy} />
          <Row label="이동 거리" items={DISTANCES} value={distance} onSelect={setDistance} />
          <Row label="예산" items={BUDGETS} value={budget} onSelect={setBudget} />
          <Row label="시간" items={DURATIONS} value={duration} onSelect={setDuration} />
          <View style={{ height: 120 }} />
        </ScrollView>
        <View style={s.footer}>
          <BigButton onPress={handleGenerate}>데이트 후보 만들기</BigButton>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 29 },
  subText: { fontSize: 13, color: C.textSub, lineHeight: 20, marginTop: 8 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: C.text, marginTop: 20, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  btn: {
    flex: 1, minWidth: 72, borderRadius: 14, paddingVertical: 12, alignItems: 'center',
    backgroundColor: C.white, borderWidth: 1.5, borderColor: C.border,
  },
  btnOn: { backgroundColor: C.pinkLight, borderColor: C.pinkBorder },
  btnText: { fontSize: 13, color: '#4A4A55', fontWeight: '500' },
  btnTextOn: { color: C.pinkDeep, fontWeight: '600' },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20, paddingBottom: 32, paddingTop: 16, backgroundColor: '#FFF8F3',
  },
});
```

- [ ] **Step 2: 타입체크**

Run: `npm run validate`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add app/mode-flow/pick.tsx
git commit -m "feat: 앱이 골라줘 전용 조건칩 화면(pick.tsx)"
```

---

### Task 5: 느낌만 말할게 화면 재구성 (feeling.tsx)

자유텍스트(주) + 분위기칩 중심으로 바꾼다.

**Files:**
- Modify: `app/mode-flow/feeling.tsx`

- [ ] **Step 1: feeling.tsx 재작성**

기존 `QUICK_CHIPS`(조건성 칩) 대신 **분위기칩**으로 교체하고, 분위기 선택을 단일 `mood` 값으로 만든다. `handleGenerate`는 `buildFeelingInput` 사용. `mode` 파라미터 의존 제거(이 화면은 항상 `feeling`).

```tsx
import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { buildFeelingInput } from '../../lib/modeForm';
import { C } from '../../constants/colors';
import { BackBar, BigButton, Chip } from '../../components/ui';

const MOODS = [
  { v: 'comfortable', label: '편안하게' },
  { v: 'fun', label: '활기차게' },
  { v: 'romantic', label: '로맨틱하게' },
  { v: 'quiet', label: '조용하게' },
  { v: 'new', label: '새롭게' },
];
const BUDGETS = ['아끼기', '적당히', '특별하게'];
const DURATIONS = ['1시간', '2~3시간', '반나절', '하루'];

export default function FeelingScreen() {
  const router = useRouter();
  const [freeText, setFreeText] = useState('');
  const [mood, setMood] = useState('comfortable');
  const [budget, setBudget] = useState('아끼기');
  const [duration, setDuration] = useState('2~3시간');

  function handleGenerate() {
    const input = buildFeelingInput({
      mood,
      freeText,
      budget: budget === '아끼기' ? 'low' : budget === '적당히' ? 'medium' : 'high',
      duration: duration === '1시간' ? '1h' : duration === '2~3시간' ? '2-3h' : duration === '반나절' ? 'half_day' : 'full_day',
    });
    router.push({
      pathname: '/mode-flow/generating',
      params: { mode: 'feeling', input: JSON.stringify(input) },
    } as any);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFF8F3' }}>
      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <BackBar />
          <View style={{ marginTop: 16 }}>
            <Text style={s.heading}>오늘 끌리는 느낌만{'\n'}알려주세요</Text>
            <Text style={s.subText}>대충 말해도 괜찮아요. 분위기를 데이트 카드로 정리해드릴게요.</Text>
          </View>

          <View style={s.freeInputWrap}>
            <TextInput
              style={s.freeInput}
              placeholder="예: 오늘은 조용히 대화하면서 분위기 있는 데가 좋아."
              placeholderTextColor={C.textFaint}
              value={freeText}
              onChangeText={setFreeText}
              multiline
            />
          </View>

          <Text style={s.sectionLabel}>분위기</Text>
          <View style={s.chips}>
            {MOODS.map(m => (
              <Chip key={m.v} selected={mood === m.v} tone="pink" onPress={() => setMood(m.v)}>
                {m.label}
              </Chip>
            ))}
          </View>

          <Text style={s.sectionLabel}>예산</Text>
          <View style={s.triRow}>
            {BUDGETS.map(b => (
              <TouchableOpacity key={b} onPress={() => setBudget(b)} activeOpacity={0.7} style={[s.triBtn, budget === b && s.triBtnOn]}>
                <Text style={[s.triBtnText, budget === b && s.triBtnTextOn]}>{b}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={s.sectionLabel}>시간</Text>
          <View style={s.quadRow}>
            {DURATIONS.map(d => (
              <TouchableOpacity key={d} onPress={() => setDuration(d)} activeOpacity={0.7} style={[s.quadBtn, duration === d && s.quadBtnOn]}>
                <Text style={[s.quadBtnText, duration === d && s.quadBtnTextOn]}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ height: 120 }} />
        </ScrollView>
        <View style={s.footer}>
          <BigButton onPress={handleGenerate}>데이트 후보 만들기</BigButton>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 29 },
  subText: { fontSize: 13, color: C.textSub, lineHeight: 20, marginTop: 8 },
  freeInputWrap: { backgroundColor: C.white, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: C.border, minHeight: 90, marginTop: 20 },
  freeInput: { fontSize: 13, color: C.text, lineHeight: 22 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: C.text, marginTop: 20, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  triRow: { flexDirection: 'row', gap: 8 },
  triBtn: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center', backgroundColor: C.white, borderWidth: 1.5, borderColor: C.border },
  triBtnOn: { backgroundColor: C.pinkLight, borderColor: C.pinkBorder },
  triBtnText: { fontSize: 13, color: '#4A4A55', fontWeight: '500' },
  triBtnTextOn: { color: C.pinkDeep, fontWeight: '600' },
  quadRow: { flexDirection: 'row', gap: 8 },
  quadBtn: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center', backgroundColor: C.white, borderWidth: 1.5, borderColor: C.border },
  quadBtnOn: { backgroundColor: C.pinkLight, borderColor: C.pinkBorder },
  quadBtnText: { fontSize: 12, color: '#4A4A55', fontWeight: '500' },
  quadBtnTextOn: { color: C.pinkDeep, fontWeight: '600' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingBottom: 32, paddingTop: 16, backgroundColor: '#FFF8F3' },
});
```

- [ ] **Step 2: 타입체크**

Run: `npm run validate`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add app/mode-flow/feeling.tsx
git commit -m "refactor: 느낌만 말할게를 분위기칩+자유텍스트 중심으로 재구성"
```

---

### Task 6: 가볍게 화면 (light.tsx)

최소 입력 — 시간만 1택, 저예산/근거리 고정.

**Files:**
- Create: `app/mode-flow/light.tsx`

- [ ] **Step 1: light.tsx 작성**

```tsx
import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { Leaf } from 'lucide-react-native';
import { buildLightInput } from '../../lib/modeForm';
import { C } from '../../constants/colors';
import { BackBar, BigButton } from '../../components/ui';

const DURATIONS = [
  { v: '1h', label: '1시간' },
  { v: '2-3h', label: '2~3시간' },
  { v: 'half_day', label: '반나절' },
];

export default function LightScreen() {
  const router = useRouter();
  const [duration, setDuration] = useState('1h');

  function handleGenerate() {
    const input = buildLightInput({ duration });
    router.push({
      pathname: '/mode-flow/generating',
      params: { mode: 'light', input: JSON.stringify(input) },
    } as any);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFF8F3' }}>
      <View style={{ flex: 1 }}>
        <View style={s.content}>
          <BackBar />
          <View style={s.iconBox}>
            <Leaf size={28} strokeWidth={1.8} color={C.creamFg} />
          </View>
          <Text style={s.heading}>오늘은 가볍게{'\n'}만나요</Text>
          <Text style={s.subText}>돈도 시간도 부담 없이. 가까운 곳에서 즐길 후보만 골라드릴게요.</Text>

          <Text style={s.sectionLabel}>얼마나 함께할까요?</Text>
          <View style={s.row}>
            {DURATIONS.map(d => (
              <TouchableOpacity key={d.v} onPress={() => setDuration(d.v)} activeOpacity={0.7} style={[s.btn, duration === d.v && s.btnOn]}>
                <Text style={[s.btnText, duration === d.v && s.btnTextOn]}>{d.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={s.footer}>
          <BigButton onPress={handleGenerate}>가벼운 후보 만들기</BigButton>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  iconBox: { width: 56, height: 56, borderRadius: 18, backgroundColor: C.cream, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 29, marginTop: 16 },
  subText: { fontSize: 13, color: C.textSub, lineHeight: 20, marginTop: 8 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: C.text, marginTop: 28, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center', backgroundColor: C.white, borderWidth: 1.5, borderColor: C.border },
  btnOn: { backgroundColor: C.pinkLight, borderColor: C.pinkBorder },
  btnText: { fontSize: 13, color: '#4A4A55', fontWeight: '500' },
  btnTextOn: { color: C.pinkDeep, fontWeight: '600' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingBottom: 32, paddingTop: 16, backgroundColor: '#FFF8F3' },
});
```

- [ ] **Step 2: 타입체크**

Run: `npm run validate`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add app/mode-flow/light.tsx
git commit -m "feat: 가볍게 하고 싶어 전용 최소 입력 화면(light.tsx)"
```

---

### Task 7: mode.tsx 라우팅 분기 + soft_message 경로 수정

**Files:**
- Modify: `app/(tabs)/mode.tsx:23-41`

- [ ] **Step 1: handleStart 라우팅 교체**

`handleStart`를 다음으로 교체한다(soft_message 경로 수정 포함, pick/light 분기 추가):

```tsx
  function handleStart() {
    const mode = MODES[selIdx];
    const routes: Record<string, string> = {
      pick_for_me: '/mode-flow/pick',
      feeling: '/mode-flow/feeling',
      light: '/mode-flow/light',
      make_course: '/mode-flow/course',
      soft_message: '/(tabs)/soft-message',
      next_meet: '/mode-flow/bucketlist',
    };
    const path = routes[mode.id];
    if (path) router.push(path as any);
  }
```

- [ ] **Step 2: 타입체크**

Run: `npm run validate`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add "app/(tabs)/mode.tsx"
git commit -m "fix: 모드별 라우팅 분기 + soft_message 경로 수정"
```

---

### Task 8: 전체 통합 검증

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 테스트**

Run: `npx jest`
Expected: 전체 PASS (smoke + prompt + modeForm)

- [ ] **Step 2: 전체 타입체크**

Run: `npm run validate`
Expected: 에러 없음

- [ ] **Step 3: 수동 확인 체크리스트 (앱 구동 시)**

- 모드 화면에서 6개 모드 각각 진입 → 올바른 화면(pick/feeling/light/course/soft-message/bucketlist)으로 이동하는지
- 앱이 골라줘: 자유텍스트 없음, 조건칩만
- 느낌만 말할게: 자유텍스트 + 분위기칩
- 가볍게: 시간만 선택 → 바로 생성
- 결과 카드가 모드별로 다른 톤으로 나오는지 (저예산/감성/무난)

---

## Self-Review 결과

- **스펙 커버리지:** A(mode 키 정합)=Task 2, B(폼 분리)=Task 4·5·6, C(폼 내용)=Task 4·5·6, D(프롬프트 차별화)=Task 2·3, E(라우팅 버그)=Task 7, F(테스트)=Task 1·2·3. 전부 커버.
- **재검토 3모드:** course/bucketlist 무변경(기획 부합), soft_message는 Task 7에서 경로만 수정. 일치.
- **타입 일관성:** 빌더 함수명(`buildPickInput`/`buildFeelingInput`/`buildLightInput`)이 Task 3 정의와 Task 4·5·6 사용처에서 일치.
- **주의:** Task 2 Step 4에서 `buildSoftMessagePrompt`의 `*_MAP` 의존 여부를 grep으로 확인 후 import 처리할 것(미확인 시 tsc 에러로 드러남).
