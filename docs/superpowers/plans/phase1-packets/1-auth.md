# 작업 패킷: 클러스터 1 — auth + splash

너는 Date Navi(React Native + Expo) 앱의 **auth+splash 화면 UI 교체**를 담당하는 세션이다. `UI RENEW/` 목업에 1:1로 맞춰 화면을 다시 만든다. 로직(Supabase/AI)은 손대지 않는다.

> **권장 모델: Sonnet.** 화면 2개라 가볍다. 단, 로그인 히어로(워드마크+일러스트+3버튼) 비주얼을 더 다듬고 싶으면 그 세션만 Opus.

## 기준
- 작업 위치: 이 worktree(`ui/auth` 브랜치, main 병합 `5a3faee`에서 분기). 이미 여기 있음.
- 공용 기반(Phase 0)은 완료·동결됨. 아래 컴포넌트를 **재사용**한다:
  - `Wordmark`(`components/brand.tsx`) — "Date·navi" 로고. `size="lg"` 로그인 히어로.
  - `Illustration`(`components/illustration.tsx`) — `date-course-map-horizontal` 등 8 asset.
  - `BigButton`·`SoftCard` 등(`components/ui.tsx`), 토큰 `C/SP/R/T`(`constants/theme.ts`), lock `STYLESEED.md`.

## 담당 화면 (목업 1:1)
| 라우트 | 목업 PNG | 현행 노트 |
|---|---|---|
| `app/(auth)/index.tsx` | `UI RENEW/DATE_NAVI_P0_UPDATED_INDIVIDUAL_SCREENS/01_login.png` | 소셜 로그인(카카오/구글/애플) + 법률 링크. 목업: 워드마크 히어로 + 가로 코스맵 일러스트 + 3버튼 + 법률 푸터 |
| `app/index.tsx` | `UI RENEW/DATE_NAVI_CONNECT_BOARD_SPLIT_SCREENS/07_loading_splash.png` | 진입 스플래시/라우팅. 목업: 핀 로고(`brand-pin-logo`) 중앙 로딩 |

## 소유 i18n 조각 (이 파일들만 편집)
- `locales/ko/auth.json` · `locales/en/auth.json`
- `locales/ko/splash.json` · `locales/en/splash.json`

## 규칙 (반드시)
1. 화면 만들기 전 대응 목업 PNG를 `Read`로 열어 레이아웃·색·요소를 1:1 대조.
2. **TDD**: `superpowers:test-driven-development` skill 먼저. 화면 렌더/핵심 문구 키/상태(로딩·에러) 계약 테스트 → 구현.
   - 테스트 인프라(중요): 이 repo는 `TestRenderer.create`를 `act()`로 안 감싸면 크래시하고, `import`로 react-test-renderer 쓰면 tsc 실패. 반드시 `const TR = require('react-test-renderer') as {...}; TR.act(() => { ... })` 패턴(예: `__tests__/auth-social-buttons.test.tsx`).
3. **StyleSeed 게이트**: 화면 완성 후 `/ss-score <file>` ≥80(미달 시 fix-first 적용 후 재점수) + `/styleseed-design-review`(AI-generic 텔 체크). lock은 `STYLESEED.md`.
4. **i18n**: 문구 추가·수정은 위 소유 조각(ko/en)에 **동시**. 다른 네임스페이스 조각 건드리지 마라.
5. **하드코딩 금지**: 색 `C.*`, 간격 `SP.*`, 반경 `R.*`.
6. **금지 편집**: `components/ui.tsx`·`components/brand.tsx`·`components/illustration.tsx`·`components/course-map.tsx`·`components/pickers.tsx`·`constants/*`·`locales/index.ts`·다른 클러스터 화면·`lib/*` 로직. 새 공용 프리미티브가 필요하면 → 화면-로컬로 만들고 `// PHASE0-BACKMERGE` 주석 + 완료보고에 기록.
7. 소셜 로그인 호출부(`lib/googleAuth`·`lib/kakaoAuth`·Supabase)와 라우팅 동작은 **그대로**. 비주얼·레이아웃만 교체.

## 완료 기준
- `npm run validate`(tsc) 클린 + 담당 화면 계약 테스트 통과 + 전체 `npx jest` 무회귀.
- 두 화면이 목업과 육안 일치, StyleSeed ≥80.
- `ui/auth` 브랜치에 커밋(메시지 끝에 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`).
- 완료보고: 바꾼 화면, StyleSeed 점수, PHASE0-BACKMERGE 플래그(있으면).

먼저 `superpowers:test-driven-development`와 `superpowers:brainstorming`이 필요한지 판단하고(화면 2개라 브레인스토밍은 생략 가능), 목업을 열어 착수해라. 불명확하면 질문.
