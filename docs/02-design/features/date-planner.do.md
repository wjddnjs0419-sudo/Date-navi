# date-planner - 구현 기록

> 작성일: 2026-05-20 | 단계: Do
> 참조 설계: `docs/02-design/features/date-planner.design.md`

---

## 1. 구현 범위

이번 구현은 실제 `supanova` 백엔드 연결 전에도 Date Planner의 핵심 사용자 흐름을 브라우저에서 확인할 수 있는 MVP를 목표로 한다.

구현한 범위:

- Next.js App Router 기반 앱 골격.
- `Design.md` 기반 디자인 토큰과 전역 스타일.
- 로컬 mock 백엔드 어댑터.
- 로그인/회원가입 mock 흐름.
- 커플 코드 생성 및 연결 mock 흐름.
- 데이트 제안 목록, 상태 필터, 상세 보기.
- 제안 작성, 옵션 추가/삭제, 입력 검증.
- AI 추천 조건 입력 및 로컬 추천 초안 생성.
- 옵션 선택, 선호도 변경, 댓글, 수정 요청.
- 수락/거절/보류 상태 변경.
- 수락된 제안의 일정 목록형 캘린더 표시.

## 2. 주요 파일

| 파일 | 역할 |
|------|------|
| `package.json` | Next.js/React/TypeScript 실행 스크립트와 의존성 |
| `src/app/layout.tsx` | 앱 HTML 레이아웃과 메타데이터 |
| `src/app/page.tsx` | Date Planner 앱 진입점 |
| `src/app/globals.css` | `Design.md` 기반 전역 스타일 |
| `src/components/ui/design-tokens.ts` | 디자인 토큰 상수 |
| `src/types/date-planner.ts` | 도메인 타입과 라벨 |
| `src/lib/backend/types.ts` | 백엔드 어댑터 인터페이스 |
| `src/lib/backend/mock-client.ts` | 로컬스토리지 기반 mock 백엔드 |
| `src/lib/ai/google-ai-studio.ts` | Google AI Studio API 호출 및 fallback 함수 초안 |
| `src/lib/validation/date-planner.ts` | 제안/댓글 입력 검증 |
| `src/features/date-planner/date-planner-app.tsx` | 주요 Date Planner UI와 상호작용 |

## 3. 백엔드 전략

설계 문서의 `supanova`는 정확한 SDK/API 확인 전이므로, 구현에서는 `BackendClient` 인터페이스를 먼저 만들고 `mock-client`를 연결했다.

나중에 실제 백엔드를 연결할 때는 다음 파일을 추가하거나 교체한다.

- `src/lib/backend/supanova-client.ts`
- `src/lib/backend/client.ts`

UI는 `BackendClient` 인터페이스를 기준으로 작성되어 있어 실제 백엔드 연결 시 변경 범위를 줄일 수 있다.

## 4. AI 추천 전략

`GOOGLE_AI_STUDIO_API_KEY`가 있으면 서버 측 함수인 `generateDateOptions`를 통해 Google AI Studio API를 호출할 수 있도록 초안을 만들었다. 현재 브라우저 UI에서는 키 노출을 피하기 위해 로컬 추천 초안을 사용한다.

다음 구현에서는 API Route를 추가해 클라이언트가 직접 키를 알지 못하도록 연결한다.

## 5. 남은 작업

- `supanova` 실제 서비스명과 SDK/API 확인.
- 실제 인증, DB, 권한 규칙 연결.
- Google AI Studio API Route 추가.
- 실시간 구독 기능 연결.
- 라우트별 페이지 분리.
- 테스트 코드 추가.
- `$pdca analyze date-planner`로 설계 대비 구현 차이 분석.

