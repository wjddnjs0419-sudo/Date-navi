# Input/Loading Design System Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Figma `Input/Loading`에서 확인한 디자인 규칙을 앱 전체의 토큰·공통 컴포넌트·화면에 단계적으로 적용해 화면 간 시각적 편차를 제거한다.

**Architecture:** Figma의 semantic token을 새 기준으로 고정하고, 기존 `C/SP/R/T/G` API는 호환 alias로 유지한다. 공통 프리미티브를 먼저 정규화한 뒤 Input과 Loading을 기준 세로 슬라이스로 전환하고, 온보딩·메인·카드·계정 화면을 기능군별로 순차 이행한다. 화면 전환·추천 요청·저장·인증 계약은 시각 migration과 분리한다.

**Tech Stack:** Expo React Native, TypeScript, React Native `StyleSheet`, `expo-router`, `react-native-svg`, `lucide-react-native`, `@react-native-community/datetimepicker`, `expo-font`, 기존 i18n(`locales/ko`, `locales/en`), Jest/React Test Renderer.

**Spec:** `docs/superpowers/specs/2026-08-26-generating-loading-renewal-design.md`, Figma `Date-navi Design System`의 `Flow 4 — Quick Planning / Loading` 노드 `520:2733`, English 노드 `498:1968`.

## Global Constraints

- Figma 기준 캔버스는 `390 × 844`, Loading 화면 기본 좌우 여백은 `20px`, 배경은 `#FFF9FC`다.
- Figma Loading에는 Back Bar 인스턴스가 보이지만, 제품 결정으로 Loading 화면 내부 뒤로가기 버튼은 렌더하지 않는다.
- Navigation rule은 `nested screen = BackBar`, `standalone entry/auth = no BackBar`, `blocking Loading = no BackBar`, `modal/sheet = close/cancel/complete action`으로 고정한다.
- 기존 코스 생성은 `0% → 90% 대기 → 응답 완료 후 100%` 진행 메커니즘, AbortController, stale response 방지, 오류·재시도 경로를 유지한다.
- Figma 표준 폰트는 Inter이며, 한글은 Inter가 제공하지 않는 글리프에 대해 플랫폼 fallback을 사용한다.
- 색상은 semantic token을 통해서만 사용한다. 새로운 화면 코드에 raw hex, `rgba`, 임의의 색상 이름을 추가하지 않는다.
- 간격은 Figma scale `0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 56, 60`에서 선택하고, 화면 수평 여백은 `20px`을 기본으로 한다.
- 반경 canonical 값은 `badge 6`, `input 16`, `button 18`, `chip 20`, `card 22`, `modal 24`, `full 999`다.
- 모든 화면 문구는 `locales/ko`와 `locales/en`을 동시에 갱신하고, 한국어·영어에서 줄바꿈과 truncation을 검증한다.
- 이번 요청에서는 화면 코드, 토큰 코드, 에셋, 라우팅을 수정하지 않는다. 이 문서만 추가하며, 구현은 별도 승인된 실행 작업으로 진행한다.
- 검증 명령은 Node stack overflow를 피하기 위해 `node --stack_size=8192 ./node_modules/typescript/bin/tsc --noEmit`를 사용한다.

---

## 1. 조사 결과와 기준 확정

### 1.1 Figma `Input/Loading`에서 확인된 규칙

참조 범위는 Figma의 Flow 4 Loading section `520:2733`, English section `498:1968`, 한국어 상태 frame `520:2448`, `520:2494`, `520:2540`, `520:2586`, English 상태 frame `498:1973`, `498:2040`, `498:2107`, `498:2174`다.

| 영역 | Figma 기준 | 앱 전체 migration 의미 |
|---|---|---|
| Canvas | `#FFF9FC`, 390×844, 좌우 20 | 화면 바닥과 주요 컨테이너의 기준을 통일한다. |
| Brand | primary `#F26B7A`, deep `#C24B57`, subtle `#FFEEF0`, border `#F2A8B0`, selected `#FFD3D9` | `C.pink`, `C.pinkDeep`, `C.pinkLight`, `C.pinkBorder`, `C.pinkMid`를 semantic 이름으로 승격한다. |
| Surface | canvas `#FFF9FC`, surface `#FFFFFF` | 페이지 배경과 카드/시트 표면을 구분한다. |
| Text | primary `#3A2E2E`, secondary `#8A7F76`, tertiary `#A89B92`, disabled `#B8AEA6`, inverse `#FFFFFF` | `textSub`, `textMuted`, `textLight`, `textFaint`의 사용 역할을 다시 매핑한다. |
| Border | default `#F2E0DC`, subtle `#F2E7DC`, selected `#F2A8B0` | 입력·카드·선택 상태에서 border 의미가 섞이지 않게 한다. |
| Spacing | `0/2/4/8/12/16/20/24/32/40/48/56/60` | 현재 `SP`에 없는 2, 40, 48, 56, 60과 semantic 용도를 보강한다. |
| Radius | `6/16/18/20/22/24/999` | 현재 `R.md=14`를 일반 input 기준으로 사용하지 않고 `input=16`으로 이동한다. |
| Elevation | card `y4/.10/blur7`, raised `y3/.08/blur6`, popover `y8/.12/blur16`, warm shadow `#785046` | raw shadow 조합을 named elevation으로 통일하고 Android `elevation`은 보조값으로 유지한다. |
| Typography | Inter display 30/36, hero 26/34, h1 22/30, h2 19/26, h3 15/20, body-lg 16/24, body 14/22, body-compact 13/20, body-sm 12/18, caption 11/16, button 15/20, button-compact 13/18 | 현재 `T.h1`, `T.sub`만 있는 구조를 전체 scale로 확장한다. |
| Iconography | small 16, default 20, large 24; Loading 내부 아이콘은 18 | 아이콘 크기와 stroke 규칙을 registry로 고정하고 Figma Route path를 별도 등록한다. |
| Loading composition | 제목 y72, subtitle y138, mascot slot y165~320, bubble y328/64, stepper y416/76, conditions card y516/104, status y644, progress y676/8 | Loading만의 고정 레이아웃을 공통 화면 프레임과 분리해 responsive overflow를 통제한다. |
| Loading motion | 진행률은 연속 증가, 단계는 24/52/76/100 checkpoint, 이미지·말풍선·상태 문구 cross-fade | 숫자, progress fill, 캐릭터, 문구가 같은 animated progress를 읽도록 한다. |
| Navigation affordance | 일반 중첩 화면만 BackBar, 로그인·Loading은 BackBar 없음, modal/sheet는 close/cancel/complete | 뒤로가기와 닫기 의미를 섞지 않는다. |

