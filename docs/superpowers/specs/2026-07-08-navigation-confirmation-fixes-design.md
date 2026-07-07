# 홈/확정/전송 플로우 UX 버그 수정 — 설계

## 배경

사용자가 iOS 시뮬레이터로 앱을 쓰다가 발견한 문제 4건 + 코드 재검토로 추가 발견한 1건.

1. 커플 연결 직후 홈 화면에 파트너의 "가까우면 좋아" 반응이 아무 조작 없이 자동으로 뜸.
2. 데이트 확정 버튼을 눌러도 홈으로 안 가고 "다가오는 데이트" 상세 화면이 그대로 뜸.
3. "계획 수정하기 → 저장하기"도 홈으로 안 가고 같은 상세 화면으로 되돌아감 (취소하기는 정상적으로 홈으로 감).
4. "마음전하기 → 보내기"도 확인 후 홈으로 안 가고 같은 화면에 머무름.
5. (재검토 중 발견) "후보 카드 보내기" 완료 후, 보낸 사람이 "상대가 보냈어요"라고 표시되는 반응 화면으로 잘못 이동함 — 원래 그 화면은 **받는 사람**이 보는 화면.

## 원인

- **1번**: `app/(tabs)/index.tsx`의 "파트너 반응" 카드가 `partnerQuoteMock`/`partnerTimeMock` locale 키(하드코딩 문자열)를 `partner` 존재 여부에만 의존해 무조건 렌더함. 실제 `reactions` 테이블 데이터를 전혀 조회하지 않음.
- **2, 3번**: `app/card/confirm.tsx`의 `handleSave()`가 저장 성공 후 `router` 호출이 전혀 없이 `setEditing(false)` 로컬 상태만 바꿔서 같은 화면을 읽기 모드로 재렌더함.
- **4번**: `app/soft-message/result.tsx`의 `handleSend()`가 네이티브 `Alert.alert`만 띄우고 이후 아무 네비게이션도 하지 않음.
- **5번**: `app/share/send.tsx`의 `handleSend()`가 전송 성공 후 `/share/reaction`으로 `router.push`함. 이 화면은 `candidates.tsx`의 "상대가 보낸 제안" 배너에서 진입하는, 받는 사람이 보낸 사람의 메시지에 반응하는 화면인데, 보낸 사람 본인이 자기 메시지에 반응하라고 뜨는 오작동.

## 범위 밖 (검토 후 정상 판정)

앱 전체 async 핸들러 24개 화면 재검토 결과, 아래는 의도된 동작이라 손대지 않음:
- `share/reaction.tsx → share/mutual.tsx`: 받는 사람이 반응 제출 후 결과 화면으로 가는 의도된 다음 단계.
- `mode-flow/result.tsx`, `mode-flow/course-result.tsx → share/send.tsx`: "보내기 시작" 진입, 문제 없음.
- `card/new.tsx`, `card/memory/new.tsx` 저장 후 candidates/memories 목록 이동, `mode-flow/bucketlist.tsx` 저장 후 candidates 이동: "방금 추가한 걸 목록에서 확인" 패턴, 정상.
- `card/edit/[id].tsx`, `card/memory/edit/[id].tsx`: 저장 후 `router.back()`, 정상.
- 계정 설정류(`change-password`, `edit-profile`, `delete-account`): 이미 `Alert 성공 + back()` 패턴 정상 동작.
- `card/[id].tsx`의 반응 토글, `card/memory/[id].tsx`의 댓글 추가: 화면 유지가 맞는 인라인 액션.
- `Mock` 접두사 locale 키는 `partnerQuoteMock`/`partnerTimeMock` 2개뿐, 다른 화면에 유사 하드코딩 없음.

## 설계

### A. `SuccessModal` 컴포넌트 (신규, `components/ui.tsx`)

```
SuccessModal({ visible: boolean, message: string, onHide: () => void })
```

