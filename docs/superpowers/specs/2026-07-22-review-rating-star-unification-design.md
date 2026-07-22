# 후기 화면 — 별점(1~5) 단일 입력으로 통일 — 설계

## 배경

[2026-07-22-review-rating-overhaul.md](../plans/2026-07-22-review-rating-overhaul.md) 계획은 목업(`09_review.png`)을 그대로 따라 "전체 별점"(1~5) 바와 감정 5종(amazing/good/okay/meh/bad) 그리드를 **둘 다** 필수 입력으로 병존시키는 것이었다. Task 1(rating 컬럼 마이그레이션)과 Task 2(감정 선택지 4→5 확장: love/good/ok/change → amazing/good/okay/meh/bad)까지 구현된 상태에서, 사용자가 두 입력이 사실상 같은 정보(둘 다 "얼마나 좋았는지")를 중복 요구한다는 점을 지적했다. 별점 하나로 통일하고, 감정은 선택한 별점에서 파생되는 시각적 피드백으로만 보여주기로 결정했다.

추가로, 설계 논의 중 기존 코드에서 실제 회귀를 하나 발견했다: `app/card/memory/new.tsx`(카드 없이 수동으로 추억을 추가하는 화면)가 `locales/*/review.json`의 `ratings` 배열을 `app/card/review.tsx`와 공유해서 쓰는데, 자신만의 `RATING_ICONS`/`RATING_TONES`를 예전 키(`love/good/ok/change`)로 하드코딩해뒀다. Task 2가 공유 배열의 키를 `amazing/good/okay/meh/bad`로 바꾸면서 이 화면은 아이콘/톤이 전부 `undefined`가 되어 깨진 상태다. 이번 설계에서 함께 고친다.

## 목표

- `app/card/review.tsx`: 감정 그리드를 제거하고 별점(1~5) 탭 바 하나만 필수 입력으로 남긴다. 별점을 선택하면 그 아래 파생된 감정 아이콘+라벨을 피드백으로 보여준다(탭 불가능).
- `app/card/memory/new.tsx`: 동일한 별점+파생 피드백 UI로 마이그레이션해 두 화면의 입력 경험을 통일하고, Task 2가 만든 회귀를 근본적으로 해결한다.
- 별점→아이콘/톤/라벨 매핑을 한 곳(공유 모듈)에 두어, 두 화면이 서로 다른 하드코딩된 맵을 유지하다 어긋나는 이번 회귀 같은 문제가 재발하지 않게 한다.
- `want_again` 파생 로직을 `rating >= 4`로 통일(기존 `mood==='amazing'||mood==='good'`, `rating==='love'||rating==='good'`와 동일한 의미 유지 — 5단계 중 상위 2단계).

## 비목표

- `app/(tabs)/memories.tsx`의 "베스트" 필터는 **수정하지 않는다** — 이미 `want_again` 컬럼만 읽으므로, 그 값이 mood 대신 rating에서 파생돼도 그대로 동작한다.
- `app/card/memory/edit/[id].tsx`, `app/card/memory/[id].tsx`(추억 수정/상세 화면)는 지금도 `want_again`만 다루고 rating을 표시/수정하지 않는다 — 원 계획의 스코프 밖 그대로 유지(후속 태스크로 남김).
- `date_memories.rating` 컬럼/CHECK 제약(Task 1 마이그레이션)은 변경 불필요 — 1~5 정수 범위 스키마가 이번 설계에도 그대로 맞는다.
- "AI 요약 도움" 카드는 원 계획대로 이번 스코프 제외.

## 아키텍처

### 공유 모듈: `lib/ratingFeedback.ts` (신규)

두 화면이 공유하는 별점→아이콘/톤/i18n키 매핑을 한 곳에 둔다:

```ts
import { Star, Smile, Meh, Frown, Angry } from 'lucide-react-native';
import { C } from '../constants/theme';

export type Rating = 1 | 2 | 3 | 4 | 5;

export const RATING_FEEDBACK_KEY: Record<Rating, 'bad' | 'meh' | 'okay' | 'good' | 'amazing'> = {
  1: 'bad', 2: 'meh', 3: 'okay', 4: 'good', 5: 'amazing',
};

export const RATING_FEEDBACK_ICON: Record<Rating, typeof Star> = {
  1: Angry, 2: Frown, 3: Meh, 4: Smile, 5: Star,
};

export const RATING_FEEDBACK_TONE: Record<Rating, { fg: string; bg: string }> = {
  1: { fg: C.grayFg, bg: C.gray },
  2: { fg: C.lavenderFg, bg: C.lavender },
  3: { fg: C.mintFg, bg: C.mint },
  4: { fg: C.creamFg, bg: C.cream },
  5: { fg: C.danger, bg: C.pinkLight },
};

export function deriveWantAgain(rating: Rating): boolean {
  return rating >= 4;
}
```

### `app/card/review.tsx`

