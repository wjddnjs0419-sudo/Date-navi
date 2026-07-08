# 코스 모드 화면 재설계 — 결과 화면(세로 화살표) + 입력 화면 스타일 통일 — 설계

> 작성일: 2026-07-08
> 대상 화면: `app/mode-flow/course-result.tsx`, `app/mode-flow/course.tsx` (`make_course` 모드 전용)
> 배경: `PLAN_GENERATION_ARCHITECTURE_V2.md` §16에 "코스 결과 UI 재설계 — Future / 별도 세션"으로 남아있던
> 항목(결과 화면). 브레인스토밍 중 사용자가 입력 화면(`course.tsx`)의 이모지 예산/시간 카드가
> `feeling.tsx`와 스타일이 다르다는 점을 지적해 범위에 추가됨.

## 1. 배경 / 목적

현재 `CourseTrail` 컴포넌트(`app/mode-flow/course-result.tsx`)는 `react-native-svg`로 가로 S자
serpentine 곡선을 그려 코스 단계를 연결한다(`lib/course.ts`의 `computeTrailNodes`/`buildTrailPath`).
초기 설계(`docs/superpowers/specs/2026-06-29-course-result-trail-design.md`) 당시의 의도였지만:

- 라벨이 노드 주변에 절대좌표로 배치되어 텍스트가 길어지면 겹치거나 잘리는 문제가 있다.
- V2 §16(추천 로직 V2)에서 `steps[].candidate_id`가 실제 Kakao 장소로 결합되며
  `place_name`/`place_address`/`map_url`이 이미 채워지고 있는데(`lib/recommendation.ts:154`),
  현재 화면은 이 정보를 전혀 노출하지 않는다.
- 브라우저 목업 브레인스토밍(2026-07-08)을 통해 세로 스크롤 + 화살표 방식으로 교체하고,
  장소 정보도 함께 노출하기로 결정했다.

## 2. 결정 사항 (확정)

- **레이아웃**: 가로 S자 SVG 트레일 → **세로 스택 카드 + 화살표**. 단계마다 독립된 카드(그림자 있음),
  카드 사이에 작은 원 안 셰브론(⌄) 커넥터.
- **장소 정보 노출**: 단계에 `place_name`이 있으면 핀 아이콘 + 장소명 + 주소 + "지도" 링크를 카드 안에
  함께 표시(탭하면 지도 열기). 데이터는 이미 존재하므로 **데이터 배선 변경 없음, 표시 전용 UI 추가**.
- **아이콘**: 이모지 금지. `lucide-react-native` (`MapPin`, `ChevronDown`, `Clock`, `Wallet`, `Sparkles`)만 사용.
- **정렬**: 핀 아이콘은 별도 열로 정렬하지 않고, 단계 제목과 동일한 왼쪽 여백(카드 내부 기준
  번호 배지+gap 만큼 들여쓰기)에서 시작 — 아이콘이 제목 텍스트 바로 아래 자연스럽게 이어지는 형태.
- **폰트 위계**: 단계 제목(15px/700) > 장소명(13px/600) > 설명·주소·"지도"링크(11~12px).
  번호 배지 숫자는 `lineHeight`를 폰트 크기와 동일하게 줘 원 안에서 정중앙 정렬되도록 한다.
- **재사용**: 카드 자체는 기존 `SoftCard`와 동일한 시각 언어(흰 배경, radius 20, `C.border`,
  얕은 shadow)를 따르되, 매 단계 반복 렌더링을 고려해 신규 컴포넌트로 분리한다(§3-2 참조).
- **폴백**: `steps.length < 2`(모델이 steps를 안 준 경우)는 기존과 동일하게 새 카드 스타일의
  단순 리스트로 폴백 — 화살표 커넥터 없이 카드만 순서대로 쌓는다.

## 3. 아키텍처

### 3-1. 제거 대상

- `app/mode-flow/course-result.tsx`의 `CourseTrail` 컴포넌트 + 관련 스타일(`trail` StyleSheet) 전체 제거.
- `lib/course.ts`의 `computeTrailNodes`, `buildTrailPath`, `TrailNode`, `TrailOpts` 제거
  (SVG 트레일 전용, 다른 곳에서 참조 없음 — 확인됨).
- `__tests__/course.test.ts`에서 위 두 함수의 단위 테스트 제거.
- `course-result.tsx`의 `react-native-svg` (`Svg`, `Path`, `Circle`) import 제거
  (다른 화면에서 SVG를 쓰는지 별도 확인 불필요 — 이 파일 전용 import).