Loading의 조건 카드는 `350 × 104`, padding `16`, radius `22`, white surface, subtle border와 card elevation을 사용한다. 1행은 map pin + location, calendar + time이고 2행은 heart + mood다. 단계 원은 `44 × 44`, 아이콘은 `18`, 라벨은 `11/16`이다.

### 1.2 기존 앱의 현재 구조

- `constants/colors.ts`는 Figma 색상 대부분을 이미 값으로 가지고 있다. `C.bg`, `C.pink`, `C.pinkDeep`, `C.pinkLight`, `C.pinkBorder`, `C.pinkMid`, `C.text`, `C.textSub`, `C.border`, `C.borderLight`, `C.shadow`가 대표 alias다.
- `constants/theme.ts`는 `SP`를 `4/8/12/16/20/24/32`, `R`을 `6/10/14/16/18/20/22/24`, `T`를 `h1/sub`, `G`를 `screen/center/row`로 제공한다.
- `components/ui.tsx`에는 `BigButton`, `SoftCard`, `SwipeableCard`, `Chip`, `OptionCardPicker`, `Badge`, `BackBar`, `ProgressDots`, `ListGroup`, `ListRow`, `LocationField`, `PlaceRow`, `InfoNote`, `GeneratingView`, `FieldBox`, `MoreMenu`, `SuccessModal`, `CourseStepList`가 한 파일에 함께 있다.
- `components/recommendation/`에는 `LocationSelector`, `CourseStepEditor`, `CourseTimeSelector`, `StepSlider`, `StepActionSheet`, `QuickPlanningLoading`이 있고, 이들은 자체 StyleSheet와 raw 숫자를 일부 가진다.
- 대부분의 화면은 `C`와 `SP/R`를 사용하지만, 화면별 `StyleSheet.create` 안에 타이포그래피·반경·그림자·spacing을 직접 반복한다.
- `Design.md`는 현재 웜 핑크 시스템을 설명하지만, `docs/02-design/features/date-planner.design.md:328-380`은 이전의 흰색 캔버스·검정 텍스트·`#ff385c` 기준을 설명해 문서 source of truth가 충돌한다.

### 1.3 차이와 migration priority

| 우선순위 | 차이 | 근거 | migration 판단 |
|---|---|---|---|
| P0 | semantic token 부재 | `constants/theme.ts:7-30`, `constants/colors.ts:1-43` | 값을 먼저 고정하고 기존 alias를 호환 유지한다. |
| P0 | 타이포그래피 scale 부재와 폰트 공급 부재 | `constants/theme.ts:28-31`, `Design.md`의 시스템 폰트 규칙 | `T` 전체 scale과 root font loading을 만든다. |
| P0 | Input 반경 variance | `components/recommendation/location-selector.tsx:232-242`, `components/ui.tsx:655-672` | input은 16으로 canonicalize한다. 카드/버튼과 분리한다. |
| P0 | Loading 색상 drift | `components/recommendation/quick-planning-loading.tsx:341-420`의 `#FFEDEF` | Figma/current `C.pinkLight=#FFEEF0`를 사용한다. raw 값을 제거한다. |
| P0 | Loading duplicate systems | `components/ui.tsx:724-862`의 `GeneratingView`와 `QuickPlanningLoading` | 새 Quick Planning Loading과 legacy fallback을 명시적으로 분리하고 공통 motion contract만 공유한다. |
| P1 | Elevation raw 조합 반복 | `components/ui.tsx:74-86`, `486-498`, `app/(tabs)/index.tsx:274-299` | `elevation.card/raised/popover`으로 매핑한다. |
| P1 | Icon source mixed | `components/ui.tsx:6`, `components/recommendation/quick-planning-loading.tsx:11-51`, 다수 화면의 lucide imports | common icon registry와 Figma-specific Route icon을 사용한다. |
| P1 | 공통 컴포넌트와 화면 전용 구현 중복 | `FieldBox`, `LocationField`, inline TextInput wrappers, inline cards | generic primitive → feature wrapper 순서로 합친다. |
| P1 | Loading progress semantics partial | `QuickPlanningLoading:246-252`는 progressbar를 제공하지만 `GeneratingView`는 단순 layout | 모든 loading state에서 현재 단계·퍼센트·문구를 하나의 접근성 source로 만든다. |
| P2 | 문서/실제 코드 불일치 | `Design.md`, `docs/02-design/features/date-planner.design.md` | token migration 종료 시 문서를 하나의 기준으로 정리한다. |

