# RESULT.md

현재 및 직전 세션의 핫 컨텍스트만 유지합니다. 과거 기록은 `RESULT_ARCHIVE.md`에 누적합니다.

---

## 2026-07-21 세션 BF — UI 전면 교체 Phase 1 완료 + Phase 2 통합 착수

> 사용자 보고: "phase 1 완료"(클러스터 6·share-account 작업 종료). 상태 확인 → 게이트 → 병합 순으로 Phase 2 §7 절차 수행.

### 확인·게이트 (클러스터 6, `ui/share-account`, 별도 worktree)
- 변경 9화면(설정/법률/계정/공유): tsc 클린, 121 suites/863 tests 통과.
- StyleSeed 게이트(subagent): 전 화면 91~98점(≥80 통과). `edit-profile.tsx:297` 아바타 오버레이가 순검정(`rgba(0,0,0,0.35)`)이라 STYLESEED.md 웜뉴트럴 규칙 위반 — 웜톤(`rgba(40,30,25,0.4)`)으로 수정 후 커밋(`a6d9ad1`, worktree 내).

### 병합 (spec §7 순서: auth→onboarding→tabs→course→card→share-account, 이미 5개 완료 상태였음)
- `ui/share-account` → `main` 병합(사용자 승인, `--no-ff`). 23파일, +1044/-354.
- 병합 후 루트에서 재검증: tsc 클린, **137 suites / 923 tests 통과**.
- 이로써 **UI 전면 교체 6클러스터 전부 main 통합 완료.**

### `PHASE0-BACKMERGE` 승격 (TDD, 커밋 `a42d59a`)
- D-day 헬퍼(`app/plans/index.tsx`·`app/(tabs)/index.tsx` 중복) → `lib/time.ts`의 `daysUntilIso`로 승격.
- `MetaChipRow` icon 유니언에 `wallet` 추가 → `app/share/send.tsx` 커스텀 예산 칩 제거, 시간+예산 한 줄로 통합.
- tsc 클린, 137 suites/928 tests.

### `ss-verify` 시각 게이트 (iOS 시뮬레이터 실렌더링)
- `EXPO_PUBLIC_SCREENSHOT=1` + `scripts/shot-control-server.py`로 시뮬레이터(iPhone 17 Pro)에서 핵심 플로우 8화면 실캡처: 로그인·홈·온보딩(닉네임/연결완료)·코스생성·AI탐색중·코스결과·데이트확정·공유보내기. 이번 콜드런치는 수동 탭 없이 자동 진입.
- **발견 1건, 즉시 수정**: `onboarding/nickname.tsx` 입력창~CTA 사이가 목업(`01_onboarding_nickname.png`) 대비 빈 공백(밸런스 실패) — 목업엔 `mascot-heart-single` 마스코트가 채워져 있었음. TDD로 anniversary/connected와 동일 패턴 흡수, 재렌더로 확인. 커밋 `b329b80`.
- 나머지 7화면은 포커스·리듬·색 규율(단일 액센트+카테고리 3색) 문제 없음. `share/send.tsx`의 `한마디 추천받기` 라벤더 칩은 STYLESEED.md가 명시 허용하는 톤 패밀리 태그라 위반 아님.
- tsc 클린, 137 suites/929 tests. 시뮬레이터·제어서버 프로세스 정리 완료.

### 남은 것
- 실기기 확인(사용자, Xcode Release Run) 대기 — 이걸로 Phase 2 §7 전 항목 완료.

## 2026-07-21 세션 BE — UI 전면 교체 Phase 0 (공용 기반, 병렬 준비)

> 요청: UI 전면 교체를 **여러 세션 병렬**로 돌릴 계획 수립 → 이번 세션은 Phase 0(공용 기반)까지. 브레인스토밍 → spec → 플랜 → subagent 주도 TDD 실행.

### 설계·계획 (승인)
- spec `docs/superpowers/specs/2026-07-21-ui-renew-parallel-design.md`: **A안(기반 직렬 → 화면 병렬)**. 목업 50 ↔ 라우트 1:1 매핑, 6클러스터(auth/onboarding/tabs/course/card/share-account) worktree 병렬, i18n 조각분할로 충돌 제거. 결정: **"색깔금지" 하드룰 폐기(목업 100% 따름)**.
- 플랜 `docs/superpowers/plans/2026-07-21-ui-renew-phase0.md`: TDD 12태스크. StepActionSheet는 단독소비자라 클러스터4 귀속으로 확정.

### Phase 0 구현 (브랜치 `ui/phase0`, 11커밋, subagent 주도)
- **토큰**: `catMeal #FD8956`·`catCafe #6B9FDB`·`catWalk #5DBD5F`(목업 실측).
- **i18n 조각분할**(핵심): `locales/ko.json`·`en.json` 단일 → `locales/{ko,en}/<ns>.json` 28조각 + 정적 배럴 `locales/index.ts`. 로더·직접 import 8파일 배선 교체, byte-equivalence 검증. → **Phase 1 병렬 세션이 자기 조각만 편집 = 충돌 0**. 배럴은 Phase 0 후 편집 금지.
- **신규 공용 컴포넌트**: `Illustration`(8 asset 이름 렌더), `Wordmark`(투명 PNG 추출 `assets/brand/wordmark.png`, sm24/lg44), `CoursePin/StepPin/CourseMapPreview`(`components/course-map.tsx`), `DdayBadge`·`MetaChipRow`·`PlanListRow`(ui.tsx 추가).
- **공용 모달 리스타일**(props 불변, 다중소비자): `SuccessModal`(마스코트+CTA)·`pickers`(X닫기+전폭확정)·`GeneratingView`(세로 코스맵+세그먼트 진행). 각 계약테스트로 시그니처 고정.
- **문서·룰**: Design.md·메모리 [[design-no-emoji-no-color-badge]] 개정(룰 폐기). `STYLESEED.md` lock 신설(single-accent `+categorical`, 웜 layered shadow 캡0.2) — 카테고리 핀·클레이 그림자 게이트 오탐 방지.

### 검증
- 전체 **112 suites / 850 tests 통과**, `npm run validate`(tsc) 클린, 워킹트리 클린.
- StyleSeed 게이트: course-map.tsx ss-score 89(lock 적용 후 카테고리·그림자 감점 소멸). 시각 게이트(ss-verify)는 화면 조립되는 Phase 1/2에서 실효.
- **미결(Phase 2 사용자 결정)**: SuccessModal 목업=버튼닫힘 vs 현행=자동닫힘 1.1초 상호작용 모델 차이(현재 둘 다 동작). GeneratingView 목업 부제/팁카드는 i18n 이유로 생략(Phase 1 course가 키 추가 가능).

### 다음 (Phase 1 병렬)
- **기준선 = `ui/phase0` 병합 후 main 커밋**(main 병합 커밋 `5a3faee`). 병합은 사용자 승인 대기.
- 클러스터별 작업 패킷 6개 생성 → 각 worktree 세션 배포. spec §8 형식.

