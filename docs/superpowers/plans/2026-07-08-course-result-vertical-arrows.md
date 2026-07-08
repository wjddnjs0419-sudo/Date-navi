# 코스 모드 화면 재설계 (결과 화면 세로 화살표 + 입력 화면 스타일 통일) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `make_course` 모드의 결과 화면(SVG S자 트레일 → 세로 카드+화살표, 장소정보 노출)과 입력 화면
(이모지 카드 → `feeling.tsx`와 동일한 텍스트 스타일)을 재설계한다.

**Architecture:** 순수 프레젠테이션 레이어 변경. 데이터 흐름(`lib/recommendation.ts`의 candidate_id→place
결합, `date_cards` 저장 로직)은 전혀 손대지 않는다. `components/ui.tsx`에 공용 컴포넌트 2개
(`TriOptionRow` 추출, `PlaceRow`에 `size` prop 추가)를 넣고, `feeling.tsx`/`course.tsx`/
`course-result.tsx` 세 화면이 이를 사용하도록 갱신한다. 마지막에 SVG 트레일 전용 코드(`lib/course.ts`의
좌표 계산 함수, `course-result.tsx`의 `CourseTrail`)를 제거한다.

**Tech Stack:** React Native (Expo), TypeScript, `lucide-react-native`, `expo-router`, Jest.

**참고 문서:** `docs/superpowers/specs/2026-07-08-course-result-vertical-arrows-design.md`

---

## 프로젝트 테스트 관례 (중요)

이 저장소는 **순수 함수만 Jest 단위 테스트를 갖는다** (`lib/course.ts`의 `parseStepsFromSummary` 등).
React Native 화면·프레젠테이션 컴포넌트(`components/ui.tsx`, `app/mode-flow/*.tsx`)는 스냅샷/컴포넌트
테스트가 프로젝트에 존재하지 않으며, 검증은 `npm run validate`(tsc)와 iOS 시뮬레이터 육안 확인으로
이루어진다(설계 문서 §4·§10에서 확정). 따라서 아래 작업 중 **컴포넌트 변경 작업은 RED 테스트 단계가
없다** — `tsc --noEmit` 통과 + 시뮬레이터 스크린샷이 그 자리를 대신한다. `lib/course.ts`의 트레일 함수
제거(Task 8)는 기존 테스트를 함께 제거하는 작업이라 RED/GREEN 사이클이 적용되지 않는다(삭제 작업).

---

### Task 1: `TriOptionRow` 공용 컴포넌트 추출

**Files:**
- Modify: `components/ui.tsx` (파일 끝에 추가)

`feeling.tsx`의 기존 예산 선택 UI(`triRow`/`triBtn` 스타일, 텍스트만 있는 균등폭 3버튼)를 그대로
공용 컴포넌트로 옮긴다. 스타일 값은 `app/mode-flow/feeling.tsx:124-127`의 기존 `triBtn`/`triBtnOn`/
`triBtnText`/`triBtnTextOn`과 **완전히 동일**해야 한다(시각적 변경 없는 순수 추출).

- [ ] **Step 1: `components/ui.tsx` 끝에 `TriOptionRow` 추가**

`components/ui.tsx` 파일 맨 끝(현재 마지막 줄은 `successS` StyleSheet 정의, 780번째 줄 부근)에
아래를 추가한다:

```tsx
// ─── TriOptionRow ───────────────────────────────────────────────────────────
// 균등폭 3버튼(텍스트만) 선택 행. feeling.tsx의 예산 선택 UI에서 추출됨.
export function TriOptionRow<T extends string>({
  options, value, onChange,
}: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={triS.row}>
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            onPress={() => onChange(opt.value)}
            activeOpacity={0.7}
            style={[triS.btn, selected && triS.btnOn]}
          >
            <Text style={[triS.btnText, selected && triS.btnTextOn]}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
const triS = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center', backgroundColor: C.white, borderWidth: 1.5, borderColor: C.border },
  btnOn: { backgroundColor: C.pinkLight, borderColor: C.pinkBorder },
  btnText: { fontSize: 13, color: C.inkSoft, fontWeight: '500' },
  btnTextOn: { color: C.pinkDeep, fontWeight: '600' },
});
```

