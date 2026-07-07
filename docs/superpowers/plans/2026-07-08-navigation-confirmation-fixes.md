# 홈/확정/전송 플로우 UX 버그 수정 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 홈 화면의 가짜 파트너 반응 카드를 실데이터로 교체하고, 데이트 확정/계획 수정 저장/마음전하기 보내기/후보 카드 보내기 완료 후 확인 모달이 뜨고 홈으로 돌아가도록 통일한다.

**Architecture:** 재사용 가능한 순수 로직(`lib/partnerReaction.ts`, `lib/time.ts`)을 단위 테스트로 검증하고, `components/ui.tsx`에 공용 `SuccessModal`을 추가한 뒤 4개 화면(`app/(tabs)/index.tsx`, `app/card/confirm.tsx`, `app/soft-message/result.tsx`, `app/share/send.tsx`)에 배선한다. 화면(.tsx) 자체는 이 코드베이스 컨벤션상 단위 테스트 대상이 아니므로 시뮬레이터 수동 검증으로 마무리한다.

**Tech Stack:** React Native + Expo (expo-router), Supabase, i18next(react-i18next), Jest(jest-expo preset)

**스타일 규칙(전체 태스크 공통):** 이 계획의 모든 JSX 변경은 인라인 `style={{ ... }}` 객체를 새로 만들지 않는다. 새 스타일은 반드시 해당 파일에 이미 있는 `StyleSheet.create({...})` 블록(`s`, `styles`, 또는 신설하는 `successS` 등)에 추가한다. 기존에 있던, 이 작업과 무관한 인라인 스타일은 건드리지 않는다 — 전체 앱 스타일 리팩터는 이 작업 범위 밖이다.

참고 설계 문서: `docs/superpowers/specs/2026-07-08-navigation-confirmation-fixes-design.md`

---

### Task 1: `lib/time.ts` — 상대 시간 포맷 순수 함수 추출

**Files:**
- Create: `lib/time.ts`
- Test: `__tests__/time.test.ts`
- (다음 태스크에서 수정할 기존 파일) `app/account/notifications.tsx:62-72,186`

- [ ] **Step 1: 실패하는 테스트 작성**

`__tests__/time.test.ts`:
```ts
import { relativeTime } from '../lib/time';

const labels = { justNow: '방금', minutes: '분 전', hours: '시간 전', yesterday: '어제', days: '일 전' };
const NOW = new Date('2026-07-08T12:00:00Z').getTime();

describe('relativeTime', () => {
  it('1분 미만이면 "방금"', () => {
    expect(relativeTime(new Date(NOW - 30 * 1000).toISOString(), labels, NOW)).toBe('방금');
  });

  it('59분이면 "59분 전"', () => {
    expect(relativeTime(new Date(NOW - 59 * 60 * 1000).toISOString(), labels, NOW)).toBe('59분 전');
  });

  it('1시간이면 "1시간 전"', () => {
    expect(relativeTime(new Date(NOW - 60 * 60 * 1000).toISOString(), labels, NOW)).toBe('1시간 전');
  });

  it('23시간이면 "23시간 전"', () => {
    expect(relativeTime(new Date(NOW - 23 * 60 * 60 * 1000).toISOString(), labels, NOW)).toBe('23시간 전');
  });

  it('정확히 1일 지나면 "어제"', () => {
    expect(relativeTime(new Date(NOW - 24 * 60 * 60 * 1000).toISOString(), labels, NOW)).toBe('어제');
  });

  it('2일이면 "2일 전"', () => {
    expect(relativeTime(new Date(NOW - 48 * 60 * 60 * 1000).toISOString(), labels, NOW)).toBe('2일 전');
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `npx jest __tests__/time.test.ts`
Expected: FAIL — `Cannot find module '../lib/time'`

- [ ] **Step 3: 최소 구현 작성**

`lib/time.ts`:
```ts
export type RelativeTimeLabels = {
  justNow: string;
  minutes: string;
  hours: string;
  yesterday: string;
  days: string;
};