## 2026-07-21 세션 BD — UI 전면 교체 착수 준비 (목업 감사 + 일러스트 asset 생성)

> 요청: 앱 UI 전격 교체. GPT로 만든 목업 50화면 수령(`UI RENEW/`) → 각 화면에 넣을 asset 추출. **이번 세션은 준비만, 코드 UI 교체는 다음 세션.**

### 목업 감사 (50화면 전수 확인)
- 5개 폴더 50 PNG 분류. **실제 일러스트 asset 필요 = ~13화면**, 나머지 35+는 코드 + iOS 시스템 이모지(📅🕐📍🛍️📷)로 재현.
- 핵심: 일러스트가 **재사용 패밀리로 뭉침** — 하트 마스코트 1종이 온보딩·연결·확정 다 돌려쓰고, 코스지도 1종이 login·생성·결과 다 돌려씀. → 50화면인데 실제 asset 8장이면 커버.

### asset 생성 (Higgsfield `nano_banana_pro`, 2크레딧/장, 사용자 결제)
- 스타일 기준 확정: **매트 클레이 질감 + 파스텔 핑크 2톤 + 볼터치**(광택 플라스틱 X). 목업이 화면마다 제각각이라 오히려 새 세트로 통일.
- 텍스트는 이미지에 **안 구움**(i18n) — 라벨/워드마크는 코드로.
- 결과 8장 → `assets/illustrations/` kebab-case:
  - `date-course-map-horizontal`(login) · `date-course-map-vertical`(generating) · `home-map-book`(home) · `brand-pin-logo`(splash)
  - `mascot-heart-single`(온보딩) · `mascot-heart-couple`(확정) · `mascot-heart-couple-check`(연결성공) · `bg-park`(온보딩 하단)
- 폐기: 광택 v1 커플하트, 세계지도 v1 핀로고(→ 동네지도 v2로 교체).

### 정리·커밋
- `UI RENEW/`(24M 목업) + `docs/screenshots/*.zip` → `.gitignore` (로컬 참고용, 리포 제외).
- `Design.md`(Airbnb 템플릿 → Date Navi 디자인 언어 재작성)는 **별도 커밋**으로 분리.

### 다음 세션
- login부터 UI 조립. 순서: 브레인스토밍(범위·우선순위) → 디자인 토큰 검증 → 공통 컴포넌트 → login → 나머지 화면.
- 구현이므로 TDD + StyleSeed 게이트 적용.

## 2026-07-21 세션 BC — 전 화면 자동 스크린샷 + 한/영 유저 플로우 맵

> 요청: 앱 모든 페이지·모달을 내가(직접 X) 캡처 → 유저 플로우 맵으로. 이어서 영어판, 최종 한/영 단일 토글본.

### 스크린샷 dev 모드 (전부 `EXPO_PUBLIC_SCREENSHOT=1` 플래그로 격리 — 평소/프로덕션 무영향)
- **단일 seam**: 모든 화면이 `lib/supabase.ts`의 supabase 하나만 import → `lib/screenshot/mock-supabase.ts`(체이너블 목업 클라)+`fixtures.ts`(커플연결/카드/추억/알림 + 추천세션 rpc payload)로 **인증 게이트 + 데이터 화면 동시 해결**. TDD 8테스트.
- **구동**: `components/screenshot/screenshot-navigator.tsx`가 로컬 HTTP 제어서버(`scripts/shot-control-server.py`) 폴링 → `router.replace`. `LANG:en/ko` 명령으로 언어 전환. `app/shot.tsx`=모달/GeneratingView 하네스. `scripts/screenshot-all.sh` 순회 캡처.
- **왜 이 방식**: openurl은 iOS 확인창 매번, System Events 클릭은 접근성 권한 없어 불가(-25204) → HTTP 폴링으로 우회. dev-client 콜드런치 메뉴/첫 확인창만 1회 수동 탭, 이후 완전 자동.

### 결과
- **37 라이브 화면** 캡처(로그인 포함). MVP 미사용 제외: **모드 선택 화면**(탭이 코스입력 직행), feeling·bucketlist·result.
- **course-result/place-detail/generating**: 런타임 세션 필요 → `recommendation-session-fixture` 구조의 rpc payload 시드 + URL 파라미터로 정상 렌더.
- **한/영 단일 `docs/screenshots/flow-map.html`**: 우상단 토글로 스크린샷·라벨·설명 전부 전환. 자체완결(claude.ai 무관·오프라인·영구). 9단계 플로우. 원본 PNG는 `.gitignore`(재캡처 가능), html만 커밋.
- 한계(정직): 장소명·주소는 한글 고정(Kakao Local API), 일부 카드 콘텐츠도 목업 한글.

### 검증
- `npm run validate`(tsc) 클린. 신규 mock 8 + 기존 = 전체 통과. 도구는 유지(플래그 off 기본). 브랜치 `feat/manual-place-pick`.
- 상세: 메모리 [[screenshot-mode-tooling]].

## 2026-07-20 세션 BB — 수동 장소 지정 Phase 2 (입력 시점 스텝별 장소 핀)

> 요청: `phase 2 진행`. 브랜치 `feat/manual-place-pick`의 Phase 0·1(교체 시트 직접 검색) 위에, 코스 입력 화면에서 각 스텝을 카카오 장소로 직접 지정(핀)하는 기능. 계획 `docs/superpowers/plans/2026-07-20-manual-place-pick-phase2.md`(승인).

### 확정 결정 (AskUserQuestion)
- **전량 지정 시 AI(Haiku) 건너뛰기** → 생성 22원→0원. (카드 문구는 어차피 결정론 `buildCompatibilityCard`라 품질 손실 없음 — AI는 candidateId만 선택.)
- **지정이 카테고리를 이김** → 핀 스텝은 카테고리·required-intent 게이트 우회.

### 구현 (TDD, 8 커밋)
- **계약/드래프트**: `CourseStepInput.pinnedKakaoPlaceId/pinnedName`(스키마 교차검증: id 있으면 name 필수). `CourseDraftStep.pin` + `setStepPin`/`clearStepPin` 리듀서 + `buildStructuredCourseInput` 매핑(핀이면 label=장소명).
- **서버**: 파이프라인이 per-step 핀도 이름 재검색해 후보 풀 병합(Phase 1 replacement 블록 일반화). 핸들러 = 핀 실재 게이트(없으면 신규 422 `STEP_PIN_UNAVAILABLE`), 카테고리/intent 게이트에서 핀 스텝 제외, **전량 핀→AI 스킵**(forced selection 직접 조립), **부분 핀→AI 선택 후 핀 스텝 candidateId 강제 덮어씀**. `buildCandidateOnlyCourse`/`buildDeterministicCandidateCourse` 핀 인식(kakaoPlaceId로 self-resolve, 카테고리 우회). 프롬프트 핀 고정 표기(`pinned/pinnedCandidateId`), 버전 v4→**v5-pinned-steps**.
- **UI**: `CourseStepEditor`에 [카테고리|직접 지정] 세그먼트 + 핀 행(장소명·주소 중립텍스트 + 지우기). Phase 1 place-search 화면·`place-pick-bridge` 재사용(course.tsx가 활성 타깃 스텝으로 라우팅). i18n ko/en `course.steps.pin.*`. ss-score 92, design-review 98(AI-generic 텔 없음).