- [ ] **Step 2: 타입 검증**

Run: `npm run validate`
Expected: 에러 없음 (아직 아무 화면도 `TriOptionRow`를 쓰지 않으므로 unused-export 경고만 없으면 통과).

- [ ] **Step 3: Commit**

```bash
git add components/ui.tsx
git commit -m "feat(ui): extract TriOptionRow from feeling.tsx budget selector"
```

---

### Task 2: `feeling.tsx`가 `TriOptionRow`를 쓰도록 리팩터 (무회귀)

**Files:**
- Modify: `app/mode-flow/feeling.tsx`

- [ ] **Step 1: import 교체**

`app/mode-flow/feeling.tsx:8`:

```tsx
import { BackBar, BigButton, Chip, LocationField, OptionCardPicker } from '../../components/ui';
```

를

```tsx
import { BackBar, BigButton, Chip, LocationField, OptionCardPicker, TriOptionRow } from '../../components/ui';
```

로 교체한다.

- [ ] **Step 2: 예산 섹션을 `TriOptionRow` 호출로 교체**

`app/mode-flow/feeling.tsx:85-92`의 현재 코드:

```tsx
          <Text style={s.sectionLabel}>{t('modeFlow.feeling.budget')}</Text>
          <View style={s.triRow}>
            {BUDGETS.map(b => (
              <TouchableOpacity key={b.value} onPress={() => setBudget(b.value)} activeOpacity={0.7} style={[s.triBtn, budget === b.value && s.triBtnOn]}>
                <Text style={[s.triBtnText, budget === b.value && s.triBtnTextOn]}>{t(b.labelKey)}</Text>
              </TouchableOpacity>
            ))}
          </View>
```

를 아래로 교체:

```tsx
          <Text style={s.sectionLabel}>{t('modeFlow.feeling.budget')}</Text>
          <TriOptionRow
            options={BUDGETS.map(b => ({ value: b.value, label: t(b.labelKey) }))}
            value={budget}
            onChange={setBudget}
          />
```

- [ ] **Step 3: 이제 쓰지 않는 `triRow`/`triBtn`/`triBtnOn`/`triBtnText`/`triBtnTextOn` 스타일 제거**

`app/mode-flow/feeling.tsx:123-127`(StyleSheet 내부)의 아래 4줄을 삭제한다:

```tsx
  triRow: { flexDirection: 'row', gap: 8 },
  triBtn: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center', backgroundColor: C.white, borderWidth: 1.5, borderColor: C.border },
  triBtnOn: { backgroundColor: C.pinkLight, borderColor: C.pinkBorder },
  triBtnText: { fontSize: 13, color: C.inkSoft, fontWeight: '500' },
  triBtnTextOn: { color: C.pinkDeep, fontWeight: '600' },
```

- [ ] **Step 4: 이제 쓰지 않는 `TouchableOpacity` import 확인**

`feeling.tsx`는 `LocationField`의 GPS 버튼 등에서 `TouchableOpacity`를 더 이상 직접 쓰지 않게 된다.
`app/mode-flow/feeling.tsx:2`의 import 목록에서 `TouchableOpacity`가 다른 곳에서도 쓰이는지 확인—
파일 전체에 더 이상 없으면 import에서 제거한다(`grep -n "TouchableOpacity" app/mode-flow/feeling.tsx`로 확인).

- [ ] **Step 5: 타입 검증**

Run: `npm run validate`
Expected: 에러 없음.

- [ ] **Step 6: 시뮬레이터 육안 확인**

`make_course`가 아닌 `feeling` 모드 입력 화면으로 진입해 예산 선택 UI가 리팩터 전과 **완전히
동일하게** 보이는지 확인(스타일 값을 그대로 옮겼으므로 픽셀 차이가 없어야 한다).

- [ ] **Step 7: Commit**

```bash
git add app/mode-flow/feeling.tsx
git commit -m "refactor(feeling): use shared TriOptionRow for budget selector"
```

---