### 1.4 현재 audit 결과

디자인 시스템 정합성은 `Needs Improvement`로 판정한다.

- 강점: Figma의 핵심 색상과 `SoftCard`의 card elevation이 이미 존재하고, `QuickPlanningLoading`은 단계·조건 카드·progress semantics·reduce motion을 구현하고 있다.
- 문제: `T`가 너무 작고, `C/SP/R`가 semantic 역할보다 legacy alias 중심이며, raw style 값이 화면과 공통 컴포넌트에 반복된다.
- 문제: `QuickPlanningLoading`은 `fontFamily: 'Inter'`를 선언하지만 앱 root에서 Inter를 로드하지 않는다.
- 문제: `C.pinkLight`와 같은 의미의 색이 Loading 안에서 `#FFEDEF`로 직접 입력되어 Figma `#FFEEF0` 및 공통 토큰과 달라진다.
- 문제: Loading의 `44/18`, `card 22`, `shadow y4/.10/blur7`가 공통 token 이름 없이 컴포넌트 내부에 다시 작성됐다.
- 문제: `ListGroup`의 radius 20, `LocationField`의 radius 14, 여러 화면의 radius 12/14/16/18/20/22가 같은 역할인지 구분되지 않는다.

---

## 2. 전체 화면 inventory

| 기능군 | 화면/파일 | 현재 공통 사용 | migration 목표 | 우선순위 |
|---|---|---|---|---|
| Bootstrap | `app/index.tsx`, `app/_layout.tsx`, `app/(auth)/_layout.tsx`, `app/(tabs)/_layout.tsx` | `G`, splash 자체 스타일, tab icon 직접 import | root font/theme bootstrap, splash/loading contract, tab icon registry | P0 |
| Auth | `app/(auth)/index.tsx` | `Illustration`, 자체 social buttons, `C/SP/R` | Button/typography/brand assets/a11y를 공통화 | P2 |
| Onboarding input | `app/onboarding/nickname.tsx`, `photo.tsx`, `preferences.tsx`, `anniversary.tsx`, `type.tsx` | `BackBar`, `ProgressDots`, `BigButton`, `SoftCard`, `DateWheelPicker` | InputField, SelectionCard, ProgressDots, Button, field/error states | P1 |
| Couple onboarding | `app/onboarding/couple-choice.tsx`, `couple-connect.tsx`, `connected.tsx` | `SoftCard`, `ListGroup/ListRow`, `Illustration`, inline TextInput/button | Card/List/Input/Success primitives, invite code state | P2 |
| Quick Planning input | `app/mode-flow/course.tsx`, `components/recommendation/course-step-editor.tsx`, `course-time-selector.tsx`, `location-selector.tsx`, `step-slider.tsx`, `components/pickers.tsx` | 일부 `C/SP/R`, 자체 cards/chips/picker styles | Figma Input/Selection/Step Slider/Location Field contract | P0 |
| Legacy feeling input | `app/mode-flow/feeling.tsx`, `app/mode-flow/bucketlist.tsx` | `Chip`, `OptionCardPicker`, `LocationField`, `BigButton` | same Input primitives로 legacy/new 흐름의 표면만 통일 | P1 |
| Place search | `app/mode-flow/place-search.tsx` | `Chip`, 자체 search/list/loading | SearchField, ListRow, Empty/Loading/Error state | P1 |
| Loading | `app/mode-flow/generating.tsx`, `components/recommendation/quick-planning-loading.tsx`, `components/ui.tsx::GeneratingView`, `app/shot.tsx` | Quick Planning은 전용, legacy는 전용, ActivityIndicator fallback | `LoadingStage`, `ProgressBar`, `LoadingState`, motion/a11y contract | P0 |
| Recommendation results | `app/mode-flow/result.tsx`, `course-result.tsx` | `SoftCard`, `CourseStepList`, `CourseMapPreview`, `PickerSheet`, inline cards | ResultCard/Timeline/Sheet/Card/Empty/Error 표면 통일 | P1 |
| Main tabs | `app/(tabs)/index.tsx`, `candidates.tsx`, `memories.tsx`, `mode.tsx` | `Wordmark`, `Illustration`, `CourseMapPreview`, `Badge`, `MetaChipRow`, cards | ScreenFrame, Card, List, Chip, tab icon and loading states | P2 |
| Plans | `app/plans/index.tsx` | `BackBar`, `SoftCard`, `PlanListRow`, `SectionLabel` | card/list/elevation/radius canonicalization | P2 |
| Card detail/edit | `app/card/[id].tsx`, `confirm.tsx`, `edit/[id].tsx`, `review.tsx` | `CourseStepList`, `BigButton`, `BackBar`, `PickerSheet`, `StepSlider` | shared Field/Card/BottomAction/Sheet/Review components | P1 |
| Memory | `app/card/memory/[id].tsx`, `memory/edit/[id].tsx`, `memory/new.tsx` | `BackBar`, `BigButton`, `HeartDoodle`, `Illustration`, `StarRating` | media input, rating, feedback, card and action contracts | P2 |
| Share | `app/share/mutual.tsx`, `reaction.tsx`, `send.tsx` | `SoftCard`, `CourseStepList`, `ReactionPicker`, `SuccessModal` | ShareCard/Reaction/Feedback/Loading states | P2 |
| Account/settings | `app/settings.tsx`, `app/account/edit-profile.tsx`, `notifications.tsx`, `delete-account.tsx` | `ListGroup/ListRow`, `BackBar`, `BigButton`, `PickerSheet` | List/Input/Modal/Destructive action semantics | P2 |
| Legal | `app/legal/privacy.tsx`, `terms.tsx` | `BackBar`, `G/SP/T` | typography, readable content width, navigation semantics | P3 |
| Visual harness | `app/shot.tsx`, `docs/screenshots/quick-planning-loading.html` | screenshot fixtures | reference-only; product token migration 대상 아님 | P0 검증 |