### 종합 리뷰(서브에이전트) 반영
- **CRITICAL·보안 우회 없음 확인**: 핀은 자기 스텝의 카테고리 게이트만 우회, **제외/부적합(unfit) 필터는 그대로 적용**(핀이 병합 후 `eligiblePlaces` 필터를 거침).
- **IMPORTANT #1 수정**: 유효한 핀이 후보 40개 상한 랭킹 절단에서 잘려 `STEP_PIN_UNAVAILABLE`로 오판되던 문제 → 랭킹에 **pin recall**(카테고리 recall처럼 절단 전 강제 포함) 추가.
- **MINOR #3 수정**: 카테고리 탭 전환 순간 숨은 핀이 서버에 그대로 적용되던 UI/제출 불일치 → 탭 전환 시 핀 제거.
- **IMPORTANT #2(브리지 크로스파이어) = 오탐**: 리뷰는 push 내비 가정. 실제 `handleGenerate`는 `router.replace`라 course.tsx가 언마운트→구독 해제, course-result와 동시 마운트 안 됨. 코드 무변경.
- **MINOR #4·#5 수용**: 전량 핀도 `selectionSource:'ai'` 보고(기존 replacement 경로와 동일 관행, analytics만). 두 스텝 같은 핀→`COURSE_VALIDATION_FAILED`(안전 거부, UI가 막는 게 이상적).

### 검증
- `npx jest`: **101 suites / 823 tests 전부 통과**(신규 pinned-step 핸들러 4 + 랭킹 보호 1 + 스키마/드래프트/에디터/프롬프트). `npm run validate`(tsc) 클린. 워킹트리 클린.
- **배포 완료**: `recommend-date` 재배포(프롬프트 v5·핀 forcing·파이프라인·랭킹, project wqjguifsmtblgrhdfnji). `generate-ai` **무변경**. **DB 마이그레이션 없음**. 스모크 OPTIONS 204/무인증 401.
- **실기기 미확인**(JS+Edge 변경): 입력 세그먼트·핀 지정·전량 핀 0원 생성·부분 핀 AI 병합·핀 실재 실패 안내.

### 후속 (같은 세션, 사용자 피드백)
- **버그 수정**: 위치(draft.location) 미설정 시 "장소 검색" 진입이 조용히 no-op → 버튼이 죽은 것처럼 보임. `requestPick`에 안내 알림(`course.steps.pin.locationFirst*`) 추가. **place-search edge는 좌표 or 위치명 필수**라 위치 먼저 선택 유도. (JS만, Edge 무변경.)
- **스텝 에디터 Option B 재설계**(사용자 목업 검토 후 확정, artifact로 A/B 비교 제시): 탭 `[카테고리|직접지정]` → **`[AI 추천|내가 직접]` 토글 상단**, 카테고리 칩은 **두 모드 모두 표시(공존)**. 카테고리는 **선택 사항**(선택 칩 재탭 시 해제=ai_decide). **"Let AI decide" 칩 제거**(AI 추천 토글과 중복, 사용자 지적). 카테고리 선택은 핀 유지, **AI 추천 전환 시에만 핀 제거**. 스텝별 독립(1단계 AI/2단계 직접 혼합=부분 핀). **서버 무변경**(이미 카테고리+핀 공존·ai_decide 처리) → Edge 재배포 불필요.
- 검증: **101 suites / 824 tests** 통과, tsc 클린. 브랜치 `feat/manual-place-pick` 미머지.

---

## 2026-07-19 세션 AZ — Step Intent Phase 2·3 (AI 파서 fallback + 부정어 + 미지원/충돌 + 감지 칩 + 완화 UI)

> 요청: `/goal phase2-4까지`. Phase 1(결정론 규칙 파서) 위에 AI fallback·부정어·충돌/미지원 감지·감지 칩·완화 UI를 쌓는다. Phase 4(가격/외부증거)는 데이터 소스 부재로 연기.

### 사전 작업 (브레인스토밍 → 스펙 → 플랜)
- `docs/superpowers/specs/2026-07-19-step-intent-phase2-3-design.md`: 설계 스펙. 핵심 = resolvedStepIntents 1회-resolve 부착 아키텍처.
- `docs/superpowers/plans/2026-07-19-step-intent-phase2-server.md`: 7태스크 TDD 서버 플랜.
- **AI 게이트 결정(사용자 재확정)**: 스펙 §8.2 **전체 신호** — 비용 감수. `additionalRequest` 있고 사전어+불용어 제거 후 **유의미 잔여 텍스트**가 있으면 AI 호출(다중타깃·복합패러프레이즈·저신뢰·미등재영어 포괄). 사전 통문장 히트 = AI 0.

### 구현 (TDD, 12 커밋)
- **부정어**: `step-intent.ts` — 말고/빼고/제외/not/except 감지(한국어 뒤·영어 앞 방향 분리). `excludedIntents` 분리, `negated` 필드.
- **resolve 배선**: `step-intent-resolve.ts`(신규) `resolveStepIntents`(규칙 → 고재현 게이트 → AI 병합, 실패 시 graceful degrade), `coerceAiParseResult`(AI 출력→ParsedStepIntent 바인딩). 핸들러 1회 resolve → 내부 request에 `resolvedStepIntents`/`resolvedExcludedIntents` 부착. 하위 모듈은 `effectiveStepIntents`/`effectiveExcludedIntents`로 읽음(무회귀).
- **AI 파서 action**: `generate-ai`에 `parse_step_intents`(Haiku 4.5, temp0, json_schema, logged) + `recommend-date` 진입점 배선(8s 타임아웃).
- **랭킹**: negated 이름매칭 페널티 `-60`.
- **메트릭**: 응답 `metadata.stepIntent`(parserSource/aiFallbackUsed/resolved/unsupported/conflicts) — optional, breaking 없음.
- **Phase 3 서버**: 422 `STEP_INTENT_UNSATISFIED`에 `unsatisfiedIntents` 부착. 클라 `RecommendationRequestError.unsatisfiedIntents` 파싱 + `relaxRequiredMarkers` 완화 유틸.
- **UI**: 결과 화면 감지 칩(`snapshot.response.metadata.stepIntent` 기반, pink=required/lavender=preferred/gray=제외, 미지원 경고). 생성 화면 완화 카드(실패 조건 표시 + [조건 완화하고 다시 찾기]=required 마커 제거 재요청 + [조건 직접 수정]). i18n ko/en 대칭.
- **StyleSeed 게이트**: 감지 칩 86, 완화 UI 88 (둘 다 ≥80). design-review AI-generic 텔 없음.

