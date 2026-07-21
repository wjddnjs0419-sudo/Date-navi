# 작업 패킷: 클러스터 2 — onboarding (9화면)

너는 Date Navi(React Native + Expo) 앱의 **온보딩 플로우 UI 교체**를 담당하는 세션이다. `UI RENEW/` 목업에 1:1로 맞춰 화면을 다시 만든다. 로직(Supabase 저장·커플 연결 RLS)은 손대지 않는다.

> **권장 모델: Opus.** 화면 9개 + 연결 성공 애니메이션 + 커플연결 다중 상태(코드생성/입력/에러)라 판단·볼륨이 크다.

## 기준
- 작업 위치: 이 worktree(`ui/onboarding` 브랜치, main 병합 `5a3faee`에서 분기).
- Phase 0 공용 컴포넌트 **재사용**: `Illustration`(`mascot-heart-single`·`mascot-heart-couple-check`·`bg-park` 등), `Wordmark`, `ProgressDots`·`BackBar`·`BigButton`·`FieldBox`·`OptionCardPicker`(`components/ui.tsx`), `pickers`(`components/pickers.tsx` — 기념일 날짜), 토큰 `C/SP/R/T`, lock `STYLESEED.md`.

## 담당 화면 (목업 1:1)
| 라우트 | 목업 PNG | 현행 노트 |
|---|---|---|
| `app/onboarding/nickname.tsx` | `.../DATE_NAVI_P1_INDIVIDUAL_SCREENS/01_onboarding_nickname.png` | 닉네임 입력(Step). |
| `app/onboarding/photo.tsx` | `.../DATE_NAVI_MISSING_9_SCREENS_REGENERATED/01_onboarding_photo.png` | 사진(현재 선택 미연결, `bg-park` 하단). |
| `app/onboarding/anniversary.tsx` | `.../DATE_NAVI_MISSING_9_SCREENS_REGENERATED/02_onboarding_anniversary.png` | 기념일(`anniversary_date`), pickers 사용. |
| `app/onboarding/type.tsx` | `.../DATE_NAVI_MISSING_9_SCREENS_REGENERATED/03_onboarding_type.png` | 계획 성향(`planning_style`). |
| `app/onboarding/couple-choice.tsx` | `.../DATE_NAVI_MISSING_9_SCREENS_REGENERATED/04_onboarding_couple_connect_manage.png` | 커플 연결 방식 선택/관리. |
| `app/onboarding/couple-connect.tsx` | `.../DATE_NAVI_CONNECT_BOARD_SPLIT_SCREENS/01_couple_connect_code.png`, `02_enter_code.png`, `04_enter_code_error.png`, `.../P1_INDIVIDUAL_SCREENS/02_onboarding_couple_connect.png` | 초대코드 생성/입력/에러. 4개 목업 = 코드생성·입력·에러상태. |
| `app/onboarding/connected.tsx` | `.../DATE_NAVI_CONNECT_BOARD_SPLIT_SCREENS/05_connect_success.png`, `.../MISSING_9_SCREENS_REGENERATED/05_onboarding_connected.png` | 연결 성공 애니메이션(`mascot-heart-couple-check`). |
| `app/onboarding/preferences.tsx` | `.../DATE_NAVI_P1_INDIVIDUAL_SCREENS/03_onboarding_preferences.png` | 취향(활동·분위기·피하기·장거리). |

## 소유 i18n 조각 (이 파일들만 편집)
- `locales/{ko,en}/onboarding.json`
- `locales/{ko,en}/nickname.json`
- `locales/{ko,en}/coupleConnect.json`
- `locales/{ko,en}/preferences.json`

## 규칙 (반드시)
1. 화면마다 대응 목업 PNG를 `Read`로 열어 1:1 대조(여러 목업 있는 화면은 상태별로 전부).
2. **TDD**: `superpowers:test-driven-development` 먼저. 테스트 인프라 = `require('react-test-renderer')` + `TR.act()` 패턴(예: `__tests__/auth-social-buttons.test.tsx`).
3. **StyleSeed 게이트**: 화면당 `/ss-score <file>` ≥80 + `/styleseed-design-review`. lock `STYLESEED.md`.
4. **i18n**: 소유 조각(ko/en)에 동시. `connected`의 커플 아바타 서클은 실사진을 코드로 얹는다(목업 참고).
5. **하드코딩 금지**: `C/SP/R`.
6. **금지 편집**: 공용 컴포넌트 파일(`ui.tsx`·`brand.tsx`·`illustration.tsx`·`course-map.tsx`·`pickers.tsx`)·`constants/*`·`locales/index.ts`·다른 클러스터·`lib/*` 로직. 새 공용 필요 시 화면-로컬 + `// PHASE0-BACKMERGE`.
7. 온보딩 라우팅 순서(nickname→photo→anniversary→type→couple-choice→couple-connect→connected→preferences→home)와 Supabase 저장 동작은 **그대로**.

## 완료 기준
- tsc 클린 + 계약 테스트 통과 + 전체 jest 무회귀. 9화면 목업 일치·StyleSeed ≥80.
- `ui/onboarding` 브랜치 커밋(`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`).
- 완료보고: 화면별 점수, PHASE0-BACKMERGE 플래그.

화면이 9개로 많으니 `superpowers:brainstorming`은 생략하고 목업 대조 → TDD 순으로 화면 하나씩 진행. 불명확하면 질문.
