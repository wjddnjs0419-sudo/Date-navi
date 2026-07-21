# STYLESEED.md — Date Navi 디자인 lock

> StyleSeed 게이트(`/ss-score`·`/ss-review`·`/ss-verify`)가 이 lock 기준으로 채점한다.
> 실제 값의 단일 출처는 코드다: 색 [constants/colors.ts](constants/colors.ts), 스케일 [constants/theme.ts](constants/theme.ts), 프리미티브 [components/ui.tsx](components/ui.tsx). 설명 문서는 [Design.md](Design.md).

## Lock

- **Preset:** warm-dtc (따뜻한 커플앱, 파스텔 핑크)
- **Palette mode:** single-accent `+categorical`
  - 액센트: `pink` #F26B7A 단일. primary·선택·강조 전담.
  - `+categorical`: 코스 카테고리 핀 색은 의도된 카테고리 매핑이다 — `catMeal` #FD8956(식사/주황)·`catCafe` #6B9FDB(카페/파랑)·`catWalk` #5DBD5F(산책/초록). 일관 매핑, 3~4개 상한. 게이트는 이 핀 색을 위반으로 보지 않는다.
  - 상태 뱃지/태그: 톤 패밀리 파스텔(pink/mint/lavender/cream/gray, 옅은 bg + 진한 동색 fg).
- **Radius personality:** soft — badge 6 · btn 18 · card 22 · hero 24 (`R.*`).
- **Elevation:** layered-shadow (웜 브라운 `shadow` #785046). 기본 카드 1단(opacity ~0.1). **shadow opacity 캡 0.2** — 클레이 질감 핀·시트는 0.15~0.18 허용(이 lock이 명시적으로 상향).
- **Density:** comfortable.
- **Surface:** product (모바일 앱).
- **Palette base:** 웜 뉴트럴 — bg `bg` #FFF9FC, text `text` #3A2E2E(순검정 금지), 보더 웜 톤. 차가운 회색은 `coolGray`로만 제한적.
- **Type:** 시스템 폰트(iOS SF / Android Roboto). 위계는 굵기(700>600>500)로. 커스텀 폰트 없음, 브랜드 워드마크는 이미지 asset(`assets/brand/wordmark.png`).
- **Icons:** lucide-react-native 단일 패밀리.
- **Illustration:** 클레이 파스텔 일러스트 세트(`assets/illustrations/`) 허용 — 브랜드 요소이지 stock 플레이스홀더가 아니다.

## 참고
- 목업(`UI RENEW/`)이 화면 디자인의 절대 진실. 화면은 목업에 1:1 대응한다.
- 설계 전문: `docs/superpowers/specs/2026-07-21-ui-renew-parallel-design.md`.
