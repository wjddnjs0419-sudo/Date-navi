# AGENTS.md — Date Planner Agent Guide

AI 에이전트(Claude, Codex 등)가 이 저장소에서 작업할 때 따라야 할 워크플로우와 아키텍처 문서.

---

## 필수 워크플로우: Plan-First Iterative Approach

모든 복잡한 태스크는 아래 순서를 반드시 따른다.

0. **세션 단축키**: 첫 메시지가 `ㅎㅇ`이면 `CLAUDE.md` → `PLAN.md` → `RESULT.md` 순으로 읽고 현재 상태를 요약한 뒤 작업 지시를 기다린다. `종료`는 PLAN/RESULT 최신화 + validate 기록 점검.
1. **계획 수립**: 새 태스크는 `PLAN.md`의 `## Pending Approval` 아래에 추가. 변경 파일·전략 문서화.
2. **승인 대기**: 사용자가 `PLAN.md`를 검토하도록 멈춘다.
3. **반복 수정**: 피드백 반영 후 명시적 "구현" 승인까지 반복.
4. **외과적 실행**: 최종 PLAN.md 기준으로 서브태스크 하나씩 구현. 각 단계마다 루트에서 `npm run validate`.
5. **결과 보고**: 완료 후 변경 내용·기술 결정을 `RESULT.md`에 기록. 과거 기록은 `RESULT_ARCHIVE.md`로 이관.
6. **PLAN 정리**: 완료된 승인 계획은 `[Done]` 한 줄로 축약. `[Done]` 항목이 10개 초과하면 가장 오래된 항목부터 삭제.
7. **Zero-Human Validation Loop**: 루트에서 `npm run validate` 후 타입/린트 에러는 사용자 개입 없이 스스로 수정·재검증 반복.
8. **Ratchet**: 스스로 해결한 빌드/린트 오류는 아래 `## Anti-Patterns` 섹션에 1줄 추가.

---

## 커맨드