- `MOOD_ICONS`/`MOOD_TONES`(review.tsx:16-31)와 `mood` state(review.tsx:43) 제거. `lib/ratingFeedback`에서 import.
- 새 state: `const [rating, setRating] = useState<Rating>(0 as Rating);` (0 = 미선택, 1~5).
- 렌더: 기존 `c.ratingLabel` + `ratingGrid`(review.tsx:161-181, 감정 5종 탭 그리드) 블록을 삭제하고, 별점 바 + 파생 피드백으로 교체:
  ```tsx
  <Text style={styles.sectionLabel}>{c.starRatingLabel}</Text>
  <View style={styles.starRow}>
    {[1, 2, 3, 4, 5].map((n) => (
      <TouchableOpacity
        key={n}
        testID={`review-star-${n}`}
        accessibilityRole="button"
        accessibilityLabel={`${n}점`}
        onPress={() => setRating(n as Rating)}
        style={styles.starBtn}
      >
        <Star size={28} strokeWidth={1.8} color={C.pinkDeep} fill={n <= rating ? C.pinkDeep : 'transparent'} />
      </TouchableOpacity>
    ))}
  </View>
  {rating > 0 && (() => {
    const key = RATING_FEEDBACK_KEY[rating as Rating];
    const Icon = RATING_FEEDBACK_ICON[rating as Rating];
    const tone = RATING_FEEDBACK_TONE[rating as Rating];
    return (
      <View style={[styles.feedbackCard, { backgroundColor: tone.bg, borderColor: tone.fg }]}>
        <Icon size={18} color={tone.fg} strokeWidth={2} />
        <Text style={[styles.feedbackLabel, { color: tone.fg }]}>{c.ratingFeedback[key]}</Text>
      </View>
    );
  })()}
  ```
- `handleSave`(review.tsx:113-138): 검증을 `if (!rating) { Alert.alert('', c.noStarRatingError); return; }` 하나로 통일(`noRatingError`/mood 검증 제거). `wantAgain = deriveWantAgain(rating as Rating)`. insert 필드에 `rating` 추가(Task 1 마이그레이션이 만든 컬럼).
- 스타일: `ratingGrid`/`ratingCard`/`ratingIconWrap`/`ratingLabel`(review.tsx:235-253) 제거, `starRow`/`starBtn`/`feedbackCard`/`feedbackLabel` 추가.

### `app/card/memory/new.tsx`

- 자신만의 `RATING_ICONS`/`RATING_TONES`(new.tsx:17-29)와 `rating: string | null` state(new.tsx:41) 제거. `lib/ratingFeedback`에서 동일하게 import, state를 `Rating`(number, 0=미선택)으로 교체.
- 렌더(new.tsx:189-209)의 감정 그리드를 review.tsx와 동일한 별점 바 + 파생 피드백 블록으로 교체.
- `handleSave`(new.tsx:111-136): `if (!rating)` 검증은 그대로 두되 에러 메시지는 `c.noStarRatingError`로, `wantAgain = deriveWantAgain(rating)`, insert에 `rating` 필드 추가.
- 두 화면 모두 `c = s.review` 네임스페이스를 공유하므로 로케일 변경 한 번으로 양쪽에 반영된다.

### 로케일 (`locales/ko/review.json`, `locales/en/review.json`)

- `ratings` 배열(탭 그리드용, review.json:6-12) 제거.
- `ratingLabel`(review.json:5, "전반적으로 어땠나요?")은 제거 — 별점 바 라벨은 원 계획의 `starRatingLabel`("전체 별점")로 대체.
- 추가:
  ```json
  "starRatingLabel": "전체 별점",
  "noStarRatingError": "별점을 선택해주세요.",
  "ratingFeedback": {
    "bad": "별로였어요",
    "meh": "아쉬웠어요",
    "okay": "무난했어요",
    "good": "좋았어요",
    "amazing": "최고였어요"
  }
  ```
- `noRatingError`(review.json:16, 감정 미선택 에러) 제거 — 별점 미선택 에러(`noStarRatingError`) 하나로 충분.
- en 버전도 동일 구조로 동기화(Overall rating / Please pick a star rating. / Not great·A bit disappointing·It was okay·Good·Amazing).

## 데이터 모델

변경 없음. `date_memories.rating`(Task 1, 1~5 정수 CHECK 제약)이 그대로 두 화면 모두의 저장 대상이 된다. `mood`/구 `rating` 문자열 값은 애초에 DB에 저장된 적이 없으므로(항상 `want_again` boolean으로만 변환) 마이그레이션이 추가로 필요 없다.

## 테스트

- `__tests__/card-review-icons.test.ts`: 감정 그리드 tap 검증(Task 2가 고친 버전 포함)은 더 이상 유효하지 않다 — 별점 선택 시 `lib/ratingFeedback`의 아이콘/톤이 파생 피드백으로 렌더되는지 검증하는 내용으로 다시 고쳐 쓴다.
- `__tests__/card-review-screen-contract.test.tsx`(원 계획 Task 3에서 신규 작성 예정): 별점 5개 렌더, 별점 미선택 시 에러, 별점 선택 시 `rating` 필드로 insert — 그대로 유효하되 "mood 선택" 관련 스텝은 제거.
- `app/card/memory/new.tsx` 마이그레이션에 대한 신규 테스트 추가: 별점 5개 렌더, 사진/별점 미선택 에러, 별점 선택 시 `rating`+`want_again` insert 반영.
- `lib/ratingFeedback.ts`에 대한 단위 테스트: `deriveWantAgain`이 1~3점에서 false, 4~5점에서 true를 반환하는지 확인.

## 스코프 밖

- `app/(tabs)/memories.tsx` "베스트" 필터 로직/UI 변경 없음(비목표 참조).
- 추억 수정/상세 화면(`edit/[id].tsx`, `[id].tsx`)에 rating 표시/수정 추가 — 별도 요청 시 후속 작업.
- "AI 요약 도움" 카드 — 원 계획대로 제외.