- `react-native`의 `Modal` (`transparent`, `animationType="fade"`) 사용. `app/account/notifications.tsx`의 기존 모달 스타일(`rgba(40,30,25,0.4)` 배경, 흰 카드, `borderRadius: 24`)을 그대로 따름.
- 체크 아이콘(`lucide-react-native`의 `Check`, 이미 다른 화면에서 사용 중) + `message` 텍스트만 표시. 버튼 없음.
- `visible`이 `true`가 되면 1100ms 뒤 자동으로 `onHide()` 호출 (setTimeout, cleanup on unmount/visible change).
- 호출부는 `onHide`에 `router.replace('/(tabs)')`를 넘겨서 홈으로 복귀시킴.

### B. `lib/partnerReaction.ts` (신규, 순수 함수 — 단위 테스트 대상)

```ts
type ReactionRow = { card_id: string; reaction_type: string; condition_tag: string | null; created_at: string };

pickLatestReaction(rows: ReactionRow[]): ReactionRow | null
// created_at 기준 내림차순 정렬 후 첫 항목. 빈 배열이면 null.

formatReactionText(row: ReactionRow, labels: { condition: (tag: string) => string | undefined; reaction: (type: string) => string }): string
// (condition_tag가 있으면 labels.condition(tag) + ' ') + labels.reaction(reaction_type)
// 예: condition_tag='closer', reaction_type='like' → "가까우면 좋아" (기존 목업 문자열과 동일 — 회귀 확인용 앵커)
```

기존 `locales/ko.json`의 `candidates.rxLabel.*` (love/like/burden/next_time)과 `card.conditionTags.*.label` 매핑을 그대로 재사용. 새 카피 불필요.

### C. `lib/time.ts` (신규, `app/account/notifications.tsx`의 `relativeTime`을 추출)

```ts
relativeTime(iso: string, labels: { justNow: string; minutes: string; hours: string; yesterday: string; days: string }): string
```

로직은 `notifications.tsx:62-72`와 동일, `t` 클로저 대신 파라미터로 받도록 일반화. `notifications.tsx`는 이 함수를 import해서 쓰도록 교체(중복 제거). 홈 화면의 파트너 반응 카드도 동일 함수로 "n분 전" 표시.

### D. `app/(tabs)/index.tsx` — 파트너 반응 카드 실데이터 연동

`useFocusEffect` 안, `couple.partnerId` 확보 후, 기존 `topCandidate` 조회(103-130줄)와 동일한 2단계 패턴을 재사용 (이 코드베이스에 임베디드 조인(`!inner`) 사용 전례가 없어, 이미 검증된 패턴을 그대로 따름):

```ts
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
  const cardTitle = latest && allCards.find(c => c.id === latest.card_id)?.title;
  setPartnerReaction(latest && cardTitle
    ? { cardId: latest.card_id, cardTitle, text: formatReactionText(latest, labels), timeAgo: relativeTime(latest.created_at, timeLabels) }
    : null);
}
```

상태로 `partnerReaction: { cardId, cardTitle, text, timeAgo } | null` 저장. (`.order().limit(1)` 뒤에 `pickLatestReaction`을 다시 쓰는 건 중복으로 보일 수 있으나, DB가 이미 정렬해 주므로 `pickLatestReaction`은 사실상 `rows[0] ?? null` 역할만 함 — 순수 함수라 단위 테스트로 검증하고, 화면에서는 정렬을 DB에 맡기고 이 함수로 안전하게 첫 값을 뽑는 정도로 사용.)

렌더: 기존 354-375줄 블록을 `partnerReaction`이 `null`이 아닐 때만 렌더하도록 변경. `onPress`는 `router.push('/share/mutual')` 대신 `router.push('/card/' + partnerReaction.cardId)`로 변경 (탭하면 실제로 반응한 그 카드로 이동).

### E. `app/card/confirm.tsx` — 확정 / 수정 저장

- `handleSave()` 시작 시 `const wasConfirmed = isPlan;` 로 저장 전 상태 캡처.
- 성공 시 기존 `await load(); setEditing(false);` 제거, 대신:
  ```ts
  setSuccessMessage(wasConfirmed ? c.savedMessage : c.confirmedMessage);
  setSuccessVisible(true);
  ```