### 검증
- `npx jest`: **97 suites / 792 tests 전부 통과**(기준선 767 + 신규 25). `npm run validate`(tsc) 클린.
- **미배포**: Phase 2·3 로컬 완결. edge function 배포(`recommend-date`·`generate-ai`)는 승인 후 별도 — 프롬프트/검색플랜/AI action 변화로 캐시 히트율·비용 변동 사전 보고 필요.

### 남은 것
- **Phase 4 연기**(문서화만): 가격/외부증거 — 카카오 무료 티어 데이터 부재. 선행조건 = 유료 API/크롤링. `docs/superpowers/plans/2026-07-19-step-intent-phase4-deferred.md`.
- 배포 승인 대기.

---

## 2026-07-20 세션 BA — Step Intent Phase 2·3 배포 + Phase 4 종결 + 비용 실측

> 요청: `/goal phase2-4까지`. Phase 2·3는 세션 AZ에서 로컬 구현·커밋 완료 상태였고 남은 블로커는 edge function 배포 승인 + Phase 4 처리. 브레인스토밍으로 스코프 확정 후 배포·검증·문서화.

### 결정 (AskUserQuestion)
- **Phase 4**(가격/외부증거): 카카오 무료 티어 데이터 부재 → **연기**, 문서화만. 재개 선행조건 = 유료 API/크롤링.
- **AI 파서**: additionalRequest 있고 규칙 미검출/저신뢰일 때만 호출(사전 히트·자유텍스트 없음 = AI 0).
- **UI**: 감지 칩 + 완화 UI 둘 다(이미 구현됨).

### 배포 (프로덕션, 승인 후)
- `generate-ai` → **v18** ACTIVE (`parse_step_intents` action + `parse-step-intents-schema.ts` 포함).
- `recommend-date` → **v14** ACTIVE (step-intent-resolve/threading 전체 shared 모듈).
- 프로젝트 Date-Navi(`wqjguifsmtblgrhdfnji`, Seoul).

### 비용 실측 (ai_recommendation_logs, 최근 30일, Haiku 4.5 $1/$5)
- recommend_date_select: 입력 평균 **15,152토큰**(최대 18,232)·출력 **44토큰** → **≈ $0.0154 (22원)/생성**.
- 비용 지배 = 입력(후보 리스트 전 필드 직렬화). 출력은 candidateId만이라 미미.
- `parse_step_intents` fallback 발생 시 +~$0.002(3원). 교체 시트 = AI 0원.
- 절감 여지: 프롬프트 후보 상한/scoreBreakdown 등 불필요 필드 제거 시 입력 절반↓.

### 검증
- `npx jest`: **97 suites / 792 tests 전부 통과**(Phase 2 AI 파서·resolve·threading 포함). `npm run validate`(tsc) 클린. 워킹트리 클린(전부 커밋).
- **모니터링 권고**: `parse_step_intents` 호출률(AI 비용)·step_intent 쿼리로 인한 카카오 캐시 히트율.

---

## 2026-07-19 세션 AY — AI 추천 Step Intent Phase 1 (결정론 수직슬라이스)

> 요청: V4 Step Intent 스펙 검토 → 현재 코드와 충돌 대조 → 조율 애드덤 작성 → Phase 1 구현. "삼겹살 먹고 싶어"/"I want samgyupsal" 같은 구체 자유텍스트를 규칙 파서로 step별 canonical 카카오 검색 의도로 변환해 검색→evidence→랭킹→선택검증→폴백→교체까지 전파. **AI 파서 없음(Phase 2)**.

### 사전 작업 (문서)
- `docs/AI_RECOMMENDATION_V4_STEP_INTENT_RECONCILIATION.md`: 스펙 vs 코드 조율 애드덤 7항목(중복 파서·AI 재추가·캐시 갭·category enum·evidence phase·로마자·explicit 중복). GPT 교차검증 반영.
- `docs/superpowers/plans/2026-07-19-step-intent-phase1.md`: 9태스크 TDD 플랜.

### 구현 (TDD, subagent-driven, 8 커밋 + 리뷰 수정 1)
- **`step-intent-dictionary.ts`(신규)**: 13개 엔트리 데이터 사전. canonicalTerm/expansions/koAliases/enAliases(로마자 samgyeopsal·samgyupsal·samgyopsal 등)/compatibleCategoryNameKeywords/displayLabel(ko/en). 파서 로직과 분리.
- **`step-intent.ts`(신규)**: `parseStepIntents(request)` 규칙 파서 — NFKC 정규화, 한/영/로마자 단어경계 매칭, required 마커(무조건/반드시/꼭/only/must) **prefix window** 판정, category 기준 step 바인딩(locked 스텝 제외). `placeMatchesStepIntent` 술어(evidence ∨ 이름포함 ∨ 호환 categoryName).
- **`recommendation-search.ts`**: SearchPhase에 `step_intent`, SearchEvidence에 intent 필드(phase/stepId/canonicalTerm/strength/expansionLevel) 보존. `buildKakaoSearchPlan`이 파서 호출 → step_intent 쿼리 생성, **파싱 성공 시 raw explicit 통문장 검색 제거**(애드덤 패치 7). `executeKakaoSearchPlan` progressive expansion(exact 매칭 ≥3이면 확장 생략, 예산 보호).
- **`kakao-search-cache.ts`**: `isCacheable`에 `step_intent` 제외 추가(개인 텍스트 파생물 크로스유저 캐시 차단, 보안).
- **`recommendation-ranking.ts`**: intent 슬롯에 가산 합산(exact +35 / exp1 +12 / exp2 +6 / 이름 +20). 스키마 무변경.
- **`recommendation-course-selection.ts`**: required intent 선택검증(미충족 후보 → COURSE_VALIDATION_FAILED), 폴백 choices에서 required=매칭만·preferred=카테고리 전체(소프트 우대, spec §18.4).
- **`recommend-date-handler.ts`**: required 게이트 → 매칭(카테고리 AND intent) 후보 0이면 422 STEP_INTENT_UNSATISFIED.
- **에러코드**: `STEP_INTENT_UNSATISFIED` — contracts/errors(ko·en)/zod enum/lib client/locales ko·en 대칭.
- **`recommendation-prompt.ts`**: 버전 `recommend-date-v4-step-intent`, resolvedStepIntents 블록(intent별 matchingCandidateIds) + required 선택 제한 지시.
- **교체 경로**: 코드 무변경(baseRequest 재사용으로 자동 전파), 회귀 테스트로 고정.

