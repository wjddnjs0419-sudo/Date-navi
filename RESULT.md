# RESULT.md

현재 및 직전 세션의 핫 컨텍스트만 유지합니다. 과거 기록은 `RESULT_ARCHIVE.md`에 누적합니다.

---

## 2026-07-05 세션 X — 사귄 날짜 수정 및 함께한 날 기준 통일

### 변경 사항 요약

| 파일 | 수정 내용 |
|------|----------|
| `app/settings.tsx` | 마이페이지 "상대방과 N일째" 기준을 `date_planner_profiles.anniversary_date`로 변경. 값이 없으면 기존 커플 연결일(`date_planner_couples.created_at`) fallback 사용 |
| `app/settings.tsx` | day badge를 터치 가능하게 변경하고, 누르면 `DateWheelPicker` sheet로 사귀기 시작한 날 수정 가능 |
| `app/settings.tsx` | picker 확정 시 `anniversary_date` 저장 후 day badge 값을 즉시 갱신 |
| `app/(tabs)/memories.tsx` | 우리 추억 상단 통계의 "함께한 날"을 추억 개수 대신 `anniversary_date` 기준 D-day로 변경. 추억 개수는 기존 헤더 문구에 유지 |

### 기술 결정

- 시작일의 단일 기준은 `date_planner_profiles.anniversary_date`로 둔다.
- 기존 사용자가 `anniversary_date`를 비워둔 경우에는 커플 연결일을 fallback으로 보여주고, 사용자가 수정하면 `anniversary_date`로 저장한다.
- 날짜 수정 UI는 이미 만든 `PickerSheet` + `DateWheelPicker`를 재사용했다.

### 검증

```bash
npm run validate  # 통과 (tsc --noEmit)
```

### 다음 세션 할 일 / 주의

1. 실기기에서 마이페이지 badge 탭 → 날짜 저장 → 마이페이지/우리 추억 D-day 반영 확인
2. 현재는 본인 profile의 `anniversary_date`만 수정한다. 커플 양쪽에 같은 값을 강제 동기화하려면 별도 DB/RLS 정책 설계 필요

---

## 2026-07-05 세션 W — 날짜/시간/소요시간 drag picker 전환

### 변경 사항 요약

| 파일 | 수정 내용 |
|------|----------|
| `components/pickers.tsx` | 신규 — `WheelPicker`, `PickerSheet`, `DateWheelPicker`, `TimeWheelPicker`, `DurationWheelPicker` 공용 컴포넌트 추가 |
| `app/card/confirm.tsx` | 확정 날짜/시간 텍스트 입력 → 하단 sheet 기반 날짜/시간 wheel picker로 교체. 장소/준비물은 자유 입력 유지 |
| `app/onboarding/anniversary.tsx` | 기념일 드롭다운 3개 → inline 년/월/일 wheel picker로 교체. 월별 일수 보정은 공용 picker에서 처리 |
| `app/mode-flow/pick.tsx`, `feeling.tsx`, `light.tsx`, `course.tsx` | 시간/소요시간 버튼 그룹 → drag wheel picker로 교체. 기존 `duration` value는 유지 |
| `app/card/new.tsx`, `app/card/edit/[id].tsx` | 예상 시간 선택/입력 → duration wheel picker로 교체. 수정 화면은 프리셋 밖 기존 값도 보존 |

### 후속 수정

- 실제 iOS 화면에서 picker 항목이 선택 범위와 겹쳐 보이는 문제 수정: wheel item 높이를 `42` → `58`로 확대하고 picker 텍스트 lineHeight/maxFontSizeMultiplier를 지정했다.
- wheel 항목을 직접 터치하면 해당 값으로 스크롤하며 선택되도록 `Pressable` 기반 터치 선택을 추가했다.
- 터치 선택 시 선택값 변경과 `scrollTo`가 동시에 실행되어 선택 행 주변이 떨리는 문제 수정: 터치 시 먼저 목표 위치로 이동하고, 짧은 지연 후 값을 확정하도록 순서를 변경했다.
- 드래그 종료 후 iOS 감속/스냅 타이밍 때문에 두 항목 사이에 멈추는 문제 수정: `onScroll`로 최신 offset을 추적하고, 드래그 종료 후 지연 snap을 2회 강제 적용한다.

### 기술 결정

- React Native `ScrollView`의 `snapToInterval` + `decelerationRate="fast"` 조합으로 wheel picker를 구현해 의존성 추가 없이 Expo SDK 54 범위 안에서 해결했다.
- 실제 DB 스키마는 변경하지 않고 기존 문자열 컬럼(`confirmed_date`, `confirmed_time`, `estimated_time`)을 유지했다.
- 확정 날짜는 새 picker 선택 시 `YYYY-MM-DD`로 저장하고, 읽기 화면에서는 `n월 d일 (요일)`로 표시한다.

### 검증

```bash
npm run validate  # 통과 (tsc --noEmit)
```

### 다음 세션 할 일 / 주의

1. 실기기/시뮬레이터에서 wheel 감속감, sheet 높이, 손가락 조작감을 확인
2. 영어 UI에서 날짜/시간 표시 문구까지 완전 현지화하려면 `formatDateLabel`/`TimeWheelPicker` locale 옵션 추가

---

## 2026-07-05 세션 V — AI 후보 생성 로딩 아이콘 pulse 애니메이션

### 변경 사항 요약

