# UI 전면 교체 — 병렬 실행 설계

> 작성 2026-07-21 (세션 BE 브레인스토밍). 상태: 승인됨.
> 목표: `UI RENEW/` 목업 50화면을 기준으로 앱 전 화면 UI를 교체하되, **여러 Claude Code 세션을 병렬로** 돌려 완성한다.
> 로직(Supabase/AI/추천 파이프라인)은 회귀 없이 유지. 이 작업은 **비주얼/레이아웃/문구 교체**에 한정한다.

---

## 1. 원칙 & 범위

- **목업 = 절대 진실.** 각 라우트를 대응 목업 PNG에 **1:1** 참조한다(§6 매핑 테이블). 세션은 화면을 만들 때 반드시 해당 PNG를 `Read`로 열어 대조한다.
- **"이모지·원색 색깔 뱃지 금지" 하드룰 폐기.** 목업의 컬러 카테고리 핀(식사=주황·카페=파랑·산책=초록)을 그대로 채택한다. Phase 0에서 `Design.md`와 메모리 `design-no-emoji-no-color-badge`를 개정한다.
- **토큰 시스템 유지.** 핑크 단일 액센트·웜 뉴트럴 베이스·둥근 형태 언어(`constants/colors.ts`·`theme.ts`)는 목업과 이미 일치. 목업 델타(신규 색·워드마크·일러스트)만 추가한다.
- **MVP 숨김 화면 제외.** `feeling`·`bucketlist`·`result`·모드선택은 목업이 없고 MVP에서 비활성 → 이번 교체 범위 밖(코드 유지, 도달 불가).
- **일러스트 asset 8장** = `assets/illustrations/`(세션 BD 생성). 텍스트는 asset에 굽지 않음(i18n) — 워드마크/라벨은 코드.

## 2. 아키텍처 — 3 Phase

```
Phase 0 (직렬, 이 세션)  →  Phase 1 (병렬 N세션)  →  Phase 2 (직렬, 통합)
  공용 기반 → main            화면 클러스터 6개          병합·검증·실기기
```

병렬의 최대 리스크는 **공유 파일 동시 편집**(`components/ui.tsx`, `locales/*.json`)이다. Phase 0에서 이 공유면을 전부 못박고 동결한 뒤에야 팬아웃한다. 그래서 기반이 **직렬 선행**이다.

---

## 3. Phase 0 — 공용 기반 (이 세션, 직렬, → main 병합)

팬아웃 전 한 번만 수행. 완료 후 병렬 세션은 이 산출물을 **read-only 기준선**으로 삼는다.

### 3.1 디자인 토큰 (`constants/colors.ts`·`theme.ts`)
- 목업 대조로 델타 확인. 신규 토큰:
  - 카테고리 핀 색: `catMeal`(주황)·`catCafe`(파랑)·`catWalk`(초록) 등 목업 실측값. (룰 폐기로 원색 허용.)
  - 워드마크 색(핑크 계열 기존 `pink` 재사용 가능 여부 확인).
- 매직 헥스 금지 — 전부 `C.*` 토큰으로.

### 3.2 신규 공용 컴포넌트 (`components/ui.tsx` 또는 신규 파일)
목업 전반에 반복 등장하는 요소를 프리미티브로 승격:
- `Wordmark` — "Date·navi" 로고 레터링. (구현 결정: 이미지 asset vs 커스텀 폰트 vs 스타일드 텍스트 — Phase 0 착수 시 목업 확대 후 확정.)
- `Illustration` — 8개 asset을 이름으로 렌더(사이징·aspectRatio 처리). RN `aspectRatio` 버그(RESULT 세션 AT) 회피: 명시적 높이 지원.
- `CoursePin` / `StepPin` — 컬러 카테고리 핀(식사/카페/산책 + generic).
- `CourseMapPreview` — 홈의 3스텝 점선 트레일 미리보기(번호 원 + 핀 + 라벨).
- `DdayBadge` — D-2/D-5 핑크 뱃지.
- `MetaChipRow` — 위치/시간/도보 아웃라인 칩 행.
- `PlanListRow` — 사진 썸네일 + 제목 + 날짜 + D-day(홈·plans 공용).