export function relativeTime(iso: string, labels: RelativeTimeLabels, now: number = Date.now()): string {
  const diffMs = now - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return labels.justNow;
  if (min < 60) return `${min}${labels.minutes}`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}${labels.hours}`;
  const day = Math.floor(hr / 24);
  if (day === 1) return labels.yesterday;
  return `${day}${labels.days}`;
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `npx jest __tests__/time.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/time.ts __tests__/time.test.ts
git commit -m "feat: extract relativeTime into lib/time.ts"
```

---

### Task 2: `app/account/notifications.tsx`가 `lib/time.ts`를 쓰도록 교체 (중복 제거)

**Files:**
- Modify: `app/account/notifications.tsx:1-14` (import 추가), `:62-72` (로컬 함수 제거), `:186` (호출부 변경)

- [ ] **Step 1: import 추가**

`app/account/notifications.tsx` 12번째 줄(`import { useI18n } from '../../lib/i18n';`) 바로 다음에 추가:
```ts
import { relativeTime } from '../../lib/time';
```

- [ ] **Step 2: 로컬 `relativeTime` 함수 제거**

`app/account/notifications.tsx:62-72`의 아래 블록을 통째로 삭제:
```ts
  function relativeTime(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return t.timeJustNow;
    if (min < 60) return `${min}${t.timeMinutes}`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}${t.timeHours}`;
    const day = Math.floor(hr / 24);
    if (day === 1) return t.timeYesterday;
    return `${day}${t.timeDays}`;
  }
```

- [ ] **Step 3: 호출부를 라벨 객체를 넘기는 형태로 변경**

`app/account/notifications.tsx:186`:
```ts
                          <Text style={s.itemTime}>{relativeTime(n.created_at)}</Text>
```
→
```ts
                          <Text style={s.itemTime}>{relativeTime(n.created_at, {
                            justNow: t.timeJustNow, minutes: t.timeMinutes, hours: t.timeHours,
                            yesterday: t.timeYesterday, days: t.timeDays,
                          })}</Text>
```

- [ ] **Step 4: 타입체크로 회귀 확인**

Run: `npm run typecheck`
Expected: 에러 없음 (해당 파일 관련 타입 에러 없어야 함)

- [ ] **Step 5: 커밋**

```bash
git add app/account/notifications.tsx
git commit -m "refactor: notifications screen uses shared lib/time relativeTime"
```

---

### Task 3: `lib/partnerReaction.ts` — 최신 반응 선택/포맷 순수 함수

**Files:**
- Create: `lib/partnerReaction.ts`
- Test: `__tests__/partnerReaction.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`__tests__/partnerReaction.test.ts`:
```ts
import { pickLatestReaction, formatReactionText, type ReactionRow } from '../lib/partnerReaction';

describe('pickLatestReaction', () => {
  it('빈 배열이면 null', () => {
    expect(pickLatestReaction([])).toBeNull();
  });

  it('가장 최근(created_at) row를 고른다', () => {
    const rows: ReactionRow[] = [
      { card_id: 'a', reaction_type: 'like', condition_tag: null, created_at: '2026-07-01T00:00:00Z' },
      { card_id: 'b', reaction_type: 'love', condition_tag: null, created_at: '2026-07-05T00:00:00Z' },
      { card_id: 'c', reaction_type: 'burden', condition_tag: null, created_at: '2026-07-03T00:00:00Z' },
    ];
    expect(pickLatestReaction(rows)?.card_id).toBe('b');
  });

  it('한 건이면 그대로 반환', () => {
    const row: ReactionRow = { card_id: 'solo', reaction_type: 'like', condition_tag: null, created_at: '2026-07-01T00:00:00Z' };
    expect(pickLatestReaction([row])).toEqual(row);
  });
});