### 3-2. 신규 컴포넌트 — `CourseStepList` (`app/mode-flow/course-result.tsx` 내부)

기존 `CourseTrail`을 대체. 좌표 계산이 필요 없으므로(세로 flow) 순수 함수 분리 없이 컴포넌트로 직접 구현.

```ts
function CourseStepList({ steps }: { steps: CourseStep[] }) {
  // steps.length === 0: 아무것도 렌더하지 않음 (요약 텍스트는 상위에서 summary로 폴백)
  // steps.length === 1: 카드 1개만, 커넥터 없음
  // steps.length >= 2: 카드 사이에 StepConnector
}
```

각 단계 카드(`StepCard`):
- 상단 행: 번호 배지(24px 원, `C.pink` 2px 테두리, 흰 배경, 숫자 `C.pink` 11px/700 `lineHeight:11`) +
  gap 10 + 제목(`step.label`, 15px/700, `C.text`).
- 설명 행(`step.desc` 있을 때만): 12px `C.textSub`, 배지 폭만큼 들여쓰기(marginLeft ~34).
- 장소 행(`step.place_name` 있을 때만): `MapPin`(14px, `C.textSub`) + 장소명(13px/600 `C.text`,
  `numberOfLines={1}`, `ellipsizeMode`) + 우측 "지도" 링크(11px/600 `C.textSub`), 탭 시
  `Linking.openURL(step.map_url)` — 기존 `PlaceRow`의 탭 동작과 동일한 패턴이지만 폰트가 작으므로
  아래 3-3에서 `PlaceRow`에 `size` prop을 추가해 재사용한다.

커넥터(`StepConnector`): 세로선(1.5px, `C.borderLight`, 8px) + 원(22px, `C.pinkLight` 배경) 안
`ChevronDown`(12px, `C.pinkDeep`) + 세로선(1.5px, `C.borderLight`, 8px).

### 3-3. `components/ui.tsx` — `PlaceRow`에 `size` prop 추가

기존 `PlaceRow`는 `result.tsx`/`course-result.tsx`(구버전)에서 이름 15px/700, 주소 13px로 이미
쓰이고 있다. 이 크기를 그대로 스텝 카드에 쓰면 단계 제목(15px)보다 장소명이 더 두드러져 위계가
깨진다. 하위 호환을 위해 옵셔널 prop을 추가한다:

```ts
export function PlaceRow({
  name, address, url, style, size = 'default',
}: { name?: string; address?: string; url?: string; style?: StyleProp<ViewStyle>; size?: 'default' | 'compact' }) { ... }
```

- `default`(기존 동작, 미지정 시): 이름 15px/700, 주소 13px, 아이콘 16px — 기존 두 화면 무회귀.
- `compact`(신규, 스텝 카드 전용): 이름 13px/600, 주소 11px, 아이콘 14px, 링크 11px.

### 3-4. 데이터

변경 없음. `lib/course.ts`의 `CourseStep`(label/desc/place_name/place_address/map_url)과
`lib/recommendation.ts`의 candidate_id → place 결합 로직을 그대로 사용한다. `stepsOf(card)` /
`parseStepsFromSummary` 폴백 로직도 그대로 유지.

## 4. 단위 경계 / 테스트

- `lib/course.ts`: `parseStepsFromSummary`만 남는다. 기존 단위 테스트 유지, 트레일 좌표 테스트만 제거.
- `PlaceRow`의 `size` prop: 스냅샷/단위 테스트는 없는 프로젝트 관례상(현재도 UI 컴포넌트 단위
  테스트 없음) 추가하지 않는다. `npm run validate`(tsc)로 타입 정합성만 보증.
- `CourseStepList`/`StepCard`/`StepConnector`는 순수 프레젠테이션 컴포넌트로, 로직(저장/전송/재생성)은
  기존 `course-result.tsx` 핸들러를 그대로 재사용 — 변경 없음.

## 5. 에러 처리

- 기존과 동일: `steps.length === 0 && summary` → summary 텍스트 폴백(카드 스타일로 감싸되 커넥터 없음).
- `place_name` 없는 단계(순수 행동 단계): 장소 행 자체를 렌더하지 않음(현재 로직과 동일, `!!step.place_name` 가드).

## 6. 범위 밖 (YAGNI)