### 리뷰 반영 (IMPORTANT 5건 수정)
루프탑카페 categoryName키워드 제거·게이트 카테고리검사·locked 스텝 intent제외·preferred 배타강제→소프트완화·required window prefix화. (부정어 "말고" 처리는 Phase 2)

### 검증
- `npx jest`: **94 suites / 767 tests 전부 통과**(기준선 733 + 신규 34). `npm run validate`(tsc) 클린.
- **배포 완료**: `recommend-date` v12→**v13**, `replacement-candidates` →**v9** 프로덕션 적용(project wqjguifsmtblgrhdfnji, `supabase functions deploy --project-ref`, CLI 자동 번들). DB 마이그레이션 없음(스키마 무변경). 신규 import(step-intent) 번들 정상.
- 배포 노트: CLI가 `supabase projects list`엔 Date-Navi 미표시(다른 org)나 `--project-ref`로는 토큰 접근 가능. 프롬프트 v4·검색플랜 변화로 캐시 히트율 일시 하락 가능. **실기기 미확인**(JS 변경 → Xcode Release Run 필요): 실제 코스 생성에서 "삼겹살" 요청이 검색·랭킹에 반영되는지 육안 검증 권장.
- 브랜치 `feat/step-intent-phase1`.

### 남은 것
- Phase 2: AI 파서 fallback(`parse_step_intents`), 충돌/미지원/부정어 감지, 파서 칩 UI, 메트릭. Phase 3: 완화 UI. Phase 4: 가격/외부증거(데이터 확보 후).

---

## 2026-07-19 세션 AX — 부적합 장소 필터 (A안, 카카오 무료 결정론)

> 요청: 카카오 API로 쌓은 장소를 "자체 리스트"로 만들어 퀄리티↑. 브레인스토밍 결과 **무료 카카오엔 별점·리뷰 신호가 없음** 확인 → 빈도 기반 인기도 부스팅(C안)은 상권 중심성만 재고 프랜차이즈 편향 역효과라 **폐기**. 확실한 이득인 **부적합 장소 필터(A안)만** 진행, 구글 Places 품질 레벨링(B안)은 백로그 기록.

### 구현 (TDD)
- `recommendation-category.ts`: `UNFIT_CATEGORY_GROUP_CODES`(HP8·PM9·AD5·BK9·PK6·OL7·SW8·MT1·CS2·PS3·SC4·AC5·AG2·PO3) + `UNFIT_CATEGORY_NAME_KEYWORDS`(키즈카페·모텔·무인텔·병원·산부인과·성인) + `isUnfitDatePlace()` 순수 술어.
- `recommendation-ranking.ts` `eligiblePlaces` 필터에 술어 1줄 추가 → **단일 choke point**로 recommend-date(후보)·replacement-candidates(대안) 양쪽 동시 적용.
- 새 테이블·집계·마이그레이션 없음. `EvidencedKakaoPlace`에 이미 있는 `categoryGroupCode`/`categoryName`만 사용.
- 기존 랭킹 테스트가 PK6(주차장)를 중립 픽스처로 쓰던 것 → 실제 부적합이라 AT4로 교체(테스트 의도 보존).

### 검증
- `npx jest`: 729/729 통과. `npm run validate`(tsc): 클린.
- 배포: **완료** — `recommend-date` + `replacement-candidates` 프로덕션 적용(project wqjguifsmtblgrhdfnji).

### 참고
- 스펙: `docs/superpowers/specs/2026-07-19-unfit-place-filter-design.md`
- 후속 B안(구글 Places 별점): PLAN.md Long-Term Backlog 기록.

---

## 2026-07-19 세션 AW — soft message 제거 + 알림 통합("데이트 제안" 1개, 문구 포함)

> 요청: 안 쓰기로 한 soft message의 잔재 제거. 카드 보낼 때 상대에게 **`new_card`("새 데이트 추천") + `soft_message`("다정한 문장/복사 모달") 2개** 알림이 가던 것을, **문구 포함된 "데이트 제안" 알림 1개**로 통합. 목업 4안 중 **3안(간결 리스트 → 탭 시 미리보기 모달) + A(모달의 "제안 보러가기"는 기존 반응 화면으로 이동)** 채택. 결정: 카드 생성만으론 알림 안 가고 **보낼 때만** 알림.

### 구조 변경
- `soft_messages` row insert는 **유지**(후보 탭 "상대가 보낸 제안" 배너 + 반응 화면의 문구 표시가 이 테이블 의존). 이 insert가 곧 제안 알림의 트리거이자 문구 출처.
- 카드 생성 알림(`trg_notify_card`) **제거** → 만들기만 하면 알림 없음. 버킷 확정 등 send 없는 카드 생성도 이제 무알림(사용자 결정).
- 보내기 화면(`send.tsx`) 메시지 입력칸·AI추천 **유지**(문구 출처), soft message 톤 문구만 중립화.

### 구현 (TDD)
- **`lib/push.ts` + `__tests__/push.test.ts`**: `new_card` 라우팅을 `/card/{id}` → `/account/notifications`로(제안 모달에서 문구 확인 후 반응 이동). RED→GREEN, push 3/3.
- **`app/account/notifications.tsx`**: `new_card`(+legacy `soft_message`) → 탭 시 모달. 모달 재구성 = 카드 칩 + 문구 인용 + **"제안 보러가기"**(→ `/share/reaction?cardId=`). **복사 버튼·Clipboard 삭제**. 닫기는 알림 유지(반응 전까지), "제안 보러가기" 눌러야 삭제. 리스트 아이콘 정리(reaction=핑크 Heart, 제안=라벤더 Mail; Sparkles 제거).
- **i18n ko/en**: `proposalTitle/proposalModalTitle/proposalCta/tapToView` 추가, `softMessageTitle·newCardTitle·modalCopyButton·copiedLabel` 제거, `share.send.subText` 중립화.
- **DB 마이그레이션** `20260719120000_merge_proposal_notification.sql`: `trg_notify_card` DROP + `notify_on_soft_message` 재작성(카드 title 조인 → `new_card` payload `{card_id, card_title, message}`).
- **edge function** `send-push`: `new_card`/legacy 모두 title "데이트 제안이 도착했어요", body=card_title(폴백 문구).

### 배포 (프로덕션 적용 완료)
- 마이그레이션 히스토리가 로컬↔리모트 크게 어긋난 상태라 `db push`(오래된 미적용 파일 전부 밀림) 대신 **내 변경만 MCP `apply_migration`으로 직접 적용**. 적용 후 `trg_notify_card` 제거·`trg_notify_soft_message`만 잔존 확인.
- edge function `send-push` **v3 배포**(verify_jwt:false 유지 — X-Internal-Secret 커스텀 인증).

