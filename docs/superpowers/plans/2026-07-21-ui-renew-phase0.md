# UI 전면 교체 — Phase 0 (공용 기반) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 병렬 화면 세션이 read-only 기준선으로 삼을 공용 기반(디자인 토큰·i18n 조각분할·신규 공용 컴포넌트·공용 모달 리스타일·문서)을 main에 못박는다.

**Architecture:** 기존 warm-pink 토큰 시스템은 유지하고 목업 델타만 추가. i18n 단일 JSON을 네임스페이스 조각 파일 + 정적 배럴로 분할해 Phase 1 병렬 충돌을 제거. 신규 프리미티브는 `components/ui.tsx`(또는 신규 파일)에 추가하고 목업 1:1로 만든다.

**Tech Stack:** React Native + Expo, TypeScript, react-i18next, react-test-renderer + jest-expo, lucide-react-native, expo-linear-gradient.

**설계 출처:** `docs/superpowers/specs/2026-07-21-ui-renew-parallel-design.md`

**공통 규칙:**
- 매 태스크 후 `npm run validate`(tsc) 통과. 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- 시각 컴포넌트(Task 3~10)는 완성 후 `ss-score`≥80(미달 시 fix-first 재점수) + `styleseed-design-review`. 대응 목업 PNG를 `Read`로 열어 1:1 대조.
- 색은 `C.*`, 간격 `SP.*`, 반경 `R.*`. 매직 헥스/숫자 금지.
- 문구 추가 시 ko/en 조각 동시.

---

## File Structure

- `constants/colors.ts` — 카테고리 핀 색 등 신규 토큰 추가 (Task 1)
- `locales/ko/<ns>.json`, `locales/en/<ns>.json` — 네임스페이스 조각 (Task 2, 스크립트 생성)
- `locales/index.ts` — 조각을 병합해 `ko`/`en` export하는 정적 배럴 (Task 2)
- `lib/i18n.ts` — 배럴 import로 전환 (Task 2)
- `components/illustration.tsx` — `Illustration` 렌더러 (Task 3)
- `components/brand.tsx` — `Wordmark` (Task 4)
- `components/course-map.tsx` — `CoursePin`/`StepPin`/`CourseMapPreview` (Task 5)
- `components/ui.tsx` — `DdayBadge`·`MetaChipRow`·`PlanListRow` 추가 (Task 6·7), `GeneratingView` 리스타일 (Task 10)
- `components/pickers.tsx` — 리스타일 (Task 9)
- `components/ui.tsx` `SuccessModal` — 리스타일 (Task 8)
- `Design.md`, 메모리 — 룰 폐기 반영 (Task 11)
- `__tests__/*.test.ts(x)` — 각 태스크 계약 테스트

---

## Task 0: 목업 실측 & 미결 확정

**Files:** 없음(조사). 결과는 Task 1·4·5에서 사용.

- [ ] **Step 1: 목업에서 정확한 값 추출**

다음 PNG를 `Read`로 열어 값을 기록한다(스크린샷 확대):
- `UI RENEW/DATE_NAVI_P0_UPDATED_INDIVIDUAL_SCREENS/02_home.png` — 스텝 핀 3색(식사/카페/산책) 헥스, D-day 뱃지 색, 메타칩 스타일.
- `UI RENEW/DATE_NAVI_P0_UPDATED_INDIVIDUAL_SCREENS/01_login.png` — "Date·navi" 워드마크 서체/굵기/색.

- [ ] **Step 2: Wordmark 구현 방식 확정**

목업의 워드마크가 커스텀 레터링이면 → 이미지 asset로 추출(png, `assets/brand/wordmark.png`) 또는 근사 시스템폰트 스타일드 텍스트. 시스템폰트로 시각 근사 불가 판단 시 이미지 asset 채택. **결정을 이 파일 하단 "결정 로그"에 1줄 기록.**

- [ ] **Step 3: 커밋 없음 (조사 태스크)** — 다음 태스크로.

---

## Task 1: 디자인 토큰 — 카테고리 핀 색 추가

