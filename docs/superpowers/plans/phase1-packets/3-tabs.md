# 작업 패킷: 클러스터 3 — tabs + plans (5화면)

너는 Date Navi(React Native + Expo) 앱의 **탭 화면(홈·후보·추억) + 일정 UI 교체**를 담당하는 세션이다. `UI RENEW/` 목업에 1:1로 맞춘다. 로직은 손대지 않는다.

> **권장 모델: Opus.** 홈이 앱의 쇼케이스 화면(CourseMapPreview+PlanListRow+MetaChipRow 합성)이라 비주얼 완성도가 중요하다.

## 기준
- 작업 위치: 이 worktree(`ui/tabs` 브랜치, main 병합 `5a3faee`에서 분기).
- Phase 0 공용 컴포넌트 **재사용**(홈이 핵심 소비자):
  - `Wordmark size="sm"`(헤더), `Illustration name="home-map-book"`(홈 히어로).
  - `CourseMapPreview`(`components/course-map.tsx`) — 홈 "새 데이트 코스" 카드의 3스텝 미리보기.
  - `DdayBadge`·`MetaChipRow`·`PlanListRow`(`components/ui.tsx`) — 다가오는 데이트 리스트·메타칩.
  - `SoftCard`·`BigButton`·`Badge`·`SectionLabel` 등, 토큰 `C/SP/R/T`, lock `STYLESEED.md`.

## 담당 화면 (목업 1:1)
| 라우트 | 목업 PNG | 현행 노트 |
|---|---|---|
| `app/(tabs)/index.tsx` (홈) | `.../DATE_NAVI_P0_UPDATED_INDIVIDUAL_SCREENS/02_home.png` | 워드마크+벨+아바타 / 히어로 / "새 코스" 카드(CourseMapPreview+MetaChipRow+CTA) / 다가오는 데이트(PlanListRow) / 취향 프롬프트. |
| `app/(tabs)/candidates.tsx` | `.../P0.../06_candidates.png`, `.../P1.../04_candidates.png` | 우리 후보(분류 탭·반응). |
| `app/(tabs)/memories.tsx` | `.../P0.../08_memories.png`, `.../P1.../06_memories.png` | 추억(featured 메타). |
| `app/plans/index.tsx` | `.../P0.../07_date_plans.png`, `.../P1.../05_date_plans.png` | 다가오는 데이트 목록(PlanListRow). |
| `app/(tabs)/mode.tsx` | (목업 없음 — 홈 P0/02 하단 탭바 참조) | MVP 숨김 화면. **탭바 아이콘/라벨만 목업(홈/데이트 모드/우리 후보/추억)과 맞추면 됨.** 큰 작업 아님. |

## 소유 i18n 조각 (이 파일들만 편집)
- `locales/{ko,en}/home.json`
- `locales/{ko,en}/tabs.json`
- `locales/{ko,en}/candidates.json`
- `locales/{ko,en}/memories.json`
- `locales/{ko,en}/plans.json`

## 규칙 (반드시)
1. 화면마다 대응 목업 PNG를 `Read`로 열어 1:1 대조.
2. **TDD** 먼저. 테스트 인프라 = `require('react-test-renderer')` + `TR.act()` 패턴.
3. **StyleSeed 게이트**: 화면당 `/ss-score` ≥80 + `/styleseed-design-review`.
4. **i18n**: 소유 조각(ko/en) 동시.
5. **하드코딩 금지**: `C/SP/R`.
6. **금지 편집**: 공용 컴포넌트 파일·`constants/*`·`locales/index.ts`·다른 클러스터·`lib/*` 로직. 새 공용 필요 시 화면-로컬 + `// PHASE0-BACKMERGE`.
7. 홈의 데이터 로딩(useFocusEffect·Supabase 조회)·CTA 라우팅·탭 동작은 **그대로**. 홈 카드 이미지 높이는 기존 명시적 높이 방식 유지(RN aspectRatio 버그 주의).

## 완료 기준
- tsc 클린 + 계약 테스트 통과 + 전체 jest 무회귀. 목업 일치·StyleSeed ≥80.
- `ui/tabs` 브랜치 커밋(`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`).
- 완료보고: 화면별 점수, PHASE0-BACKMERGE 플래그.

홈이 CourseMapPreview·PlanListRow·MetaChipRow 재사용의 핵심이니 먼저. 목업 대조 → TDD 순. 불명확하면 질문.