### 검증
- `npm run validate`(tsc) 클린, 전체 **92 suites / 733 tests** 통과.
- **실기기 미확인**(JS 변경 → Xcode Release Run 필요): ①보내기 시 상대 알림함에 제안 1개만 ②탭→모달(카드 칩+문구+"제안 보러가기", 복사 없음) ③"제안 보러가기"→반응 화면·알림 삭제 ④닫기 시 유지 ⑤카드 만들기만 하면 무알림.
- 참고: 배포 전 쌓인 legacy `soft_message` 알림은 새 제안 모달로 열림(card_id 없으면 CTA 숨김).

---

## 2026-07-18 세션 AU — 카카오 검색 크로스 유저 캐시 + 교체 시트 즉시 로딩

> 목표: 교체 시트 2~3초 로딩 제거 + 비슷한 위치 유저 간 카카오 검색 결과 공유(사용자 결정: B 중심, 카카오 약관 리스크 인지 후 강행). 스펙 `docs/superpowers/specs/2026-07-18-kakao-search-cache-design.md`, 플랜 `docs/superpowers/plans/2026-07-18-kakao-search-cache.md`.

### 구현

- **`kakao_search_cache` 테이블** (`20260718020000`): cache_key PK(`endpoint|카테고리∥키워드|격자lat|격자lng|page`), documents jsonb, fetched_at. RLS on·정책 0개(service-role 전용), anon/authenticated revoke, `fetched_at` 인덱스, `purge_expired_ai_data()`에 30일 삭제 추가. **읽기 시 fetched_at 필터라 스케줄러 미가동이어도 만료 미사용.**
- **`_shared/kakao-search-cache.ts`** 신규: 0.005°(~500m) 격자 스냅(스냅 좌표를 카카오 호출에도 사용 → 셀 내 완전 공유), 플랜 전체 키 prefetch 1회, 미스만 카카오 → 성공만 upsert(fire-and-forget + `EdgeRuntime.waitUntil`), 캐시 장애 시 무조건 라이브 폴백, 실패 status 미캐시, put 실패는 `kakao_cache_put_failed` 로그.
- **개인정보**: `additionalRequest` 유래 explicit-phase 쿼리는 캐시 제외(교차 유저 테이블에 자유텍스트 저장 안 함) — 리뷰에서 발견, 반영.
- **파이프라인**: `searchAndRankRecommendation`에 optional `cacheStore`/`cacheMetrics` — 미주입 시 기존 경로 그대로(무회귀).
- **`recommend-date`**(재배포): service-role 캐시 스토어 배선 + `kakao_cache_lookup` 로그. **`replacement-candidates`**(재배포): 동일 배선 + **AI 큐레이션 완전 제거**(결정론 `rankReplacementCandidates`만) + `replacement_candidates_served` 로그. 고아 심볼 삭제: `selectCuratedReplacementCandidates`, `buildReplacementSelectionPrompt`, `REPLACEMENT_SELECT_PROMPT_VERSION` (+전용 테스트). `generate-ai`의 `replacement_select` action은 보존 인프라로 유지.

### KPI 실측 (임시 인증 유저 E2E, 서울숲 좌표, 배포 후)

| KPI | 결과 |
|---|---|
| 교체 시트 응답 | **콜드 574ms / 웜 331~640ms** (기존 2~3초 → 최대 ~87%↓). 주 요인은 AI 큐레이션 제거, 캐시는 ~200ms 추가 절감 |
| 초기 생성(클라 총) | 콜드 5350ms → 웜 3941ms → 셀 히트 2626ms (서버 검색 구간 ~1544ms → ~536ms) |
| 카카오 호출 | 웜/같은 셀 재요청 시 신규 캐시 행 0 = 카카오 호출 0 (완전 히트) |
| 크로스 좌표 공유 | 같은 셀 내 다른 좌표(37.5449/127.0366 vs 37.5444/127.0374) 완전 히트 확인 |
| 정확도 중립 | 웜/콜드 후보 리스트 14개 byte-identical, 생성 코스 동일 — **설계 목표(동일 데이터 더 빠르게) 충족, 정확도 상승은 없음(정직 보고)** |
| 품질 신호 | 결정론 top3에 "서울형키즈카페"가 1위로 노출됨 — AI 큐레이션이 걸렀을 수 있는 데이트 부적합 장소. 후속 개선 후보(카테고리명 기반 감점 등) |

- 주의: `+0.001°`가 셀 경계(127.0384→127.040)를 넘는 케이스 확인 — 셀 경계 부근 유저는 서로 다른 키(정상 동작, 히트율만 영향).
- attestation `metadata.search.requestCount`는 이제 캐시 히트 포함(실제 카카오 호출 수 아님) — 쿼터 모니터링 시 `kakao_cache_lookup`의 `kakaoCalls` 사용.
- 시뮬레이션 임시 유저/세션/attestation/로그 전부 삭제 완료. generate-ai 502 백로그는 이번 실측에서 **재현 안 됨**(4회 전부 200, selectionSource=ai).

### 후속 버그픽스 — add-after-replace 422 (실기기 실측 중 보고)

- 사용자 실측: 교체·기타 전부 정상 + 체감 속도 대폭 개선, **"장소 추가"만 에러**. systematic-debugging으로 규명:
  - **근본 원인 (캐시 배포와 무관한 기존 버그)**: replace mutation이 attested 요청을 그대로 `latest_request`에 저장 → one-shot `replacement` 필드 영구 잔존(실DB로 확인). `addVerifiedStep`·`regenerateUnlocked`가 `...snapshot.request` 스프레드 → 잔존 `replacement`가 recommend-date의 replacement 분기 진입 → "새 스텝 비잠금" 검증 실패 → **422 (Haiku 도달 전, 로그 327~449ms·generate-ai 미호출과 정확히 일치)**. 기존 "add 간헐 실패" 백로그의 실제 원인으로 추정("간헐" = 같은 세션에서 replace 선행 여부).
  - **수정 A (서버, 적용 완료)**: `20260718030000_latest_request_drop_replacement` — RPC `latest_request` 저장 시 양쪽 분기에 `- 'replacement'` + 오염 세션 데이터 보정. 적용 후 오염 0건·스트립 확인. **기존 설치 앱에서 즉시 해결.**
  - **수정 B (클라 방어)**: 신규 `lib/recommendation-request.ts` `omitOneShotRequestFields()` — course-result의 regenerate/replace/add 3개 스프레드 지점 적용. 다음 Xcode Run 때 반영(JS만).