describe('formatReactionText', () => {
  const labels = {
    condition: (tag: string) => ({
      change_place: '장소만 바꾸면', closer: '가까우면', indoor: '실내면', budget_adjust: '예산 조정되면',
    } as Record<string, string>)[tag],
    reaction: (type: string) => ({
      love: '완전 끌려', like: '좋아', burden: '부담돼', next_time: '다음에',
    } as Record<string, string>)[type],
  };

  it('condition_tag가 있으면 조건+반응 문구를 합친다 (기존 목업 문자열과 동일해야 함)', () => {
    const row: ReactionRow = { card_id: 'x', reaction_type: 'like', condition_tag: 'closer', created_at: '2026-07-01T00:00:00Z' };
    expect(formatReactionText(row, labels)).toBe('가까우면 좋아');
  });

  it('condition_tag가 없으면 반응 라벨만 반환', () => {
    const row: ReactionRow = { card_id: 'x', reaction_type: 'love', condition_tag: null, created_at: '2026-07-01T00:00:00Z' };
    expect(formatReactionText(row, labels)).toBe('완전 끌려');
  });

  it('다른 reaction_type도 정확히 매핑된다', () => {
    const row: ReactionRow = { card_id: 'x', reaction_type: 'burden', condition_tag: null, created_at: '2026-07-01T00:00:00Z' };
    expect(formatReactionText(row, labels)).toBe('부담돼');
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `npx jest __tests__/partnerReaction.test.ts`
Expected: FAIL — `Cannot find module '../lib/partnerReaction'`

- [ ] **Step 3: 최소 구현 작성**

`lib/partnerReaction.ts`:
```ts
export type ReactionRow = {
  card_id: string;
  reaction_type: string;
  condition_tag: string | null;
  created_at: string;
};

export function pickLatestReaction(rows: ReactionRow[]): ReactionRow | null {
  if (!rows.length) return null;
  return rows.reduce((latest, row) => (
    new Date(row.created_at).getTime() > new Date(latest.created_at).getTime() ? row : latest
  ));
}

export function formatReactionText(
  row: ReactionRow,
  labels: { condition: (tag: string) => string | undefined; reaction: (type: string) => string },
): string {
  const conditionLabel = row.condition_tag ? labels.condition(row.condition_tag) : undefined;
  const reactionLabel = labels.reaction(row.reaction_type);
  return conditionLabel ? `${conditionLabel} ${reactionLabel}` : reactionLabel;
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `npx jest __tests__/partnerReaction.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/partnerReaction.ts __tests__/partnerReaction.test.ts
git commit -m "feat: add pure helpers for latest partner reaction lookup/formatting"
```

---

### Task 4: `components/ui.tsx`에 공용 `SuccessModal` 추가

**Files:**
- Modify: `components/ui.tsx:1-12` (import에 `Modal` 추가), 파일 끝(현재 737번째 줄 `});` 뒤)에 신규 컴포넌트 추가

- [ ] **Step 1: `Modal` import 추가**

`components/ui.tsx:1-5`의 현재 내용:
```ts
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, PanResponder, Pressable, TextInput, Linking, Alert,
  AccessibilityInfo, Easing,
  type ViewStyle, type TextStyle, type StyleProp,
} from 'react-native';
```
→
```ts
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, PanResponder, Pressable, TextInput, Linking, Alert,
  AccessibilityInfo, Easing, Modal,
  type ViewStyle, type TextStyle, type StyleProp,
} from 'react-native';
```

- [ ] **Step 2: `SuccessModal` 컴포넌트를 파일 끝에 추가**

`components/ui.tsx` 파일 맨 끝(현재 737번째 줄 `});` 다음)에 추가:
```ts

// ─── SuccessModal ─────────────────────────────────────────────────────────────
const SUCCESS_MODAL_DURATION_MS = 1100;

