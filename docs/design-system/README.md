# Date-navi Design System

Status: Current baseline for UI work  
Last updated: 2026-08-27

이 문서는 Date-navi UI를 수정할 때 항상 참조하는 안정적인 디자인 시스템 진입점이다. 상세한 합의 과정과 결정 원본은 [2026-08-27 디자인 시스템 결정 기록](../superpowers/specs/2026-08-27-date-navi-design-system-decisions.md)에 보존한다.

## 적용 순서

1. UI를 수정하기 전에 이 문서와 상세 결정 기록을 읽는다.
2. 실제 값은 `constants/design-tokens.ts`의 토큰을 기준으로 한다.
3. 화면에서는 `C / DS / SP / T / G`와 공통 UI 컴포넌트를 사용한다.
4. 화면별 raw 색상·spacing·radius·font 값과 직접 Lucide 아이콘 사용을 추가하지 않는다.
5. 시각 변경 후 타입검사와 390×844 한·영 화면 확인을 수행한다.

## 핵심 토큰

### 색상

- Normal canvas: `#FFF9FC`
- Home gradient: 좌상단 `#FFF1F6` → 우하단 `#FFFFFF`
- Splash/loading background: `#FFF1F6`
- Surface: `#FFFFFF`
- Brand primary: `#F26B7A`
- Brand deep: `#C24B57`
- Brand subtle: `#FFEEF0`
- Brand border: `#F2A8B0`
- Brand selected: `#FFD3D9`
- Text primary: `#3B2E2E`
- Text secondary: `#8A7F76`
- Text tertiary: `#A89B92`
- Text disabled: `#B8AEA6`
- Border default: `#F2E0DC`
- Border subtle: `#F2E7DC`
- Error: `#FF4F6D`

흰색은 기본 페이지 배경이 아니라 surface다. Bucketlist와 Card Detail의 전체 흰색 배경은 이름 있는 예외 토큰으로 관리한다.

### Spacing

일반 spacing은 `4 / 8 / 12 / 16 / 24 / 32 / 40 / 48`만 사용한다.

- `20pt`: 화면 inset·헤더 디자인 inset
- `44pt`: 최소 터치 영역·아이콘 버튼 프레임
- `56pt`, `60pt`: 컴포넌트 고유 크기
- `2 / 6 / 10 / 13pt`: 일반 레이아웃 spacing으로 사용하지 않는 legacy/component-specific 값

Safe Area는 디자인 spacing에 포함하지 않는다. Input 기준은 Safe Area를 먼저 적용한 뒤 상·하·좌·우 디자인 여백을 별도로 둔다. 기본 페이지 여백은 Safe Area 안쪽 20pt다.

### Typography

폰트는 Inter다.

| Style | Size / line height | Weight |
|---|---:|---|
| Display | 30 / 36 | Extra Bold |
| Hero | 26 / 34 | Bold |
| Screen title | 24 / 32 | Extra Bold |
| H1 | 22 / 30 | Bold |
| H2 | 19 / 26 | Bold |
| H3 | 15 / 20 | Bold |
| Body Large | 16 / 24 | Semi Bold |
| Body | 14 / 22 | Medium |
| Body Compact | 13 / 20 | Medium |
| Body Small | 12 / 18 | Medium |
| Caption | 11 / 16 | Medium |
| Button | 15 / 20 | Semi Bold |

한국어·영어는 자연스럽게 줄바꿈한다. 한 줄 고정·말줄임은 전역 규칙이 아니며, 의도된 hero 카피에만 수동 줄바꿈을 허용한다.

## 공통 구조

### Header

- `Header`는 제목을 포함하지 않는 44pt 내비게이션 행이다.
- Child: 좌측 44×44 back frame, 필요한 경우에만 가운데 진행 상태와 우측 액션을 둔다.
- Root: Home처럼 내비게이션 행이 필요 없으면 Header를 생략할 수 있다. 우리 후보·우리 추억·설정/My page는 공통 Header의 뒤로가기를 표시하고, Home 워드마크처럼 내비게이션 행 역할인 브랜드 요소는 좌측 슬롯에 둘 수 있다.
- Login/loading/modal: 뒤로가기 없음
- Safe Area 아래 20pt에서 시작하고, 좌측 inset은 20pt다.
- 우측 액션 그룹은 우측 20pt inset에 고정한다. 복수 액션은 가장 오른쪽 액션부터 왼쪽으로 쌓으며 기본 간격은 8pt, 분리된 액션 그룹 간격은 16pt다.
- 화면에 직접 필요한 액션이 있을 때만 액션을 표시한다.
- Home의 Settings 진입과 My page 탭은 같은 화면과 같은 헤더를 사용한다.

