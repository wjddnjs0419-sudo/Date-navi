# Date Navi (데이트 나비)

커플이 "오늘 뭐 하지?"를 함께 정하는 iPhone 앱. AI가 위치 기반 실제 장소로 데이트 코스를 추천하고, 커플이 반응을 주고받으며 후보를 고르고, 다녀온 데이트를 별점 리뷰로 추억에 남긴다.

**현재 상태**: EAS production 빌드 → TestFlight 배포 완료, App Store 심사 제출 준비 중 (E2E 실기기 검증 진행 중 — [docs/e2e-release-checklist.md](docs/e2e-release-checklist.md)).

## 🧱 스택

| 영역 | 구성 |
|---|---|
| 앱 | **React Native + Expo SDK 54** (expo-router, dev-client) · iPhone 전용 · i18n 한/영([locales/](locales/)) |
| 로그인 | 카카오 · Google · Apple (모두 네이티브 SDK → **Expo Go 실행 불가**, dev build 필요) |
| 백엔드 | **Supabase** — DB(마이그레이션 40+) · Auth · Edge Functions 7개 (`recommend-date` `generate-ai` `place-search` `location-autocomplete` `replacement-candidates` `send-push` `delete-account`) |
| AI | **Anthropic Claude** (`claude-haiku-4-5`, `generate-ai` Edge Function에서 호출, 키는 Edge 시크릿) |
| 장소 데이터 | **카카오 로컬 API** (장소/맛집 검색, Edge 시크릿 `KAKAO_REST_API_KEY`) |
| 푸시 | Expo Notifications + APNs (`send-push`) |
| 웹 | [web/](web/) — **Next.js** 초대 링크 랜딩 + 동적 OG 이미지 + AASA(유니버설 링크), Vercel 배포(`date-navi.vercel.app`) |

> 앱 코드(Expo)·웹(Next.js)·기획 문서·Supabase 마이그레이션이 모두 **저장소 루트**에 함께 있다.