### 3.3 공용 모달/로딩 리스타일
전 화면 공유 프리미티브라 Phase 0에서 처리(클러스터 아님):
- `SuccessModal` ← P2/15
- `pickers` (`components/pickers.tsx`) ← P2/16
- `StepActionSheet` (course-result 내) ← P2/17 *(course-flow 클러스터와 경계 협의: 컴포넌트 정의만 Phase 0, 사용은 클러스터 4)*
- `GeneratingView` ← P2/01

### 3.4 i18n 분할 (병렬 충돌 제거의 핵심)
- 현재: `locales/ko.json`·`en.json` 단일 파일 import (`lib/i18n.ts`).
- 변경: `locales/ko/<namespace>.json` 조각으로 분리 + 로더가 deep-merge해 `ko`/`en` 리소스 구성.
- 기존 최상위 네임스페이스: `language, common, tabs, settings, auth, home, nickname, coupleConnect, preferences, mode, feeling, course, result, candidates, memories, card, confirm, review, notifications, location, pickers, modeFlow, legal, onboarding, splash, share, account, plans`.
- `withLegacyHelpers`의 경로 참조(settings.daysWith, home.greeting 등)는 merge 후 동일 shape라 무영향 — 회귀 테스트로 고정.
- **클러스터별 조각 소유권 배정**(§5) → 각 세션이 자기 조각 파일만 편집 = i18n 충돌 0.

### 3.5 문서·메모리 갱신
- `Design.md`: "색깔 금지" 규칙 폐기, 컬러 핀·일러스트·워드마크 섹션 추가.
- 메모리 `design-no-emoji-no-color-badge`: 폐기/개정 반영.

### 3.6 완료 기준
- `npm run validate`(tsc) 클린 + 기존 jest 전부 통과(i18n 분할 회귀 없음).
- main 커밋 = 병렬 기준선. **이 커밋 해시를 모든 병렬 세션 패킷에 명시.**

---

## 4. Phase 1 — 화면 클러스터 병렬 (N worktree 세션)

각 세션 = Phase 0 기준선 커밋에서 worktree 분기. **disjoint 파일만** 편집.

### 4.1 세션 공통 규칙 (모든 패킷에 복사)
1. 화면당 대응 목업 PNG를 `Read`로 열어 1:1 대조.
2. **TDD**(superpowers:test-driven-development): 화면 렌더/문구/상태 계약 테스트 먼저.
3. **StyleSeed 게이트**: 화면 완성 후 `ss-score` ≥80(미달 시 fix-first 재점수) + `styleseed-design-review`(AI-generic 텔 체크).
4. **i18n 동기**: 문구는 자기 소유 `locales/ko/*`·`en/*` 조각에 ko/en 동시.
5. **Phase 0 컴포넌트 재사용.** 새 공용 프리미티브 필요 시 → 화면-로컬로 만들고 `// PHASE0-BACKMERGE` 주석 + 패킷 복귀 노트에 기록(Phase 2에서 승격 검토).
6. **금지**: `components/ui.tsx`·`constants/*`·타 클러스터 파일·`lib/*` 로직 편집. 순수 화면 레이어만.
7. 완료: 클러스터 파일 `tsc` 클린, 목업 일치, 게이트 통과, 브랜치 커밋.

### 4.2 클러스터 분할 (6묶음)

| # | 클러스터 | worktree/브랜치 | 화면 수 |
|---|---|---|---|
| 1 | auth+splash | `ui/auth` | 2 |
| 2 | onboarding | `ui/onboarding` | 9 |
| 3 | tabs+plans | `ui/tabs` | 5 |
| 4 | course-flow | `ui/course` | 4 |
| 5 | card+memory | `ui/card` | 7 |
| 6 | share+account+legal | `ui/share-account` | 9 |

*세션 수는 조정 가능 — 6은 파일 disjoint를 보장하는 자연 경계. 더 잘게 쪼개려면 2(onboarding)와 6을 분할.*

---

## 5. 공유파일 충돌 전략