---

## 3. Target architecture

### 3.1 Token layer

새 source of truth는 `constants/design-tokens.ts`로 두고, 기존 import를 깨지 않도록 `constants/colors.ts`와 `constants/theme.ts`가 alias를 제공한다.

```ts
export const DS = {
  color: {
    brandPrimary: '#F26B7A',
    brandDeep: '#C24B57',
    brandSubtle: '#FFEEF0',
    brandBorder: '#F2A8B0',
    brandSelected: '#FFD3D9',
    backgroundCanvas: '#FFF9FC',
    backgroundSplash: '#FFF1F6',
    surface: '#FFFFFF',
    textPrimary: '#3A2E2E',
    textSecondary: '#8A7F76',
    textTertiary: '#A89B92',
    textDisabled: '#B8AEA6',
    borderDefault: '#F2E0DC',
    borderSubtle: '#F2E7DC',
    borderSelected: '#F2A8B0',
    error: '#FF4F6D',
    shadowWarm: '#785046',
  },
  spacing: { zero: 0, micro: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, hero: 40, art: 48, splash: 56, tab: 60 },
  radius: { badge: 6, input: 16, button: 18, chip: 20, card: 22, modal: 24, full: 999 },
  typography: { h1: { size: 22, lineHeight: 30, weight: '700' }, body: { size: 14, lineHeight: 22, weight: '500' }, bodyCompact: { size: 13, lineHeight: 20, weight: '500' }, bodySm: { size: 12, lineHeight: 18, weight: '500' }, caption: { size: 11, lineHeight: 16, weight: '500' }, button: { size: 15, lineHeight: 20, weight: '600' } },
  elevation: { card: { y: 4, opacity: 0.1, blur: 7 }, raised: { y: 3, opacity: 0.08, blur: 6 }, popover: { y: 8, opacity: 0.12, blur: 16 } },
  motion: { progressMs: 400, stageCrossfadeMs: 280, copyCrossfadeMs: 240, pressOpacity: 0.85 },
} as const;
```

`C/SP/R/T/G`는 바로 제거하지 않는다. 기존 화면을 세로 슬라이스 단위로 바꾼 뒤 `rg`로 소비자가 0이 된 alias만 제거한다.

### 3.2 Shared primitives

공통 컴포넌트의 책임은 다음으로 고정한다.

```ts
type InputFieldProps = {
  label?: string;
  value: string;
  placeholder?: string;
  error?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  onChangeText: (value: string) => void;
  multiline?: boolean;
  editable?: boolean;
};

type LoadingStateProps = {
  label: string;
  description?: string;
  tone?: 'brand' | 'neutral';
  accessibilityLabel?: string;
};
```

- `BigButton`은 기존 `primary/secondary/text/disabled` API를 유지하고 token 기반 size/state/a11y를 추가한다.
- `SoftCard`는 `elevation.card`, `radius.card`, `surface`, `border.subtle`를 기본값으로 사용한다.
- `FieldBox`와 `LocationField`의 외형은 `InputField` 계약을 소비하는 feature wrapper로 바꾼다.
- `ProgressDots`는 onboarding용으로 유지하되 `ProgressStepper`를 새로 분리해 Loading의 `44/18/11` 규칙과 progressbar semantics를 담당하게 한다.
- Navigation primitive은 `BackBar`와 modal `CloseButton`을 분리한다. `BackBar`는 nested route 전용이고, `CloseButton`은 `PickerSheet`/replacement sheet/title sheet 같은 modal surface 전용이다.
- `GeneratingView`는 legacy fallback 전용으로 남기고, Quick Planning은 `QuickPlanningLoading`을 사용한다. 두 컴포넌트가 공유하는 것은 `ProgressBar`와 motion/a11y helper뿐이다.
- 아이콘은 `components/iconography.tsx`의 named registry를 사용한다. Figma Route path는 registry에 등록하고 screen에서 raw SVG를 다시 선언하지 않는다.

---

## 4. Implementation tasks

### Task 1: Token contract와 문서 source of truth 고정

**Files:**
- Create: `constants/design-tokens.ts`
- Modify: `constants/colors.ts`
- Modify: `constants/theme.ts`
- Modify: `Design.md`
- Modify: `docs/02-design/features/date-planner.design.md`
- Test: `__tests__/design-tokens.test.ts`

**Interfaces:**
- Produces: `DS.color`, `DS.spacing`, `DS.radius`, `DS.typography`, `DS.elevation`, `DS.motion`과 기존 `C/SP/R/T/G` compatibility exports.

