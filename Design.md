# Design.md — Date Navi 디자인 언어

> **단일 출처(Source of Truth):** 이 문서는 설명이고, 실제 값은 코드가 진짜다.
> 색은 [constants/colors.ts](constants/colors.ts), 간격·반경·타이포 스케일은 [constants/theme.ts](constants/theme.ts),
> 공용 UI 프리미티브는 [components/ui.tsx](components/ui.tsx)에 있다. 새 값이 필요하면 문서가 아니라 이 파일들을 먼저 고친다.

## Overview

Date Navi는 커플이 "오늘 뭐 하지?"를 함께 정하는 **React Native + Expo 모바일 앱**이다.
캔버스는 순백이 아니라 **아주 옅은 웜 핑크**(`bg` #FFF9FC)로, 화면 전체가 부드럽고 따뜻한 인상을 준다.
액센트는 단 하나 — **살몬 핑크**(`pink` #F26B7A)가 모든 주요 CTA·활성 상태·강조를 담당한다.
텍스트는 순검정을 피하고 **웜 브라운**(`text` #3A2E2E) 계열을 쓴다. 그림자마저 회색이 아니라 웜 브라운(`shadow` #785046)이라, 앱 전체가 하나의 따뜻한 색 온도로 묶인다.

폰트는 **시스템 기본 폰트**(별도 커스텀 폰트 없음), 아이콘은 **lucide-react-native**, 그라데이션은 **expo-linear-gradient**를 쓴다.

**핵심 특징**
- **단일 액센트 핑크:** `pink` #F26B7A가 primary 버튼·선택 상태·핵심 강조를 전담한다. 과하게 쓰지 않고 화면당 한두 번만 등장한다.
- **웜 뉴트럴 베이스:** 배경·텍스트·보더·그림자까지 전부 따뜻한 톤(핑크/크림/브라운)으로 통일. 차가운 회색은 보조(`coolGray`)로만 제한적으로 쓴다.
- **부드러운 형태 언어:** 직각이 거의 없다. 카드 22px, 버튼 18px, hero 24px — 모든 인터랙티브 요소가 둥글다.
- **톤 패밀리로 분류:** 상태용 태그·뱃지는 pink / mint / lavender / cream / gray 5개 톤 패밀리(각각 `bg`+`fg` 쌍, 옅은 파스텔 배경 + 진한 동색 텍스트)로 구분한다.
- **컬러 카테고리 핀 + 일러스트(2026-07-21 신규):** 코스 카테고리는 원색 채운 핀으로 식별한다 — 식사=`catMeal` #FD8956(주황)·카페=`catCafe` #6B9FDB(파랑)·산책=`catWalk` #5DBD5F(초록). 온보딩·홈·확정 등에는 클레이 파스텔 일러스트(`assets/illustrations/`)와 워드마크(`assets/brand/wordmark.png`)를 쓴다.
- **얕은 단일 그림자:** 카드에 웜 브라운 그림자 1단(opacity 0.1, radius 7)만. 레이어드 다단 그림자 없음.
- **목업이 진실:** `UI RENEW/` 목업 50화면이 디자인의 절대 진실이고 각 화면은 목업에 1:1 대응한다. (과거의 "이모지·원색 색깔 뱃지 전면 금지" 블랭킷 룰은 **폐기** — 목업이 쓰는 컬러 핀·일러스트·워드마크는 의도된 것. 일반 상태 뱃지는 여전히 톤 패밀리 파스텔, 문구 이모지는 목업이 요구할 때만.)

## Colors

전체 정의는 [constants/colors.ts](constants/colors.ts) 참조. 아래는 역할별 요약.

### 브랜드 & 액센트
| 토큰 | 값 | 용도 |
|---|---|---|
| `pink` | #F26B7A | 단일 브랜드 액센트. primary 버튼 배경, 선택/활성 상태 |
| `pinkDeep` | #C24B57 | 핑크 배경 위 텍스트/아이콘(secondary 버튼 전경, pink 톤 뱃지 전경) |
| `pinkLight` | #FFEEF0 | 옅은 핑크 채움. secondary 버튼 배경, pink 톤 뱃지 배경 |
| `pinkBorder` | #F2A8B0 | 핑크 계열 보더 |
| `pinkMid` | #FFD3D9 | 중간 핑크 |
| `danger` | #FF4F6D | 삭제·경고 등 위험 액션 |

### 서피스 & 배경
| 토큰 | 값 | 용도 |
|---|---|---|
| `bg` | #FFF9FC | 기본 페이지 바닥 (옅은 웜 핑크) |
| `bgSplash` | #FFF1F6 | 스플래시/진입 배경 |
| `bgGradient` | #FFF1F6 → #FFFFFF | 좌상단→우하단 대각선 그라데이션 |
| `white` / `cardBg` | #ffffff | 카드·시트 서피스 |
| `disabledBg` | #EFE7DF | 비활성 버튼 배경 |

### 텍스트 (웜 브라운 스케일)
| 토큰 | 값 | 용도 |
|---|---|---|
| `text` | #3A2E2E | 기본 본문·제목 (순검정 아님) |
| `textSub` | #8A7F76 | 보조 텍스트, text 버튼 전경 |
| `textMuted` | #A89B92 | 더 약한 보조 |
| `textLight` | #B8AEA6 | 비활성 텍스트 |
| `textFaint` | #C8BCB1 | 가장 옅은 힌트 |
| `ink` / `inkSoft` | #1A1A1A / #4A4A55 | 강한 대비가 필요한 특수 표기 |

### 보더 & 뉴트럴
`border` #F2E0DC · `borderLight` #F2E7DC — 웜 톤 1px 헤어라인. 카드·리스트 구분선.
`coolGray` #6B7280 · `coolGrayLight` #9CA3AF — 차가운 회색은 여기서만, 제한적으로.

### 톤 패밀리 (뱃지·태그·카테고리)
각 패밀리는 **옅은 배경(`*`) + 진한 동색 전경(`*Fg`)** 쌍으로 쓴다.
| 패밀리 | bg | fg | 대표 의미 |
|---|---|---|---|
| pink | `pinkLight` #FFEEF0 | `pinkDeep` #C24B57 | 로맨틱·재미·기본 |
| mint | `mint` #E3F2EA | `mintFg` #3E8C5F | 야외·안전(실패 확률 낮음) |
| lavender | `lavender` #F1ECFF | `lavenderFg` #6B5BB8 | 조용·사진 |
| cream | `cream` #FFF3E0 | `creamFg` #A77738 | 저예산·피곤 |
| gray | `gray` #F2EBE3 | `grayFg` #6B5247 | 실내·가까운 이동 |

태그 문자열 → 아이콘·색 매핑 규칙은 [lib/tagStyle.ts](lib/tagStyle.ts)에 있다.

### 카테고리 핀 색 (코스 스텝, 2026-07-21 신규)
목업의 코스 카테고리 식별용 **원색 채운 핀**. 톤 패밀리(파스텔)와 달리 채도 높은 단색.
| 토큰 | 값 | 카테고리 |
|---|---|---|
| `catMeal` | #FD8956 | 식사(주황) |
| `catCafe` | #6B9FDB | 카페(파랑) |
| `catWalk` | #5DBD5F | 산책(초록) |

핀·아이콘 렌더는 [components/course-map.tsx](components/course-map.tsx)의 `CoursePin`/`StepPin`/`CourseMapPreview`가 담당한다.

## Typography

**폰트 패밀리:** 시스템 기본 폰트(별도 지정 없음). iOS는 San Francisco, Android는 Roboto가 그대로 렌더된다.

**공용 프리셋** ([constants/theme.ts](constants/theme.ts)의 `T`)
- `T.h1` — 22px / 700 / lineHeight 29 / `text` — 화면 제목
- `T.sub` — 13px / `textSub` / lineHeight 20 — 부제·설명

**실제 사용 스케일** (코드 빈도 기준)
- 크기: 13·12·14·11px가 본문·메타 주력. 22px가 제목, 15px가 버튼 라벨, 10px가 뱃지.
- 굵기: 700(제목·강조) > 600(버튼·라벨) > 500(부제) > 800(특대 강조). 400은 거의 안 쓴다 — 이 앱은 굵기로 위계를 만든다.

## Layout

### 간격 스케일 (`SP`, 4px 기반)
`xs` 4 · `sm` 8 · `md` 12 · `base(lg)` 16 · `xl` 20 · `xxl` 24 · `xxxl` 32.
새 스타일은 이 스케일 값을 우선 사용한다.

### 모서리 반경 (`R`)
`badge` 6 · `sm` 10 · `md` 14 · `lg` 16 · `btn` 18 · `xl` 20 · `card` 22 · `hero` 24.
기존 화면에서 실제 쓰이는 값만 담겨 있다. 뱃지=6, 버튼=18, 카드=22가 주력.

### 전역 레이아웃 프리셋 (`G`)
`G.screen`(flex:1 + `bg`) · `G.center`(중앙 정렬) · `G.row`(가로 정렬).

## Elevation

그림자는 사실상 **1단 + 플랫**이다. 핵심은 그림자 색이 회색이 아니라 **웜 브라운**(`shadow` #785046)이라는 점.

- **플랫:** 대부분의 서피스는 그림자 없음, 옅은 웜 보더로만 구분.
- **카드 1단** (`SoftCard`): `shadowColor` #785046, offset (0, 4), opacity 0.1, radius 7, elevation 3. 앱의 기본 카드 떠 있음.
- 모달·시트 등 특수 표면에서만 조금 더 강한 그림자(opacity 0.12~0.3)를 예외적으로 쓴다.

## Components

공용 프리미티브는 전부 [components/ui.tsx](components/ui.tsx)에 있다. 신규 화면은 이 컴포넌트를 재사용한다.

### 버튼 — `BigButton`
반경 18, 세로 패딩 16, 폭 100%, 라벨 15px/600. `activeOpacity` 0.85.
| variant | 배경 | 전경 |
|---|---|---|
| primary | `pink` | `white` |
| secondary | `pinkLight` | `pinkDeep` |
| text | transparent | `textSub` |
| disabled | `disabledBg` | `textLight` |

### 카드 — `SoftCard`
흰 서피스, 반경 22, 패딩 16, 1px `borderLight`, 웜 브라운 그림자 1단.
`onPress` 없으면 순수 View(상위 스와이프 탭 방해 방지), 있으면 TouchableOpacity.

### `SwipeableCard`
왼쪽으로 밀면 수정(연필)·삭제(X) 액션 노출. 가로 드래그가 세로보다 우세하고 10px 넘을 때만 스와이프로 인식.

### `Badge`
반경 6, 패딩 6×2, 라벨 10px/600, letterSpacing 0.2. 톤: gray / pink / mint / lavender (각 톤 패밀리의 bg+fg).

### 그 외 프리미티브
`Chip` · `OptionCardPicker` · `BackBar` · `ProgressDots` · `ListGroup`/`ListRow`(설정형 리스트) · `SectionLabel` · `LocationField`/`PlaceRow`(위치·장소) · `InfoNote` · `GeneratingView`(AI 생성 로딩) · `FieldBox` · `MoreMenu` · `SuccessModal` · `CourseStepList`.

### 2026-07-21 신규 프리미티브 (UI 전면 교체 Phase 0)
목업 대응용 공용 컴포넌트. 신규 화면은 재구현 말고 이걸 쓴다.
- `Illustration`([components/illustration.tsx](components/illustration.tsx)) — `assets/illustrations/` 8장을 이름으로 렌더(intrinsic aspectRatio + 명시 height 옵션).
- `Wordmark`([components/brand.tsx](components/brand.tsx)) — "Date·navi" 로고(투명 PNG, `size` sm=24/lg=44).
- `CoursePin`/`StepPin`/`CourseMapPreview`([components/course-map.tsx](components/course-map.tsx)) — 컬러 카테고리 핀 + 3스텝 점선 트레일 미리보기.
- `DdayBadge`·`MetaChipRow`·`PlanListRow`([components/ui.tsx](components/ui.tsx)) — D-day 핑크 뱃지 / 아웃라인 메타칩 행 / 다가오는 데이트 리스트 행.

## 규칙 (신규 UI)

- **목업 1:1 대조.** 화면 만들 때 `UI RENEW/`의 대응 목업 PNG를 먼저 열어 레이아웃·색·요소를 맞춘다. 목업이 진실.
- **하드코딩 금지.** 색은 `C.*`, 간격은 `SP.*`, 반경은 `R.*`를 쓴다. 매직 숫자·헥스 문자열 금지.
- **기존 컴포넌트 재사용.** 새로 만들기 전에 [components/ui.tsx](components/ui.tsx)·[components/course-map.tsx](components/course-map.tsx)·[components/illustration.tsx](components/illustration.tsx)·[components/brand.tsx](components/brand.tsx)에 같은 역할이 있는지 먼저 본다.
- **컬러 핀·일러스트 허용, 상태 뱃지는 톤 패밀리.** 코스 카테고리는 컬러 핀, 상태 표시는 파스텔 톤 패밀리. 문구 이모지는 목업이 요구할 때만.
- **i18n 동기화.** 화면 문구는 소유 네임스페이스의 `locales/ko/<ns>.json`·`locales/en/<ns>.json` 조각을 같은 작업에서 함께 갱신한다(2026-07-21 조각 분할 후).

---

> 과거 이 파일에는 Airbnb 웹 마켓플레이스 레퍼런스 문서가 들어 있었으나, 실제 앱(웜 핑크 모바일 커플앱)과 무관하여 실제 코드 토큰 기준으로 재작성했다. (2026-07-21)