| 공유면 | 전략 |
|---|---|
| `components/ui.tsx` | Phase 0 후 **동결**. 병렬 세션 read-only. 신규 프리미티브는 화면-로컬 + 백머지 플래그. |
| `constants/colors.ts`·`theme.ts` | Phase 0 후 동결. read-only. |
| `locales/*` | Phase 0 분할 → 클러스터별 조각 소유. 충돌 0. |
| 화면 파일 | 클러스터 disjoint. 물리적으로 겹치지 않음. |
| worktree | 세션별 독립 워킹트리로 물리 격리. |

### i18n 조각 소유권 (Phase 0에서 확정)
- auth: `auth`, `splash`
- onboarding: `onboarding`, `nickname`, `coupleConnect`, `preferences`
- tabs: `home`, `tabs`, `candidates`, `memories`, `plans`
- course: `course`, `modeFlow`, `location`
- card: `card`, `confirm`, `review`
- share-account: `share`, `account`, `settings`, `notifications`, `legal`
- 공용(`common`, `pickers`, `language`): Phase 0 소유, 병렬 세션 read-only.

---

## 6. 목업 ↔ 라우트 1:1 매핑

경로 접두어: 목업 = `UI RENEW/<folder>/`, 라우트 = `app/`.
폴더 약칭: **P0**=P0_UPDATED, **P1**=P1_INDIVIDUAL, **P2**=P2_INDIVIDUAL, **M**=MISSING_9, **CB**=CONNECT_BOARD_SPLIT.

### 클러스터 1 — auth+splash
| 라우트 | 목업 |
|---|---|
| `(auth)/index.tsx` | P0/01_login.png |
| `index.tsx` (진입 스플래시) | CB/07_loading_splash.png |

### 클러스터 2 — onboarding
| 라우트 | 목업 |
|---|---|
| `onboarding/nickname.tsx` | P1/01_onboarding_nickname.png |
| `onboarding/photo.tsx` | M/01_onboarding_photo.png |
| `onboarding/anniversary.tsx` | M/02_onboarding_anniversary.png |
| `onboarding/type.tsx` | M/03_onboarding_type.png |
| `onboarding/couple-choice.tsx` | M/04_onboarding_couple_connect_manage.png |
| `onboarding/couple-connect.tsx` | CB/01_couple_connect_code.png, CB/02_enter_code.png, CB/04_enter_code_error.png, P1/02_onboarding_couple_connect.png |
| `onboarding/connected.tsx` | CB/05_connect_success.png, M/05_onboarding_connected.png |
| `onboarding/preferences.tsx` | P1/03_onboarding_preferences.png |

### 클러스터 3 — tabs+plans
| 라우트 | 목업 |
|---|---|
| `(tabs)/index.tsx` (홈) | P0/02_home.png |
| `(tabs)/candidates.tsx` | P0/06_candidates.png, P1/04_candidates.png |
| `(tabs)/memories.tsx` | P0/08_memories.png, P1/06_memories.png |
| `plans/index.tsx` | P0/07_date_plans.png, P1/05_date_plans.png |
| `(tabs)/mode.tsx` | (MVP 숨김 — 탭바만 목업 P0/02 하단 참조, 최소 정리) |

### 클러스터 4 — course-flow
| 라우트 | 목업 |
|---|---|
| `mode-flow/course.tsx` | P0/03_course_create.png |
| `mode-flow/course-result.tsx` | P0/04_course_result_detail.png, P0/05_course_result_editable.png, P1/07_course_result.png |
| `mode-flow/place-search.tsx` | P2/02_place_search.png |
| `mode-flow/place-detail.tsx` | P2/03_place_detail.png |
| `mode-flow/generating.tsx` | P2/01_generating.png *(GeneratingView는 Phase 0 소유 — 화면은 하네스만)* |

### 클러스터 5 — card+memory
| 라우트 | 목업 |
|---|---|
| `card/[id].tsx` | P1/08_candidate_detail.png |
| `card/confirm.tsx` | M/06_card_confirm.png |
| `card/review.tsx` | P1/09_review.png |
| `card/edit/[id].tsx` | P2/05_card_edit_confirm.png |
| `card/memory/new.tsx` | M/07_card_memory_new.png |
| `card/memory/[id].tsx` | M/08_card_memory_detail.png |
| `card/memory/edit/[id].tsx` | M/09_card_memory_edit.png |