- 카드 탭 시 상세 화면 이동 등 신규 인터랙션 없음 — 정적 표시 + 지도 링크 탭만.
- 커넥터 애니메이션 없음(정적).
- `date_cards` DB 스키마 변경 없음(기존과 동일하게 표시 전용, steps는 저장 안 함).
- 다른 모드(`result.tsx`)의 `PlaceRow` 기본 사용처는 손대지 않음 — `size` prop은 옵셔널 확장만.

## 7. i18n (결과 화면)

신규 사용자 노출 문구 없음(기존 `location.map`, `modeFlow.courseResult.*` 키 재사용). ko/en 갱신 불필요.

## 8. 입력 화면(`course.tsx`) 스타일 통일

### 8-1. 현재 차이 원인

`course.tsx`만 `locales/{ko,en}.json`의 `course.budgetOptions`/`course.durationOptions`에
`emoji` 필드가 들어있어 이모지 카드로 렌더된다. `feeling.tsx`는:
- 예산: 커스텀 `triRow`/`triBtn`(균등폭 3버튼, 텍스트만, 선택 시 `C.pinkLight` 배경 + `C.pinkBorder` 테두리).
- 시간: 동일한 `OptionCardPicker`를 쓰되 `emoji` 필드를 아예 넘기지 않아 텍스트만 표시.

### 8-2. 결정 사항

- `course.tsx`의 예산 섹션을 `feeling.tsx`의 `triRow`/`triBtn` 스타일과 동일하게 맞춘다.
- `course.tsx`의 시간 섹션(`OptionCardPicker`)은 그대로 두되 이모지를 더 이상 넘기지 않는다.
- `locales/ko.json`·`locales/en.json`의 `course.budgetOptions`/`durationOptions`에서 `emoji`
  필드를 제거한다(`label`/`value`는 유지 — 표시 문구 자체 변경 없음, 필드 삭제이므로 ko/en 동시 반영).
- **옵션 목록(개수) 자체는 바꾸지 않는다** — `course.durationOptions`는 여전히 3개(2~3시간/반나절/
  하루종일), `feeling`의 4개(1시간 포함)와 달라도 그대로 둔다. 이번 범위는 시각 스타일 통일이며,
  옵션 구성 변경은 별도 논의 없이 진행하지 않는다(YAGNI).

### 8-3. 공용 컴포넌트 추출 — `TriOptionRow`

`triRow`/`triBtn` 스타일이 `feeling.tsx`(기존)와 `course.tsx`(신규)에서 두 번째로 쓰이게 되므로
중복을 피해 `components/ui.tsx`에 작은 프레젠테이션 컴포넌트로 추출한다:

```ts
export function TriOptionRow<T extends string>({
  options, value, onChange,
}: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) { ... }
```

- 스타일은 `feeling.tsx`의 기존 `triRow`/`triBtn`/`triBtnOn`/`triBtnText`/`triBtnTextOn`을
  그대로 옮긴다(시각적 변경 없음).
- `feeling.tsx`는 이 컴포넌트를 쓰도록 리팩터(순수 리팩터, 화면상 차이 없음).
- `course.tsx`는 기존 `optionRow`/`optionCard`/이모지 렌더링을 제거하고 `TriOptionRow`로 교체.

### 8-4. 범위 밖

- `course.tsx`의 시간 옵션 개수를 `feeling.tsx`와 맞추는 것(1시간 추가 등)은 하지 않는다.
- `pick_for_me`/`light` 등 이미 삭제된 모드의 흔적은 손대지 않는다(무관).

## 9. i18n (입력 화면)

`course.budgetOptions`/`durationOptions`의 `emoji` 필드 삭제는 ko/en 양쪽 `locales/*.json`에
동시 반영한다. `label` 텍스트 자체는 변경하지 않으므로 번역 검수는 불필요.

## 10. 검증

- `npm run validate` (`tsc --noEmit`) 통과.
- `__tests__/course.test.ts` 갱신 후 통과 (트레일 함수 테스트 제거, `parseStepsFromSummary` 유지).
- iOS 시뮬레이터 스크린샷으로 육안 확인:
  - 결과 화면: steps 0/1/2/3개, place_name 있음/없음 조합.
  - 입력 화면: `course.tsx` 예산/시간 섹션이 `feeling.tsx`와 시각적으로 동일한 스타일인지,
    `feeling.tsx`가 리팩터 후에도 기존과 동일하게 보이는지(무회귀).
