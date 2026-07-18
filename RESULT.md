# RESULT.md

현재 및 직전 세션의 핫 컨텍스트만 유지합니다. 과거 기록은 `RESULT_ARCHIVE.md`에 누적합니다.

---

## 2026-07-18 세션 AT — MVP 단일 모드 전환 + 마음 전하기 삭제 + 홈 카드 커플 이미지

> MVP 방향 확정: 완성도 높은 "코스로 정리해줘"만 남긴다. feeling/next_meet 모드는 UI 숨김, 마음 전하기는 코드 삭제. 데이트 후보 만들기 = 코스 플로우, 느낌 남기기 = 후보 카드 reaction 구조로 정리.

### 1. MVP 단일 모드 전환 (UI 숨김, 복원 가능)

- `lib/dateModes.ts`에 `ENABLED_DATE_MODE_IDS = ['make_course']` + `isDateModeEnabled()`(DB text 대응 string 허용) + `PRIMARY_DATE_MODE_ROUTE`(enabled[0]에서 파생) 추가. **복원 = 배열에 id 재추가 한 줄** — 모든 UI 분기가 이 배열에 연동.
- 모드 탭: `_layout.tsx`의 `tabPress` 리스너로 선택 화면 건너뛰고 코스 화면 직행(`router.navigate` — push는 더블탭 시 중복 스택 확인되어 교체). 모드 2개 이상 복원 시 리스너 자동 해제.
- 홈: 모드 카드 1개, dots·"전체보기" 숨김(`MODES.length > 1` 가드), "데이트 후보 만들기" 버튼 → 코스.
- 후보 탭: bucket 필터 chip 숨김(next_meet 연동), FAB → 코스(`candidates.fabAddCourse` ko/en 추가). BucketSection 등 코드는 의도적으로 유지(도달 불가).
- 카드 상세: "부담돼요" 재생성 버튼을 `isDateModeEnabled(card.mode ?? 'feeling')`로 게이트 — 숨긴 모드의 레거시 생성 경로 차단(사용자 결정). 반응 남기기는 유지.
- 8각도 finder + 검증 리뷰에서 CONFIRMED 3건(더블탭 중복 push, PRIMARY 하드코딩 desync, 재생성 우회) 수정 완료.
- 승인된 트레이드오프: 기존 `bucket_list` 데이터는 복원 전까지 UI 접근 불가(DB 온전). `/mode-flow/feeling`·`bucketlist` 딥링크 잔존.

### 2. 마음 전하기(soft-message) 코드 삭제

- 삭제: `app/(tabs)/soft-message.tsx`, `app/soft-message/`, 탭바 항목, `lib/ai.ts`의 `generateSoftMessage`/`adjustSoftMessage`, `lib/prompt.ts`의 빌더/타입, analytics `soft_message_generated`, ko/en `softMessage` 섹션·`tabs.softMessage`, 전용 테스트 2개.
- **유지**: `soft_messages` 테이블, `generate-ai`의 `soft_message` action, `generateInviteMessage`, share/send·share/reaction·알림함 — 카드 제안 흐름이 같은 인프라 사용.

### 3. 홈 코스 카드 커플 이미지 + 정렬

- 단일 모드일 땐 가로 스크롤 대신 좌우 20px 동일한 전폭 카드.
- Unsplash 커플 사진(photo-1575390130709)을 2340×1020 크롭 → 1600px 리샘플로 `assets/images/couple-card.jpg` 번들. 카드 `overflow:hidden`으로 위쪽 모서리만 radius.
- **RN 버그**: `width:'100%' + aspectRatio` 조합이 무시되고 원본 고유 크기(1600×697pt)로 렌더 — 실기기에서 세로 2화면 확대 크롭으로 나타남. `SINGLE_MODE_IMAGE_HEIGHT = Math.round((SCREEN_W-40)/2.3)` 명시적 숫자 높이로 해결. 비율 변경은 `SINGLE_MODE_IMAGE_RATIO` 한 줄.
- 비율 비교 목업 아티팩트: https://claude.ai/code/artifact/bf4dc8d8-e556-422b-b5b2-64afb9de37da (1.65/2.3/2.8/3.3).

### 검증

- 전체 81 suites / 669 tests, `npm run validate`(tsc) 매 단계 통과. 신규 `__tests__/mvp-mode-visibility.test.ts`(19 tests) + `dateModes.test.ts` 확장.
- 실기기: 이미지 세로 버그는 사용자 스크린샷으로 확인 후 수정 — **명시적 높이 수정본은 아직 실기기 미확인(Xcode Run 필요)**.

### 다음 세션 참고

- 실기기 확인: 홈 카드 이미지 152pt 높이, 모드 탭 직행/뒤로가기, 후보 FAB, 탭바 4개.
- 이미지 비율 취향 조정 시 `SINGLE_MODE_IMAGE_RATIO`(현재 2.3)만 변경. 크롭 소스는 원본 URL로 재크롭 가능.
- 기존 백로그 유지: `generate-ai` 502 조사, 스텝 추가 간헐 실패(addVerifiedStep 전체 스텝 핀), 방문 확인 트리거, 장소 실사진.

---

## 2026-07-17 세션 AS — 영어 로컬라이제이션 버그 + 커플 이중언어 카드 + UI 폴리시

> 사용자가 보고한 3가지 UX 이슈(영어 모드 로컬라이제이션 안 됨, 일부 화면 뒤로가기 버튼 없음, 커플 언어 불일치 시 카드가 상대 언어로 안 보임)를 TDD로 수정하고 Supabase에 적용. 이어서 코스 결과 화면 UI 폴리시(하단 버튼 대칭, 교체 후보 모달화, 로케일 카피 정정) 진행.