### Task 3: locales에서 `course.budgetOptions`/`durationOptions`의 `emoji` 필드 제거

**Files:**
- Modify: `locales/ko.json:522-556`
- Modify: `locales/en.json:522-556`

- [ ] **Step 1: `locales/ko.json`에서 emoji 필드 제거**

`locales/ko.json:522-556`의 현재 내용:

```json
    "budgetOptions": [
      {
        "label": "아끼고 싶어",
        "emoji": "💰",
        "value": "low"
      },
      {
        "label": "적당히",
        "emoji": "💳",
        "value": "medium"
      },
      {
        "label": "특별하게",
        "emoji": "✨",
        "value": "high"
      }
    ],
    "durationLabel": "시간은 얼마나?",
    "durationOptions": [
      {
        "label": "2~3시간",
        "emoji": "⏱️",
        "value": "2-3h"
      },
      {
        "label": "반나절",
        "emoji": "🌤️",
        "value": "half_day"
      },
      {
        "label": "하루종일",
        "emoji": "☀️",
        "value": "full_day"
      }
    ],
```

를 아래로 교체(각 옵션에서 `"emoji": "..."` 줄만 제거):

```json
    "budgetOptions": [
      {
        "label": "아끼고 싶어",
        "value": "low"
      },
      {
        "label": "적당히",
        "value": "medium"
      },
      {
        "label": "특별하게",
        "value": "high"
      }
    ],
    "durationLabel": "시간은 얼마나?",
    "durationOptions": [
      {
        "label": "2~3시간",
        "value": "2-3h"
      },
      {
        "label": "반나절",
        "value": "half_day"
      },
      {
        "label": "하루종일",
        "value": "full_day"
      }
    ],
```

- [ ] **Step 2: `locales/en.json`에서 동일하게 emoji 필드 제거**

`locales/en.json:522-556`의 현재 내용:

```json
    "budgetOptions": [
      {
        "label": "Keep it cheap",
        "emoji": "💰",
        "value": "low"
      },
      {
        "label": "Moderate",
        "emoji": "💳",
        "value": "medium"
      },
      {
        "label": "Make it special",
        "emoji": "✨",
        "value": "high"
      }
    ],
    "durationLabel": "How much time do you have?",
    "durationOptions": [
      {
        "label": "2-3 hours",
        "emoji": "⏱️",
        "value": "2-3h"
      },
      {
        "label": "Half day",
        "emoji": "🌤️",
        "value": "half_day"
      },
      {
        "label": "All day",
        "emoji": "☀️",
        "value": "full_day"
      }
    ],
```

를 아래로 교체:

```json
    "budgetOptions": [
      {
        "label": "Keep it cheap",
        "value": "low"
      },
      {
        "label": "Moderate",
        "value": "medium"
      },
      {
        "label": "Make it special",
        "value": "high"
      }
    ],
    "durationLabel": "How much time do you have?",
    "durationOptions": [
      {
        "label": "2-3 hours",
        "value": "2-3h"
      },
      {
        "label": "Half day",
        "value": "half_day"
      },
      {
        "label": "All day",
        "value": "full_day"
      }
    ],
```

- [ ] **Step 3: JSON 유효성 + 타입 검증**

Run: `node -e "JSON.parse(require('fs').readFileSync('locales/ko.json','utf8')); JSON.parse(require('fs').readFileSync('locales/en.json','utf8')); console.log('ok')"`
Expected: `ok` 출력 (JSON 문법 오류 없음).

Run: `npm run validate`
Expected: **이 시점에는 실패한다** — `course.tsx`가 아직 `opt.emoji`를 참조 중이라 `tsc`가
"Property 'emoji' does not exist" 에러를 낸다. 이는 정상이며 Task 4에서 해결된다. 실패 메시지가
정확히 `course.tsx`의 emoji 참조 관련인지만 확인하고 다음 태스크로 진행한다.

- [ ] **Step 4: Commit**

```bash
git add locales/ko.json locales/en.json
git commit -m "chore(i18n): drop unused emoji field from course budget/duration options"
```

---