export function SuccessModal({
  visible, message, onHide,
}: { visible: boolean; message: string; onHide: () => void }) {
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(onHide, SUCCESS_MODAL_DURATION_MS);
    return () => clearTimeout(timer);
  }, [visible, onHide]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onHide}>
      <View style={successS.backdrop}>
        <View style={successS.card}>
          <View style={successS.iconWrap}>
            <Check size={28} color={C.white} strokeWidth={3} />
          </View>
          <Text style={successS.message}>{message}</Text>
        </View>
      </View>
    </Modal>
  );
}
const successS = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(40,30,25,0.4)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24,
  },
  card: {
    width: '100%', maxWidth: 280, backgroundColor: C.white,
    borderRadius: 24, paddingVertical: 32, paddingHorizontal: 24,
    alignItems: 'center', gap: 14,
  },
  iconWrap: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: C.pink, alignItems: 'center', justifyContent: 'center',
  },
  message: { fontSize: 15, fontWeight: '700', color: C.text, textAlign: 'center' },
});
```

`useEffect`와 `Check`, `C`는 이미 파일 상단에서 import돼 있음 (line 6: `Check`, line 9: `C`, line 10: `useEffect`) — 추가 import 불필요.

- [ ] **Step 3: 타입체크**

Run: `npm run typecheck`
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add components/ui.tsx
git commit -m "feat: add shared SuccessModal component"
```

---

### Task 5: locale 키 추가/정리 (ko.json, en.json)

**Files:**
- Modify: `locales/ko.json:157-200` (home), `:993-1021` (confirm), `:717-817` (softMessage), `:1388-1446` (share.send)
- Modify: `locales/en.json` (동일 라인 구조, 영어 문구)

- [ ] **Step 1: 홈 섹션에서 목업 키 제거**

`locales/ko.json:197-198`, `locales/en.json` 동일 라인의 아래 두 줄을 삭제 (더 이상 어디서도 참조하지 않음 — Task 6에서 참조 코드도 제거):
```json
    "partnerQuoteMock": "가까우면 좋아",
    "partnerTimeMock": "5분 전",
```
삭제 후 `partnerReactionSuffix` 다음 줄이 바로 `"createCta": "..."`로 이어지도록 콤마 정리.

- [ ] **Step 2: `confirm` 섹션에 성공 모달 문구 추가**

`locales/ko.json:1019` (`"saving": "저장 중...",` 바로 다음, `"back"` 앞)에 추가:
```json
    "confirmedMessage": "데이트가 확정됐어요",
    "savedMessage": "변경사항이 저장됐어요",
```
`locales/en.json` 동일 위치에 추가:
```json
    "confirmedMessage": "Your date is confirmed",
    "savedMessage": "Your changes are saved",
```

- [ ] **Step 3: `softMessage` 섹션에 전송 성공 모달 문구 추가**

`locales/ko.json:815` (`"sentAlertMessage": "..."` 다음) 뒤에 추가:
```json
    "sentSuccessMessage": "마음을 전했어요",
```
`locales/en.json` 동일 위치:
```json
    "sentSuccessMessage": "Your message is on its way",
```

- [ ] **Step 4: `share.send` 섹션에 전송 성공 모달 문구 추가**

`locales/ko.json:1444` (`"editCta": "수정하기"` 다음, `send` 객체 닫히기 전)에 추가:
```json
      "sentMessage": "마음을 전했어요"
```
(직전 줄 `"editCta": "수정하기"`에 콤마 추가 필요). `locales/en.json` 동일 위치:
```json
      "sentMessage": "Your message is on its way"
```

- [ ] **Step 5: JSON 유효성 확인**