- **사용자 재실측에서 "새 코스에서도 add 항상 실패" 정정 보고 → 주범 별도 확정**: add 시도 3건 전부 attestation 미소비(Edge 200 후 RPC 거부)였고, 실제 attestation 대조로 **핀 0개 → Haiku가 기존 스텝 장소를 통째로 재선택(수퍼빌런→오비야 등) → RPC add의 "기존 스텝 불변" 검증이 constraint_violation으로 거부**를 실증. 세션 AR 백로그 "스텝 추가 간헐 실패"의 실제 메커니즘. replacement 잔존은 부차 버그(replace 후에만 발동)였음.
  - **수정 (클라, AR 예정안)**: `addVerifiedStep`이 잠긴 스텝만이 아니라 **전체 스텝을 핀 전송**(`snapshot.steps.map(toLockedStep)`, locked 플래그 에코 활용) — 서버가 기존 스텝을 그대로 보존하고 새 ai_decide 스텝만 선택.
  - **프로덕션 E2E 선검증 완료**(임시 유저, 재빌드 전): 새 코스 생성→persist→전체 핀 add→RPC add 200, 기존 스텝 완전 보존 + 새 스텝 삽입 확인. 임시 유저 정리 완료.
  - **재빌드 필요**: 핀 수정 + one-shot 스트립 방어가 모두 JS 클라 변경 — Xcode Run 1회.

### 검증

- 최종 90 suites / 702 tests, `npm run validate`, `git diff --check` 통과. 신규 테스트 5파일(`kakaoSearchCache`, `kakaoSearchCacheMigration`, `kakaoSearchCacheWiring`, `latestRequestDropReplacementMigration`, `recommendation-request-one-shot`).
- 서브에이전트 리뷰 1회: important 1건(waitUntil) + minor 3건 반영, attestation 카운트 의미 변화는 문서화로 수용.
- 원격 검증: RLS/권한/인덱스/purge SQL 확인, 두 함수 OPTIONS 204·invalid-JWT 401.
- **클라이언트 무변경** — 실기기 재빌드 불필요, 교체 시트가 그대로 빨라짐.

## 2026-07-18 — 법률 페이지 사실관계 갱신 및 일관성 검증

- `locales/ko.json`·`locales/en.json`의 이용약관/개인정보처리방침을 구현 사실에 맞춰 10개 번호 섹션으로 갱신했고, `app/(auth)/index.tsx`의 로그인 법률 링크를 `/legal/terms`·`/legal/privacy`로 연결했다. 문의처는 `jake051096@gmail.com`으로 확인했다.
- 배포 전에는 자격을 갖춘 변호사의 검토와 승인을 반드시 거쳐야 한다. 변호사는 `[시행일]`/`[Effective date]`, `[법인명/운영자]`/`[Legal entity/operator]`, `[사업장 주소]`/`[Business address]`, `[최소 이용 연령/동의 요건]`/`[Minimum age/consent requirement]`, `[준거법/관할]`/`[Governing law/venue]`을 포함해 법인·연령·이용 자격, 준거법·관할, 시행일을 확인해야 한다.
- 보관·파기 운영(실제 `purge_expired_ai_data()` 삭제 스케줄러의 구성·가동·모니터링 포함), 공개 업로드 정책, 관할별 개인정보 의무도 변호사가 검증해야 한다. 실제 스케줄러를 구성하고 모니터링한 뒤에만 자동 30일 삭제를 공개적으로 약속할 수 있다. 이는 구현 정합성 초안이며 법률 자문이 아니다.

## 2026-07-18 세션 AT — MVP 단일 모드 전환 + 마음 전하기 삭제 + 홈 카드 커플 이미지

> MVP 방향 확정: 완성도 높은 "코스로 정리해줘"만 남긴다. feeling/next_meet 모드는 UI 숨김, 마음 전하기는 코드 삭제. 데이트 후보 만들기 = 코스 플로우, 느낌 남기기 = 후보 카드 reaction 구조로 정리.

### 1. MVP 단일 모드 전환 (UI 숨김, 복원 가능)

- `lib/dateModes.ts`에 `ENABLED_DATE_MODE_IDS = ['make_course']` + `isDateModeEnabled()`(DB text 대응 string 허용) + `PRIMARY_DATE_MODE_ROUTE`(enabled[0]에서 파생) 추가. **복원 = 배열에 id 재추가 한 줄** — 모든 UI 분기가 이 배열에 연동.
- 모드 탭: `_layout.tsx`의 `tabPress` 리스너로 선택 화면 건너뛰고 코스 화면 직행(`router.navigate` — push는 더블탭 시 중복 스택 확인되어 교체). 모드 2개 이상 복원 시 리스너 자동 해제.
- 홈: 모드 카드 1개, dots·"전체보기" 숨김(`MODES.length > 1` 가드), "데이트 후보 만들기" 버튼 → 코스.
- 후보 탭: bucket 필터 chip 숨김(next_meet 연동), FAB → 코스(`candidates.fabAddCourse` ko/en 추가). BucketSection 등 코드는 의도적으로 유지(도달 불가).
- 카드 상세: "부담돼요" 재생성 버튼을 `isDateModeEnabled(card.mode ?? 'feeling')`로 게이트 — 숨긴 모드의 레거시 생성 경로 차단(사용자 결정). 반응 남기기는 유지.
- 8각도 finder + 검증 리뷰에서 CONFIRMED 3건(더블탭 중복 push, PRIMARY 하드코딩 desync, 재생성 우회) 수정 완료.
- 승인된 트레이드오프: 기존 `bucket_list` 데이터는 복원 전까지 UI 접근 불가(DB 온전). `/mode-flow/feeling`·`bucketlist` 딥링크 잔존.

### 2. 마음 전하기(soft-message) 코드 삭제

- 삭제: `app/(tabs)/soft-message.tsx`, `app/soft-message/`, 탭바 항목, `lib/ai.ts`의 `generateSoftMessage`/`adjustSoftMessage`, `lib/prompt.ts`의 빌더/타입, analytics `soft_message_generated`, ko/en `softMessage` 섹션·`tabs.softMessage`, 전용 테스트 2개.
- **유지**: `soft_messages` 테이블, `generate-ai`의 `soft_message` action, `generateInviteMessage`, share/send·share/reaction·알림함 — 카드 제안 흐름이 같은 인프라 사용.

### 3. 홈 코스 카드 커플 이미지 + 정렬

- 단일 모드일 땐 가로 스크롤 대신 좌우 20px 동일한 전폭 카드.
- Unsplash 커플 사진(photo-1575390130709)을 2340×1020 크롭 → 1600px 리샘플로 `assets/images/couple-card.jpg` 번들. 카드 `overflow:hidden`으로 위쪽 모서리만 radius.
- **RN 버그**: `width:'100%' + aspectRatio` 조합이 무시되고 원본 고유 크기(1600×697pt)로 렌더 — 실기기에서 세로 2화면 확대 크롭으로 나타남. `SINGLE_MODE_IMAGE_HEIGHT = Math.round((SCREEN_W-40)/2.3)` 명시적 숫자 높이로 해결. 비율 변경은 `SINGLE_MODE_IMAGE_RATIO` 한 줄.
- 비율 비교 목업 아티팩트: https://claude.ai/code/artifact/bf4dc8d8-e556-422b-b5b2-64afb9de37da (1.65/2.3/2.8/3.3).