### Task 4: `course.tsx` 입력 화면을 `feeling.tsx` 스타일로 통일

**Files:**
- Modify: `app/mode-flow/course.tsx`

- [ ] **Step 1: import에 `TriOptionRow` 추가**

`app/mode-flow/course.tsx:8`:

```tsx
import { BackBar, BigButton, LocationField, OptionCardPicker } from '../../components/ui';
```

를

```tsx
import { BackBar, BigButton, LocationField, OptionCardPicker, TriOptionRow } from '../../components/ui';
```

로 교체.

- [ ] **Step 2: 예산 섹션을 `TriOptionRow`로 교체**

`app/mode-flow/course.tsx:52-68`의 현재 코드:

```tsx
        <Text style={s2.sectionLabel}>{c.budgetLabel}</Text>
        <View style={s2.optionRow}>
          {c.budgetOptions.map((opt: { label: string; emoji: string; value: string }) => {
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
```

를 아래로 교체(간격 유지를 위해 `budgetBlock` wrapper로 감싼다):

```tsx
        <Text style={s2.sectionLabel}>{c.budgetLabel}</Text>
        <View style={s2.budgetBlock}>
          <TriOptionRow
            options={c.budgetOptions.map((opt: { label: string; value: string }) => ({ value: opt.value, label: opt.label }))}
            value={budget}
            onChange={setBudget}
          />
        </View>
```

- [ ] **Step 3: 시간 섹션에서 emoji 참조 제거**

`app/mode-flow/course.tsx:70-79`의 현재 코드:

```tsx
        <Text style={s2.sectionLabel}>{c.durationLabel}</Text>
        <View style={s2.durationBlock}>
          <OptionCardPicker
            options={c.durationOptions.map((opt: { label: string; emoji: string; value: string }) => (
              { value: opt.value, label: opt.label, emoji: opt.emoji }
            ))}
            value={duration || c.durationOptions[0]?.value}
            onChange={setDuration}
          />
        </View>
```

를 아래로 교체(emoji 매핑 제거):

```tsx
        <Text style={s2.sectionLabel}>{c.durationLabel}</Text>
        <View style={s2.durationBlock}>
          <OptionCardPicker
            options={c.durationOptions.map((opt: { label: string; value: string }) => (
              { value: opt.value, label: opt.label }
            ))}
            value={duration || c.durationOptions[0]?.value}
            onChange={setDuration}
          />
        </View>
```

- [ ] **Step 4: 이제 쓰지 않는 스타일 제거 + `budgetBlock` 추가**

`app/mode-flow/course.tsx:103-111`(StyleSheet 내부)의 아래 항목:

```tsx
  optionRow: { flexDirection: 'row', gap: 10, marginBottom: 28 },
  optionCard: {
    flex: 1, alignItems: 'center', backgroundColor: C.white, borderRadius: 14,
    paddingVertical: 16, paddingHorizontal: 4, borderWidth: 2, borderColor: 'transparent', gap: 6,
  },
  optionSelected: { backgroundColor: C.pinkLight, borderColor: C.pinkBorder },
  optionEmoji: { fontSize: 22 },
  optionLabel: { fontSize: 13, fontWeight: '600', color: C.textSub, textAlign: 'center' },
  optionLabelSelected: { color: C.pinkDeep },
```

를 아래로 교체(Step 2에서 쓴 `budgetBlock`의 정의):

```tsx
  budgetBlock: { marginBottom: 28 },
```

- [ ] **Step 5: 이제 쓰지 않는 `TouchableOpacity` import 확인**

`grep -n "TouchableOpacity" app/mode-flow/course.tsx`로 다른 사용처가 없으면
`app/mode-flow/course.tsx:2`의 import에서 `TouchableOpacity`를 제거한다.

- [ ] **Step 6: 타입 검증**

Run: `npm run validate`
Expected: 에러 없음 (Task 3에서 발생했던 emoji 관련 에러가 해소됨).

- [ ] **Step 7: 시뮬레이터 육안 확인**