Run: `node -e "JSON.parse(require('fs').readFileSync('locales/ko.json','utf8')); JSON.parse(require('fs').readFileSync('locales/en.json','utf8')); console.log('valid')"`
Expected: `valid` 출력, 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add locales/ko.json locales/en.json
git commit -m "feat: add locale strings for success modal, remove unused mock strings"
```

---

### Task 6: `app/(tabs)/index.tsx` — 파트너 반응 카드 실데이터 연동

**Files:**
- Modify: `app/(tabs)/index.tsx:19-25` (타입), `:82-101` (조회 로직), `:354-375` (렌더)

- [ ] **Step 1: 타입 교체**

`app/(tabs)/index.tsx:20`:
```ts
type Partner = { display_name: string } | null;
```
→ 유지하되, 바로 아래에 추가:
```ts
type PartnerReaction = { cardId: string; cardTitle: string; text: string; timeAgo: string } | null;
```

- [ ] **Step 2: import 추가**

`app/(tabs)/index.tsx:16-17`:
```ts
import { SoftCard, Chip } from '../../components/ui';
import { useI18n } from '../../lib/i18n';
```
→
```ts
import { SoftCard, Chip } from '../../components/ui';
import { useI18n } from '../../lib/i18n';
import { pickLatestReaction, formatReactionText } from '../../lib/partnerReaction';
import { relativeTime } from '../../lib/time';
```

- [ ] **Step 3: state 추가**

`app/(tabs)/index.tsx:49` (`const [partner, setPartner] = useState<Partner>(null);` 다음)에 추가:
```ts
  const [partnerReaction, setPartnerReaction] = useState<PartnerReaction>(null);
```

- [ ] **Step 4: 조회 로직 추가**

`app/(tabs)/index.tsx:93-100`의 현재 내용(중요: `partnerId`는 이 `if (partnerId) { ... }` 블록 안에서만 유효한 지역 변수이므로, 새 코드는 반드시 이 블록 **안**, `setPartner(partnerProfile);` 바로 다음 줄에 넣어야 한다 — 블록 밖에 넣으면 `partnerId`를 참조할 수 없어 타입에러가 난다):
```ts
              if (partnerId) {
                const { data: partnerProfile } = await supabase
                  .from('date_planner_profiles')
                  .select('display_name')
                  .eq('user_id', partnerId)
                  .maybeSingle();
                setPartner(partnerProfile);
              }
```
→
```ts
              if (partnerId) {
                const { data: partnerProfile } = await supabase
                  .from('date_planner_profiles')
                  .select('display_name')
                  .eq('user_id', partnerId)
                  .maybeSingle();
                setPartner(partnerProfile);

                const { data: allCards } = await supabase
                  .from('date_cards')
                  .select('id, title')
                  .eq('couple_id', myProfile.couple_id);

                if (allCards?.length) {
                  const { data: rxRows } = await supabase
                    .from('reactions')
                    .select('card_id, reaction_type, condition_tag, created_at')
                    .eq('user_id', partnerId)
                    .in('card_id', allCards.map(c => c.id))
                    .order('created_at', { ascending: false })
                    .limit(1);

                  const latest = pickLatestReaction(rxRows ?? []);
                  const cardTitle = latest ? allCards.find(c => c.id === latest.card_id)?.title : undefined;
                  setPartnerReaction(latest && cardTitle ? {
                    cardId: latest.card_id,
                    cardTitle,
                    text: formatReactionText(latest, {
                      condition: (tag) => t(`card.conditionTags.${tag}.label`) || undefined,
                      reaction: (type) => t(`candidates.rxLabel.${type}`),
                    }),
                    timeAgo: relativeTime(latest.created_at, {
                      justNow: t('notifications.timeJustNow'),
                      minutes: t('notifications.timeMinutes'),
                      hours: t('notifications.timeHours'),
                      yesterday: t('notifications.timeYesterday'),
                      days: t('notifications.timeDays'),
                    }),
                  } : null);
                } else {
                  setPartnerReaction(null);
                }
              }
