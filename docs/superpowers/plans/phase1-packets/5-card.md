# 작업 패킷: 클러스터 5 — card + memory (7화면)

너는 Date Navi(React Native + Expo) 앱의 **카드 상세·확정·리뷰·추억 화면 UI 교체**를 담당하는 세션이다. `UI RENEW/` 목업에 1:1로 맞춘다. 로직(카드 조회·반응·저장)은 손대지 않는다.

> **권장 모델: Sonnet.** 대부분 폼·상세·리스트라 표준적. 화면 7개지만 인터랙션 복잡도는 낮음. (원하면 카드 상세만 Opus.)

## 기준
- 작업 위치: 이 worktree(`ui/card` 브랜치, main 병합 `5a3faee`에서 분기).
- Phase 0 공용 컴포넌트 **재사용**: `CourseStepList`·`CoursePin/StepPin`·`Badge`·`SoftCard`·`BigButton`·`FieldBox`·`MoreMenu`·`SwipeableCard`·`SuccessModal`(버튼닫힘)·`pickers`(날짜/시간), 토큰 `C/SP/R/T`, lock `STYLESEED.md`.

## 담당 화면 (목업 1:1)
| 라우트 | 목업 PNG | 현행 노트 |
|---|---|---|
| `app/card/[id].tsx` | `.../DATE_NAVI_P1_INDIVIDUAL_SCREENS/08_candidate_detail.png` | 후보 카드 상세 + 반응. |
| `app/card/confirm.tsx` | `.../DATE_NAVI_MISSING_9_SCREENS_REGENERATED/06_card_confirm.png` | 데이트 확정(날짜/시간 pickers → SuccessModal). |
| `app/card/review.tsx` | `.../P1.../09_review.png` | 데이트 후기 작성. |
| `app/card/edit/[id].tsx` | `.../P2.../05_card_edit_confirm.png` | 카드 수정. |
| `app/card/memory/new.tsx` | `.../MISSING_9.../07_card_memory_new.png` | 추억 새로 작성. |
| `app/card/memory/[id].tsx` | `.../MISSING_9.../08_card_memory_detail.png` | 추억 상세. |
| `app/card/memory/edit/[id].tsx` | `.../MISSING_9.../09_card_memory_edit.png` | 추억 수정. |

## 소유 i18n 조각 (이 파일들만 편집)
- `locales/{ko,en}/card.json`
- `locales/{ko,en}/confirm.json`
- `locales/{ko,en}/review.json`

## 규칙 (반드시)
1. 화면마다 대응 목업 PNG를 `Read`로 열어 1:1 대조.
2. **TDD** 먼저. 테스트 인프라 = `require('react-test-renderer')` + `TR.act()` 패턴. 기존 카드 테스트 무회귀.
3. **StyleSeed 게이트**: 화면당 `/ss-score` ≥80 + `/styleseed-design-review`.
4. **i18n**: 소유 조각(ko/en) 동시. 카드 텍스트 i18n(`content_i18n`·`localizeCardContent`) 로직은 그대로 사용만.
5. **하드코딩 금지**: `C/SP/R`.
6. **금지 편집**: 공용 컴포넌트 파일·`constants/*`·`locales/index.ts`·다른 클러스터·`lib/*` 로직. 새 공용 필요 시 화면-로컬 + `// PHASE0-BACKMERGE`.
7. 카드 조회·반응·저장·추억 CRUD 데이터 흐름은 **그대로**. 비주얼·레이아웃만.

## 완료 기준
- tsc 클린 + 계약 테스트 통과 + 전체 jest 무회귀. 7화면 목업 일치·StyleSeed ≥80.
- `ui/card` 브랜치 커밋(`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`).
- 완료보고: 화면별 점수, PHASE0-BACKMERGE 플래그.

목업 대조 → TDD 순으로 화면 하나씩. 불명확하면 질문.