`make_course` 입력 화면 진입 → 예산 섹션이 `feeling.tsx`의 텍스트 알약형 3버튼과 동일한 스타일로
보이는지, 시간 섹션이 이모지 없이 텍스트만 보이는지 확인.

- [ ] **Step 8: Commit**

```bash
git add app/mode-flow/course.tsx
git commit -m "refactor(course): match input screen style to feeling.tsx (no emoji)"
```

---

### Task 5: `PlaceRow`에 `size` prop 추가 (`default` | `compact`)

**Files:**
- Modify: `components/ui.tsx:516-544`

- [ ] **Step 1: `PlaceRow` 함수 시그니처와 스타일 분기 수정**

`components/ui.tsx:516-544`의 현재 코드:

```tsx
export function PlaceRow({
  name, address, url, style,
}: { name?: string; address?: string; url?: string; style?: StyleProp<ViewStyle> }) {
  const { t } = useI18n();
  if (!name) return null;
  return (
    <TouchableOpacity
      style={[placeS.wrap, style]}
      activeOpacity={url ? 0.7 : 1}
      disabled={!url}
      onPress={url ? () => { Linking.openURL(url); } : undefined}
    >
      <MapPin size={16} color={C.text} strokeWidth={2} style={placeS.icon} />
      <View style={placeS.body}>
        <Text style={placeS.name} numberOfLines={1}>{name}</Text>
        {!!address && <Text style={placeS.addr} numberOfLines={1}>{address}</Text>}
      </View>
      {!!url && <Text style={placeS.link}>{t('location.map')}</Text>}
    </TouchableOpacity>
  );
}
const placeS = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  icon: { marginTop: 1 },
  body: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700', color: C.text },
  addr: { fontSize: 13, color: C.textSub, marginTop: 2 },
  link: { fontSize: 13, fontWeight: '600', color: C.textSub, marginTop: 1 },
});
```

를 아래로 교체:

```tsx
export function PlaceRow({
  name, address, url, style, size = 'default',
}: { name?: string; address?: string; url?: string; style?: StyleProp<ViewStyle>; size?: 'default' | 'compact' }) {
  const { t } = useI18n();
  if (!name) return null;
  const compact = size === 'compact';
  return (
    <TouchableOpacity
      style={[placeS.wrap, style]}
      activeOpacity={url ? 0.7 : 1}
      disabled={!url}
      onPress={url ? () => { Linking.openURL(url); } : undefined}
    >
      <MapPin size={compact ? 14 : 16} color={compact ? C.textSub : C.text} strokeWidth={2} style={placeS.icon} />
      <View style={placeS.body}>
        <Text style={[placeS.name, compact && placeS.nameCompact]} numberOfLines={1}>{name}</Text>
        {!!address && <Text style={[placeS.addr, compact && placeS.addrCompact]} numberOfLines={1}>{address}</Text>}
      </View>
      {!!url && <Text style={[placeS.link, compact && placeS.linkCompact]}>{t('location.map')}</Text>}
    </TouchableOpacity>
  );
}
const placeS = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  icon: { marginTop: 1 },
  body: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700', color: C.text },
  nameCompact: { fontSize: 13, fontWeight: '600' },
  addr: { fontSize: 13, color: C.textSub, marginTop: 2 },
  addrCompact: { fontSize: 11 },
  link: { fontSize: 13, fontWeight: '600', color: C.textSub, marginTop: 1 },
  linkCompact: { fontSize: 11 },
});
```

- [ ] **Step 2: 타입 검증**

Run: `npm run validate`
Expected: 에러 없음. `size` prop이 옵셔널이므로 `result.tsx`의 기존 `<PlaceRow name=... />` 호출부는
변경 없이도 그대로 컴파일된다(기본값 `'default'`로 기존 동작 무회귀).

- [ ] **Step 3: Commit**

```bash
git add components/ui.tsx
git commit -m "feat(ui): add compact size variant to PlaceRow"
```

---

### Task 6: `course-result.tsx` — `CourseTrail` → `CourseStepList`(세로 카드+화살표)

**Files:**
- Modify: `app/mode-flow/course-result.tsx`