> 실제 앱은 Expo RN. 앱 코드·`package.json`은 **저장소 루트**에 있다. 모든 명령은 루트에서 실행한다.
> ⚠️ Expo는 자주 바뀐다 — 코드 작성 전 버전 문서(https://docs.expo.dev/) 확인.

```bash
npm install        # 최초 1회 / 의존성 변경 시
npm run validate   # tsc --noEmit               ← 변경 후 항상 실행
npm run typecheck  # tsc --noEmit (validate와 동일)
npm start          # expo start (개발 서버)
```

### 환경 변수 (`.env`, git 제외)

```
EXPO_PUBLIC_SUPABASE_URL=https://wqjguifsmtblgrhdfnji.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
EXPO_PUBLIC_GOOGLE_AI_STUDIO_API_KEY=...
```

### 백엔드 전환

| 모드 | 설정 | 저장소 |
|------|------|--------|
| Supabase | `NEXT_PUBLIC_BACKEND_PROVIDER=supabase` | Postgres DB |
| Mock | 위 줄 주석 처리 | localStorage (시드 데이터) |

Mock 시드 데이터 초기화: 프로필 탭 → "데모 초기화" 버튼 (mock 모드 전용)

---

## 아키텍처

**스택:** Next.js 15 (App Router) + React 19 + TypeScript + Supabase (Auth, Postgres, Realtime, RLS) + CSS Custom Properties

**경로 별칭:** `@` → `./src`

### 핵심 파일 맵

| 파일 | 역할 |
|------|------|
| `src/app/page.tsx` | 앱 진입점 — `DatePlannerApp` 마운트 |
| `src/app/globals.css` | 디자인 시스템 전체 — CSS 변수 + 컴포넌트 스타일 |
| `src/app/api/date-options/route.ts` | AI 후보 생성 API Route |
| `src/features/date-planner/date-planner-app.tsx` | **메인 컴포넌트** — 모든 뷰/상태/핸들러 |
| `src/features/date-planner/icons.tsx` | SVG 아이콘 컴포넌트 |
| `src/types/date-planner.ts` | 모든 타입 + 레이블 맵 |
| `src/lib/backend/client.ts` | 백엔드 클라이언트 팩토리 (mock/supabase 분기) |
| `src/lib/backend/mock-client.ts` | Mock 클라이언트 (localStorage) + 시드 데이터 |
| `src/lib/backend/supabase-client.ts` | Supabase 클라이언트 구현 |
| `src/lib/backend/types.ts` | `BackendClient` 인터페이스 |
| `src/lib/validation/date-planner.ts` | 폼 유효성 검사 |
| `src/lib/ai/google-ai-studio.ts` | Gemini API 호출 + fallback |
| `docs/supabase-schema.sql` | DB 스키마 전체 (마이그레이션 기준) |

### Supabase 데이터베이스 테이블

| 테이블 | 설명 |
|--------|------|
| `date_planner_profiles` | 사용자 프로필 (`user_id`, `display_name`, `couple_id`) |
| `date_planner_couples` | 커플 코드 (`code`, `owner_user_id`, `partner_user_id`, `status`) |
| `date_planner_proposals` | 데이트 제안 (`couple_id`, `title`, `proposed_date`, `status`, `selected_option_id`) |
| `date_planner_options` | 후보 옵션 (`proposal_id`, `place_name`, `address`, `estimated_cost`) |
| `date_planner_option_preferences` | 유저별 옵션 선호도 (`option_id`, `user_id`, `preference`) — PK: `(option_id, user_id)` |
| `date_planner_comments` | 옵션 댓글 (`option_id`, `author_user_id`, `type`, `content`) |

연결 프로젝트: `wqjguifsmtblgrhdfnji` (`Date-planner`, Northeast Asia, Seoul)

스키마 변경 시 `docs/supabase-schema.sql` 수정 후 Supabase SQL Editor에서 실행. 대시보드 직접 편집 금지.

### 상태 흐름

```
DatePlannerApp
├── useEffect → connectClient() → BackendClient (mock | supabase)
├── data: AppData | null  (profile + couple + proposals + options + comments)
├── activeView: "home" | "create" | "calendar" | "profile"
└── 모든 변경: client.xxx() → commit/loadAppData → setData({ ...client.dump() })
```

Realtime: `data.profile.coupleId` 변경 시 `client.realtime.subscribe()` 재구독.

### AI 후보 생성 흐름

```
handleGenerateAiOptions()
→ POST /api/date-options
→ google-ai-studio.ts → generateDateOptions()
→ Gemini 2.0 Flash (API key 있을 때) or createFallbackOptions() (없을 때)
→ setOptionDrafts(generated)
```

---

## 디자인 시스템

**철학:** Tinder iOS 온보딩 스타일 — 그라디언트 브랜드 컬러, 블랙 필 CTA, 깔끔한 화이트 배경.

### CSS 변수 (`:root` in `globals.css`)

| 변수 | 값 | 용도 |
|------|-----|------|
| `--gradient` | `linear-gradient(135deg, #fd297b, #ff655b, #ff9a4a)` | 브랜드 그라디언트 |
| `--primary` | `#fd297b` | 액센트 (칩, 인디케이터, active 상태) |
| `--cta` | `#111111` | Primary 버튼 배경 (블랙) |
| `--canvas` | `#ffffff` | 페이지 배경 |
| `--ink` | `#21242c` | 본문 텍스트 |
| `--surface-soft` | `#f7f7f7` | 카드/인풋 배경 |
| `--hairline-soft` | `#f0f0f0` | 미세 구분선 |
| `--bottom-nav-h` | `62px` | 하단 네비 높이 (모바일 패딩 계산용) |

### 버튼 규칙

- `primary-button`: `background: var(--cta)` (블랙), `border-radius: 9999px`, `min-height: 52px`
- `secondary-button`: 흰 배경, `1.5px` 테두리, 필 shape
- `danger-button`: 투명 배경, 빨간 텍스트, 필 shape
- 모바일 `decision-bar`에서 모든 버튼은 전체 너비 (`width: 100%`)

### 인풋 규칙

- `background: var(--surface-soft)`, `border: 0`, `border-radius: 10px`
- 포커스: `background: var(--surface-strong)`, `outline: none`

### 반응형 브레이크포인트

- `≤920px`: 하단 네비 표시, 2-컬럼 → 1-컬럼, mobile-back 버튼 표시
- `≤680px`: h1 28px, 폼 1-컬럼, decision-bar 세로 스택, 버튼 전체 너비

---

## 🚫 Anti-Patterns & Lessons Learned

- `.map(toOption)` 사용 금지 — array index가 두 번째 인자로 넘어가 타입 충돌 발생. 항상 `.map((row) => toOption(row))`로 래핑.
- `gemini-1.5-flash` 모델 사용 금지 — deprecated. `gemini-2.0-flash` 사용.
- 회원가입 폼에 mock 기본값(`"지우"`, `"jiwoo@example.com"`) pre-fill 금지 — Supabase 모드에서 실제 사용자 데이터처럼 혼동 유발.
- `isSupabaseMode` 무관하게 "로컬 mock 데이터" notice 출력 금지 — Supabase 모드에서는 초기 notice 빈 문자열로 시작.
- Supabase Kakao Provider Client ID에 REST API Key 넣지 말 것 — `@react-native-seoul/kakao-login`(네이티브 SDK)이 발급하는 idToken의 `aud`는 REST API Key가 아니라 Native App Key라 "Unacceptable audience" 에러 발생. 필드 이름은 "REST API Key"지만 실제로는 aud 검증용이므로 Native App Key를 넣어야 함.
- 온보딩/라우팅 게이트에서 FK 컬럼(`couple_id` 등) 존재 여부만으로 "완료됐다" 판단하지 말 것 — row는 생성됐지만 상대방 미연결(`status: 'waiting'`) 상태일 수 있음. 반드시 관련 테이블의 실제 상태 컬럼(`status`, `partner_user_id` 등)까지 확인.
- JSON 리소스에서 온 배열을 `.map()`할 때 `strings`가 느슨한 타입이면 콜백 인자 타입을 명시한다.
- `@supabase/supabase-js`의 `loadOtel()`(`dist/index.mjs`/`index.cjs`) 내 OpenTelemetry 지연 로딩용 dynamic import가 Hermes 파서 미지원 문법이라 Release/기기 빌드 시 `hermesc`에서 "Invalid expression encountered"로 실패함. `patches/@supabase+supabase-js+2.106.1.patch`(patch-package)로 `Promise.resolve(null)` 반환하도록 고쳐서 우회함 — `@opentelemetry/api` 미설치 상태라 기능 손실 없음.
- 프로젝트 폴더 경로에 공백이 있으면(`Date navi`) `expo-constants`의 `EXConstants` pod 스크립트(`bash -l -c "$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh"`)가 공백에서 인자가 잘려 빌드 실패함. 폴더명에 공백 넣지 말 것(`Date-navi`로 변경해 해결).
- `expo-notifications` 설치돼 있으면 `npx expo prebuild -p ios` 돌릴 때마다 `ios/DateNavi/DateNavi.entitlements`에 `aps-environment` 키가 자동으로 다시 생김 — 무료 Apple ID(Personal Team)는 Push Notifications capability 지원 안 해서 빌드 실패함. prebuild 이후 로컬 무료 계정 빌드 전에 매번 `plutil -remove aps-environment ios/DateNavi/DateNavi.entitlements` 실행해서 제거 필요 (유료 계정/실배포 시엔 다시 넣어야 함).
- 공유 타입(`KakaoPlace` 등)에 필수 필드를 추가하면 그 타입을 리터럴로 생성하는 **테스트 fixture**(`__tests__/*.test.ts`)가 tsc에서 깨진다 — 타입 필드 추가 시 리터럴 생성처(테스트 포함)를 함께 갱신할 것.
- MCP `deploy_edge_function`으로 Edge를 인라인 배포할 때 `files[].content`는 JSON 문자열이라 소스의 백슬래시(정규식 `\d`·`\.` 등)·이중따옴표가 이스케이프 오류/전사 실수를 유발한다. 배포 전 소스를 백슬래시·이중따옴표 0개로 만들 것(예: `\d`→`[0-9]`, `\.`→`[.]`, 문자열은 홑따옴표/백틱). 배포 후 `get_edge_function`으로 배포본과 디스크를 대조해 몰문자·누락 확인.
- Claude 구조화 출력 스키마에서 필드를 required에서 빼도 앱이 그 필드를 채워야 하면(예: `estimated_time/budget`을 앱이 `DURATION_MAP`/`BUDGET_MAP`으로 채움) Edge 스키마 변경과 앱 채우기 지점을 **같은 배포에서** 함께 바꿀 것 — 한쪽만 바꾸면 빈 문자열 카드가 저장된다.