- [ ] `DS` 객체에 Figma color, spacing, radius, elevation, typography, motion 값을 추가하고 모든 값에 semantic 이름을 부여한다.
- [ ] `C` alias를 `DS.color`에 연결하고 `C.pinkLight`의 값을 `#FFEEF0`로 고정한다.
- [ ] `SP`에 `micro`, `hero`, `art`, `splash`, `tab`을 추가하되 기존 키의 값은 유지한다.
- [ ] `R.md`를 즉시 삭제하지 않고 `R.input=16`, `R.button=18`, `R.chip=20`, `R.card=22`, `R.modal=24`, `R.full=999`를 추가한다.
- [ ] `T`에 Figma type scale을 React Native `TextStyle`로 노출하고 font family는 font loader의 resolved family를 사용하도록 경계를 만든다.
- [ ] `Design.md`를 Figma/현재 RN 기준으로 갱신하고 `docs/02-design/features/date-planner.design.md:328-380`의 이전 `#ffffff/#222222/#ff385c` 규칙을 Figma canonical 값으로 교체한다.
- [ ] 테스트에서 `DS.color.brandPrimary === '#F26B7A'`, `DS.color.brandSubtle === '#FFEEF0'`, `DS.radius.input === 16`, `DS.radius.card === 22`, `DS.elevation.card` 값을 고정한다.
- [ ] Run: `npx jest __tests__/design-tokens.test.ts --runInBand`와 `npm run validate`.

### Task 2: Inter font loading과 typography boundary 추가

**Files:**
- Create: `assets/fonts/Inter-Regular.ttf`, `assets/fonts/Inter-Medium.ttf`, `assets/fonts/Inter-SemiBold.ttf`, `assets/fonts/Inter-Bold.ttf`
- Create: `lib/font-loader.ts`
- Modify: `package.json`, `package-lock.json`
- Modify: `app/_layout.tsx`
- Modify: `constants/design-tokens.ts`
- Test: `__tests__/font-loader.test.ts`

**Interfaces:**
- Produces: `loadDesignFonts(): Promise<Record<string, boolean>>`, `DESIGN_FONT_FAMILY`, and root `fontsReady` gate.

- [ ] `expo-font`를 직접 dependency로 고정하고 Inter 정적 weight 400/500/600/700 파일을 앱 assets로 등록한다.
- [ ] `loadDesignFonts()`가 성공 시 Inter family를 반환하고 실패 시 플랫폼 sans fallback으로 계속 렌더하도록 만든다.
- [ ] `app/_layout.tsx`에서 font load를 startup gate에 연결하되, 네트워크·Supabase startup timeout과 서로 대기하지 않게 한다.
- [ ] 한글 문구는 Inter에 없는 글리프가 플랫폼 fallback으로 자연스럽게 렌더되는지 확인하고, English는 Inter weight가 실제 적용되는지 확인한다.
- [ ] `font-loader.test.ts`에서 성공·실패·fallback 결과를 검증한다.
- [ ] Run: `npx jest __tests__/font-loader.test.ts --runInBand`와 `npm run validate`.

### Task 3: Iconography와 shared primitive 정규화

**Files:**
- Create: `components/iconography.tsx`
- Modify: `components/ui.tsx`
- Modify: `components/illustration.tsx`
- Modify: `components/pickers.tsx`
- Test: `__tests__/design-primitives.test.tsx`, `__tests__/iconography.test.tsx`

**Interfaces:**
- Produces: `AppIcon({ name, size, color, strokeWidth })`, `InputField`, `SelectionCard`, `ProgressStepper`, `ProgressBar`, `LoadingState`.
- Consumes: `DS`, resolved font family, existing `BigButton/SoftCard/BackBar` call signatures.

- [ ] `AppIcon`에 `search`, `mapPin`, `calendar`, `heart`, `route`, `chevronLeft`, `chevronRight`, `clock`, `wallet`, `walk` 이름을 등록한다.
- [ ] `route`는 Figma `Icon / 동선 정리` path를 registry 안에 보관하고 `components/recommendation/quick-planning-loading.tsx`의 local `FigmaRouteIcon`을 `AppIcon` 소비로 교체한다.
- [ ] `BigButton`, `SoftCard`, `Chip`, `Badge`, `BackBar`의 raw radius/shadow/font 값을 `DS` 기반으로 바꾸되 기존 public props를 보존한다.
- [ ] generic `InputField`를 추가하고 `FieldBox`는 adapter로, `LocationField`는 leading/trailing/error를 조합하는 adapter로 유지한다.
- [ ] `ProgressStepper`는 `44px` circle, `18px` icon, `11/16` label, active connector 규칙과 `progressbar` accessibility value를 함께 제공한다.
- [ ] `ProgressBar`는 `0~100` clamping, `track/fill`, reduced motion, testID를 공통 계약으로 제공한다.
- [ ] `LoadingState`는 검색·저장·업로드·조회 중의 작은 상태에 사용하고, Quick Planning의 mascot composition은 소유하지 않는다.
- [ ] `BackBar`와 modal close action을 별도 계약으로 테스트하고, close action을 nested navigation back으로 재사용하지 않는다.
- [ ] host node 기준 testID와 접근성 role을 테스트해 React Native wrapper 중복 매칭을 피한다.
- [ ] Run: `npx jest __tests__/design-primitives.test.tsx __tests__/iconography.test.tsx --runInBand`와 `npm run validate`.

### Task 4: Input vertical slice — Quick Planning과 legacy feeling