- [ ] **Step 1: import 정리 — `react-native-svg` 제거, `lucide` 아이콘 추가**

`app/mode-flow/course-result.tsx:1-16`의 현재 코드:

```tsx
import { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, useWindowDimensions, Alert,
  type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { type DateCard, type FeelingInput } from '../../lib/ai';
import { computeTrailNodes, buildTrailPath, parseStepsFromSummary, type CourseStep } from '../../lib/course';
import { supabase } from '../../lib/supabase';
import { Clock, Wallet, Send, Bookmark } from 'lucide-react-native';
import { C } from '../../constants/colors';
import { BackBar, BigButton, Badge, PlaceRow } from '../../components/ui';
import { useI18n } from '../../lib/i18n';
```

를 아래로 교체:

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
import { parseStepsFromSummary, type CourseStep } from '../../lib/course';
import { supabase } from '../../lib/supabase';
import { Clock, Wallet, Send, Bookmark, ChevronDown } from 'lucide-react-native';
import { C } from '../../constants/colors';
import { BackBar, BigButton, Badge, PlaceRow } from '../../components/ui';
import { useI18n } from '../../lib/i18n';
```

(`useWindowDimensions` import는 유지 — 다른 곳(`width` 기반 페이지 폭)에서 계속 쓰인다.)

- [ ] **Step 2: `CourseTrail`을 `CourseStepList`로 교체**

`app/mode-flow/course-result.tsx:18-73`의 현재 코드 전체(상수 `TRAIL_OPTS`/`LABEL_W`부터
`CourseTrail` 함수 끝까지)를 아래로 교체:

```tsx
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