**Files:**
- Modify: `constants/colors.ts`
- Test: `__tests__/design-tokens.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

```ts
// __tests__/design-tokens.test.ts
import { C } from '../constants/colors';

describe('design tokens — category pins', () => {
  it('exposes distinct meal/cafe/walk pin colors', () => {
    expect(C.catMeal).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(C.catCafe).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(C.catWalk).toMatch(/^#[0-9a-fA-F]{6}$/);
    const set = new Set([C.catMeal, C.catCafe, C.catWalk]);
    expect(set.size).toBe(3);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx jest design-tokens -v` → FAIL (`catMeal` undefined).

- [ ] **Step 3: 토큰 추가**

Task 0에서 실측한 헥스로 `constants/colors.ts`의 `C` 객체에 추가(예시값, 실측으로 대체):
```ts
  catMeal: '#F5883C',
  catCafe: '#5B9BD5',
  catWalk: '#4CAF6E',
```

- [ ] **Step 4: 통과 확인** — Run: `npx jest design-tokens -v` → PASS. `npm run validate` → 클린.

- [ ] **Step 5: 커밋** — `git commit -m "feat(tokens): 카테고리 핀 색 토큰 추가"`

---

## Task 2: i18n 조각 분할 + 정적 배럴 (병렬 충돌 제거)

**Files:**
- Create: `scripts/split-locales.mjs`, `locales/ko/<ns>.json`×28, `locales/en/<ns>.json`×28, `locales/index.ts`
- Modify: `lib/i18n.ts`
- Delete: `locales/ko.json`, `locales/en.json`
- Test: `__tests__/i18n-split.test.ts`

- [ ] **Step 1: 분할 스크립트 작성**

```js
// scripts/split-locales.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
for (const lang of ['ko', 'en']) {
  const tree = JSON.parse(readFileSync(`locales/${lang}.json`, 'utf8'));
  mkdirSync(`locales/${lang}`, { recursive: true });
  for (const [ns, value] of Object.entries(tree)) {
    writeFileSync(`locales/${lang}/${ns}.json`, JSON.stringify({ [ns]: value }, null, 2) + '\n');
  }
  console.log(`${lang}: ${Object.keys(tree).length} namespaces`);
}
```
각 조각은 `{ "<ns>": { ...원본 } }` 형태로 감싼다(병합 시 네임스페이스 보존).

- [ ] **Step 2: 스크립트 실행**

Run: `node scripts/split-locales.mjs`
Expected: `ko: 28 namespaces` / `en: 28 namespaces`. `locales/ko/`·`locales/en/`에 28개씩 생성.

- [ ] **Step 3: 정적 배럴 작성**

`locales/index.ts` — 모든 조각을 명시 import 후 얕은 병합(각 조각이 서로 다른 최상위 키라 얕은 병합으로 충분):
```ts
import koLanguage from './ko/language.json';
import koCommon from './ko/common.json';
// ... 28개 전부 (ns 순서대로)
import enLanguage from './en/language.json';
// ... en 28개 전부

export const ko = Object.assign({}, koLanguage, koCommon /* , ...나머지 26 */);
export const en = Object.assign({}, enLanguage, enCommon /* , ...나머지 26 */);
```
> 실제 import 목록은 `locales/ko/` 디렉터리의 파일명 전체(Step 2 산출)로 채운다. **이 배럴은 Phase 0에서 한 번만 작성되고 Phase 1에서 편집 금지** — 클러스터는 조각 파일 내용만 수정한다.

- [ ] **Step 4: 실패 테스트 작성**

```ts
// __tests__/i18n-split.test.ts
import { ko, en } from '../locales';

const ORIGINAL_NAMESPACES = [
  'language','common','tabs','settings','auth','home','nickname','coupleConnect',
  'preferences','mode','feeling','course','result','candidates','memories','card',
  'confirm','review','notifications','location','pickers','modeFlow','legal',
  'onboarding','splash','share','account','plans',
];

describe('i18n split barrel', () => {
  it('merged ko has every original namespace', () => {
    for (const ns of ORIGINAL_NAMESPACES) expect(ko).toHaveProperty(ns);
  });
  it('ko and en have identical top-level key sets', () => {
    expect(Object.keys(ko).sort()).toEqual(Object.keys(en).sort());
  });
  it('preserves a known deep key', () => {
    expect(typeof (ko as any).auth).toBe('object');
    expect(typeof (ko as any).home.greeting).toBe('string');
  });
});
```

- [ ] **Step 5: 실패 확인** — Run: `npx jest i18n-split -v` → FAIL (`../locales` 미해결 또는 배럴 미완).

- [ ] **Step 6: lib/i18n.ts 전환**

`lib/i18n.ts` 상단 import 교체:
```ts
// import en from '../locales/en.json';
// import ko from '../locales/ko.json';
import { ko, en } from '../locales';
```
나머지(`resources`, `withLegacyHelpers`)는 무변경 — 병합 객체가 동일 shape.

- [ ] **Step 7: 통과 확인** — Run: `npx jest i18n-split -v` → PASS.

- [ ] **Step 8: 전체 회귀 확인**

Run: `npx jest && npm run validate`
Expected: 기존 i18n 관련 테스트(`card-content-i18n`, `card-screens-localization` 등) 포함 전부 PASS. tsc 클린.
> tsconfig에서 JSON import(`resolveJsonModule`)가 켜져 있어야 함. 꺼져 있으면 켠다.

- [ ] **Step 9: 모놀리스 삭제**

Run: `git rm locales/ko.json locales/en.json`
재확인: `npx jest && npm run validate` → PASS.

- [ ] **Step 10: 커밋** — `git commit -m "refactor(i18n): 로케일 네임스페이스 조각 분할 + 정적 배럴 (병렬 충돌 제거)"`

---

## Task 3: `Illustration` 렌더러

**Files:**
- Create: `components/illustration.tsx`
- Test: `__tests__/illustration.test.tsx`

일러스트 8장을 이름으로 렌더. intrinsic aspectRatio 자동 계산 + 명시 높이 옵션(RN aspectRatio 버그 회피, RESULT 세션 AT).

- [ ] **Step 1: 실패 테스트 작성**

```tsx
// __tests__/illustration.test.tsx
import React from 'react';
import { Image } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { Illustration } from '../components/illustration';

describe('Illustration', () => {
  it('renders an Image for a known asset name', () => {
    const tree = TestRenderer.create(<Illustration name="home-map-book" />);
    const img = tree.root.findByType(Image);
    expect(img.props.source).toBeTruthy();
    expect(img.props.accessible).toBe(true);
  });
  it('applies explicit height when given', () => {
    const tree = TestRenderer.create(<Illustration name="bg-park" height={120} />);
    const img = tree.root.findByType(Image);
    const flat = Array.isArray(img.props.style) ? Object.assign({}, ...img.props.style) : img.props.style;
    expect(flat.height).toBe(120);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx jest illustration -v` → FAIL.

- [ ] **Step 3: 구현**

```tsx
// components/illustration.tsx
import { Image, type StyleProp, type ImageStyle } from 'react-native';

const SOURCES = {
  'date-course-map-horizontal': require('../assets/illustrations/date-course-map-horizontal.png'),
  'date-course-map-vertical': require('../assets/illustrations/date-course-map-vertical.png'),
  'home-map-book': require('../assets/illustrations/home-map-book.png'),
  'brand-pin-logo': require('../assets/illustrations/brand-pin-logo.png'),
  'mascot-heart-single': require('../assets/illustrations/mascot-heart-single.png'),
  'mascot-heart-couple': require('../assets/illustrations/mascot-heart-couple.png'),
  'mascot-heart-couple-check': require('../assets/illustrations/mascot-heart-couple-check.png'),
  'bg-park': require('../assets/illustrations/bg-park.png'),
} as const;

export type IllustrationName = keyof typeof SOURCES;

export function Illustration({
  name, width, height, style,
}: {
  name: IllustrationName;
  width?: number;
  height?: number;
  style?: StyleProp<ImageStyle>;
}) {
  const source = SOURCES[name];
  const meta = Image.resolveAssetSource(source);
  const ratio = meta && meta.height ? meta.width / meta.height : 1;
  const sizeStyle: ImageStyle =
    height != null ? { height, width: width ?? height * ratio }
    : width != null ? { width, height: width / ratio }
    : { width: '100%', aspectRatio: ratio };
  return (
    <Image
      source={source}
      accessible
      accessibilityRole="image"
      resizeMode="contain"
      style={[sizeStyle, style]}
    />
  );
}
```

- [ ] **Step 4: 통과 확인** — Run: `npx jest illustration -v` → PASS. `npm run validate` 클린.

- [ ] **Step 5: 커밋** — `git commit -m "feat(ui): Illustration 렌더러"`

---

## Task 4: `Wordmark`

**Files:**
- Create: `components/brand.tsx`
- (조건부) `assets/brand/wordmark.png` — Task 0 결정이 이미지면 추출
- Test: `__tests__/wordmark.test.tsx`

- [ ] **Step 1: 실패 테스트 작성**

```tsx
// __tests__/wordmark.test.tsx
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { Wordmark } from '../components/brand';

describe('Wordmark', () => {
  it('renders without crashing and is accessible as Date Navi', () => {
    const tree = TestRenderer.create(<Wordmark />);
    const match = tree.root.findAll(
      (n) => n.props?.accessibilityLabel === 'Date Navi' || n.props?.accessible === true,
    );
    expect(match.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx jest wordmark -v` → FAIL.

- [ ] **Step 3: 구현** (Task 0 결정 반영)

이미지 방식이면 `Illustration`류로 `assets/brand/wordmark.png` 렌더 + `accessibilityLabel="Date Navi"`. 텍스트 방식이면 스타일드 `Text`(핑크·굵기·letterSpacing 목업 근사) + `accessibilityLabel="Date Navi"`. `size?: 'sm'|'lg'` prop으로 로그인/홈 크기 대응. 색은 `C.pink` 등 토큰.

- [ ] **Step 4: 통과 확인** — Run: `npx jest wordmark -v` → PASS. 목업 `01_login.png`·`02_home.png`와 육안 대조.

- [ ] **Step 5: 커밋** — `git commit -m "feat(brand): Wordmark 컴포넌트"`

---

## Task 5: `CoursePin` · `StepPin` · `CourseMapPreview`

**Files:**
- Create: `components/course-map.tsx`
- Test: `__tests__/course-map.test.tsx`

목업 `02_home.png`의 3스텝 점선 트레일 미리보기(번호 원 + 컬러 카테고리 핀 + 라벨).

- [ ] **Step 1: 실패 테스트 작성**

```tsx
// __tests__/course-map.test.tsx
import React from 'react';
import { Text } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { CourseMapPreview } from '../components/course-map';

describe('CourseMapPreview', () => {
  const steps = [
    { category: 'meal' as const, label: '식사' },
    { category: 'cafe' as const, label: '카페' },
    { category: 'walk' as const, label: '산책' },
  ];
  it('renders one label per step', () => {
    const tree = TestRenderer.create(<CourseMapPreview steps={steps} />);
    const texts = tree.root.findAllByType(Text).map((n) => n.props.children);
    expect(texts).toEqual(expect.arrayContaining(['식사', '카페', '산책']));
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx jest course-map -v` → FAIL.

- [ ] **Step 3: 구현**

`CoursePinCategory = 'meal'|'cafe'|'walk'|'generic'` → 색 매핑(`C.catMeal/catCafe/catWalk`, generic=`C.pink`). `StepPin`(번호 원 + lucide 아이콘), `CoursePin`(핀 모양), `CourseMapPreview`(steps 배열 → 가로 배치 + 점선 커넥터 + 라벨). 아이콘은 lucide(식사=Utensils, 카페=Coffee, 산책=Trees). 점선은 목업 대조. 색/간격/반경 토큰 사용.

- [ ] **Step 4: 통과 확인** — Run: `npx jest course-map -v` → PASS. 목업 육안 대조 + StyleSeed 게이트.

- [ ] **Step 5: 커밋** — `git commit -m "feat(ui): CoursePin/StepPin/CourseMapPreview"`

---

## Task 6: `DdayBadge` · `MetaChipRow`

**Files:**
- Modify: `components/ui.tsx` (신규 export 추가)
- Test: `__tests__/dday-meta.test.tsx`

- [ ] **Step 1: 실패 테스트 작성**

```tsx
// __tests__/dday-meta.test.tsx
import React from 'react';
import { Text } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { DdayBadge, MetaChipRow } from '../components/ui';

describe('DdayBadge', () => {
  it('formats positive days as D-n', () => {
    const tree = TestRenderer.create(<DdayBadge days={2} />);
    expect(tree.root.findAllByType(Text).map((n) => n.props.children).join('')).toContain('D-2');
  });
});
describe('MetaChipRow', () => {
  it('renders each chip label', () => {
    const tree = TestRenderer.create(
      <MetaChipRow items={[{ icon: 'map', label: '성수동 중심' }, { icon: 'clock', label: '약 3시간' }]} />,
    );
    const texts = tree.root.findAllByType(Text).map((n) => n.props.children);
    expect(texts).toEqual(expect.arrayContaining(['성수동 중심', '약 3시간']));
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx jest dday-meta -v` → FAIL.

- [ ] **Step 3: 구현**

`components/ui.tsx`에 추가:
- `DdayBadge({ days }: { days: number })` — `days>0` → `D-{days}`, `0` → `D-DAY`, `<0` → `D+{abs}`. 핑크 뱃지(`C.pinkLight`/`C.pinkDeep`, `R.badge`).
- `MetaChipRow({ items }: { items: { icon: 'map'|'clock'|'walk'; label: string }[] })` — 아웃라인 칩 가로 배치. lucide(MapPin/Clock/Footprints). 목업 `02_home.png` 메타칩 대조.

- [ ] **Step 4: 통과 확인** — Run: `npx jest dday-meta -v` → PASS. StyleSeed 게이트.

- [ ] **Step 5: 커밋** — `git commit -m "feat(ui): DdayBadge/MetaChipRow"`

---

## Task 7: `PlanListRow`

**Files:**
- Modify: `components/ui.tsx`
- Test: `__tests__/plan-list-row.test.tsx`

목업 `02_home.png` "다가오는 데이트" · `07_date_plans.png` 리스트 행(사진 썸네일 + 제목 + 날짜 + D-day + chevron).

- [ ] **Step 1: 실패 테스트 작성**

```tsx
// __tests__/plan-list-row.test.tsx
import React from 'react';
import { Text } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { PlanListRow } from '../components/ui';

describe('PlanListRow', () => {
  it('renders title, date, and D-day', () => {
    const tree = TestRenderer.create(
      <PlanListRow title="성수동 감성 데이트 코스" dateLabel="7월 22일 (목) 오후 2:00" days={2} onPress={() => {}} />,
    );
    const texts = tree.root.findAllByType(Text).map((n) => n.props.children).flat().join(' ');
    expect(texts).toContain('성수동 감성 데이트 코스');
    expect(texts).toContain('7월 22일');
    expect(texts).toContain('D-2');
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx jest plan-list-row -v` → FAIL.

- [ ] **Step 3: 구현**

`PlanListRow({ title, dateLabel, days, imageSource?, onPress })` — 좌측 썸네일(imageSource 없으면 플레이스홀더 서피스), 중앙 제목+날짜(달력 아이콘), 우측 `DdayBadge`(Task 6 재사용) + `ChevronRight`. `SoftCard`/`ListRow` 스타일 계열 재사용. 토큰만.

- [ ] **Step 4: 통과 확인** — Run: `npx jest plan-list-row -v` → PASS. StyleSeed 게이트.

- [ ] **Step 5: 커밋** — `git commit -m "feat(ui): PlanListRow"`

---

## Task 8: `SuccessModal` 리스타일 (목업 P2/15)

**Files:**
- Modify: `components/ui.tsx` (`SuccessModal`)
- Test: 기존 `SuccessModal` 소비 화면 테스트 회귀 유지 + `__tests__/success-modal.test.tsx`(신규 계약)

> **주의:** 다중 소비자(send·course-result·confirm). props 시그니처·동작 불변. 비주얼만 목업화.

- [ ] **Step 1: 현행 props 파악** — `components/ui.tsx`의 `SuccessModal` 정의(라인 840~)를 Read. 기존 props(title/message/cta 등) 목록화.

- [ ] **Step 2: 계약 테스트 작성**(기존 props 유지 보장)

```tsx
// __tests__/success-modal.test.tsx
import React from 'react';
import { Text } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { SuccessModal } from '../components/ui';

describe('SuccessModal contract', () => {
  it('renders title and cta when visible', () => {
    // 실제 props는 Step 1에서 확인한 시그니처로 채운다
    const tree = TestRenderer.create(
      <SuccessModal visible title="확정했어요" ctaLabel="확인" onClose={() => {}} />,
    );
    const texts = tree.root.findAllByType(Text).map((n) => n.props.children).join(' ');
    expect(texts).toContain('확정했어요');
  });
});
```
> Step 1에서 확인한 실제 prop 이름으로 위 JSX를 수정한다(placeholder 아님 — 실 시그니처로 채울 것).

- [ ] **Step 3: 실패/기준 확인** — Run: `npx jest success-modal -v`. 현행 통과하면 계약 고정 완료.

- [ ] **Step 4: 목업 대조 리스타일** — `UI RENEW/DATE_NAVI_P2_INDIVIDUAL_SCREENS/15_success_modal.png` Read → 일러스트/체크 마스코트·레이아웃·버튼을 목업에 맞춤(가능하면 `Illustration` `mascot-heart-couple-check` 활용). 토큰만.

- [ ] **Step 5: 회귀 확인** — Run: `npx jest && npm run validate` → 소비 화면 테스트 포함 PASS. StyleSeed 게이트.

- [ ] **Step 6: 커밋** — `git commit -m "style(ui): SuccessModal 목업 리스타일"`

---

## Task 9: `pickers` 리스타일 (목업 P2/16)

**Files:**
- Modify: `components/pickers.tsx`
- Test: 기존 소비 화면 회귀 + `__tests__/pickers-contract.test.tsx`

> 다중 소비자(anniversary·couple-connect·confirm·settings). export 시그니처 불변.

- [ ] **Step 1: 현행 export/props 파악** — `components/pickers.tsx` Read, export 컴포넌트·props 목록화.

- [ ] **Step 2: 계약 테스트 작성** — Step 1 시그니처 기준으로 각 export가 핵심 옵션/버튼을 렌더하는지 확인하는 테스트 작성(실제 export명·props로 채움).

- [ ] **Step 3: 기준 확인** — Run: `npx jest pickers-contract -v` → 현행 PASS.

- [ ] **Step 4: 목업 대조 리스타일** — `16_picker_modal.png` Read → 시트/옵션 셀/확인버튼 목업화. 토큰만.

- [ ] **Step 5: 회귀 확인** — Run: `npx jest && npm run validate` → PASS. StyleSeed 게이트.

- [ ] **Step 6: 커밋** — `git commit -m "style(pickers): 목업 리스타일"`

---

## Task 10: `GeneratingView` 리스타일 (목업 P2/01)

**Files:**
- Modify: `components/ui.tsx` (`GeneratingView`)
- Test: 기존 `generating` 테스트 회귀 + `__tests__/generating-view.test.tsx`

> 소비자: generating.tsx(클러스터4). `components/ui.tsx` 내부라 Phase 0 소유. props(`heading/steps/step`) 불변.

- [ ] **Step 1: 계약 테스트 작성**

```tsx
// __tests__/generating-view.test.tsx
import React from 'react';
import { Text } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { GeneratingView } from '../components/ui';

describe('GeneratingView contract', () => {
  it('renders heading and current step', () => {
    const tree = TestRenderer.create(
      <GeneratingView heading="코스를 만드는 중" steps={['장소 찾기', '코스 짜기']} step={0} />,
    );
    const texts = tree.root.findAllByType(Text).map((n) => n.props.children).flat().join(' ');
    expect(texts).toContain('코스를 만드는 중');
  });
});
```

- [ ] **Step 2: 기준 확인** — Run: `npx jest generating-view -v` → 현행 PASS(props 시그니처 확인).

- [ ] **Step 3: 목업 대조 리스타일** — `01_generating.png` Read → 세로 코스지도 일러스트(`date-course-map-vertical`)·진행 표시 목업화. props 동작 불변.

- [ ] **Step 4: 회귀 확인** — Run: `npx jest && npm run validate` → PASS. StyleSeed 게이트.

- [ ] **Step 5: 커밋** — `git commit -m "style(ui): GeneratingView 목업 리스타일"`

---

## Task 11: 문서 · 메모리 룰 폐기 반영

**Files:**
- Modify: `Design.md`
- Modify: 메모리 `design-no-emoji-no-color-badge.md` + `MEMORY.md`

- [ ] **Step 1: Design.md 갱신** — "이모지·원색 색깔 뱃지 금지" 규칙을 폐기/개정으로 수정: 컬러 카테고리 핀·일러스트·워드마크 섹션 추가, 신규 컴포넌트(Illustration/Wordmark/CourseMapPreview/DdayBadge/MetaChipRow/PlanListRow) 등재. 신규 토큰(catMeal/catCafe/catWalk) 기록.

- [ ] **Step 2: 메모리 갱신** — `design-no-emoji-no-color-badge.md` 본문을 "일러스트/코스맵 컬러 핀은 허용, 목업이 진실. 일반 배지/태그는 여전히 톤 패밀리 파스텔"로 개정. `MEMORY.md` 인덱스 1줄 갱신.

- [ ] **Step 3: 커밋** — `git commit -m "docs: 색깔금지 룰 폐기 + Phase0 컴포넌트 반영"`

---

## Task 12: Phase 0 마감 검증 & main 병합

- [ ] **Step 1: 전체 검증** — Run: `npx jest && npm run validate` → 전부 PASS, tsc 클린.
- [ ] **Step 2: 워킹트리 클린 확인** — Run: `git status` → clean.
- [ ] **Step 3: 기준선 해시 기록** — Run: `git rev-parse --short HEAD` → spec의 §8 패킷 "기준선"에 이 해시를 채운다(RESULT.md에도 기록).
- [ ] **Step 4: RESULT.md·PLAN.md 갱신** — Phase 0 완료·Phase 1 클러스터 패킷 대기 반영.

---

## 결정 로그
- (Task 0에서 채움) Wordmark 방식: __________
- (Task 0에서 채움) 핀 색 실측: meal ____ / cafe ____ / walk ____

## Self-Review 결과
- **Spec 커버리지:** §3.1→T1, §3.2→T3~7, §3.3→T8~10(StepActionSheet는 단독소비자라 클러스터4로 이관, spec §10 해소), §3.4→T2, §3.5→T11, §3.6→T12. 전 항목 태스크 대응.
- **StepActionSheet 경계:** spec은 Phase 0 소유로 열어뒀으나 소비자 조사 결과 course-result 단독 → 클러스터4 귀속으로 확정(문서화됨).
- **타입 일관성:** `IllustrationName`(T3)·`CoursePinCategory`(T5)·토큰명(T1)이 후속 태스크와 일치.
- **placeholder:** 리스타일 태스크(T8~10)는 "현행 props Read→계약테스트→목업대조" 구조로, 실 시그니처를 Step에서 확정하게 함(빈 TODO 아님).