**Files:**
- Modify: `app/mode-flow/course.tsx`
- Modify: `components/recommendation/course-step-editor.tsx`
- Modify: `components/recommendation/course-time-selector.tsx`
- Modify: `components/recommendation/location-selector.tsx`
- Modify: `components/recommendation/step-slider.tsx`
- Modify: `components/pickers.tsx`
- Modify: `app/mode-flow/feeling.tsx`
- Modify: `app/mode-flow/bucketlist.tsx`
- Modify: `app/mode-flow/place-search.tsx`
- Test: `__tests__/course-screen.test.tsx`, `__tests__/course-step-editor.test.tsx`, `__tests__/location-selector.test.tsx`, `__tests__/step-slider.test.tsx`, `__tests__/input-primitives.test.tsx`

**Interfaces:**
- Consumes: `InputField`, `ProgressStepper`, `AppIcon`, `DS`.
- Produces: all mode-flow input screens with input radius 16, button radius 18, card radius 22, canonical typography, and localized validation/error states.

- [ ] `course.tsx`의 Intro, progress header, mood card, review card, title/subtitle를 `T`와 `SP/R` semantic token으로 바꾼다.
- [ ] `CourseStepEditor`의 category/preference chips와 step cards를 selection/card contract로 매핑하고 selected state는 `brand.subtle/brand.border/brand.deep`로 통일한다.
- [ ] `CourseTimeSelector`, `DateWheelPicker`, `TimeWheelPicker`의 field/sheet/button radius를 각각 input 16, modal 24, button 18로 맞춘다.
- [ ] `LocationSelector`와 legacy `LocationField`의 input radius 14를 16으로 바꾸고 search/list/error/permission 상태를 공통 InputField/ListRow contract로 연결한다.
- [ ] `StepSlider`의 24px thumb와 44px touch target은 유지하고 track, value label, accessibility adjustable semantics만 token화한다.
- [ ] `feeling`, `bucketlist`, `place-search`의 inline TextInput, search bar, chip, empty/error/loading 상태를 같은 primitive로 전환한다.
- [ ] 데이터 reducer, request payload, place bridge, validation rule, route params는 수정하지 않는다.
- [ ] 한국어/영어의 긴 장소명·시간값·mood 조합에서 no-wrap overflow와 truncation을 확인한다.
- [ ] Run: `npx jest __tests__/course-screen.test.tsx __tests__/course-step-editor.test.tsx __tests__/location-selector.test.tsx __tests__/step-slider.test.tsx __tests__/input-primitives.test.tsx --runInBand`와 `npm run validate`.

### Task 5: Loading vertical slice — Quick Planning, legacy, and transient loading

**Files:**
- Modify: `components/recommendation/quick-planning-loading.tsx`
- Modify: `app/mode-flow/generating.tsx`
- Modify: `components/ui.tsx`
- Modify: `app/index.tsx`
- Modify: `app/shot.tsx`
- Test: `__tests__/quick-planning-loading.test.tsx`, `__tests__/generating-view.test.tsx`, `__tests__/loading-contract.test.tsx`

**Interfaces:**
- Consumes: `ProgressStepper`, `ProgressBar`, `LoadingState`, `AppIcon`, `DS.motion`, `DS.elevation`.
- Produces: `getQuickPlanningStageIndex(progress)`, Quick Planning four-state UI, legacy `GeneratingView`, and non-blocking transient loading contract.

- [ ] `QuickPlanningLoading`의 `#FFEDEF` 두 곳을 `DS.color.brandSubtle`로 교체하고 조건 카드 shadow/radius/typography를 named token으로 연결한다.
- [ ] Figma Route icon을 `AppIcon` registry에서 소비하도록 바꾸고 Search/MapPin/Heart/Calendar도 동일한 size/stroke contract를 사용한다.
- [ ] stage checkpoint를 `0~24`, `25~52`, `53~76`, `77~100`으로 유지하고 character, bubble copy, status copy, percent가 동일한 animated progress를 읽도록 한다.
- [ ] progress number와 fill은 `0%`부터 연속 easing하며, 요청 응답 전 90%에서 기다리고 응답 완료 후 100%로 마무리하는 `generating.tsx` 동작을 보존한다.
- [ ] mascot은 장식 이미지로 유지하고 progressbar 하나에 단계명·현재 퍼센트·상태 문구를 합쳐 VoiceOver/TalkBack 중복 낭독을 막는다.
- [ ] `AccessibilityInfo.isReduceMotionEnabled()`가 true이면 cross-fade/scale/progress transition을 즉시 상태 전환으로 만든다.
- [ ] 단계 변경 시 이전 layer와 다음 layer가 겹쳐 cross-fade하고, bubble/status text는 고정 slot에서 교차 전환해 layout jump를 막는다.
- [ ] `GeneratingView`는 legacy 흐름의 코스맵/pulse를 유지하되 `ProgressBar`와 accessibility contract를 공유한다. Quick Planning mascot과 legacy asset을 서로 대체하지 않는다.
- [ ] `app/index.tsx`의 splash fade와 `app/shot.tsx` harness가 root font/theme 초기화와 충돌하지 않는지 확인한다.
- [ ] 테스트에서 0/24/25/52/53/76/77/100 checkpoint, 90% hold, 100% completion, reduced motion, KR/EN copy, testID를 고정한다.
- [ ] Run: `npx jest __tests__/quick-planning-loading.test.tsx __tests__/generating-view.test.tsx __tests__/loading-contract.test.tsx --runInBand`와 `npm run validate`.