| 파일 | 수정 내용 |
|------|----------|
| `components/ui.tsx` | `GeneratingView` 중앙 Sparkles 아이콘을 `Animated.View`로 감싸 heartbeat/pulse scale 애니메이션 추가 |
| `components/ui.tsx` | 아이콘 뒤에 은은한 pink halo를 추가하고, pulse에 맞춰 halo opacity/scale이 함께 변하도록 구성 |
| `components/ui.tsx` | `AccessibilityInfo.isReduceMotionEnabled()` 및 `reduceMotionChanged` 구독 추가. reduce motion 환경에서는 정적 아이콘 상태 유지 |

### 기술 결정

- 생성 화면 공통 컴포넌트인 `GeneratingView`에 적용해 `pick/feeling/light/course` 생성 플로우가 모두 동일한 집중 애니메이션을 사용한다.
- `useNativeDriver: true`가 가능한 `transform: scale`과 `opacity`만 애니메이션해 로딩 중 프레임 부담을 낮췄다.
- `iconStage` 크기를 고정해 pulse 중에도 헤딩/체크리스트 레이아웃이 흔들리지 않게 했다.

### 검증

```bash
npm run validate  # 통과 (tsc --noEmit)
```

### 다음 세션 할 일 / 주의

1. 실기기 또는 Expo 시뮬레이터에서 생성 화면 진입 후 pulse 속도/강도 체감 확인
2. 너무 튄다고 느껴지면 scale 상한을 `1.08`에서 `1.05~1.06`으로 낮추기

---

## 2026-05-28 세션 U — 마이페이지 버그픽스 (커플연결·언어·닉네임)

### 변경 사항 요약

| 파일 | 수정 내용 |
|------|----------|
| `app/settings.tsx` | **커플 연결 row에 `onPress` 누락** → `/onboarding/couple-connect` 라우팅 추가 (클릭 무반응 버그 해결) |
| `app/settings.tsx` | 전체 라벨 하드코딩 한국어 → `strings.settings.*` 기반 교체. 언어 토글 시 마이페이지도 즉시 전환 (계정/커플연결/비밀번호/환경설정/알림/언어/정보/도움말/약관/개인정보/로그아웃/탈퇴 + 통계·기념일 라벨 + 언어선택·도움말 Alert 문구) |
| `app/account/edit-profile.tsx` | `handleSave`의 `user_preferences` upsert를 **best-effort try/catch로 분리**. prefs 실패가 닉네임 저장/`router.back()`을 막지 않게 함 |
| `lib/i18n.ts` | `settings` 섹션에 누락 키 ko·en 추가 (nameEmpty, partnerFallback, daysWith(fn), statDates, statWantAgain, rowNickname/Couple/Password/Notifications/Language, prefsTitle, infoTitle, rowHelp/Terms/Privacy, langPickTitle/Message, cancel, helpTitle/Message) |

### 버그 원인 분석

1. **커플 연결 클릭 무반응**: `ListRow`는 `onPress` 없으면 탭해도 무동작. 해당 row에 핸들러가 빠져 있었음.
2. **언어 변경 적용 안됨**: `setLanguage` 토글 자체는 앱 전역 작동하나, settings.tsx 라벨이 전부 하드코딩 한국어라 마이페이지 화면은 안 바뀜 → "적용 안됨"으로 보임.
3. **닉네임 변경 적용 안됨**: `date_planner_profiles` update(RLS `profiles_update_self` 정상)는 성공하지만, 뒤이은 `user_preferences.upsert(onConflict:'user_id')`가 throw(테이블 `user_id` UNIQUE 제약 미확인)하면 catch로 "저장 실패" alert + `router.back()` 차단 → 이름은 저장됐어도 실패처럼 보임.

### 검증

```bash
npx tsc --noEmit  # 통과 (EXIT 0)
```

### 다음 세션 할 일 / 주의

1. 실기기 QA: 닉네임 변경 후 마이페이지·홈 갱신 / 언어 ko↔en 토글 / 커플 연결 진입 확인
2. **근본 확인**: `user_preferences.user_id` UNIQUE 제약 실제 유무 점검 → 없으면 마이그레이션으로 추가해 ③ 원인 확정 제거
3. Phase 7 잔여: App Store 영어 메타데이터

---

## 2026-05-28 세션 T — 알림 Supabase 연동 (생성 트리거 + 삭제 + 빈 상태)

### 변경 사항 요약

| 항목 | 내용 |
|------|------|
| `supabase/migrations/20260528000001_notifications.sql` | 신규 — `notifications` 테이블(`user_id, couple_id, type, payload jsonb, read, created_at`) + RLS 3개(본인 select/update/delete, insert는 트리거만) + helper `couple_partner()` + 트리거 2개. 원격 적용 완료 |
| 트리거 `trg_notify_reaction` | `reactions` AFTER INSERT → card_id로 카드 주인 찾아 알림. 자기 카드에 자기가 반응 시 제외 |
| 트리거 `trg_notify_card` | `date_cards` AFTER INSERT (`source='ai'`만) → 커플 상대에게 알림. manual 카드 제외 |
| 보안 | `get_advisors` 경고 → security definer 함수 3개 EXECUTE 권한 `public/anon/authenticated`에서 revoke (RPC 외부 노출·상대 uuid 유출 차단) |
| `app/account/notifications.tsx` | mock 전면 제거 → Supabase fetch. **개별 탭 → 해당 알림 delete**, **"모두 지우기" → 전체 delete**(버튼 라벨 변경), **빈 상태 UI 신규**(BellOff), 로딩 스피너, 시간 그룹핑(오늘/이번 주/이전), 상대시간 표기 |
| `lib/i18n.ts` | `notifications` 섹션 ko/en 추가 (제목, unreadSuffix, clearAll, empty, group, type별 title, 상대시간 단위) |
| `app/(tabs)/index.tsx` | 벨 dot을 `notifications` count > 0 일 때만 표시 (기존: 항상 켜짐) |