### Screen title

- 화면 제목은 Header 내부가 아니라 Header 아래의 독립된 `ScreenHeading`이다.
- Child 화면에서는 44pt 내비게이션 행 아래 16pt에서 시작하며 좌측 inset은 20pt다.
- Root 화면에서 내비게이션 행이 없으면 Safe Area 아래 20pt에서 시작한다.
- `screenTitle` 24/32 Extra Bold를 사용하며 한국어·영어는 자연스럽게 줄바꿈한다.
- 제목에 종속된 하트 같은 디자인 요소는 제목 텍스트 직후 4pt에 둔다. 다가오는 데이트 수정과 추억 수정의 하트도 이 title accessory 규칙을 따른다. 액션이면 시각 간격은 유지하면서 44×44pt 터치 영역을 제공한다.
- 후보 상세의 하트는 제목 장식이 아니라 카드 반응 액션이다. `ScreenHeading` accessory로 넣지 않고 카드 제목 행의 trailing edge에 독립적인 44×44pt 액션으로 고정한다.

### Bottom tab bar

- Home, Date Mode, Candidates, Memories, My page에서 동일하게 사용한다.
- 본체 64pt + bottom Safe Area
- 아이콘 24pt, 라벨 11/16
- 활성 아이콘·라벨 `#F26B7A`, 비활성은 secondary/muted token
- 활성 밑줄이나 별도 pill은 사용하지 않는다.
- 상단 1pt divider만 사용하며, 상세 화면에서는 숨긴다.

Course Result·Memories·Plans의 segmented control은 하단 탭과 별개다. 선택된 항목은 기존의 채움 배경 방식으로 표시하고 밑줄은 사용하지 않는다.

## 컴포넌트 규칙

- Card: 흰색 surface, subtle border 1pt, radius 22pt, 기본 shadow 없음
- Input/selection: 흰색 surface, default border 1pt, radius 16pt, 기본 shadow 없음
- Selected: brand-subtle 배경 + brand border 1.5pt
- Primary: `#F26B7A` 배경 + 흰색 텍스트, 핵심 CTA일 때 full width
- Secondary: 현재 방식 유지 — `#FFEEF0` 배경 + `#C24B57` 텍스트
- Text action: transparent + secondary text
- Destructive: transparent + `#FF4F6D` 텍스트
- Modal/sheet: 흰색 surface, radius 24pt, 공통 scrim·header. 드래그 handle은 bottom sheet에만 표시하고 중앙 dialog에는 표시하지 않는다.
- Shadow는 실제로 떠 있는 modal, popover, dropdown, raised 요소에만 사용한다.

모바일 상태는 `default / pressed / selected / disabled`로 통일한다. Hover는 사용하지 않는다. Pressed opacity는 0.88이며, 모든 터치 영역은 최소 44×44pt다.

짧은 화면의 Primary CTA는 fixed footer, 긴 스크롤 폼의 CTA는 콘텐츠 마지막에 둔다. 두 경우 모두 위 요소와의 CTA 간격은 16pt로 통일한다. CTA 하단 디자인 여백과 Safe Area는 분리한다.

## Icons, progress, motion

- Figma Icons가 canonical catalog다.
- Figma에 없는 아이콘은 Lucide에서 가져와 24pt·18pt Figma 컴포넌트로 저장한다.
- 앱은 최종적으로 SVG 자산만 사용한다.
- Course Input은 5개 Progress Dots와 `step / 5`를 사용한다.
- 활성 Progress Dot은 반드시 `#F26B7A`다.
- Press 120ms, content 200ms, stage 360ms, progress 400ms
- Reduce Motion 설정에서는 비필수 애니메이션을 제거하거나 최소화한다.

현재 `ProgressDots`의 `current-only` 상태는 활성 dot의 너비만 바꾸고 색상을 바꾸지 않는 결함이 있다. migration에서 `brandPrimary`를 명시적으로 연결한다.

## 예외

예외는 토큰 또는 화면 역할로 이름을 붙여야 한다.

- Home gradient canvas
- Bucketlist full-white canvas
- Card Detail full-white canvas
- Quick Planning Loading의 composition top 72pt
- Quick Planning Loading의 composition bottom 32pt
- Login/onboarding의 기존 24pt body inset은 migration 시 별도 검토

새 예외는 상세 결정 기록에 이유와 적용 범위를 추가한 뒤 사용한다.