### 클러스터 6 — share+account+legal
| 라우트 | 목업 |
|---|---|
| `share/send.tsx` | P2/06_share_send.png |
| `share/reaction.tsx` | P2/07_share_reaction.png |
| `share/mutual.tsx` | P2/08_mutual_confirmed.png, P1/10_share.png, P2/04_candidate_agreement.png *(합의 화면 귀속은 목업 대조로 확정)* |
| `settings.tsx` | P2/09_settings.png |
| `account/notifications.tsx` | P2/10_notifications.png |
| `account/edit-profile.tsx` | P2/11_profile_edit.png |
| `account/delete-account.tsx` | P2/12_account_delete.png |
| `legal/terms.tsx` | P2/13_terms.png |
| `legal/privacy.tsx` | P2/14_privacy.png |

### Phase 0 소유 공용 목업
| 컴포넌트 | 목업 |
|---|---|
| `SuccessModal` | P2/15_success_modal.png |
| `pickers` | P2/16_picker_modal.png |
| `StepActionSheet` | P2/17_step_action_sheet.png |
| `GeneratingView` | P2/01_generating.png |
| 공유 시트 | CB/06_share_sheet_expanded.png |

---

## 7. Phase 2 — 통합 (직렬)

1. worktree 순차 병합: auth → onboarding → tabs → course → card → share-account. (파일 disjoint + i18n 조각 소유라 충돌 근접 0.)
2. `// PHASE0-BACKMERGE` 플래그 수집 → 중복/공용 프리미티브 승격 검토.
3. 전체 `npm run validate`(tsc) + `npx jest`.
4. StyleSeed 최종 **시각** 게이트: `ss-verify`로 핵심 플로우(로그인→온보딩→홈→코스생성→결과→공유) 렌더 스크린샷 점수. (스크린샷 도구 = 메모리 `screenshot-mode-tooling` 재사용.)
5. 실기기 확인(사용자, Xcode Release Run) — JS 변경만이라 prebuild 불필요.

---

## 8. 세션별 작업 패킷 형식 (클러스터당 1개, Phase 1 착수 시 생성)

각 패킷은 세션에 그대로 붙여넣을 수 있는 자기완결 지시서:
```
# 패킷: <클러스터명>
- 기준선: main 커밋 <Phase0 해시>에서 worktree `ui/<name>` 분기
- 화면 목록: [라우트 파일 ↔ 목업 PNG 절대경로] + 현행 화면 한 줄 노트
- 소유 i18n 조각: locales/ko/<ns>.json · en/<ns>.json (목록)
- 공통 규칙: §4.1 전문 복사 (TDD·StyleSeed≥80·목업 1:1·재사용·타파일 금지)
- 완료 기준: tsc 클린 · 목업 일치 · 게이트 통과 · 브랜치 커밋 · 백머지 플래그 보고
```

## 9. 테스트/검증 전략
- **화면 계약 테스트**(TDD): 렌더·핵심 문구 키·상태 분기(로딩/에러/빈). 로직은 이미 커버됨 — UI 레이어만 신규.
- **StyleSeed 게이트**: 화면당 `ss-score`≥80 + `design-review`. Phase 2에서 `ss-verify` 시각 게이트.
- **i18n 회귀**: Phase 0 분할 후 기존 키 접근·legacy helper 동작 테스트.
- **회귀 금지**: `lib/*`·`shared/*`·`supabase/*` 무변경. 화면이 부르는 데이터/props 계약 유지.

## 10. 미결 / Phase 0 착수 시 확정
- `Wordmark` 구현 방식(이미지 vs 폰트 vs 텍스트).
- 카테고리 핀 정확한 색값(목업 실측).
- `StepActionSheet`의 Phase 0/클러스터4 경계.
- P2/04_candidate_agreement 귀속 화면(mutual vs reaction) — 목업 대조로 확정.
- 세션 병렬 개수 최종(6 유지 vs onboarding/share 추가 분할).