```

- [ ] **Step 5: 렌더 블록 교체**

`app/(tabs)/index.tsx:354-375`의 현재 내용:
```tsx
        {/* 파트너 반응 */}
        {partner && (
          <View style={s.partnerSection}>
            <Text style={s.sectionTitle}>{t('home.partnerReactionsTitle')}</Text>
            <SoftCard style={s.partnerCard} onPress={() => router.push('/share/mutual' as any)}>
              <View style={s.partnerRow}>
                <View style={s.partnerAvatar}>
                  <Text style={s.partnerAvatarText}>{partner.display_name.charAt(0)}</Text>
                </View>
                <View style={s.flex1}>
                  <Text style={s.partnerText}>
                    {t('home.partnerReactionPrefix', { name: partner.display_name })}
                    <Text style={s.partnerQuote}>"{t('home.partnerQuoteMock')}"</Text>
                    {t('home.partnerReactionSuffix')}
                  </Text>
                  <Text style={s.partnerTime}>{t('home.partnerTimeMock')}</Text>
                </View>
                <ChevronRight size={16} color={C.textFaint} />
              </View>
            </SoftCard>
          </View>
        )}
```
→
```tsx
        {/* 파트너 반응 */}
        {partner && partnerReaction && (
          <View style={s.partnerSection}>
            <Text style={s.sectionTitle}>{t('home.partnerReactionsTitle')}</Text>
            <SoftCard style={s.partnerCard} onPress={() => router.push(`/card/${partnerReaction.cardId}` as any)}>
              <View style={s.partnerRow}>
                <View style={s.partnerAvatar}>
                  <Text style={s.partnerAvatarText}>{partner.display_name.charAt(0)}</Text>
                </View>
                <View style={s.flex1}>
                  <Text style={s.partnerText}>
                    {t('home.partnerReactionPrefix', { name: partner.display_name })}
                    <Text style={s.partnerQuote}>"{partnerReaction.text}"</Text>
                    {t('home.partnerReactionSuffix')}
                  </Text>
                  <Text style={s.partnerTime}>{partnerReaction.timeAgo}</Text>
                </View>
                <ChevronRight size={16} color={C.textFaint} />
              </View>
            </SoftCard>
          </View>
        )}
```

기존 `s.partnerSection`, `s.partnerCard`, `s.partnerRow`, `s.partnerAvatar`, `s.partnerAvatarText`, `s.flex1`, `s.partnerText`, `s.partnerQuote`, `s.partnerTime` 스타일은 이미 `StyleSheet.create` 블록에 있으므로 그대로 재사용 — 새 인라인 스타일 추가하지 않는다.

- [ ] **Step 6: 타입체크**

Run: `npm run typecheck`
Expected: 에러 없음

- [ ] **Step 7: 커밋**

```bash
git add "app/(tabs)/index.tsx"
git commit -m "fix: home partner reaction card uses real reaction data instead of mock text"
```

---

### Task 7: `app/card/confirm.tsx` — 확정/수정 저장 후 성공 모달 + 홈 이동

**Files:**
- Modify: `app/card/confirm.tsx:12` (import), `:39-40` (state 추가), `:74-99` (`handleSave`), 읽기 모드 return 블록 최상단(`:149` 근처)에 `SuccessModal` 렌더 추가

- [ ] **Step 1: import에 `SuccessModal` 추가**

`app/card/confirm.tsx:12`:
```ts
import { BackBar, BigButton, Chip, SoftCard } from '../../components/ui';
```
→
```ts
import { BackBar, BigButton, Chip, SoftCard, SuccessModal } from '../../components/ui';
```

- [ ] **Step 2: state 추가**

`app/card/confirm.tsx:40` (`const [editing, setEditing] = useState(false);` 다음)에 추가:
```ts
  const [successVisible, setSuccessVisible] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
```

- [ ] **Step 3: `handleSave` 수정**

`app/card/confirm.tsx:74-99`의 현재 내용:
```ts
  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('date_cards')
        .update({
          status: 'confirmed',
          confirmed_date: date.trim() || null,
          confirmed_time: time.trim() || null,
          confirmed_place: place.trim() || null,
          confirmed_items: items.trim() || null,
        })
        .eq('id', id)
        .select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('update affected no rows');
      // 저장 후엔 읽기 상세로 전환해 정리된 일정을 보여준다.
      await load();
      setEditing(false);
    } catch {
      Alert.alert(c.errorTitle, c.saveError);
    } finally {
      setSaving(false);
    }
  }
