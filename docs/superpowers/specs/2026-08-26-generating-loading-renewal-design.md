# Quick Planning Loading 화면 리뉴얼 기준서

작성일: 2026-08-26  
대상: Expo React Native `app/mode-flow/generating.tsx` + `GeneratingView`  
참조: Figma `Date-navi-Design-System`

## 1. 작업 원칙

- 기존 코스 생성 요청과 퍼센트 진행 메커니즘은 유지한다.
- 화면은 Figma의 새 Quick Planning Loading 시각 언어로 교체한다.
- 4개의 화면을 별도 라우트로 만들지 않고 `progressPercent`에서 현재 단계를 파생하는 하나의 상태 기반 컴포넌트로 렌더링한다.
- Figma의 마지막 상태는 실제 진행률 `100%`로 구현한다.
- Loading 화면 내부의 뒤로가기 버튼은 제거한다.
- 네트워크 완료 전 진행률은 기존처럼 90%에서 대기하고, 응답 완료 후 100%까지 마무리한다.
- 기존 에러·재시도·AbortController·stale response 방지 흐름은 변경하지 않는다.

## 2. 기존 동작 불변식

현재 `app/mode-flow/generating.tsx`의 코스 진행:

- `displayedProgress = 0`에서 시작한다.
- 80ms interval마다 1%씩 증가한다.
- 실제 추천 응답이 오기 전 목표값은 90%다.
- 응답이 완료되면 목표값을 100%로 바꾸고 80ms마다 4%씩 증가시킨다.
- `AbortController`와 effect cleanup으로 요청·타이머를 정리한다.
- 기존 진행률 타이머(0→90→100)는 유지한다.
- 시각 단계는 Figma 기준 상태값에 맞춰 0~24%는 1단계, 25~52%는 2단계, 53~76%는 3단계, 77~100%는 4단계로 매핑한다. 따라서 레퍼런스의 24/52/76/100% 화면이 각각 정확한 캐릭터 상태로 보인다.
- progress bar는 기존처럼 0%부터 연속적으로 한 줄로 채워진다.

## 3. Figma 기준

참조 노드:

- 한국어 section: `520:2733`
- 영어 section: `498:1968`
- 한국어 frame: `520:2448`, `520:2494`, `520:2540`, `520:2586`
- 영어 frame: `498:1973`, `498:2040`, `498:2107`, `498:2174`

### 화면 캔버스

- 기준 크기: 390 × 844
- 화면 좌우 기본 여백: 20px
- 배경: `#FFF9FC`
- Loading 내부 back button: 사용하지 않음

### 폰트

Figma 지정 폰트는 `Inter`다. 현재 RN 코드에는 별도 `fontFamily` 또는 Inter font asset loading이 없으므로, 정확한 적용 전 실제 폰트 공급 방식을 확인한다. 폰트 로딩을 추가하지 않는 경우에는 플랫폼 기본 sans fallback을 사용하되, 스타일 수치와 weight는 아래 값으로 고정한다.

- 제목: Inter Bold, 22px / 30px, `#3A2E2E`, 중앙 정렬
- 서브카피: Inter Medium, 13px / 20px, `#8A7F76`, 중앙 정렬
- 말풍선: Inter Medium, 14px / 22px, `#C24B57`, 중앙 정렬
- 단계 라벨: Inter Medium, 11px / 16px
- 조건 카드 제목: Inter Bold, 15px / 20px, `#3A2E2E`
- 조건 값: Inter Medium, 12px / 18px, `#8A7F76`
- 하단 상태: Inter Medium, 13px / 20px, `#F26B7A`
- 퍼센트: Inter Semi Bold, 16px / 24px, `#F26B7A`

### 고정 레이아웃

- 제목: x20, y72, width350, height60
- 서브카피: y138, height20. 한국어는 디자인상 폭115, 영어는 폭350이나 구현은 width 350 중앙 정렬로 처리한다.
- 캐릭터 영역: 대략 y165~320. 캐릭터마다 원본 비율과 slot 크기가 다르므로 이미지 컨테이너에서 `contain`으로 렌더링한다.
- 말풍선: y328, height64, radius16, 1px border
- 4-step progress: x20, y416, width350, height76
- 조건 카드: x20, y516, width350, height104
- 상태/퍼센트 row: x20, y644~666
- progress track: x20, y676, width350, height8, radius999

### 상태별 캐릭터 slot

| 단계 | 퍼센트 기준 화면 | Figma asset node | slot 위치/크기 | 의미 |
|---|---:|---|---|---|
| 취향 분석 | 24% reference | `520:2451` | x117, y190, 155×130 | 돋보기로 취향 분석 |
| 장소 탐색 | 52% reference | `520:2497` | x99, y188, 192×132 | 책을 보며 장소 탐색 |
| 동선 정리 | 76% reference | `520:2543` | x107, y188, 176×132 | 보드로 코스 구성 |
| 코스 완성 | 100% reference | `520:2589` | x113, y165, 171×155 | 양팔을 들고 완성 |

에셋은 Figma visible image fill에서 추출한 투명 PNG를 사용한다. 기존 `mascot-heart-single.png`는 새 4개 상태 에셋과 다르므로 재사용하지 않는다.

### 상태별 카피

한국어:

| 단계 | 단계 라벨 | 말풍선 | 하단 상태 |
|---|---|---|---|
| 1 | 취향 분석 | 취향과 분위기를\n분석하고 있어요 | 취향과 분위기 분석 중 |
| 2 | 장소 탐색 | 조건에 맞는 장소들을\n찾고 있어요 | 장소 후보 탐색 중 |
| 3 | 동선 정리 | 이동 동선을\n정리 중이에요 | 동선 정리 중 |
| 4 | 코스 완성 | 코스를\n마무리하고 있어요 | 코스 완성 중 |

영어:

| 단계 | 단계 라벨 | 말풍선 | 하단 상태 |
|---|---|---|---|
| 1 | Preferences | Analyzing\nyour preferences | Analyzing preferences |
| 2 | Places | Finding places\nfor you | Finding place options |
| 3 | Route | Planning the\nroute | Planning your route |
| 4 | Finish | Finalizing your\nplan | Finalizing your plan |

공통 제목:

- 한국어: `둘에게 맞는\n코스를 찾고 있어요`
- 영어: `Finding a date plan\nfor you both`
- 한국어 서브카피: `조금만 기다려주세요!`
- 영어 서브카피: `Just a moment, please!`

### Stepper

- 원형: 44×44
- 아이콘: 18×18
- 라벨: 원 아래 y50, 11px / 16px
- 연결선: stroke 2px, 각 48.667px
- 활성 원 fill: `#FFEDEF`
- 활성 원 border/연결선: `#F26B7A`
- 활성 라벨: `#C24B57`
- 비활성 원: white fill, `#F2E7DC` 계열 border
- 비활성 연결선: `#F2E7DC`
- 비활성 라벨: `#8A7F76`
- 아이콘은 Search / MapPin / Heart와 Figma `Icon / 동선 정리`(`151:465`)의 Route 18px 선형 아이콘을 사용한다. Route는 현재 lucide 버전과 path 비율이 다르므로 Figma의 18px SVG path를 그대로 사용한다.
- 현재 단계 이전의 연결선만 활성 색상으로 표시한다.

### 조건 카드

- 위치: x20, y516, 350×104
- 배경: `#FFFFFF`
- border: 1px `#F2E7DC`
- radius: 22px
- shadow: color `#785046` at 10%, offset y4, radius7
- 내부 padding: 16px
- 제목: `지금까지의 조건` / `Current conditions`
- 1행: map pin + location, calendar + meeting time
- 2행: heart + selected mood summary
- demo 문자열을 하드코딩하지 않고 prepared recommendation request에서 가져온 값을 표시한다.

### Progress bar

- track: `#FFEDEF`, 350×8, radius999
- fill: `#F26B7A`, height8, radius999
- 퍼센트 텍스트는 실제 `progressPercent` 값을 표시한다.
- 0%에서 현재 값까지 연속 animation한다.
- 마지막 응답 완료 시 100%까지 기존 완료 흐름을 따른다.

## 4. 모션 규칙

- 현재 캐릭터가 바뀌면 이전 캐릭터는 opacity 1→0, 새 캐릭터는 opacity 0→1로 cross-fade한다.
- 캐릭터 변경 animation: 250~300ms, `Easing.inOut(Easing.quad)` 권장.
- 새 캐릭터는 fade-in과 함께 scale 0.98→1 정도만 허용한다. 큰 이동·bounce는 사용하지 않는다.
- 이전 fade-out과 새 fade-in은 겹쳐야 하며, 캐릭터가 순간적으로 사라지는 공백을 만들지 않는다.
- 말풍선과 활성 stepper는 단계 변경 시 200~250ms opacity/색상 transition을 적용한다.
- progress bar는 기존 400ms easing을 유지하거나, 잦은 1% 업데이트가 끊겨 보이지 않도록 현재 값으로 부드럽게 따라간다.
- `AccessibilityInfo.isReduceMotionEnabled()`가 true면 모든 cross-fade/scale loop를 즉시 상태 전환으로 바꾼다.
- Figma에는 별도 motion spec이 없으므로 위 값은 구현 기준이며, 시각 QA에서 조정한다.

## 5. 접근성 기준

- mascot은 장식 이미지로 `accessible={false}` 처리한다.
- stepper와 progress bar는 하나의 progressbar semantics로 묶는다.
- accessibility value에는 현재 단계와 실제 퍼센트를 포함한다.
- 상태 문구는 단계가 바뀔 때 `polite` live announcement로 한 번만 읽힌다.
- 시각적 말풍선과 상태 문구가 중복 낭독되지 않도록 하나만 accessibility source로 사용한다.
- 색상 외에도 현재 단계명·상태 문구·퍼센트로 진행 상태를 전달한다.
- VoiceOver/TalkBack에서 화면 진입 시 현재 단계와 퍼센트를 확인한다.

## 6. 검증 기준

- `npm run validate` 통과
- GeneratingView 단위 테스트: 0%, 임의 progress, 100%, 단계/상태/퍼센트 렌더링
- progress track/fill testID 유지
- 단계 전환 시 캐릭터가 해당 단계 에셋으로 바뀌고 cross-fade가 동작
- reduce motion 활성화 시 opacity/scale animation 없이 최종 상태 렌더
- 한국어/영어에서 제목·말풍선·단계 라벨이 잘리지 않음
- 390×844 기준 Figma 스크린샷과 직접 비교