- 컴포넌트 루트에 `<SuccessModal visible={successVisible} message={successMessage} onHide={() => router.replace('/(tabs)')} />` 추가.
- `locales/ko.json`(및 `en.json`) `confirm` 섹션에 `confirmedMessage: "데이트가 확정됐어요"`, `savedMessage: "변경사항이 저장됐어요"` 추가.
- "계획 취소하기"(`handleCancelPlan`)는 이미 정상 동작이라 변경 없음.

### F. `app/soft-message/result.tsx` — 마음전하기 보내기

- `handleSend()` 성공 분기의 `Alert.alert(sentAlertTitle, sentAlertMessage)`를 제거하고 `SuccessModal` state로 교체.
- 메시지: `softMessage.sentAlertTitle` 재사용("보냈어요") 또는 새 키 `softMessage.sentSuccessMessage: "마음을 전했어요"` 추가 (모달은 제목+본문 2단 구조가 아니라 한 줄이므로 새 키 사용).
- `onHide` → `router.replace('/(tabs)')`.
- "문장 복사하기"(`handleCopy`)는 변경 없음 — 클립보드 복사 후에도 화면에 남아 이어서 전송하거나 외부 앱에 붙여넣을 수 있어야 함.

### G. `app/share/send.tsx` — 보내기 후 오배정 수정

- `handleSend()` 성공 시 `router.push({ pathname: '/share/reaction', ... })` 제거.
- 대신 `SuccessModal` 표시, 메시지 새 키 `share.send.sentMessage: "마음을 전했어요"`.
- `onHide` → `router.replace('/(tabs)')`.
- `candidates.tsx`가 `/share/reaction`으로 진입시키는 부분(받는 사람 경로)은 그대로 둠.

## 에러 처리

기존 각 화면의 `try/catch` + `Alert.alert(errorTitle, ...)` 패턴 그대로 유지 (실패 시 `SuccessModal` 띄우지 않고 기존 에러 얼럿만 노출, 화면 이동 없음 — 사용자가 재시도 가능해야 함).

## 테스트

기존 컨벤션(`__tests__/*.test.ts`, `lib/*.ts` 순수 함수만 단위 테스트, `.tsx` 화면은 시뮬레이터 수동 검증)을 그대로 따름.

- `__tests__/partnerReaction.test.ts` (신규): `pickLatestReaction` (빈 배열→null, 여러 건 중 최신 선택), `formatReactionText` (condition_tag 있음/없음, `closer`+`like` 조합이 기존 목업 문자열 `"가까우면 좋아"`와 정확히 일치하는지 회귀 앵커).
- `__tests__/time.test.ts` (신규): `relativeTime` 경계값(0분, 59분, 1시간, 23시간, 1일, 2일 이상).
- 화면 변경분(`confirm.tsx`, `soft-message/result.tsx`, `share/send.tsx`, `index.tsx`)은 시뮬레이터로 수동 검증 — 사용자가 직접 확인.

## 수동 검증 체크리스트 (구현 후 사용자가 확인)

1. 파트너가 카드에 반응 남기기 → 홈 화면에 실제 카드 제목 기반 문구 표시되는지, 탭하면 해당 카드로 이동하는지. 반응 없는 커플 계정에서는 카드 자체가 안 보이는지.
2. 후보 카드 확정 → 체크 모달 뜨고 잠시 후 홈으로 이동하는지.
3. 확정된 계획 "수정하기 → 저장하기" → 체크 모달(다른 문구) 뜨고 홈으로 이동하는지. "취소하기"는 기존처럼 홈으로 가는지(회귀 확인).
4. 마음전하기 "보내기" → 모달 뜨고 홈으로 이동하는지.
5. 후보 카드 "마음 보내기"(share/send) → 모달 뜨고 홈으로 이동하는지(예전처럼 반응 화면 안 뜨는지). candidates 목록의 "상대가 보낸 제안" 배너 탭 시엔 여전히 반응 화면으로 정상 진입하는지(회귀 확인).