## 🧭 처음 오셨나요? (어디부터 볼지)
- **이 앱을 처음 돌려본다면 → 아래 [빠른 시작](#-빠른-시작-로컬)**
- **개발 규칙·보안·코딩 컨벤션 → [AGENTS.md](AGENTS.md)**
- **지금까지 만든 기능·남은 일 → [PLAN.md](PLAN.md)** / **직전 작업 기록 → [RESULT.md](RESULT.md)**
- **AI 에이전트(Claude)로 작업한다면 → [CLAUDE.md](CLAUDE.md)** (세션 시작 라우터)

## 🚀 빠른 시작 (로컬)
> ⚠️ 카카오/구글/애플 로그인이 네이티브 모듈이라 **Expo Go로는 못 돌린다.** 시뮬레이터에 dev build를 한 번 설치하고 시작한다.
> 사전 준비물: **Docker Desktop**, **Node.js**, **Xcode**(+iOS 시뮬레이터), **Supabase CLI**(`brew install supabase/tap/supabase`).

```bash
# 1) 앱 라이브러리(의존성) 설치 (루트에서)
npm install

# 2) 비밀값 쪽지(.env) 만들기 — 템플릿 복사 후, 🔴 실제 키는 관리자에게 받아 채움
cp .env.example .env

# 3) 내 컴퓨터 안에 '연습용 서버'(로컬 Supabase) 켜기 — 루트에서 실행
#    Docker로 DB·로그인·Edge Function을 한꺼번에 띄움 (포트 55321~)
supabase start

# 4) 로컬 스택에 연결할 .env.local 만들기
#    - iOS 시뮬레이터 기준: EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321
#    - ANON 키는 `supabase status` 의 Publishable 키(sb_publishable_...)
#    (GOOGLE 클라이언트 ID는 .env 에서 자동 상속되므로 안 넣어도 됨)

# 5) dev build를 시뮬레이터에 설치 + 실행 (처음 한 번, 몇 분 걸림)
npx expo run:ios
```

- 이후에는 `npx expo start`(Metro)만 켜고 시뮬레이터의 Date Navi 앱을 열면 된다. 네이티브 의존성이 바뀐 경우에만 `npx expo run:ios` 재실행.
- **실기기(iPhone)** 확인은 Xcode에서 **Release 빌드로 Run** (Metro 불필요). JS만 바꿨어도 Run 다시, 네이티브 변경은 prebuild 후 Run.
- 로컬 DB는 **비어 있음**(스키마만, 데이터 0건) → 앱에서 **회원가입부터** 새로 시작.

## 📅 매일 작업 시작 (요약 순서)
> 위 "빠른 시작"은 **처음 한 번**. 익숙해지면 매번 이 순서면 충분.

1. **Docker Desktop 실행** — 트레이 아이콘이 켜질 때까지 대기. (안 켜면 2번이 실패)
2. **`supabase start`** — 루트에서. 내 컴퓨터 위 '연습용 서버' 켜기.
3. **`npx expo start`** (루트에서) — Metro 띄우기.
4. **시뮬레이터에서 Date Navi 앱 실행** — dev build가 Metro에 자동 연결.
5. **Claude Code 켜고 `ㅎㅇ` 입력** — AI 비서가 현재 상황 요약 + 다음 할 일을 한국어로 안내.

**작업 끝낼 때**: 터미널에서 `Ctrl+C`로 Metro 중지 → 루트에서 `supabase stop`. *Docker Desktop은 꺼도 됨.*

## ✅ 테스트 · 검증

```bash
npm test            # Jest — 185+ suites / 1188+ tests
npm run validate    # tsc --noEmit (코드 바꾼 뒤 필수)
```

## 🔀 로컬 ↔ 원격 전환
환경변수 파일로 어디에 붙을지 정한다. Expo는 `.env.local`을 `.env`보다 **우선** 로드한다.

| 붙는 곳 | 방법 |
|---|---|
| **로컬 스택** | `.env.local` 존재 → 로컬 Supabase(55321) 사용 |
| **원격 프로젝트** | `.env.local` 삭제(또는 `.env.local.off`로 rename) 후 `.env`만 사용 |

전환 후에는 항상 `npx expo start --clear`로 캐시를 비우고 재시작. (`.env*.local`은 `.gitignore`로 git에서 제외됨.)

- 서버 쪽 비밀키(Anthropic·카카오 REST·APNs)는 클라이언트 `.env`가 아니라 **Supabase Edge Function 시크릿**으로만 설정한다. 상세는 [.env.example](.env.example) 주석 참조.

## 🗂 DB 스키마 바꿀 때 (마이그레이션)
> ⚠️ **MCP `apply_migration`으로 원격에 직접 적용하지 말 것.** 로컬 파일과 원격 히스토리가 갈라져 파이프라인이 깨진다. 항상 아래 순서로.

```bash
supabase migration new <이름>   # 로컬에 마이그레이션 파일 생성 → SQL 작성
supabase db reset               # 로컬 DB에 전체 재적용해서 테스트
supabase db push                # 검증되면 원격에 반영
```

- 로컬 스택 포트는 **55320 대역**으로 분리되어 있어, 다른 Supabase 프로젝트(54320 대역)와 **동시에** `supabase start` 가능.
- Edge Function이 공유하는 스키마(zod 계약)를 바꿨다면 **관련 함수 전체 재배포** — 번들 스큐로 404 난다.

## 🌐 web/ — 초대 링크 랜딩 (Next.js)
커플 초대 공유 링크(`https://date-navi.vercel.app/invite?...`)의 랜딩 페이지. 카톡 프리뷰용 동적 OG 이미지(`/api/og`), 앱 설치자는 유니버설 링크(AASA)로 앱 직행, 미설치자는 폴백 안내.

```bash
cd web && npm install
npm run dev      # 로컬 개발
npm run build    # 배포 전 검증 (배포는 Vercel)
```

## 📚 문서 지도
| 문서 | 내용 |
|---|---|
| [README.md](README.md) | 📍 지금 이 문서 — 서버 켜고 작업하는 기본 흐름 |
| [CLAUDE.md](CLAUDE.md) / [AGENTS.md](AGENTS.md) | AI 에이전트 라우터 · 개발 규칙·보안·코딩 컨벤션 |
| [PLAN.md](PLAN.md) | 활성/예정 작업 (완료 항목 축약) |
| [RESULT.md](RESULT.md) | 직전 세션 작업 상세 기록 |
| [Design.md](Design.md) / [STYLESEED.md](STYLESEED.md) | 디자인 시스템·화면 설계 · StyleSeed 디자인 게이트 |
| [Super plan/](Super%20plan/) | 제품 기획·런칭 타임라인·MVP 기능 스펙 |
| [docs/](docs/) | 기획·분석·리포트·QA용 SQL |
| [docs/e2e-release-checklist.md](docs/e2e-release-checklist.md) | 출시 전 실기기 E2E 체크리스트 |
| [docs/app-store-review-pack.md](docs/app-store-review-pack.md) | App Store 심사 제출 준비(라벨·데모 계정·Review note) |