### 검증

- 전체 81 suites / 669 tests, `npm run validate`(tsc) 매 단계 통과. 신규 `__tests__/mvp-mode-visibility.test.ts`(19 tests) + `dateModes.test.ts` 확장.
- 실기기: 이미지 세로 버그는 사용자 스크린샷으로 확인 후 수정 — **명시적 높이 수정본은 아직 실기기 미확인(Xcode Run 필요)**.

### 다음 세션 참고

- 실기기 확인: 홈 카드 이미지 152pt 높이, 모드 탭 직행/뒤로가기, 후보 FAB, 탭바 4개.
- 이미지 비율 취향 조정 시 `SINGLE_MODE_IMAGE_RATIO`(현재 2.3)만 변경. 크롭 소스는 원본 URL로 재크롭 가능.
- 기존 백로그 유지: `generate-ai` 502 조사, 스텝 추가 간헐 실패(addVerifiedStep 전체 스텝 핀), 방문 확인 트리거, 장소 실사진.

---

## 2026-07-17 세션 AS — 영어 로컬라이제이션 버그 + 커플 이중언어 카드 + UI 폴리시

> 사용자가 보고한 3가지 UX 이슈(영어 모드 로컬라이제이션 안 됨, 일부 화면 뒤로가기 버튼 없음, 커플 언어 불일치 시 카드가 상대 언어로 안 보임)를 TDD로 수정하고 Supabase에 적용. 이어서 코스 결과 화면 UI 폴리시(하단 버튼 대칭, 교체 후보 모달화, 로케일 카피 정정) 진행.

### 조사 결과 (Explore 3건 병렬)

- 뒤로가기 버튼: 전 화면 중 `app/settings.tsx`(마이페이지)만 `BackBar` 없이 push되는 화면이었음. 나머지 미표시 화면(`generating.tsx`, `onboarding/connected.tsx`)은 의도적.
- 장소 자동완성/검색은 전부 Kakao Local API이며 language 파라미터 자체가 없음 — 장소명·주소는 구조적으로 항상 한국어. AI가 생성하는 카드 텍스트(제목/요약/추천이유)만 언어 분기 가능.
- 확정된 `date_cards`는 커플 둘 다 RLS로 읽을 수 있는 유일한 테이블인데, 텍스트가 생성 시점 요청자 언어 하나로만 저장되어 파트너가 다른 언어 모드면 그대로 안 맞는 언어로 보임.

### 수정 (TDD, 6단계)

| 대상 | 내용 |
|---|---|
| `app/settings.tsx` | `BackBar largeTouchTarget` 추가 |
| `app/(tabs)/candidates.tsx` | 버킷 확정 카드 생성 시 `'ko'` 하드코딩 제거 → `useI18n().language` 사용 |
| `shared/recommendation/schemas.ts` | `recommendDateCardSchema`에 optional `i18n: { ko, en }` 블록 추가(하위호환) |
| `supabase/functions/_shared/recommendation-course-selection.ts` | `buildCardTexts()`로 카드 제목/요약/추천이유를 ko·en 동시 생성, top-level은 요청 언어 유지(레거시 리더 호환) |
| `supabase/migrations/20260717010000_date_cards_content_i18n.sql` | `date_cards.content_i18n` jsonb 컬럼 추가 + `apply_recommendation_session_mutation`의 confirm 분기가 `v_card -> 'i18n'`을 함께 저장하도록 재정의 |
| `lib/card-i18n.ts` (신규) | `localizeCardContent()` — `content_i18n`에서 뷰어 언어 텍스트를 오버레이, 컬럼 없거나 malformed면 원본 폴백 |
| `app/(tabs)/candidates.tsx`, `app/card/[id].tsx`, `app/share/send.tsx`, `app/share/mutual.tsx` | `content_i18n` 조회 + `localizeCardContent` 적용 |

### 배포

- 마이그레이션(컬럼 추가 + RPC 재정의)을 linked Supabase(`wqjguifsmtblgrhdfnji`)에 순서대로 적용(컬럼 먼저 → RPC), 원격 SQL로 반영 확인.
- `recommend-date`, `replacement-candidates` Edge Function 재배포 완료.
- 배포 순서 주의점(리뷰에서 확인): 마이그레이션이 앱 빌드보다 먼저 적용되어야 함(새 빌드가 `content_i18n`을 select하므로) — 이번엔 순서 지켜 적용함.

### UI 폴리시 (후속 요청, TDD)

- 코스 결과 화면(`course-result.tsx`) 하단 3버튼(Regenerate/Add place/Confirm)이 영어 라벨 길이에 따라 비대칭·오버플로 나던 문제 — 전부 `flex: 1` 균등 분할 + 좌우 패딩 동일 + 라벨 중앙정렬로 수정.
- "Replacement options"가 타임라인 아래 인라인 패널이던 것을 `StepActionSheet`와 동일한 패턴의 바텀시트 모달로 교체(어두운 백드롭 탭-투-클로즈, 기존 X 버튼 컴포넌트를 시트 우상단에 재사용, 최대 높이 75%).
- Confirm 버튼 체크 아이콘 제거, 영어 라벨 "Confirm course" → "Confirm"(한국어 "코스 확정"은 유지).
- 코스 만들기 화면(`course.tsx`)의 글자수 카운터와 "Build a course" 버튼이 붙어있던 간격 문제 — `generateButton`에 `marginTop: SP.xxl` 추가.
- 로케일 카피 정정: `course.moods.options.novel`의 영어 라벨이 "Novel"(명사로 오독 소지) → "Unique"(의미 오역, 사용자 지적으로 되돌림) → 최종 **"Different"**(원 의미 "색다른" 유지 + 명사 오독 없음).

### 검증

- 전체 81→82 suites, 655 tests, `npm run validate`(tsc) 매 단계 통과.
- 신규 테스트: `settings-back-button`, `candidates-language-propagation`, `recommendation-card-i18n`, `dateCardsContentI18nMigration`, `card-content-i18n`, `card-screens-localization`, `course-result-ui-polish`, `course-screen-generate-button-spacing`.
- code-reviewer 서브에이전트 리뷰(마이그레이션 diff, i18n 전달 경로, strict 스키마 호환, RLS, 배포 순서) — 버그 없음, 배포 순서 주의만 확인 후 반영.

### 남은 제약 / 다음 세션 참고

- 장소명·주소는 Kakao Local API 한계로 계속 한국어 고정(승인된 범위). 영어 모드에서도 "서울숲 date course"처럼 장소명만 한글.
- 기존에 이미 확정된 `date_cards`는 `content_i18n`이 없어 생성 당시 언어로만 남음 — 새로 확정하는 카드부터 양쪽 언어 저장.
- Xcode 재빌드로 실기기 확인 필요(JS 변경만이라 Run만 다시 하면 됨. 아직 사용자 실기기 확인 전).