### Task 6: Onboarding/auth 화면 migration

**Files:**
- Modify: `app/(auth)/index.tsx`
- Modify: `app/onboarding/nickname.tsx`
- Modify: `app/onboarding/photo.tsx`
- Modify: `app/onboarding/preferences.tsx`
- Modify: `app/onboarding/anniversary.tsx`
- Modify: `app/onboarding/type.tsx`
- Modify: `app/onboarding/couple-choice.tsx`
- Modify: `app/onboarding/couple-connect.tsx`
- Modify: `app/onboarding/connected.tsx`
- Test: `__tests__/auth-login-hero.test.tsx`, `__tests__/onboarding-ui-renew.test.tsx`, `__tests__/onboarding-photo-picker.test.tsx`, `__tests__/onboarding-design-contract.test.tsx`

**Interfaces:**
- Consumes: `InputField`, `SelectionCard`, `ProgressDots`, `BigButton`, `SoftCard`, `ListGroup/ListRow`, `Illustration`, `DS`.
- Produces: onboarding/auth screen surfaces with shared input, selection, feedback, button, progress, and font behavior.

- [ ] nickname/couple-connect/photo의 TextInput wrapper를 `InputField` 또는 `InputField` adapter로 교체하고 placeholder, focus, disabled, error 색상을 token화한다.
- [ ] preferences/type/couple-choice의 선택 카드를 `SelectionCard` 규칙으로 맞추고 selected state의 border/background/icon/text를 semantic token으로 통일한다.
- [ ] onboarding `ProgressDots`는 Loading `ProgressStepper`와 합치지 않고, 공통 spacing/color/type만 공유한다.
- [ ] photo upload, nickname save, type save, couple connect의 ActivityIndicator를 `LoadingState` 또는 button busy state로 연결한다.
- [ ] BackBar는 일반적인 nested onboarding 화면에서만 유지하고, standalone login/auth 화면과 Loading route에는 렌더하지 않는다.
- [ ] `PickerSheet`, replacement sheet, title sheet 같은 modal surface에는 BackBar 대신 X/취소/완료 액션을 사용한다.
- [ ] Apple/Kakao/Google native login button의 provider 요구사항과 접근성 label은 유지하고, container/spacing/typography만 token화한다.
- [ ] 인증·profile·couple·onboarding routing과 Supabase 호출은 수정하지 않는다.
- [ ] Run: `npx jest __tests__/auth-login-hero.test.tsx __tests__/onboarding-design-contract.test.tsx --runInBand`와 `npm run validate`.

### Task 7: Main tabs, plans, result/card, share/account 화면 migration

**Files:**
- Modify: `app/(tabs)/_layout.tsx`, `app/(tabs)/index.tsx`, `app/(tabs)/candidates.tsx`, `app/(tabs)/memories.tsx`, `app/(tabs)/mode.tsx`
- Modify: `app/plans/index.tsx`
- Modify: `app/mode-flow/result.tsx`, `app/mode-flow/course-result.tsx`
- Modify: `app/card/[id].tsx`, `app/card/confirm.tsx`, `app/card/edit/[id].tsx`, `app/card/review.tsx`
- Modify: `app/card/memory/[id].tsx`, `app/card/memory/edit/[id].tsx`, `app/card/memory/new.tsx`
- Modify: `app/share/mutual.tsx`, `app/share/reaction.tsx`, `app/share/send.tsx`
- Modify: `app/settings.tsx`, `app/account/edit-profile.tsx`, `app/account/notifications.tsx`, `app/account/delete-account.tsx`
- Test: `__tests__/home-screen-contract.test.tsx`, `__tests__/candidates-screen-contract.test.tsx`, `__tests__/memories-screen-contract.test.tsx`, `__tests__/plans-screen-contract.test.tsx`, `__tests__/course-result-screen.test.tsx`, `__tests__/card-detail-hero.test.tsx`, `__tests__/card-memory-edit-screen-contract.test.tsx`, `__tests__/card-memory-new-screen-contract.test.tsx`, `__tests__/card-review-screen-contract.test.tsx`, `__tests__/share-mutual-screen.test.tsx`, `__tests__/share-reaction-screen.test.tsx`, `__tests__/share-send-screen.test.tsx`, `__tests__/settings-screen-redesign.test.tsx`, visual screenshot fixtures in `app/shot.tsx`

**Interfaces:**
- Consumes: token layer and shared primitives from Tasks 1–5.
- Produces: canonical card/list/sheet/action/loading surfaces without changing data, review, candidate, confirmation, or share behavior.

- [ ] Home/candidates/memories/plans의 card/list/elevation을 `SoftCard`, `PlanListRow`, `CourseMapPreview`, `Badge`, `MetaChipRow` contract로 매핑한다.
- [ ] tab bar icon size/active color/label typography를 `AppIcon`과 `DS.typography`로 통일한다. 기존 route names와 tab order는 유지한다.
- [ ] result/course-result/card detail의 timeline, place row, result card, replacement sheet, title sheet를 card/input/modal radius와 elevation에 매핑한다.
- [ ] card edit/confirm와 memory new/edit의 title/free text/date/time/rating/photo inputs를 `InputField`, `StepSlider`, `PickerSheet`, `StarRating` contract로 맞춘다.
- [ ] share/reaction/send의 success, loading, empty, error, reaction picker surfaces를 공통 feedback contract로 바꾼다.
- [ ] settings/account/legal처럼 nested route인 화면은 BackBar를 사용하고 destructive action은 `danger` semantic token과 confirmation modal을 사용한다. modal 자체에는 BackBar를 넣지 않는다.
- [ ] Home의 gradient/illustration과 category pin 색상처럼 명시된 brand exception은 유지하되, 새 raw color는 추가하지 않는다.
- [ ] Run: 해당 화면의 targeted Jest, `npm run validate`, `npx expo export --platform web`.