### 알림 생성 기준 (확정)

- **reaction**: 상대가 내 카드에 반응 → 카드 주인에게
- **new_card**: 커플 상대가 AI 카드 생성 → 나에게
- **soft_message는 제외**: "자동 전송 금지" 원칙(Proposal 11.9)과 충돌하여 트리거에서 뺌

### 검증

```bash
npx tsc --noEmit  # 통과 (출력 없음)
```

### 다음 세션 할 일 / 주의

1. 실기기 QA: 둘이 반응·AI 카드 주고받아 알림 생성·삭제·빈 상태 확인 (기존 reactions 3건은 트리거 적용 전이라 알림 없음)
2. AI 카드 한 번에 3장 생성 → 알림 3개. 시끄러우면 statement-level로 묶기 검토
3. Phase 7 잔여: App Store 영어 메타데이터

---

## 2026-05-25 세션 S — Phase QA 버그픽스

### 변경 사항 요약

| 파일 | 수정 내용 |
|------|----------|
| `app/account/notifications.tsx` | `useState`로 unread 목록 관리, `markAllRead()` 함수 → "모두 읽음" 버튼 onPress 연결. 남은 unread 개수 실시간 반영 |
| `app/account/edit-profile.tsx` | 아바타 + "사진 변경하기" 버튼 `onPress` 연결 → Alert("이미지 선택 기능은 곧 업데이트될 예정이에요.") |
| `app/settings.tsx` | `useEffect` → `useFocusEffect(useCallback)` 전환 → 닉네임 수정 후 화면 복귀 시 즉시 반영 |
| `app/settings.tsx` | 알림 row `value="켜짐"` 제거 → `/account/notifications` 네비게이션임을 명확히 |
| `app/settings.tsx` | 도움말 `onPress={handleHelp}` 연결 → Alert(이메일 문의) |
| `app/settings.tsx` | 언어 `onPress={handleLanguage}` 연결 → Alert(한국어/English 선택), i18n `setLanguage` 연동, 현재 언어 value 표시 |
| `app/settings.tsx` | `handleLogout` — `signOut()` 후 즉시 `router.replace('/(auth)')` 호출 → 스와이프백으로 마이페이지 복원되는 버그 차단 |
| `app/settings.tsx` | `useI18n` + `AppLanguage` import 추가 |

### 수정된 버그 목록

1. 알림창 "모두읽음" 버튼 동작 안 함 → 해결
2. 카메라/사진변경 버튼 동작 안 함 → 해결 (준비 중 안내)
3. 마이페이지 닉네임 변경 후 "닉네임 없음" 표시 → 해결
4. 마이페이지 알림 row "켜짐/꺼짐" 토글처럼 보임 → 해결 (value 제거, 알림 화면 이동 명확화)
5. 도움말 클릭 안 됨 → 해결
6. 언어 클릭 안 됨 → 해결
7. 로그아웃 후 스와이프백으로 마이페이지 재등장 → 해결

### 검증

```bash
npx tsc --noEmit  # 통과 (출력 없음)
```

### 다음 세션 할 일

1. Phase 7 잔여: App Store / Google Play 영어 메타데이터 (앱 이름, 설명, 키워드)
2. Long-Term: EAS Build 세팅, TestFlight 클로즈드 베타 준비
3. `expo-image-picker` 연결 — `onboarding/photo.tsx` + `edit-profile.tsx` 실제 이미지 선택

---

## 2026-05-25 세션 R — Phase 11 반응 고도화 + UI 그라디언트

### 변경 사항 요약

