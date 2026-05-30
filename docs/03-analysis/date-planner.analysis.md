# Gap Analysis: date-planner

> Date: 2026-05-20 | Design: docs/02-design/features/date-planner.design.md

---

## Match Rate: 88%

## Summary

이번 iteration에서 설계 대비 큰 누락이었던 제안 수정/삭제, 옵션 수정/삭제, Google AI Studio API Route, 입력 검증 보강, 설계상 주요 라우트 진입점, Supabase backend adapter와 RLS schema 초안을 추가했다.

현재 구현은 mock backend와 Supabase backend를 환경 변수로 전환할 수 있다. 다만 실제 Supabase 프로젝트 URL/key가 아직 없어서 원격 DB 연결은 로컬에서 검증하지 못했다.

## Implemented Items

- [x] Next.js App Router 기반 앱 골격
- [x] 홈, 작성, 캘린더, 프로필 주요 화면
- [x] 설계상 주요 라우트 진입점: `/login`, `/signup`, `/link-couple`, `/proposals/new`, `/proposals/[proposalId]`, `/calendar`, `/profile`
- [x] `BackendClient` 인터페이스
- [x] `NEXT_PUBLIC_BACKEND_PROVIDER` 기반 mock/Supabase backend 선택
- [x] Supabase Auth sign up/sign in/sign out adapter
- [x] Supabase Postgres CRUD adapter
- [x] Supabase Realtime subscription adapter
- [x] Supabase RLS schema SQL 초안
- [x] 로컬 mock 인증/회원가입/로그인
- [x] 커플 코드 생성 및 연결 mock
- [x] 제안 목록, 상세 보기, 상태 필터
- [x] 제안 생성
- [x] 제안 수정 및 삭제
- [x] 옵션 생성, 수정, 삭제
- [x] 댓글 및 수정 요청
- [x] 옵션 선호도 변경
- [x] 수락/거절/보류 상태 변경
- [x] 수락 시 선택 옵션 필수 검증
- [x] 확정 일정 목록형 캘린더
- [x] Google AI Studio 호출 함수와 `/api/date-options` API Route
- [x] AI 실패 시 로컬 fallback 옵션 생성
- [x] 제안/댓글 입력 검증
- [x] 과거 날짜, 시간 형식, 카테고리 검증 보강
- [x] 화면 포커스/스토리지 이벤트 기반 준실시간 재동기화
- [x] Supabase Realtime 기반 변경 감지 연결
- [x] 반응형 모바일 하단 내비게이션
- [x] 빈 상태, 오류 상태, 로딩 상태

## Missing Items

- [ ] 실제 Supabase 프로젝트에서 `docs/supabase-schema.sql` 실행 및 원격 연결 검증
- [ ] RLS 정책을 실제 두 사용자 가입/연결 시나리오로 검증
- [ ] 본인 댓글 삭제 UI
- [ ] 제안 상세 라우트에서 `proposalId` 기반 자동 선택
- [ ] 로그인/회원가입/커플 연결 라우트별 완전 분리 화면
- [ ] 테스트 코드 추가

## Changed Items (Deviations from Design)

- [x] 설계의 `supanova` 표현을 실제 구현에서는 Supabase adapter로 정리했다.
- [x] 설계는 기능별 파일/훅/컴포넌트 분리를 계획했지만 현재는 주요 UI가 `date-planner-app.tsx`에 집중되어 있다.
- [x] mock 모드에서는 화면 포커스와 storage 이벤트 재로딩, Supabase 모드에서는 Realtime subscription을 사용한다.
- [x] AI 추천은 Google AI Studio API Route까지 연결했지만 API 키가 없으면 fallback 추천을 반환한다.

## Recommendations

1. Supabase Dashboard에서 `docs/supabase-schema.sql`을 실행하고 `.env`에 URL/anon key를 넣어 원격 연결을 검증한다.
2. 실제 두 계정으로 회원가입, 커플 코드 연결, 제안 생성, 댓글, Realtime 반영을 확인한다.
3. 이후 제안 상세 `proposalId` 자동 선택과 댓글 삭제 UI를 보강한다.

## Next Steps

- [ ] 실제 Supabase 프로젝트 연결 후 `$pdca analyze date-planner` 재실행