### 조사 결과 (Explore 3건 병렬)

- 뒤로가기 버튼: 전 화면 중 `app/settings.tsx`(마이페이지)만 `BackBar` 없이 push되는 화면이었음. 나머지 미표시 화면(`generating.tsx`, `onboarding/connected.tsx`)은 의도적.
- 장소 자동완성/검색은 전부 Kakao Local API이며 language 파라미터 자체가 없음 — 장소명·주소는 구조적으로 항상 한국어. AI가 생성하는 카드 텍스트(제목/요약/추천이유)만 언어 분기 가능.
- 확정된 `date_cards`는 커플 둘 다 RLS로 읽을 수 있는 유일한 테이블인데, 텍스트가 생성 시점 요청자 언어 하나로만 저장되어 파트너가 다른 언어 모드면 그대로 안 맞는 언어로 보임.

### 수정 (TDD, 6단계)

| 대상 | 내용 |
|---|---|
| `app/settings.tsx` | `BackBar largeTouchTarget` 추가 |
| `app/(tabs)/candidates.tsx` | 버킷 확정 카드 생성 시 `'ko'` 하드코딩 제거 → `useI18n().language` 사용 |
| `shared/recommendation/schemas.ts` | `recommendDateCardSchema`에 optional `i18n: { ko, en }` 블록 추가(하위호환) |
| `supabase/functions/_shared/recommendation-course-selection.ts` | `buildCardTexts()`로 카드 제목/요약/추천이유를 ko·en 동시 생성, top-level은 요청 언어 유지(레거시 리더 호환) |
| `supabase/migrations/20260717010000_date_cards_content_i18n.sql` | `date_cards.content_i18n` jsonb 컬럼 추가 + `apply_recommendation_session_mutation`의 confirm 분기가 `v_card -> 'i18n'`을 함께 저장하도록 재정의 |
| `lib/card-i18n.ts` (신규) | `localizeCardContent()` — `content_i18n`에서 뷰어 언어 텍스트를 오버레이, 컬럼 없거나 malformed면 원본 폴백 |
| `app/(tabs)/candidates.tsx`, `app/card/[id].tsx`, `app/share/send.tsx`, `app/share/mutual.tsx` | `content_i18n` 조회 + `localizeCardContent` 적용 |

### 배포

- 마이그레이션(컬럼 추가 + RPC 재정의)을 linked Supabase(`wqjguifsmtblgrhdfnji`)에 순서대로 적용(컬럼 먼저 → RPC), 원격 SQL로 반영 확인.
- `recommend-date`, `replacement-candidates` Edge Function 재배포 완료.
- 배포 순서 주의점(리뷰에서 확인): 마이그레이션이 앱 빌드보다 먼저 적용되어야 함(새 빌드가 `content_i18n`을 select하므로) — 이번엔 순서 지켜 적용함.

### UI 폴리시 (후속 요청, TDD)

- 코스 결과 화면(`course-result.tsx`) 하단 3버튼(Regenerate/Add place/Confirm)이 영어 라벨 길이에 따라 비대칭·오버플로 나던 문제 — 전부 `flex: 1` 균등 분할 + 좌우 패딩 동일 + 라벨 중앙정렬로 수정.
- "Replacement options"가 타임라인 아래 인라인 패널이던 것을 `StepActionSheet`와 동일한 패턴의 바텀시트 모달로 교체(어두운 백드롭 탭-투-클로즈, 기존 X 버튼 컴포넌트를 시트 우상단에 재사용, 최대 높이 75%).
- Confirm 버튼 체크 아이콘 제거, 영어 라벨 "Confirm course" → "Confirm"(한국어 "코스 확정"은 유지).
- 코스 만들기 화면(`course.tsx`)의 글자수 카운터와 "Build a course" 버튼이 붙어있던 간격 문제 — `generateButton`에 `marginTop: SP.xxl` 추가.
- 로케일 카피 정정: `course.moods.options.novel`의 영어 라벨이 "Novel"(명사로 오독 소지) → "Unique"(의미 오역, 사용자 지적으로 되돌림) → 최종 **"Different"**(원 의미 "색다른" 유지 + 명사 오독 없음).

### 검증

- 전체 81→82 suites, 655 tests, `npm run validate`(tsc) 매 단계 통과.
- 신규 테스트: `settings-back-button`, `candidates-language-propagation`, `recommendation-card-i18n`, `dateCardsContentI18nMigration`, `card-content-i18n`, `card-screens-localization`, `course-result-ui-polish`, `course-screen-generate-button-spacing`.
- code-reviewer 서브에이전트 리뷰(마이그레이션 diff, i18n 전달 경로, strict 스키마 호환, RLS, 배포 순서) — 버그 없음, 배포 순서 주의만 확인 후 반영.

### 남은 제약 / 다음 세션 참고

- 장소명·주소는 Kakao Local API 한계로 계속 한국어 고정(승인된 범위). 영어 모드에서도 "서울숲 date course"처럼 장소명만 한글.
- 기존에 이미 확정된 `date_cards`는 `content_i18n`이 없어 생성 당시 언어로만 남음 — 새로 확정하는 카드부터 양쪽 언어 저장.
- Xcode 재빌드로 실기기 확인 필요(JS 변경만이라 Run만 다시 하면 됨. 아직 사용자 실기기 확인 전).