| 항목 | 내용 |
|------|------|
| `supabase/migrations/20260525000002_reactions_condition_tag.sql` | `reactions` 테이블에 `condition_tag text CHECK(...)` 컬럼 추가 (원격 적용 완료) |
| `app/card/[id].tsx` | `burden` 반응 선택 시 조건 박스 노출 — 장소만 바꾸면/가까우면/실내면/예산 조정되면 4가지 선택, condition_tag upsert |
| `app/card/[id].tsx` | 조건 선택 후 "조건으로 다시 찾아줘" 버튼 → AI `generateDateCards` 호출 → `date_cards` 3개 삽입 |
| `app/(tabs)/candidates.tsx` | `reactions` 쿼리에 `condition_tag` 추가, `CardWithReactions` 타입 확장, 반응 박스에 조건 라벨 표시 |
| `datemate-app/` | `expo-linear-gradient` SDK 54 호환 버전 설치 |
| `app/(tabs)/index.tsx` | 홈 헤더 배너에 LinearGradient (#FFE8EC→#FFF5F0→#FFF8F3) 적용, CTA 버튼 그라디언트 (#FF6B85→#FF4F6D→#E8395A) 적용 |

### 조건부 반응 플로우

```
카드 상세 화면
  → "오늘은 부담돼" 선택
  → 조건 박스 노출: 📍 장소만 바꾸면 / 🚶 가까우면 / 🏠 실내면 / 💰 예산 조정되면
  → 조건 선택 → condition_tag upsert (reactions 테이블)
  → "📍 장소만 바꾸면 조건으로 다시 찾아줘" 버튼
  → AI generateDateCards(freeText=조건 설명) → date_cards 3개 저장
  → Alert "새 후보 생성 완료" → 우리 후보 탭에서 확인

우리 후보 탭
  → 반응 박스에 조건 라벨 표시 (나: 부담돼 / 📍 장소만 바꾸면)
```

### 검증

```bash
npx tsc --noEmit  # 통과 (출력 없음)
```

### 다음 세션 할 일

1. Phase 7 잔여: App Store 영어 메타데이터 (앱 이름, 설명, 키워드)
2. Long-Term: 클로즈드 베타 준비 (EAS Build, TestFlight)
3. `expo-image-picker` 연결 — `onboarding/photo.tsx` 실제 이미지 선택

---

## 2026-05-25 세션 Q — Phase 10: "다음에 만나면" 버킷리스트

### 변경 사항 요약

| 항목 | 내용 |
|------|------|
| Supabase `bucket_list` | 신규 테이블 — `id, user_id, couple_id, item, status('pending'/'confirmed'), created_at` + RLS 3개 정책 |
| Supabase `bucket_reactions` | 신규 테이블 — `id, bucket_id, user_id, reaction_type('love'/'next_time'), created_at` + UNIQUE(bucket_id, user_id) + RLS 3개 정책 |
| `supabase/migrations/20260525000001_bucket_list.sql` | 위 두 테이블 마이그레이션 파일 (원격 적용 완료) |
| `app/mode-flow/bucketlist.tsx` | 신규 — 아이디어 자유 텍스트 입력 (최대 200자) + `bucket_list` 저장 → 후보 탭 이동 |
| `app/(tabs)/mode.tsx` | `next_meet` 선택 시 `/mode-flow/bucketlist`로 라우팅 분기 |
| `app/(tabs)/candidates.tsx` | 필터 탭에 "다음에 만나면" 추가. 별도 `BucketSection` 컴포넌트로 버킷리스트 목록 + 반응(끌려/다음에) + 만남 확정 버튼(AI 코스 카드 3장 생성 → `date_cards` 저장 → bucket 상태 `confirmed`) |

### 전체 플로우

```
데이트 모드 탭 → "다음에 만나면" 선택 → /mode-flow/bucketlist
  → 아이디어 입력 + 저장 → bucket_list 테이블

우리 후보 탭 → "다음에 만나면" 필터 탭
  → 버킷리스트 목록 표시
  → 각 아이템: 내 반응(끌려/다음에) + 상대 반응 표시
  → 내가 '끌려' 선택 시 "만남 확정" 버튼 등장
  → 확정 → AI generateDateCards(mode:'next_meet') → date_cards 3개 저장
  → bucket_list status 'confirmed' → "전체" 탭 전환
```

### 검증

```bash
npx tsc --noEmit  # 통과 (출력 없음)
```

### 다음 세션 할 일

1. Phase 11: 반응 고도화 — 조건부 반응 상세 (`장소만 바꾸면 / 가까우면 / 실내면 / 예산 조정되면`)
2. Phase UI 시각 갭: `expo-linear-gradient` 그라디언트 적용

---

## 2026-05-25 세션 P — Phase 9: 직접 후보 추가

### 변경 사항 요약

| 항목 | 내용 |
|------|------|
| Supabase `date_cards` | `source text NOT NULL DEFAULT 'ai' CHECK (source IN ('ai', 'manual'))` 컬럼 추가 (마이그레이션) |
| `app/card/new.tsx` | 신규 — 제목·설명 입력 + 예상 시간·예산 선택(optional) + "AI가 카드로 정리해줘" 토글 → `source:'manual'` 또는 AI 보정 후 `source:'ai'`로 `date_cards` 저장 → 후보 탭으로 이동 |
| `app/(tabs)/candidates.tsx` | 헤더 우상단 "직접 추가" 핑크 버튼 추가 (`/card/new` 라우팅). `source` 컬럼 쿼리 추가. 직접 추가 카드에 라벤더 배지 표시 |
| `components/ui.tsx` | `Badge` 컴포넌트에 `lavender` tone 추가 |
| `app/mode-flow/result.tsx` | AI 저장 시 `source: 'ai'` 명시 |

### 검증

```bash
npx tsc --noEmit  # 통과 (출력 없음)
```

### 다음 세션 할 일

1. Phase 10: "다음에 만나면" 버킷리스트 (`app/mode-flow/bucketlist.tsx` + `bucket_list` 테이블)
2. Phase 11: 반응 고도화 (조건부 반응 상세)

---

## 2026-05-25 세션 O — Phase UI: soft-message 2화면 분리

### 변경 사항 요약

| 항목 | 내용 |
|------|------|
| `app/(tabs)/soft-message.tsx` | softHelper만 남김 — result 관련 state/핸들러 제거. 버튼 클릭 시 `/soft-message/result`로 라우팅 (`card`, `tone`, `free` params) |
| `app/soft-message/result.tsx` | 신규 — softResult 화면. params 수신 후 마운트 시 `generateSoftMessage` 호출 → 로딩 → 라벤더 SoftCard + TextInput 편집 + 조정 버튼 3개 + InfoNote + 복사/저장 하단 CTA |

### 라우팅 흐름

```
마음 전하기 탭 (softHelper)
  → 카드 선택 + 톤 선택 + 추가 메모
  → "문장 만들어줘" → /soft-message/result?card=...&tone=...&free=...
  → AI 생성 로딩 → 편집 가능한 문장 카드
  → 복사하기 / 저장하기
```

### 검증

```bash
npx tsc --noEmit  # 통과 (출력 없음)
```

### 다음 세션 할 일

1. Phase 9: 직접 후보 추가 (`app/card/new.tsx`)
2. Phase 10: "다음에 만나면" 버킷리스트

---

## 2026-05-25 세션 N — Phase UI: share/mutual.tsx 개선

### 변경 사항 요약

| 항목 | 내용 |
|------|------|
| `app/share/mutual.tsx` | 카드에 `summary` 텍스트 표시 (타이틀 아래 2줄) |
| `app/share/mutual.tsx` | `estimated_time` / `estimated_budget` 아이콘(Clock·Wallet) + 섹션 색상으로 메타 정보 표시 |
| `app/share/mutual.tsx` | 태그 칩 최대 3개 표시 |
| `app/share/mutual.tsx` | 카드 탭 시 `/card/[id]` 상세화면 이동 (`onPress` 연결) |
| `app/share/mutual.tsx` | "이번 데이트로 정하기" → mutual 카드 존재 시 `/card/confirm?id=...`, 없으면 후보 탭 폴백 |
| `app/share/mutual.tsx` | mutual 섹션 note 문구 개선: "둘 다 좋아하는 후보예요. 이번 데이트로 정해볼까요?" |
| `app/share/mutual.tsx` | Supabase 쿼리에 `estimated_time`, `estimated_budget`, `tags` 컬럼 추가 |

### 섹션 색상 구조 (기존 유지 + 확인)

| 섹션 | 배경색 | 강조색 |
|------|--------|--------|
| 둘 다 끌린 후보 | `C.pinkLight` (#FFEEF0) | `C.pinkDeep` (#C24B57) |
| 조건만 맞추면 좋은 후보 | `C.lavender` (#F1ECFF) | `C.lavenderFg` (#6B5BB8) |
| 오늘은 부담되지만 다음에 좋은 후보 | `C.cream` (#FFF3E0) | `C.creamFg` (#A77738) |

### 검증

```bash
npx tsc --noEmit  # 통과 (출력 없음)
```

### 다음 세션 할 일

1. `(tabs)/soft-message.tsx` — softHelper + softResult 2화면 분리
2. Phase 9: 직접 후보 추가 (`app/card/new.tsx`)

---

## 2026-05-25 세션 M — Phase UI: confirm / review / memories 강화

### 변경 사항 요약

| 항목 | 내용 |
|------|------|
| `app/card/confirm.tsx` | 신규 — DateConfirmScreen: 카드 요약 + 날짜/시간/장소/준비물 입력 → `date_cards` status `'confirmed'` 업데이트 → review로 이동 |
| `app/card/review.tsx` | 신규 — DateReviewScreen: 평가 2×2 그리드 + 좋았던 점 칩 선택 + 한 줄 후기 → `date_memories` 저장 → memories 탭 이동 |
| `app/card/[id].tsx` | "이번 데이트로 정할까요?" 버튼 추가 → `/card/confirm?id=<id>` 라우팅 |
| `lib/i18n.ts` | `Copy` 타입에 `confirm`, `review` 섹션 추가, ko/en 문자열 완성, card에 `confirmButton` 추가 |
| `(tabs)/memories.tsx` | featured 카드에 시간/비용 메타, 태그 칩, "최근 추억" Badge 추가. date_cards 쿼리에 estimated_time/budget/tags 포함 |
| `(tabs)/candidates.tsx` | 반응 바이패널 (`나 / 상대`) 이미 구현되어 있음 — 추가 작업 불필요 |

### 라우팅 흐름 (신규 확정)

```
우리 후보 → card/[id] → "이번 데이트로 정할까요?" 버튼
  → /card/confirm?id=X  (날짜/시간/장소/준비물 입력 + status 'confirmed' 저장)
  → /card/review?id=X   (평가 + 칩 + 후기 → date_memories 저장)
  → /(tabs)/memories    (추억 탭)
```

### 검증

```bash
npx tsc --noEmit  # 통과 (출력 없음)
```

### 다음 세션 할 일

1. `share/mutual.tsx` — 색상 섹션 그룹핑 (둘 다 끌린 / 조건부 / 다음에)
2. `(tabs)/soft-message.tsx` — softHelper + softResult 2화면 분리
3. Phase 9: 직접 후보 추가 (`app/card/new.tsx`)

---

## 2026-05-25 세션 L — Phase UI: Date Navi 온보딩 화면 포팅 + 갭 분석

### 변경 사항 요약

| 항목 | 내용 |
|------|------|
| `onboarding/photo.tsx` | 신규 — 프로필 사진 단계 (2/4), 아바타 이니셜 + 카메라 버튼 UI |
| `onboarding/anniversary.tsx` | 신규 — 기념일 날짜 입력 (3/4), 드롭다운 연/월/일 선택, D-day 계산, `anniversary_date` Supabase 저장 |
| `onboarding/type.tsx` | 신규 — 데이트 계획 스타일 선택 (4/4), 5가지 옵션, `planning_style` 저장 후 `couple-connect`로 라우팅 |
| `onboarding/connected.tsx` | 신규 — 커플 연결 성공 화면, RN `Animated` API로 아바타 2개 수렴 + 하트 등장 + 펄스 애니메이션 |
| `onboarding/nickname.tsx` | 저장 후 라우팅 `/onboarding/photo`로 변경 (기존: `couple-connect`) |
| `onboarding/couple-connect.tsx` | 연결 성공 후 `/onboarding/connected`로 라우팅, "나중에" 버튼 → `/onboarding/preferences` |
| `onboarding/preferences.tsx` | 단계 재배치: 활동→분위기→피하기→장거리 여부. `planning_style` 제거, `is_long_distance` + `mood_tags` 저장 |
| `(tabs)/index.tsx` | 알림 벨 버튼에 핑크 dot(8px) 추가 |

### 온보딩 라우팅 (확정)

```
/(auth) → nickname(1/4) → photo(2/4) → anniversary(3/4) → type(4/4)
  → couple-connect → connected → preferences(4단계) → /(tabs)
나중에 연결 → preferences → /(tabs)
```

### preferences 단계 순서 변경 이유

Date Navi OnboardingScreens.tsx 기준:
- pref1: 선호 활동 (활동 멀티 선택)
- pref2: 원하는 분위기 (mood 멀티 선택) ← 기존 step3
- pref3: 부담스러운 것 (avoid 멀티 선택) ← 기존 step2
- pref4: 장거리 커플 여부 (단일 선택) ← 기존 planning_style 위치

planning_style은 `onboarding/type.tsx`(signup step 4)로 이동.

### 갭 분석 결과 (Phase UI 잔여 작업)

**미구현 화면 2개 (최우선):**
- `app/card/confirm.tsx` — 날짜·장소·시간·준비물 입력 후 데이트 확정
- `app/card/review.tsx` — 데이트 완료 후기 (별점칩·텍스트·사진)

**UI 갭 4개 (중요):**
1. `candidates.tsx` — "나 / 상대" 반응 바이패널 없음
2. `memories.tsx` — featured 카드 메타 정보 없음
3. `share/mutual.tsx` — 색상별 섹션 그룹핑 없음
4. `soft-message.tsx` — 2화면 분리 필요

**시각적 갭:** `expo-linear-gradient` 미설치로 일부 그라디언트 단색 대체 중

### 검증

```bash
npx tsc --noEmit  # 통과 (출력 없음)
```

### 다음 세션 할 일

1. `app/card/confirm.tsx` 신규 생성 (DateConfirmScreen)
2. `app/card/review.tsx` 신규 생성 (DateReviewScreen)
3. `(tabs)/candidates.tsx` UI — 반응 바이패널 추가
4. `(tabs)/memories.tsx` UI — featured 카드 메타 강화

---

## 2026-05-24 세션 K — Phase 8 모드별 차별화 UX

### 변경 사항 요약

| 항목 | 내용 |
|------|------|
| `lib/ai.ts` | `MODE_EMPHASIS` / `MODE_EMPHASIS_EN` 맵 추가 — `buildPrompt()` 내 모드별 AI 지시 블록 주입 |
| `lib/i18n.ts` | `course` 타입 및 한/영 문자열 추가 (아이디어 입력, 예산·시간 옵션, 버튼, 오류 메시지) |
| `app/mode-flow/course.tsx` | "코스로 정리해줘" 전용 입력 화면 신규 생성 |
| `app/(tabs)/mode.tsx` | `make_course` 선택 시 `/mode-flow/course`로 분기, 나머지는 기존 feeling 화면 유지 |

### 모드별 AI 프롬프트 강조 내용

| 모드 | 강조 지침 |
|------|----------|
| `light_date` | 저예산·근거리·체력 소모 적음·특별한 준비 불필요 우선 |
| `special_date` | 기념일·감성·로맨틱·기억에 남을 경험 강조 |
| `low_risk` | 무난·안전·둘 다 만족 가능성 높음·쉽게 실행 가능 우선 |
| `make_course` | summary에 단계별 동선, tags에 준비물, why_recommended에 대체안 포함 지시 |

### course.tsx 입력 플로우

```
"코스로 정리해줘" 탭
  → 아이디어 자유 텍스트 입력 (최대 200자)
  → 예산 선택 (아끼고 싶어 / 적당히 / 특별하게)
  → 시간 선택 (2~3시간 / 반나절 / 하루종일)
  → "코스 만들기" → result.tsx (mode=make_course)
  → AI가 단계별 코스 포함 카드 3장 생성
```

### 검증

```bash
cd datemate-app && npx tsc --noEmit
```

결과: 통과 (출력 없음)

참고: `npm run validate` 스크립트 없음 — `npx tsc --noEmit`으로 대체

### 다음 세션 할 일

- Phase 9: 사용자 직접 후보 추가 (우리 후보 탭 "직접 추가" 버튼 + `app/card/new.tsx`)
- Phase 7 잔여: App Store 영어 메타데이터 (앱 이름, 설명, 키워드)

---

## 2026-05-24 세션 J — Phase 6.5 마이페이지 & 계정 관리

### 변경 사항 요약

| 항목 | 내용 |
|------|------|
| `lib/i18n.ts` | settings 타입·한국어·영어 문자열 25개 추가 (닉네임·비밀번호·탈퇴) |
| `app/settings.tsx` | 마이페이지로 전면 교체: 닉네임 수정 / 비밀번호 변경 / 언어 설정 / 로그아웃 / 회원 탈퇴 모달 |
| `app/(tabs)/index.tsx` | 홈 하단 로그아웃 버튼 제거 (마이페이지로 통합) |
| `supabase/functions/delete-account/index.ts` | 회원 탈퇴 Edge Function 작성 및 Supabase에 배포 (ACTIVE) |
| `tsconfig.json` | `supabase/functions` Deno 코드 타입 검사 제외 |

### 탈퇴 처리 흐름

1. 상대방 `couple_id → null` + 커플 row 삭제
2. 내 `user_preferences`, `soft_messages`, `date_memories`, `date_planner_profiles` 삭제
3. `date_cards`, `reactions` 공유 데이터 보존 (상대방 계속 열람 가능)
4. Edge Function `delete-account` → `auth.admin.deleteUser()` 호출
5. `signOut()` → 로그인 화면 이동

### Edge Function 배포 위치

`/Users/jeongwonkim/Desktop/Codex_sample/supabase/functions/delete-account/index.ts`  
(앱 코드와 별개로 `Codex_sample/supabase/` 아래에 위치해야 CLI가 인식)

### 검증

```bash
cd datemate-app && npx tsc --noEmit
```

결과: 통과

### 다음 세션 할 일

- Phase 7 잔여: App Store 영어 메타데이터 (앱 이름, 설명, 키워드)
- 실기기 QA: 닉네임 수정 / 비밀번호 변경 / 탈퇴 플로우 확인

---

## 2026-05-23 세션 I — 닉네임 저장 무한 로딩 수정

### 변경 사항 요약

| 항목 | 내용 |
|------|------|
| `datemate-app/app/onboarding/nickname.tsx` | 닉네임 저장 후 `refreshSession()` 대기 제거, `/onboarding/couple-connect`로 직접 이동 |
| `datemate-app/app/_layout.tsx` | `onAuthStateChange` callback 안에서 Supabase query를 직접 await하지 않도록 `setTimeout`으로 비동기 예약 |

### 원인

닉네임 저장 자체는 성공했지만, 저장 후 호출한 `supabase.auth.refreshSession()`이 auth state callback의 추가 Supabase query와 맞물리면서 저장 버튼이 계속 loading 상태로 남을 수 있었다.

### 검증

```bash
cd datemate-app
npx tsc --noEmit
```

결과: 통과

### DB 확인

수정 전 닉네임 저장 시도 때문에 현재 원격 DB에는 `auth.users = 1`, `date_planner_profiles = 1` 상태가 확인됐다. 카드/반응/커플/취향 데이터는 0건이다.

---

## 2026-05-23 세션 H — QA 데이터 리셋 & 마이페이지 계획

### 변경 사항 요약

| 항목 | 내용 |
|------|------|
| `docs/qa-reset.sql` | QA 전 Supabase 데이터/유저 전체 초기화 SQL 추가 |
| `PLAN.md` | Phase 6에 QA 리셋 SQL 준비 완료 기록 |
| `PLAN.md` | Phase 6.5 `마이페이지 & 계정 관리` 추가 |
| Supabase 원격 DB | `supabase db query --linked -f docs/qa-reset.sql`로 실제 QA 리셋 실행 |
| `src/lib/backend/mock-client.ts` | 레거시 웹 mock 런타임이 예전 demo seed 대신 빈 상태로 시작하도록 변경 |

### QA 리셋 범위

- Mobile MVP 테이블: `date_cards`, `reactions`, `soft_messages`, `user_preferences`, `date_memories`, `analytics_events`
- 이전 Web MVP 테이블: `date_planner_*`
- Supabase Auth: `auth.users` 전체 삭제

### 마이페이지 방향

1. 닉네임/표시 이름 수정
2. 비밀번호 변경 또는 재설정
3. 언어 설정 유지
4. 로그아웃 정리
5. 회원 탈퇴 UI + Auth user 삭제 + cascade 검증
6. 커플 연결 해제/상대 데이터 보존 정책 결정

### 실행 참고

CLI가 linked project 권한을 갖고 있어 터미널에서 직접 실행했다.

실행 후 원격 DB 확인 결과:

| 테이블/영역 | count |
|-------------|-------|
| `auth.users` | 0 |
| `date_planner_profiles` | 0 |
| `date_planner_couples` | 0 |
| `date_cards` | 0 |
| `reactions` | 0 |
| `user_preferences` | 0 |
| `soft_messages` | 0 |
| `date_memories` | 0 |

---

## 2026-05-23 세션 G — Phase 7 영어/한국어 언어 선택

### 변경 사항 요약

| 항목 | 내용 |
|------|------|
| `package.json` | `expo-localization` 추가 |
| `lib/i18n.ts` | 한국어/영어 카피 사전, 언어 자동 감지, AsyncStorage 언어 저장, `I18nProvider/useI18n` 추가 |
| `components/language-toggle.tsx` | 인증/온보딩 화면용 언어 토글 추가 |
| `app/_layout.tsx` | 앱 전체를 `I18nProvider`로 감싸고 `/settings` 라우트 등록 |
| `app/settings.tsx` | 별도 설정 화면 추가: 앱 언어 선택 + 로그아웃 |
| 주요 앱 화면 | 인증, 온보딩, 탭, 모드 플로우, 후보, 마음 전하기, 추억, 카드 상세, 약관/개인정보 화면 카피 다국어화 |
| `lib/ai.ts` | `generateDateCards`, `generateSoftMessage`에 `language` 파라미터 추가 및 Gemini 프롬프트/폴백 결과 언어 분기 |

### 구현 결정

- `i18next`는 도입하지 않고, 현재 앱 규모에 맞춰 `expo-localization + 자체 I18nProvider`로 구현했다.
- 기본 언어는 기기 언어가 한국어면 `ko`, 그 외에는 `en`으로 시작한다.
- 사용자가 설정 화면에서 언어를 바꾸면 `datemate.language` 키로 AsyncStorage에 저장되어 다음 실행 때 유지된다.
- 홈 화면 상단의 설정 버튼에서 언어 변경 위치를 더 명확하게 접근할 수 있게 했다.

### 검증

```bash
cd datemate-app
npx tsc --noEmit
```

결과: 통과

참고: `npm run validate`는 `datemate-app/package.json`에 `validate` 스크립트가 없어 실행 불가.

### 남은 작업

1. App Store 영어 메타데이터 준비
2. 실제 기기/시뮬레이터에서 한국어/영어 화면 전환 QA

---

## 2026-05-23 세션 F — Phase 5.5 취향 데이터 AI 반영

### 변경 사항 요약

| 항목 | 내용 |
|------|------|
| `lib/ai.ts` | `UserPreferences` 타입 추가 (preferred_tags, avoid_tags, is_long_distance, planning_style) |
| `lib/ai.ts` | `buildPreferencesBlock()` 함수 추가 — 취향 데이터를 【커플 취향 (온보딩 기반)】 블록으로 변환 |
| `lib/ai.ts` | `buildPrompt()`에 `prefs?: UserPreferences` 파라미터 추가 — 취향 블록 프롬프트 끝에 주입 |
| `lib/ai.ts` | `generateDateCards()`에 `prefs?: UserPreferences` 파라미터 추가 |
| `app/mode-flow/result.tsx` | `useEffect` 내에서 `user_preferences` Supabase 조회 후 `generateDateCards`에 전달 |

### 프롬프트 주입 형식

```
【커플 취향 (온보딩 기반)】
- 선호 분위기: 맛집, 카페
- 평소 피하고 싶은 것: 먼 이동, 사람 많은 곳
- 장거리 커플: 아니요
- 계획 성향: 같이 정하는 편
```

### 설계 원칙

- `prefs`는 optional — 온보딩 미완료 유저도 정상 작동 (취향 블록 생략)
- Supabase 조회 실패 시 `prefs = undefined` → fallback 없이 기존 동작 유지

### 다음 세션 할 일 (Phase 7)

1. i18n 라이브러리 도입 (`expo-localization` + `i18next`)
2. 한국어/영어 언어 파일 분리 (`locales/ko.json`, `locales/en.json`)
3. 모든 UI 텍스트 번역 (탭, 버튼, 안내문구, 에러 메시지)
4. AI 프롬프트 영어 버전 분기
5. 앱 언어 자동 감지 + 수동 변경 설정
6. App Store 영어 메타데이터 준비

### 이번 결정

- `클로즈드 베타 10~30쌍`은 `Long-Term Backlog`로 이관
- 현재 다음 우선순위는 `Phase 7 — 영어 버전(English Localization)`

---

## 2026-05-23 세션 E — Phase 5 온보딩 & 추억

### 변경 사항 요약

| 항목 | 내용 |
|------|------|
| `supabase/user_preferences` | 신규 테이블 (user_id, preferred_tags text[], avoid_tags text[], is_long_distance, planning_style) + RLS 3개 정책 |
| `supabase/date_memories` | 신규 테이블 (couple_id text, card_id text, user_id uuid, review, want_again) + RLS 4개 정책 |
| `app/onboarding/preferences.tsx` | 4단계 온보딩 플로우 + 건너뛰기 버튼 |
| `app/_layout.tsx` | user_preferences 없으면 → /onboarding/preferences 라우팅 추가 |
| `app/card/[id].tsx` | "이 데이트 완료했어요" 버튼 + 후기/다시 하고 싶은지 모달 |
| `app/(tabs)/memories.tsx` | 완료 데이트 목록 화면 (카드 제목, 날짜, 후기, want_again 배지) |

### 버그픽스

- `preferences.tsx`의 `handleSave()`에서 불필요한 `refreshSession()` 제거 → 저장 후 즉시 탭 이동

### 온보딩 플로우

```
커플 연결 완료
  → user_preferences 없으면 → /onboarding/preferences
  → 1단계: 선호 분위기 멀티 선택 (맛집/카페/산책/집데이트/전시/액티비티)
  → 2단계: 피하고 싶은 것 멀티 선택 (먼 이동/큰 지출/사람 많은 곳/오래 걷기/예약 복잡)
  → 3단계: 장거리 여부 단일 선택
  → 4단계: 계획 성향 단일 선택
  → "완료" or "건너뛰기" → /(tabs)
```

### 추억 플로우

```
card/[id] 하단 → "이 데이트 완료했어요" 버튼
  → 모달: 한 줄 후기 (선택) + 다시 하고 싶은지 (필수)
  → date_memories DB 저장
  → memories 탭에서 목록 확인 (카드 제목, 날짜, 후기, want_again)
```

### 라우팅 순서 (전체)

```
앱 시작 → 세션 없음 → /(auth)
세션 있음
  → 닉네임 없음 → /onboarding/nickname
  → couple_id 없음 → /onboarding/couple-connect
  → user_preferences 없음 → /onboarding/preferences
  → /(tabs)
```

### 참고: user_preferences는 현재 AI에 미반영

저장은 되지만 `lib/ai.ts` 프롬프트에는 아직 주입 안 됨. Phase 6 개인화 단계에서 추가 필요.

### 다음 세션 할 일 (Phase 6)

1. **Super plan 4개 파일 필독**
2. 예외 처리: 로그인 실패, 코드 오류, AI 응답 실패
3. 로딩 상태 / 빈 화면 / 에러 메시지 UX
4. 개인정보처리방침 / 이용약관 페이지
5. 핵심 이벤트 로그: signup, couple_connected, mode_selected, ai_card_created
6. 클로즈드 베타 10~30쌍

---

## 2026-05-23 세션 D — Phase 4 내 마음 문장 만들기

### 변경 사항 요약

| 항목 | 내용 |
|------|------|
| `supabase/soft_messages` | 신규 테이블 (couple_id, user_id, reason_tags text[], free_text, generated_text, used) + RLS 4개 정책 |
| `lib/ai.ts` | `generateSoftMessage()` 함수 추가 — Gemini Flash로 부드러운 문장 생성 + fallback 8종 |
| `app/(tabs)/soft-message.tsx` | 전체 플로우 구현 — 조건 선택 → AI 생성 → 수정 → 클립보드 복사 → 저장 |

### 유저 플로우

```
마음 전하기 탭
  → 민감 조건 버튼 복수 선택 (8가지)
  → 추가 메모 입력 (선택)
  → "문장 만들기" → Gemini Flash API
  → 생성된 문장 표시 (수정 가능 TextInput)
  → 📋 클립보드 복사 (직접 상대에게 전송)
  → 저장하기 → soft_messages DB
```

### 핵심 설계 원칙

- **자동 전송 절대 금지**: "앱이 자동으로 보내지 않아요" 안내문 상시 노출
- AI 실패 시 이유별 fallback 문장 제공

---

_세션 A~C는 `RESULT_ARCHIVE.md` 참조._