### Task 8: Accessibility, localization, visual gate와 cleanup

**Files:**
- Modify: `constants/design-tokens.ts`, `constants/colors.ts`, `constants/theme.ts`
- Modify: `components/ui.tsx`, `components/iconography.tsx`
- Modify: `locales/ko/common.json`, `locales/en/common.json`, `locales/ko/modeFlow.json`, `locales/en/modeFlow.json`, `locales/ko/course.json`, `locales/en/course.json`, `locales/ko/location.json`, `locales/en/location.json`
- Modify: `Design.md`, `docs/02-design/features/date-planner.design.md`
- Test: `__tests__/design-system-a11y.test.tsx`, `__tests__/home-screen-contract.test.tsx`, `__tests__/candidates-screen-contract.test.tsx`, `__tests__/memories-screen-contract.test.tsx`, `__tests__/plans-screen-contract.test.tsx`, `__tests__/legal-privacy-screen.test.tsx`, `__tests__/legal-terms-screen.test.tsx`, `__tests__/account-edit-profile-screen.test.tsx`, `__tests__/account-notifications-screen.test.tsx`, `__tests__/account-delete-account-screen.test.tsx`, screenshot harness snapshots

**Interfaces:**
- Consumes: all migrated screens and primitives.
- Produces: a checked migration ledger, no unowned raw style values in migrated paths, and a visual/a11y regression gate.

- [ ] migrated paths에서 `#[0-9A-Fa-f]`, `rgba(`, radius literal, shadow literal, font size literal을 `rg`로 검색해 token 외 사용처를 분류한다.
- [ ] 의도된 exception은 `components/iconography.tsx`, illustration sizing, category pin color, native provider button처럼 소유 파일과 이유를 문서화한다.
- [ ] Loading, Input, Button, Card, List, Sheet, Selection, Error, Empty 상태마다 accessibility role/label/value/selected/disabled를 검증한다.
- [ ] KR/EN 모든 화면을 `390×844`에서 캡처하고 Figma reference와 비교한다. Loading은 0/24/52/76/100, Input은 각 validation/focus/selected 상태를 캡처한다.
- [ ] iOS와 Android에서 font fallback, safe area, keyboard, picker sheet, shadow/elevation, VoiceOver/TalkBack을 확인한다.
- [ ] `app/shot.tsx`를 product route로 취급하지 않고 visual harness로 유지한다. `docs/screenshots/quick-planning-loading.html`은 RN 구현의 보조 비교 자료로만 둔다.
- [ ] 소비자가 0이 된 legacy token alias와 중복 스타일을 삭제하고, 삭제 전 `rg` 결과와 Jest/tsc 결과를 기록한다.
- [ ] Run: `npm run validate`, `npm test -- --runInBand`, `npx expo export --platform web`, target device visual QA.

---

## 5. 실행 순서와 완료 기준

실행 순서는 `Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7 → Task 8`이다. 각 task는 다음 checkpoint를 통과한 뒤 다음 task로 이동한다.

1. TypeScript와 해당 task의 targeted tests가 통과한다.
2. 기존 route params, request payload, Supabase 호출, navigation, persistence 동작이 변하지 않는다.
3. 한국어·영어에서 text clipping과 layout jump가 없다.
4. 390×844 기준 Figma reference와 색·반경·spacing·typography·icon source를 비교한다.
5. reduce motion과 VoiceOver/TalkBack 상태가 통과한다.
6. dirty worktree에 이미 존재하는 사용자 변경을 분리한 뒤 task 단위로 커밋한다. 현재 분석 turn에서는 commit이나 화면 수정이 없다.

최종 완료 조건은 다음과 같다.

- Figma Loading의 4단계 checkpoint와 0→90→100 progress 동작이 유지된다.
- standalone login/auth와 blocking Loading 내부 BackBar가 없고, 일반 nested 입력/상세 화면의 BackBar는 유지된다.
- modal/sheet는 BackBar 없이 X/취소/완료로 닫히며, modal close와 route back의 접근성 label이 분리된다.
- Input radius variance가 canonical `16`으로 정리되고 card/button/modal radius가 `22/18/24`로 구분된다.
- 화면 코드는 semantic token과 shared primitive를 사용하며, raw color/shadow/radius는 문서화된 exception만 남는다.
- `QuickPlanningLoading`의 단계 이미지, bubble, status text, percent, progress fill이 같은 timeline으로 자연스럽게 전환된다.
- 전체 화면의 KR/EN copy와 accessibility semantics가 동일한 component contract를 따른다.
- `npm run validate`, 전체 Jest, Expo export, iOS/Android visual QA가 모두 통과한다.

## 6. 이번 turn의 변경 범위

- 추가한 파일: 이 계획 문서 하나.
- 화면 코드·토큰 코드·에셋·라우팅·데이터 계약은 수정하지 않았다.
- 기존 worktree의 다른 변경은 이 계획의 결과로 정리하거나 되돌리지 않는다.
