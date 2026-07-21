# 작업 패킷: 클러스터 4 — course-flow (5화면)

너는 Date Navi(React Native + Expo) 앱의 **코스 생성·결과·장소 화면 UI 교체**를 담당하는 세션이다. `UI RENEW/` 목업에 1:1로 맞춘다. 추천 파이프라인/편집 RPC 로직은 손대지 않는다.

> **권장 모델: Opus.** 코스 결과 편집 화면(잠금/교체/재정렬/추가/확정)이 앱에서 가장 복잡한 인터랙티브 화면이고, place-search/generating까지 얽혀 판단이 크다.

## 기준
- 작업 위치: 이 worktree(`ui/course` 브랜치, main 병합 `5a3faee`에서 분기).
- Phase 0 공용 컴포넌트 **재사용**:
  - `GeneratingView`(`components/ui.tsx`) — 이미 목업 P2/01로 리스타일됨(세로 코스맵+세그먼트 진행). 화면은 하네스만.
  - `CourseStepList`·`CoursePin/StepPin`(`components/course-map.tsx`)·`MetaChipRow`·`LocationField`/`PlaceRow`·`BigButton`·`SoftCard`, 토큰 `C/SP/R/T`, lock `STYLESEED.md`.
  - `SuccessModal`(버튼 닫힘 확정) — 확정 성공 시.
  - **`StepActionSheet`(`components/recommendation/step-action-sheet.tsx`)는 이 클러스터 소유** — course-result 단독 소비라 여기서 목업 `P2/17_step_action_sheet.png`에 맞춰 리스타일한다.

## 담당 화면 (목업 1:1)
| 라우트 | 목업 PNG | 현행 노트 |
|---|---|---|
| `app/mode-flow/course.tsx` | `.../DATE_NAVI_P0_UPDATED_INDIVIDUAL_SCREENS/03_course_create.png` | 코스 입력(위치·스텝·도보·예산·분위기). 스텝 에디터 = 카테고리+핀 공존(옵션 B). |
| `app/mode-flow/course-result.tsx` | `.../P0.../04_course_result_detail.png`, `05_course_result_editable.png`, `.../P1.../07_course_result.png` | 결과 코스 초안(타임라인·잠금·교체·추가·확정). + `StepActionSheet`(P2/17). |
| `app/mode-flow/place-search.tsx` | `.../DATE_NAVI_P2_INDIVIDUAL_SCREENS/02_place_search.png` | 카카오 장소 검색(핀 지정). |
| `app/mode-flow/place-detail.tsx` | `.../P2.../03_place_detail.png` | 장소 상세(Naver/Kakao 외부 링크). |
| `app/mode-flow/generating.tsx` | `.../P2.../01_generating.png` | GeneratingView 소비. **부제/팁카드**는 Phase 0에서 i18n 이유로 생략됨 — 원하면 `modeFlow.json`에 키 추가해 넣어도 됨(옵션). |

## 소유 i18n 조각 (이 파일들만 편집)
- `locales/{ko,en}/course.json`
- `locales/{ko,en}/modeFlow.json`
- `locales/{ko,en}/location.json`

## 규칙 (반드시)
1. 화면마다 대응 목업 PNG를 `Read`로 열어 1:1 대조(course-result는 detail·editable 두 상태 모두).
2. **TDD** 먼저. 테스트 인프라 = `require('react-test-renderer')` + `TR.act()` 패턴. 기존 course 테스트(`__tests__/course-*.test.tsx`) 무회귀 필수.
3. **StyleSeed 게이트**: 화면당 `/ss-score` ≥80 + `/styleseed-design-review`.
4. **i18n**: 소유 조각(ko/en) 동시.
5. **하드코딩 금지**: `C/SP/R`.
6. **금지 편집**: `components/ui.tsx`·`brand.tsx`·`illustration.tsx`·`course-map.tsx`·`pickers.tsx`·`constants/*`·`locales/index.ts`·다른 클러스터·`lib/*`·`shared/*`·`supabase/*` 로직. (StepActionSheet만 예외로 편집 허용 — 이 클러스터 소유.) 새 공용 필요 시 화면-로컬 + `// PHASE0-BACKMERGE`.
7. 추천 생성/편집(잠금·교체·추가·확정)의 데이터 흐름·RPC 호출·검증은 **그대로**. 비주얼·레이아웃만.

## 완료 기준
- tsc 클린 + 계약 테스트 통과 + 전체 jest 무회귀. 5화면 목업 일치·StyleSeed ≥80.
- `ui/course` 브랜치 커밋(`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`).
- 완료보고: 화면별 점수, StepActionSheet 처리, PHASE0-BACKMERGE 플래그.

course-result가 가장 크니 상태(detail/editable)별로 목업 대조 → TDD 순으로 신중히. 불명확하면 질문.