```
→
```ts
  async function handleSave() {
    if (saving) return;
    setSaving(true);
    const wasConfirmed = isPlan;
    try {
      const { data, error } = await supabase
        .from('date_cards')
        .update({
          status: 'confirmed',
          confirmed_date: date.trim() || null,
          confirmed_time: time.trim() || null,
          confirmed_place: place.trim() || null,
          confirmed_items: items.trim() || null,
        })
        .eq('id', id)
        .select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('update affected no rows');
      // 저장 성공 시엔 이 화면에 머무르지 않고 확인 모달 후 홈으로 돌아간다.
      // editing을 먼저 false로 바꿔 읽기 모드 화면(SuccessModal이 그려질 return 블록)으로 전환한 뒤 모달을 띄운다.
      setEditing(false);
      setSuccessMessage(wasConfirmed ? c.savedMessage : c.confirmedMessage);
      setSuccessVisible(true);
    } catch {
      Alert.alert(c.errorTitle, c.saveError);
    } finally {
      setSaving(false);
    }
  }
```

- [ ] **Step 4: 읽기 모드 return 블록에 `SuccessModal` 렌더 추가**

읽기 모드 return 블록(`app/card/confirm.tsx:149` 근처, `<SafeAreaView style={styles.safe}>` 바로 다음)의 현재 내용:
```tsx
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView style={styles.flex1} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <BackBar />
```
→
```tsx
    return (
      <SafeAreaView style={styles.safe}>
        <SuccessModal
          visible={successVisible}
          message={successMessage}
          onHide={() => { setSuccessVisible(false); router.replace('/(tabs)/' as any); }}
        />
        <ScrollView style={styles.flex1} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <BackBar />
```

(Step 3에서 성공 시 `setEditing(false)`를 호출하므로, 저장 직후엔 항상 이 읽기 모드 블록이 렌더된다 — 편집 모드 return 블록에는 `SuccessModal`을 추가할 필요 없다.)

- [ ] **Step 5: 타입체크**

Run: `npm run typecheck`
Expected: 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add app/card/confirm.tsx
git commit -m "fix: date confirm and plan-edit save show success modal then return home"
```

---

### Task 8: `app/soft-message/result.tsx` — 보내기 후 성공 모달 + 홈 이동

**Files:**
- Modify: `app/soft-message/result.tsx:13` (import), `:25` (state), `:54-88` (`handleSend`), return 블록 최상단

- [ ] **Step 1: import에 `SuccessModal` 추가**

`app/soft-message/result.tsx:13`:
```ts
import { BackBar, BigButton, SoftCard, InfoNote, GeneratingView } from '../../components/ui';
```
→
```ts
import { BackBar, BigButton, SoftCard, InfoNote, GeneratingView, SuccessModal } from '../../components/ui';
```

- [ ] **Step 2: state 추가**

`app/soft-message/result.tsx:25` (`const [saving, setSaving] = useState(false);` 다음)에 추가:
```ts
  const [successVisible, setSuccessVisible] = useState(false);
```

- [ ] **Step 3: `handleSend`에서 `Alert.alert` 성공 다이얼로그를 모달로 교체**

`app/soft-message/result.tsx:82`의 현재 내용:
```ts
      Alert.alert(t('softMessage.sentAlertTitle'), t('softMessage.sentAlertMessage'));
```
→
```ts
      setSuccessVisible(true);
```

- [ ] **Step 4: `SuccessModal` 렌더 추가**

`app/soft-message/result.tsx:116-117`의 현재 내용:
```tsx
  return (
    <SafeAreaView style={G.screen}>
      <ScrollView
```
→
```tsx
  return (
    <SafeAreaView style={G.screen}>
      <SuccessModal
        visible={successVisible}
        message={t('softMessage.sentSuccessMessage')}
        onHide={() => { setSuccessVisible(false); router.replace('/(tabs)/' as any); }}
      />
      <ScrollView
```

- [ ] **Step 5: 타입체크**

Run: `npm run typecheck`
Expected: 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add app/soft-message/result.tsx
git commit -m "fix: soft message send shows success modal then returns home"
```

---

### Task 9: `app/share/send.tsx` — 보낸 사람을 반응 화면 대신 성공 모달+홈으로

**Files:**
- Modify: `app/share/send.tsx:13` (import), `:27` (state), `:58-87` (`handleSend`), return 블록 최상단

- [ ] **Step 1: import에 `SuccessModal` 추가**

`app/share/send.tsx:13`:
```ts
import { BackBar, BigButton, Chip } from '../../components/ui';
```
→
```ts
import { BackBar, BigButton, Chip, SuccessModal } from '../../components/ui';
```

- [ ] **Step 2: state 추가**

`app/share/send.tsx:27` (`const [sending, setSending] = useState(false);` 다음)에 추가:
```ts
  const [successVisible, setSuccessVisible] = useState(false);
```

- [ ] **Step 3: `handleSend`에서 `/share/reaction` 이동 제거하고 모달 표시로 교체**

`app/share/send.tsx:83`의 현재 내용:
```ts
      router.push({ pathname: '/share/reaction', params: cardId ? { cardId } : {} } as any);
```
→
```ts
      setSuccessVisible(true);
```

(이 화면은 카드를 **보낸** 사람이 보는 화면이다. `/share/reaction`은 `candidates.tsx`의 "상대가 보낸 제안" 배너를 통해 **받는** 사람이 진입하는 화면이라, 보낸 사람을 그리로 보내는 건 오작동이었다 — 그 진입 경로는 건드리지 않는다.)

- [ ] **Step 4: `SuccessModal` 렌더 추가**

`app/share/send.tsx:89-90`의 현재 내용:
```tsx
  return (
    <SafeAreaView style={G.screen}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
```
→
```tsx
  return (
    <SafeAreaView style={G.screen}>
      <SuccessModal
        visible={successVisible}
        message={t('share.send.sentMessage')}
        onHide={() => { setSuccessVisible(false); router.replace('/(tabs)/' as any); }}
      />
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
```

- [ ] **Step 5: 타입체크**

Run: `npm run typecheck`
Expected: 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add app/share/send.tsx
git commit -m "fix: sending a candidate card shows success modal then returns home instead of the recipient reaction screen"
```

---

### Task 10: 전체 검증

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 테스트 스위트 실행**

Run: `npm test`
Expected: 모든 테스트 PASS (기존 테스트 + Task 1/3에서 추가한 `time.test.ts`, `partnerReaction.test.ts` 포함), 실패 0건

- [ ] **Step 2: 전체 타입체크**

Run: `npm run typecheck`
Expected: 에러 0건

- [ ] **Step 3: 시뮬레이터 수동 검증 (사용자 진행)**

아래 5가지를 iOS 시뮬레이터에서 확인 (설계 문서의 "수동 검증 체크리스트"와 동일):
1. 파트너가 카드에 반응 남기기 → 홈 화면에 실제 카드 제목 기반 문구 표시, 탭하면 해당 카드로 이동. 반응 없는 커플 계정에서는 카드 자체가 안 보임.
2. 후보 카드 확정 → 체크 모달 뜨고 잠시 후 홈으로 이동.
3. 확정된 계획 "수정하기 → 저장하기" → 체크 모달(다른 문구) 뜨고 홈으로 이동. "취소하기"는 기존처럼 홈으로 이동(회귀 확인).
4. 마음전하기 "보내기" → 모달 뜨고 홈으로 이동.
5. 후보 카드 "마음 보내기"(share/send) → 모달 뜨고 홈으로 이동(반응 화면 안 뜸). candidates 목록의 "상대가 보낸 제안" 배너 탭 시엔 여전히 반응 화면으로 정상 진입(회귀 확인).

- [ ] **Step 4: 최종 커밋 (필요 시)**

수동 검증 중 발견된 사소한 수정이 있다면 각각 커밋. 없으면 이 단계는 생략.
