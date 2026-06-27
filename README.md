# DateMate (데이트메이트)

커플이 "오늘 뭐 하지?"를 함께 정하는 모바일 앱. 핵심 기능: AI 데이트 카드 추천 · 부담 없는 반응으로 후보 분류 · 내 마음 부드럽게 전하기 · 추억 기록.

스택: **React Native + Expo (SDK 54)** / Supabase(DB·Auth·Edge Functions) / Google AI Studio(Gemini, 카드·문장 생성).

> 앱 코드(Expo)·기획 문서·Supabase 마이그레이션이 모두 **저장소 루트**에 함께 있다.

## 🧭 처음 오셨나요? (어디부터 볼지)
- **이 앱을 처음 돌려본다면 → 아래 [빠른 시작](#-빠른-시작-로컬)** (위에서부터 한 줄씩 따라가면 됨)
- **개발 규칙·보안·코딩 컨벤션 → [AGENTS.md](AGENTS.md)**
- **지금까지 만든 기능·남은 일 → [PLAN.md](PLAN.md)** / **직전 작업 기록 → [RESULT.md](RESULT.md)**
- **AI 에이전트(Claude)로 작업한다면 → [CLAUDE.md](CLAUDE.md)** (세션 시작 라우터)

## 🚀 빠른 시작 (로컬)
> 위에서부터 **순서대로** 한 줄씩 실행. 각 명령이 무슨 일을 하는지 주석으로 적어둠.
> 사전 준비물: **Docker Desktop**, **Node.js**, **Supabase CLI**(`brew install supabase/tap/supabase`), 그리고 폰에 **Expo Go** 앱.

```bash
# 1) 앱 라이브러리(의존성) 설치 — 코드가 쓰는 외부 패키지를 내려받음 (루트에서)
npm install

# 2) 비밀값 쪽지(.env) 만들기 — 템플릿 복사 후, 🔴 실제 키는 관리자에게 받아 채움
cp .env.example .env

# 3) 내 컴퓨터 안에 '연습용 서버'(로컬 Supabase) 켜기 — 루트에서 실행
#    Docker로 DB·로그인·Edge Function을 한꺼번에 띄움 (포트 55321~)
supabase start

# 4) 로컬 스택에 연결할 .env.local 만들기 (실기기 Expo Go 기준)
#    - URL 은 내 맥의 LAN IP. 아래로 확인:  ipconfig getifaddr en0
#    - ANON 키는 `supabase status` 의 Publishable 키(sb_publishable_...)
#    예시 내용:
#      EXPO_PUBLIC_SUPABASE_URL=http://<맥-LAN-IP>:55321
#      EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xxxxx
#    (GOOGLE 키는 .env 에서 자동 상속되므로 안 넣어도 됨)

# 5) 개발 서버 실행 — 폰의 Expo Go로 QR을 찍으면 앱이 뜸 (루트에서)
npx expo start --clear
```

- 폰과 맥이 **같은 Wi-Fi**여야 함. QR이 안 잡히면 Expo Go에서 `exp://<맥-LAN-IP>:8081` 직접 입력.
- 로컬 DB는 **비어 있음**(스키마만, 데이터 0건) → 앱에서 **회원가입부터** 새로 시작.
- 코드 바꾼 뒤 검사: `npm run validate` (= `tsc --noEmit`, 루트에서 실행).

## 📅 매일 작업 시작 (요약 순서)
> 위 "빠른 시작"은 **처음 한 번**. 익숙해지면 매번 이 순서면 충분.

1. **Docker Desktop 실행** — 트레이 아이콘이 켜질 때까지 대기. (로컬 서버가 여기 위에서 돎 → 안 켜면 3번이 실패)
2. **`supabase start`** — 루트(`Codex_sample/`)에서. 내 컴퓨터 위 '연습용 서버' 켜기. *(처음 한 번은 몇 분 걸림)*
3. **`npx expo start --clear`** (루트에서) — 개발 서버 띄우기.
4. **Expo Go로 QR 스캔** — 폰에서 앱 실행.
5. **Claude Code 켜고 `ㅎㅇ` 입력** — AI 비서가 현재 상황 요약 + 다음 할 일을 한국어로 안내.

**작업 끝낼 때**: 터미널에서 `Ctrl+C`로 dev 중지 → 루트에서 `supabase stop`(연습용 서버 끄기). *Docker Desktop은 꺼도 됨.*

## 🔀 로컬 ↔ 원격 전환
환경변수 파일로 어디에 붙을지 정한다. Expo는 `.env.local`을 `.env`보다 **우선** 로드한다.

| 붙는 곳 | 방법 |
|---|---|
| **로컬 스택** | `.env.local` 존재 → 로컬 Supabase(55321) 사용 |
| **원격 프로젝트** | `.env.local` 삭제(또는 `.env.local.off`로 rename) 후 `.env`만 사용 |

전환 후에는 항상 `npx expo start --clear`로 캐시를 비우고 재시작. (`.env*.local`은 `.gitignore`로 git에서 제외됨.)

## 🗂 DB 스키마 바꿀 때 (마이그레이션)
> ⚠️ **MCP `apply_migration`으로 원격에 직접 적용하지 말 것.** 로컬 파일과 원격 히스토리가 갈라져 파이프라인이 깨진다. 항상 아래 순서로.

```bash
supabase migration new <이름>   # 로컬에 마이그레이션 파일 생성 → SQL 작성
supabase db reset               # 로컬 DB에 전체 재적용해서 테스트
supabase db push                # 검증되면 원격에 반영
```

- 로컬 스택 포트는 **55320 대역**으로 분리되어 있어, 다른 Supabase 프로젝트(54320 대역)와 **동시에** `supabase start` 가능.
- 자세한 절차는 [docs/](docs/) 및 [PLAN.md](PLAN.md) 참고.

## 📚 문서 지도
| 문서 | 내용 |
|---|---|
| [README.md](README.md) | 📍 지금 이 문서 — 서버 켜고 작업하는 기본 흐름 |
| [CLAUDE.md](CLAUDE.md) / [AGENTS.md](AGENTS.md) | AI 에이전트 라우터 · 개발 규칙·보안·코딩 컨벤션 |
| [PLAN.md](PLAN.md) | 활성/예정 작업 (완료 항목 축약) |
| [RESULT.md](RESULT.md) | 직전 세션 작업 상세 기록 |
| [Design.md](Design.md) | 디자인 시스템·화면 설계 |
| [Super plan/](Super%20plan/) | 제품 기획·런칭 타임라인·MVP 기능 스펙 |
| [docs/](docs/) | 기획·분석·리포트·QA용 SQL |