function CourseStepList({ steps, summary }: { steps: CourseStep[]; summary?: string }) {
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
```

- [ ] **Step 3: 사용처 교체**

`app/mode-flow/course-result.tsx:217`의 현재 코드:

```tsx
              <CourseTrail steps={steps} width={width - 40} summary={card.summary} />
```

를 아래로 교체:

```tsx
              <CourseStepList steps={steps} summary={card.summary} />
```

- [ ] **Step 4: `width` 변수 사용처 확인**

`CourseStepList`는 `width`를 받지 않으므로, `width`가 이 파일의 다른 곳(페이지 폭 `style={{ width }}`,
`onScrollEnd`의 `contentOffset.x / width` 계산)에서 계속 쓰이는지 `grep -n "width" app/mode-flow/course-result.tsx`로
확인 — 계속 쓰이므로 `useWindowDimensions()` 호출 자체는 그대로 둔다(Step 1에서 이미 유지 확인함).

- [ ] **Step 5: 기존 `trail` StyleSheet를 `stepS`로 교체**

`app/mode-flow/course-result.tsx` 맨 끝의 현재 코드:

```tsx
const trail = StyleSheet.create({
  fallbackWrap: { gap: 10, paddingVertical: 16 },
  node: { position: 'absolute', width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  nodeNum: { fontSize: 12, fontWeight: '700', color: C.pinkDeep },
  labelBox: { position: 'absolute', alignItems: 'center', width: 120 },
  labelWidth: { width: LABEL_W },
  labelText: { fontSize: 12, fontWeight: '600', color: C.text, textAlign: 'center' },
  descText: { fontSize: 10, color: C.textMuted, textAlign: 'center', marginTop: 1 },
  fallbackStep: { fontSize: 14, color: C.text },
});
```

를 아래로 교체:

```tsx
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

- [ ] **Step 6: 타입 검증**

Run: `npm run validate`
Expected: 에러 없음. `LABEL_W`, `TRAIL_OPTS` 등 이전 상수를 참조하는 곳이 남아있지 않은지 확인
(`grep -n "TRAIL_OPTS\|LABEL_W\|CourseTrail" app/mode-flow/course-result.tsx` → 결과 없어야 함).

- [ ] **Step 7: 시뮬레이터 육안 확인**

`make_course` 결과 화면 진입 → 단계별 카드가 세로로 쌓이고 카드 사이에 화살표 커넥터가 보이는지,
장소가 있는 단계는 핀+장소명+주소+"지도" 링크가 보이고 탭하면 지도가 열리는지, 장소 없는 단계(순수
행동)는 장소 행 없이 제목/설명만 보이는지 확인. `steps`가 1개뿐인 카드(커넥터 없이 카드 1개)와
`steps`가 아예 없는 폴백(summary 텍스트만)도 확인.

- [ ] **Step 8: Commit**

```bash
git add app/mode-flow/course-result.tsx
git commit -m "feat(course-result): replace SVG trail with vertical step cards + arrows"
```

---

### Task 7: `lib/course.ts` / `__tests__/course.test.ts` — 트레일 좌표 함수 제거

**Files:**
- Modify: `lib/course.ts`
- Modify: `__tests__/course.test.ts`

Task 6까지 마치면 `computeTrailNodes`/`buildTrailPath`/`TrailNode`/`TrailOpts`를 참조하는 곳이
없다(`course-result.tsx`에서 이미 제거됨, 다른 파일에서도 미사용 — 브레인스토밍 단계에서
`grep -rn "computeTrailNodes|buildTrailPath|CourseTrail"`로 확인 완료).

- [ ] **Step 1: `lib/course.ts`에서 트레일 함수 제거**

`lib/course.ts:19-67`의 현재 코드(`TrailNode` 타입부터 파일 끝 `buildTrailPath` 함수까지) 전체를
삭제한다. 파일에는 아래만 남는다:

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
```

- [ ] **Step 2: `__tests__/course.test.ts`에서 트레일 테스트 제거**

`__tests__/course.test.ts`의 현재 전체 내용을 아래로 교체(`computeTrailNodes`/`buildTrailPath`
관련 `describe` 블록 2개와 해당 import를 삭제, `parseStepsFromSummary` 테스트만 남김):

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

- [ ] **Step 3: 테스트 실행**

Run: `npm test -- course.test.ts`
Expected: `PASS __tests__/course.test.ts`, 3개 테스트 모두 통과.

- [ ] **Step 4: 타입 검증**

Run: `npm run validate`
Expected: 에러 없음.

- [ ] **Step 5: Commit**

```bash
git add lib/course.ts __tests__/course.test.ts
git commit -m "chore(course): remove unused SVG trail coordinate helpers"
```

---

### Task 8: 최종 검증

**Files:** 없음 (검증 전용 태스크)

- [ ] **Step 1: 전체 타입 검증**

Run: `npm run validate`
Expected: 에러 없음.

- [ ] **Step 2: 전체 테스트 스위트**

Run: `npm test`
Expected: 모든 테스트 통과, 특히 `__tests__/course.test.ts`, `__tests__/modeForm.test.ts`,
`__tests__/prompt.test.ts` 확인(현재 작업 트리에 이미 수정 사항이 있던 파일들이므로 회귀 여부 확인).

- [ ] **Step 3: iOS 시뮬레이터 종합 확인**

`npm run ios` (또는 기존 실행 중인 시뮬레이터)로:
1. `feeling` 모드 입력 화면 — 예산 선택 UI가 리팩터 전과 동일하게 보이는지.
2. `make_course` 입력 화면 — 예산/시간 섹션이 이모지 없이 `feeling.tsx`와 같은 스타일인지.
3. `make_course` 결과 화면 — steps 3개(장소 있음) 코스, steps 2개(장소 일부만) 코스, steps 1개
   코스, steps 0개(요약 폴백) 카드를 각각 생성해 카드/화살표/장소정보 표시를 확인.
4. 결과 화면에서 장소 "지도" 링크 탭 시 카카오맵/브라우저가 열리는지.

- [ ] **Step 4: PLAN.md 갱신**

`PLAN.md`의 "V2 — 추천 생성 로직 개선" 섹션 하단 `- [ ] (코스 결과 UI 재설계 §16 — SVG 트레일→세로
화살표, Phase 4 이후 별도 세션. 여전히 Future.)` 항목을 완료로 표시하고, 새 세션 로그 항목을
`RESULT.md`에 추가한다(CLAUDE.md "종료" 절차 — 이 Step은 사용자가 "종료"를 요청할 때 수행).
