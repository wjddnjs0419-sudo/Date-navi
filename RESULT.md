# RESULT.md

## 2026-07-31 — 코스 키워드 필수 조건 전환·원격 배포 완료

- 사용자가 코스 스텝에서 선택하는 기본 제안 칩과 직접 입력 키워드를 구분하지 않고 모두 `required` intent로 전환했다. 적용 범위는 식사·카페·술·액티비티·문화·산책 전체다.
- 이전에는 키워드가 `preferred`라 검색·랭킹 가점만 받고 최종 선택에서 일반 카테고리 장소로 완화될 수 있었다. 이제 기존 required 게이트가 AI 선택과 결정론 폴백 모두에서 키워드 검증 후보만 허용한다.
- 매칭 후보가 없으면 일반 장소로 바꾸지 않고 `STEP_INTENT_UNSATISFIED`와 기존 조건 수정 UI를 반환한다. 라멘(기본 제안)·샐러드(직접 입력) 회귀 테스트로 이 경로와 AI 호출 전 차단을 고정했다.
- 태그 전환 뒤 교체 후보 요청이 대상 스텝의 `intentTags`를 버리던 회귀를 수정했다. 저장된 원 요청에서 태그를 다시 resolve하므로 최초 추천과 교체 후보가 같은 필수 intent를 사용한다.
- 코스 편집 RPC가 `latest_request.courseSteps`를 재구성할 때 모든 카테고리의 `intentTags`를 삭제하던 DB 회귀를 수정했다. BEFORE UPDATE 트리거가 동일 step/category의 태그를 최신·원본 요청에서 보존하며, 마이그레이션 백필로 이미 손상된 세션도 복구한다. 교체 Edge도 원본 태그를 별도로 복구해 이중 방어한다.
- 카카오 단계 키워드 검색을 거리순에서 정확도순으로 변경하고, 정확도 상위 5개·1페이지만 필수 키워드 증거로 인정한다. 기존 거리순과 무제한 evidence는 `샐러드`처럼 의미가 약하게 연결된 가까운 일반 식당도 동일한 exact evidence로 인정해 최종 선택되는 문제가 있었다. 일반 카테고리·주변 탐색은 거리순을 유지한다.
- 키워드 없는 기본 액티비티가 추상어 `액티비티`를 검색해 동명의 업체와 전국 레저 사업자를 반환하던 경로를 제거했다. 기본 검색을 `보드게임카페·방탈출·볼링장·클라이밍장`으로 분산하고 모든 Kakao 검색을 중심 반경 10km로 제한했다. 반경 도입 전 30일 캐시와 섞이지 않도록 캐시 키 버전도 분리했다.
- 설계: `docs/superpowers/specs/2026-07-31-course-keyword-hard-constraint-design.md`. 실행 계획: `docs/superpowers/plans/2026-07-31-course-keyword-hard-constraint.md`.

검증·배포:

- 최종 대상 Jest 9 suites / 351 tests 통과.
- `npm run validate` 통과.
- 태그·기본 액티비티 검색 공통 코드가 포함된 `recommend-date` v45와 `replacement-candidates` v36의 ACTIVE 상태를 확인했다.
- `20260731183000_preserve_recommendation_step_intent_tags.sql`을 원격 DB에 적용하고 migration history 반영을 확인했다.
- 실제 로그인 사용자로 라멘·샐러드·의도적 무매칭 키워드를 생성하는 프로덕션 QA는 이 세션에서 수행하지 못했다.

## 2026-07-30 — AI 코스 생성 제한 구현·원격 배포 완료

- 브랜치: `feat/ai-rate-limits`. 코스 생성(`course_generate`)만 사용자 ID 기준으로 보호한다: 동일 사용자 요청 lock 2분, 고정 5분 burst 3회, Asia/Seoul 일일 20회.
- 차감 시점은 Kakao 후보 검증 뒤 실제 Claude 선택 직전이다. 인증·입력·Kakao 실패와 전량 핀/교체 결정론 경로는 차감하지 않으며, Claude 호출 이후 실패는 차감 유지한다.
- `generate-ai`는 `recommend_date_select`/`estimate_place_price` 두 내부 action만 `INTERNAL_AI_TOKEN`으로 허용한다. 직접 legacy action은 403, 프롬프트 상한은 각각 20,000/1,000자다.
- 장소 가격 추정은 claim UUID와 2분 stale handoff를 사용해 신규 장소당 한 번만 실행한다.
- 앱은 409 진행 중, 429 burst, 429 일일 한도를 별도 한·영 안내로 표시한다.

검증 완료:

- 대상 회귀: 13 suites / 182 tests 통과.
- `npm run validate` 통과.
- 전체 `npm test -- --runInBand` 통과. 기존 테스트의 `console.warn`/React `act` 경고만 출력되며 실패는 없었다.
- A–F 각 묶음은 설계 문서와 계획을 컨텍스트로 한 read-only subagent 리뷰 승인 후 진행했다.

배포 완료 기록:

- 원격 migration history의 과거 불일치를 CLI `migration repair`로 정렬했다. 스키마·데이터를 직접 수정하지 않고 history만 조정한 뒤 `db push --dry-run`에서 이번 두 migration만 대상임을 확인했다.
- `supabase db push`로 `20260729120000_ai_rate_limits.sql`, `20260729130000_place_price_estimation_claim.sql`을 순서대로 적용했다.
- 사용자 QA에서 확인된 고정 창 경계 문제를 `20260730010000_ai_rolling_burst_limit.sql`로 교체했다. 이제 성공 시각 기준 rolling 5분 내에는 정확히 3회만 허용하며, 기존 fixed burst count는 이력 복원이 불가능해 새 rolling 소비 행에서 새로 시작한다.
- 새 무작위 `INTERNAL_AI_TOKEN`을 Edge secret으로 설정하고 `generate-ai` v29, `recommend-date` v40을 배포했다.
- 인증 없는 두 Function의 POST는 모두 HTTP 401로 차단됨을 확인했다.

남은 staging 계정 검증:

1. authenticated JWT로 7개 quota/lock/price RPC가 거부되고 service role만 허용되는지, 내부 token 없는 authenticated `generate-ai`가 403인지 확인한다.
2. staging에서 동시 요청 409, 4번째 burst 429, 일일 20회 초과, Kakao 실패 미차감, 동일 신규 장소의 가격 추정 1회만을 확인한다.

출시 후 지표: 사용자별 `course_generate` 일평균, burst/daily reject 비율, lock conflict 수, Anthropic 429 수.

## 2026-07-28 — AI 추천 예산 단위 정규화

- 계약은 유지: UI의 1인 코스 예산을 클라이언트가 `totalBudgetKRW`(2인 총액)로 전송한다.
- 랭킹 앵커와 `places.estimated_*`/`places.observed_*` 원장은 모두 **1인·장소당 원화**로 통일했다. 따라서 앵커는 `totalBudgetKRW / 2 / 장소 수`다.
- `20260728100000_normalize_observed_price_per_person.sql`은 관측 가격 재계산 함수를 같은 단위로 교체하고 기존 모든 장소 원장을 재계산한다. Supabase CLI로 원격에 적용하고 migration history를 기록했다.
- `recommend-date`, `replacement-candidates` Edge Function을 배포했다. 입력·결과 UI는 “1인 전체 코스 예산”을 명시하며 결과에는 같은 1인 금액을 표시한다.
- 검증: 예산 단위 회귀 테스트 포함 대상 Jest 54개와 `npm run validate` 통과. 전체 Jest는 기존 RN 비동기 teardown(`window.dispatchEvent is not a function`)으로 종료 실패했으며 이번 변경과 무관한 테스트 환경 문제다.


현재 및 직전 세션의 핫 컨텍스트만 유지합니다. 과거 기록은 `RESULT_ARCHIVE.md`에 누적합니다.

---

## 2026-07-26 — 현 커밋 AI 장소 추천 아키텍처 분석 (코드 기준, 변경/배포 없음)

대상 커밋 `9cb6f31`. `recommend-date` 기반 **신규 코스**와 `generateDateCards` 기반 **레거시 느낌/다음만남**은 품질 보장이 다르다.

- **신규 코스:** Kakao 후보를 서버에서 좌표·카테고리·제외 ID·부적합 카테고리로 필터/랭킹하고 Claude는 후보 ID만 선택한다. 응답 스키마·서버 조립이 존재/카테고리/코스 내 stable Kakao ID 중복을 강제한다. 위치·카테고리·필수 step intent는 강함. 이동은 실제 도로/도보가 아닌 직선거리÷80m/분의 provisional 휴리스틱이며 budget은 prompt 메타데이터일 뿐 후보 근거가 아니다.
- **레거시 느낌/다음만남:** 위치+후보가 있을 때만 client-side Kakao 후보→Claude 선택→클라이언트 검증을 쓴다. 위치/후보가 없거나 후보가 0개면 일반 LLM 카드/고정 fallback으로 내려가 실제 장소·거리·예산·중복 보장이 약해진다. bucketlist 확정도 이 경로다.
- **리뷰/평점:** Kakao 수집·Candidate·ranking 모델에 리뷰 수/별점/품질 필드가 없다. 부적합 업종만 제거하며 저평점 장소를 회피할 수 없다.
- **예산:** `totalBudgetKRW`는 전달되지만 ranking budget=0, prompt에도 verified evidence가 아니라고 명시한다. 사용자에게 비용 적합성을 실제로 보장하지 못한다.
- **DB 품질 효과:** `recommendation_sessions`/attestation은 편집 무결성, `date_cards`는 표시·공유, Kakao cache는 속도, pair/feedback/log 테이블은 분석·향후 학습 기반이다. 현재 ranker의 behavior/preference/budget은 모두 0이며 pair·feedback을 읽는 추천 경로가 없다. 즉 DB 저장이 다음 추천의 품질을 자동으로 개선하지 않는다.
- **검증:** `recommend-date-server`, ranking/intent/contracts, legacy candidate/거리, session learning migration 등 9 suites / 169 tests 통과. 테스트는 synthetic contract 검증이며, 실제 Kakao/Anthropic 품질·저평점 회피율은 측정하지 않는다.

## 2026-07-25 세션 — Phase 14 출시 준비: TestFlight 크래시 해결 + E2E 발견 5건 수정

> 커밋 `692258e`(발견 #1~#3), `cf24d12`(발견 #4~#5). 앞선 `1d91a8f`(약관), `b07847d`(iPhone전용), `519293b`(BackBar 테스트)은 병행 세션이 커밋. **전부 main, 푸시 안 함.**

### TestFlight 첫 빌드 크래시 (핵심)
- 증상: 빌드 2 설치 시 시작 즉시 크래시(EXC_BAD_ACCESS, Hermes JS 스레드). 크래시 로그는 빌드2 것이라 오판 주의.
- 근본원인: **EAS 프로덕션 빌드에 `EXPO_PUBLIC_SUPABASE_URL/ANON_KEY` 등 env 누락**. `.env`는 gitignore라 클라우드 빌드에 안 올라가고, [lib/supabase.ts](lib/supabase.ts)가 없으면 throw → 시작 크래시.
- 해결: `eas env:create`로 4개(SUPABASE_URL·ANON_KEY·GOOGLE_IOS_CLIENT_ID·GOOGLE_WEB_CLIENT_ID)를 **production 환경**에 등록. EAS는 `distribution=store` 프로필에 production env를 자동 주입(문서 확인) → eas.json `environment` 명시 불필요. 빌드3부터 정상. (첫 빌드 = Distribution Cert/Provisioning Profile 생성, Apple 2FA는 사용자 터미널에서. EAS 큐 느리면 `.ipa` 받아 Transporter 직접 업로드.)

### E2E 발견 5건 (모두 TDD, 실기기 검증)
- **#1 위치 캐시좌표**: 권한 거부 상태에서 "내 위치 사용 중" 최근항목 탭 시 캐시 좌표로 생성됨. → [lib/recentLocations.ts](lib/recentLocations.ts) `source:'current'`를 최근목록에 저장/로드 안 함. GPS 버튼(권한 확인)만 현재위치.
- **#2 장소 리뷰 = 네이버 검색결과**: place ID 없어 이름 검색이라. → 카카오 place URL(`place.map.kakao.com/{id}`)로 통일, `lib/placeBrowser.ts`(브랜드 툴바 toolbarColor/controlsColor). 네이버(buildNaverMapUrl) 완전 제거.
- **#3 리뷰 별점 미표시 + 사실상 1인 리뷰**: 첫 리뷰가 즉시 `status='done'`으로 카드 잠가 상대 진입 차단. → done은 **둘 다 리뷰 시에만**(`lib/reviewFlow.ts`), 홈 다가오는·계획 목록에서 **per-user 제거**(내 리뷰 있으면 내 뷰에서만), `planTabOf`에 myReviewedIds, 추억 목록·상세에 작성자 배지+별점(`components/StarRating.tsx`). **회귀 주의**: status 즉시 done 제거로 confirm 화면 재리뷰 경로 열려 본인 중복 리뷰 가능해짐 → confirm.tsx에 per-user memoryDone 가드 추가로 차단(독립 리뷰가 발견).
- **#4 미저장 코스 candidates 누출**: 코스 흐름은 "확정" 시 RPC가 카드를 `status='active'`로 insert(candidates 필터와 동일) → 저장/보내기 전에 이탈해도 남음. feeling 흐름은 저장/보내기에서만 insert. → **client-flip**: 확정 직후 카드를 `draft`로, 저장(commitTitle)·보내기 시 `active` 승격. 코어 RPC(200줄, 확정/교체/재생성) 재작성 회피 위해 클라이언트에서 처리.
- **#5 상세 2단계**: 스텝 "상세 보기" → 얇은 place-detail → "리뷰·지도" 한 번 더. → 상세 버튼이 `openPlaceInBrowser` 직접 호출, place-detail.tsx·죽은 i18n 제거.

### 검증
- 전체 **185 suites / 1182 tests, tsc 클린**. Phase별 리뷰(#3은 독립 리뷰 에이전트).
- 마이그레이션 0건(#4는 client-flip). 약관 확정값: 시행일 2026-07-24 / 운영자 김정원 / 대한민국 법 / 만 14세.
- **다음**: 빌드5로 #4·#5 재검증 + 남은 E2E(교체·lock·부분재생성·확정·탈퇴) → App Privacy·demo couple·App Review note → 심사 제출.

---

## 2026-07-24 세션 — 커플 연결 QA 버그 2건 (해제 미동작 + connected 플래시)

> 커밋 `5d8d70d` (main 푸시 완료).

### 증상 1 — 해제 버튼 눌러도 해제 안 됨 (근본원인: DB 미배포)
- `disconnectPartner()`가 `disconnect_date_planner_couple` RPC 호출. 원격 DB pg_proc 조회 결과 **함수 없음** — 마이그레이션 `20260705090000_disconnect_date_planner_couple.sql`이 로컬에만 있고 배포 안 됐었다. 호출 에러 → catch → 실패 알림, 해제 미실행.
- **해결**: MCP `apply_migration`으로 함수 배포. `authenticated` 실행권한 확인. 코드 변경 없음(순수 배포).
- (참고: `proacl`에 anon=X도 뜨지만 함수가 `auth.uid()` null이면 예외라 무해 — 기존 함수 공통 패턴.)

### 증상 2 — connected 화면 아주 짧게 뜸 (참여자 쪽)
- `joinWithCode` 성공 직후 `await supabase.auth.refreshSession()`(구 370줄) → 루트 `_layout.tsx`의 `onAuthStateChange(TOKEN_REFRESHED)`가 `routeForSession` 재실행 → linked+온보딩미완 → `/onboarding/preferences`로 `replace`해 방금 띄운 connected를 덮어씀.
- custom access token 훅은 `config.toml`에서 비활성 → 커플 정보는 JWT 클레임 아님 → 이 refreshSession은 **기능상 불필요 = 순수 버그 원인**.
- **해결**: 그 한 줄 제거. TDD 회귀 테스트 `__tests__/couple-connect-join-no-refresh.test.tsx` 추가(RED 확인: refreshSession 1회 호출 → GREEN).

### 검증
- 커플 테스트 4 suites / 14 tests 통과. `npm run validate`(tsc) 통과.
- 로직/네비게이션만 변경(UI 렌더 무변) → StyleSeed 게이트 대상 아님.
- AGENTS.md 안티패턴 2줄 추가(jest.mock 호이스팅, joinWithCode refreshSession 금지).

### 남은 것
- 실기기에서 초대→수락(플래시 사라짐)·관리→해제(실동작) 각 1회 QA 재확인. 코드는 JS라 Xcode Run만(prebuild 불필요), DB는 반영 완료.

---

## 2026-07-24 세션 — Apple 로그인 시뮬 검증 + i18n 영어 폴백

### Apple 로그인: 코드 머지 + 실검증
- Phase 2 로직 브랜치 `feat/apple-signin-logic`(커밋 3개)를 main에 **로컬 머지**(529e55a). 미푸시.
- 외부 콘솔 2건 완료: `com.datenavi.app` Sign In with Apple capability는 **원래 켜져 있었음**(entitlements와 일치). Supabase Apple provider 활성화 + Authorized Client IDs `com.datenavi.app`. **Service ID·Secret·"Allow users without email" 전부 불필요** — identity token(JWT)에 email 클레임이 매번 오므로 Supabase가 파싱한다.
- iOS 시뮬레이터(iPhone 17/iOS 26.5) 실제 로그인 **성공**. 단 시뮬 iCloud 로그인이 처음 멈춰서 `simctl shutdown/boot` 재부팅 후 통과 — 시뮬 iCloud는 원래 불안정, 앱 문제 아님.

### 빌드 막힘 2건 (다음에 또 만날 수 있음)
1. **머지 전 발견**: 워크트리가 남긴 `node_modules` 심링크(절대경로)가 브랜치에 커밋돼 있었다. `.gitignore`의 `node_modules/`(슬래시)가 심링크를 안 잡은 게 원인 → `node_modules`로 수정하고 언트랙(5847285).
2. **`npx expo run:ios` 링크 실패**: `ld: cannot link with SwiftUICore`는 무관한 경고였고, 진짜 원인은 RN 디버그 심볼(`DebugStringConvertible::getDebugName`,`Sealable::ensureUnsealed`,`RCTPackagerConnection`) undefined. Expo54/RN0.81은 `Pods/React-Core-prebuilt`의 prebuilt React 코어를 Debug/Release로 갈아끼우는데(`replace-rncore-version.js`), 판단 기준인 `.last_build_configuration` 마커가 사라지면 "마커 없음+Debug=교체 스킵"으로 처리 → 디스크에 남은 **Release 코어**와 Debug 팟이 링크돼 실패. **해결: 마커에 실제 구성(`Release`) 기록 후 재빌드** → 스크립트가 불일치 감지해 로컬 debug 타르볼 자동 추출.

### i18n: 미지원 언어 영어 폴백 (커밋 3008d42)
- `detectInitialLanguage()`가 ko/en 아닌 기기(불어·일어 등)를 전부 **한국어**로 떨어뜨리던 버그. 영어가 국제 baseline → `?? 'ko'` → `?? 'en'`. 함수 export.
- `lng`·`fallbackLng`도 `ko`→`en`: 영어 화면에서 키 누락 시 한국어가 새어나오는 것 방지.
- TDD 신규 테스트 4개(ko→ko, en→en, fr→en, 로케일없음→en). `npm run validate` 통과 · `npx jest` **170 suites / 1116 tests 전부 통과**.
- 순수 로직/설정 변경(UI 렌더 없음) → StyleSeed 게이트 대상 아님.

### 남은 것
- Apple 로그인 **실기기 Release 검증 1회**(심사 대비) + main 원격 푸시. PLAN.md 상단 참조.

---

## 2026-07-23 세션 BS — Sign in with Apple Phase 1 (공식 버튼 교체)

> 사용자 요청: "방금 애플 developer 계정을 등록했어. 우선 로그인 화면에서 애플 로그인 버튼을 [Apple 공식 버튼 페이지] 참고해서 수정하자". 브랜치 `feat/apple-signin-button` (미머지·미푸시).

### 발견한 사실
1. **기존 애플 버튼은 가짜였다** — `AppleFruitIcon`이 Apple 로고 대신 "잎사귀 달린 일반 과일 실루엣"을 `View` 두 개로 그리고 있었다(주석에 의도적이라고 명시됨). 심사에서 Sign in with Apple 버튼으로 인정받지 못한다.
2. **버튼 높이가 Apple 최소치 미달 가능** — 높이를 카카오 공식 이미지 비율(600×90)에서 유도하는데, 폭 320pt 화면이면 41pt가 나온다. Apple은 **44pt 최소**를 요구(iOS 최소 탭 타깃과도 동일).
3. `account.apple.com/signinwithapple/button`·HIG 페이지 모두 **JS 렌더라 WebFetch로 본문을 못 읽는다**. 스펙을 긁는 대신 **네이티브 공식 버튼을 쓰는 쪽**이 확실 — 로고·문구·다국어·터치 피드백을 Apple이 직접 그리므로 규정 준수가 자동 보장된다.

### 구현 내용
- `expo-apple-authentication@~8.0.8` 추가 + `app.json` plugins 등록.
- **`lib/socialButtonMetrics.ts` 신설** — 인라인 상수였던 버튼 크기 계산을 순수 함수로 분리하고 `Math.max(44, ...)` 클램프 추가. 3버튼 공통이라 클램프가 셋 다에 적용돼 정렬이 유지된다.
- **`app/(auth)/index.tsx`** — `AppleFruitIcon`·관련 스타일 삭제, `AppleAuthentication.AppleAuthenticationButton`으로 교체(`SIGN_IN` / `BLACK` / `cornerRadius = socialButtonRadius(height)` / `width: '100%'`). 우리가 정할 수 있는 건 타입·색·반경·크기뿐이고 라벨·아이콘은 직접 그리면 안 된다.
- **미지원 플랫폼에서 숨김** — `isAvailableAsync()`를 `useEffect`에서 확인해 true일 때만 렌더. Apple 로고를 안드로이드에 노출하는 건 브랜드 가이드 위반이고, 이 앱은 `app.json`에 android 타깃이 있다.
- `locales/en/auth.json` `appleStart`: "Continue with Apple" → **"Sign in with Apple"**(버튼 타입 `SIGN_IN`의 네이티브 영문 문구와 접근성 라벨을 일치시킴). ko는 "Apple로 로그인"으로 이미 일치.
- **탭 동작은 아직 "준비 중" 안내 그대로** — 로그인 로직은 Phase 2.

### 테스트에서 배운 것
- 네이티브 버튼이 `isAvailableAsync()` resolve 후에 붙으므로 **모든 로그인 화면 테스트를 `await act(async …)`로 통일**해야 한다. 기존 동기 `render()` 헬퍼를 그대로 두면 다른 테스트에서 act 경고가 새어 나온다(테스트는 통과하지만 출력이 더러워짐).
- 목킹한 컴포넌트는 `findByProps().type`이 host 문자열이 아니라 **mock 함수 자체**로 잡힌다.

### 검증
- TDD(RED 확인 후 GREEN). 신규 테스트 7개(사이징 3 + 버튼 4: 공식 컴포넌트 타입·SIGN_IN·BLACK, 크기·반경 일치, 미지원 플랫폼 숨김).
- `npm run validate`(tsc) 통과 · `npx jest` **165 suites / 1087 tests 전부 통과**, 출력 클린.
- StyleSeed 게이트 **93/100** (lock: warm-dtc, 플로어 80). 유일한 감점은 기존 `C.textMuted` 대비 미달(전역 토큰 문제, 범위 밖).
- **실기기 미확인** — 네이티브 모듈이라 `expo prebuild` + Xcode Run 필요. 다음 세션 선행 작업.

### 남은 것
→ **`PLAN.md` 최상단 "다음 세션 활성 작업 — Sign in with Apple Phase 2"에 체크리스트로 정리해 두었다.** 요약: prebuild(에셋 백업 주의) → Apple Developer App ID capability + Supabase Apple provider 설정 → `lib/appleAuth.ts` + `signInWithIdToken`. 네이티브 iOS는 Service ID·Secret 없이 동작하고 **App Store 출시 전에도 테스트 가능**하다. 주의: 애플은 **이름·이메일을 최초 1회만** 준다.

### 주의: 무관한 변경분 혼입
브랜치를 딸 때 candidates 관련 미커밋 변경 5개 파일(`app/(tabs)/candidates.tsx`, 테스트 2, ko/en locale)이 이미 워크트리에 있었다. 세션 시작 시점 git status는 clean이었으므로 **다른 세션이 병행 작업 중**인 것으로 보인다. 건드리지 않았으니 커밋 전에 분리할 것.

---

## 2026-07-24 세션 BS — 커플 초대 공유: OG 프리뷰 + 유니버설 링크 (배포 완료)

> 사용자 요청: "링크 공유할 때 OG가 없다"를 이어, 공유 문구 개선 + 카톡 프리뷰용 OG + 앱 딥링크까지.

### 결정 (사용자와 합의)
- OG 방향 **B (마스코트 + 초대자 이름)**, 좌우 분할 **B1**. 마스코트는 기존 mascot-heart-couple.
- 이름 조회는 **(가) 서버 조회**(공개 RPC). OG 언어는 **초대자 언어**(링크의 `l`), 랜딩은 **받는 사람 언어**(Accept-Language). ko/en 양쪽 문안 작성.
- 링크는 `https://date-navi.vercel.app/invite?code=DN-XXXX&l=ko`. 도메인은 무료 vercel.app.
- TestFlight 중 = 애플 유료계정 있음 → **유니버설 링크 가능**(지난 세션의 "유료계정 없음" 전제 폐기). Team ID `YQGRS8YK72`.

### 구현 (브랜치 feat/share-og-invite, 커밋 6b8c770)
- **앱**: `buildInviteUrl(code, lang)` 신설(TDD), couple-connect 공유를 커스텀 스킴→https로 교체, `associatedDomains: applinks:date-navi.vercel.app`(app.json + ios entitlements 직접), shareMessage ko/en 개선. `parseInviteCodeFromUrl`은 이미 https 파싱 가능이라 무변경. 딥링크 핸들러(_layout)도 무변경(모든 URL을 parseInviteCodeFromUrl로 처리).
- **Supabase**: `get_invite_inviter(code)` SECURITY DEFINER 공개 RPC — 초대코드로 초대자 display_name만 반환(anon 허용, 그 외 노출 0). 마이그레이션 파일 + apply_migration 적용.
- **web/** (Next.js 15.5.21, Vercel): `/invite` 랜딩(뷰어 언어, 코드·앱열기·스토어 폴백), `/api/og` 동적 이미지(B1, 이름 RPC 조회, 초대자 언어, 한글은 번들 Pretendard(OFL) 서브셋 1.29MB), `.well-known/apple-app-site-association`(AASA).

### 검증
- 앱 185 suites/1188 tests + tsc 클린(web은 앱 tsconfig exclude에 추가). web tsc·next build 통과.
- **로컬+라이브 실렌더 확인**: OG ko/en/이름있음 3종 모두 200/PNG로 정상 렌더(마스코트·한글폰트·B1 레이아웃·이름 accent 강조). 이름 케이스는 임시 auth user+profile+couple 삽입→렌더 확인→**전부 삭제**(DB가 비어 있었어서 가능, 잔여 0 확인). AASA 200/json, 랜딩 ko/en Accept-Language 전환 정상.
- 배포: `vercel deploy --prod`(scope jeongwon-kim-s-projects), 프로젝트명 `web`, alias `date-navi.vercel.app` 부여. **Vercel SSO 보호(all_except_custom_domains)가 .vercel.app을 막아 302** → REST API로 `ssoProtection:null` 해제(공개 공유 사이트라 필수, 스크래퍼 접근 허용). 최종 date-navi.vercel.app 전 경로 200.

### 남은 것 / 주의
- **OG route가 fs로 읽는 폰트·마스코트**는 `process.cwd()` 기준 + next.config `outputFileTracingIncludes`로 번들 포함. `import.meta.url`+fetch(file://)는 서버리스에서 ENOENT라 폐기됨(로컬만 됨). 이 패턴 유지할 것.
- **유니버설 링크는 앱 재빌드 필요** — entitlement associatedDomains를 넣었지만, 실기기에서 링크 탭→앱 바로 열림은 새 빌드를 TestFlight/기기에 올린 뒤에만 동작. 재빌드 전엔 랜딩만 뜨고 "앱에서 열기"(스킴 재시도)로 폴백.
- **스토어 폴백 미설정** — APP_STORE_URL/TESTFLIGHT_URL 비어 있어 "곧 출시" + 코드 수동입력 안내로 폴백. 정식 출시 후 Vercel 환경변수 한 줄로 반영(앱 재배포 불필요).
- **D(계획 공유 OG)는 보류**(공개 URL 코스 노출 = RLS 설계 필요).
- **커플 초대 화면이 아직 앱에 있나?** — 이전 세션들에서 MVP 축소가 있었으니, 이 공유 흐름이 실제 노출되는지 실기기 확인 필요.
- 병렬 세션 흔적: `docs/app-store-review-pack.md`는 다른 세션 산출물이라 이 커밋서 제외.

---

## 2026-07-23 세션 BR — 브랜드 로고 교체 + 네이티브/JS 스플래시 이음매 제거

> 사용자 요청: "기존 로고가 안 맞는 것 같다, 힉스필드로 만든 로고로 교체하자" + "앱 켤 때 우리 로딩 화면 전에 다른 화면이 하나 더 뜬다".

### 발견한 사실
1. **앱 아이콘이 Expo 기본값이었음** — `assets/icon.png`는 파란 "A" 데모 아이콘, 안드로이드 adaptive 배경도 `#E6F4FE`(Expo 기본). 실제로 쓰이던 건 `assets/logo.png`(500×500)라 **App Store 1024×1024 요건 미달 = 심사 거절감**.
2. **"먼저 뜨는 화면" = iOS 네이티브 스플래시**(`ios/DateNavi/SplashScreen.storyboard`). 없앨 수 없고, JS 로딩 화면과 픽셀을 맞춰 이음매를 없애는 것이 유일한 해법. 안 맞던 이유 3가지: 배경색 불일치(`#FFF8F3` vs `#FFF9FC`), 로고 크기 점프(네이티브는 여백 큰 500px 이미지, JS는 width 200), JS의 0.85→1 확대 애니메이션.

### 구현 내용
- **에셋(힉스필드 API 호출 0회, 크레딧 0)** — 기존 완료 생성물을 내려받아 로컬 PIL로 처리. 채도 마스크 + 바깥쪽 플러드필 + 모폴로지 닫힘으로 핀+하트만 컷아웃(`scripts/brand/extract_pin.py`), 아이콘·스플래시·안드로이드 adaptive·모노크롬·파비콘 생성(`scripts/brand/build_assets.py`). 정렬 기준은 마크 전체 bbox가 아니라 **가장 큰 연결 요소(=핀)** — 하트가 우상단에 떠 있어 bbox 기준이면 핀이 좌하단으로 밀려 보인다.
- **이음매 제거** — `lib/splash-layout.ts`가 storyboard의 `scaleAspectFit`(4면 핀 고정) 배치를 그대로 계산하고, `app/index.tsx`가 **같은 이미지·같은 좌표·같은 크기**로 시작. 핀 확대 애니메이션 제거(텍스트만 페이드인), 전환은 `SplashScreen.setOptions({ fade: true })`로 크로스페이드.
- **실버그 1건** — 타이틀 블록이 `useNativeDriver`로 `top`(레이아웃 속성)을 애니메이트하려 해 네이티브에서 터질 코드였음. 위치 View / 애니메이션 View 분리.
- `app.json`: icon·splash 경로 교체, splash 배경 `#FFF9FC`(= `C.bg`), adaptive 배경 `#FFF1F6`.

### 검증
- TDD(RED 확인 후 GREEN). 161 suites/1069 tests + tsc 클린. StyleSeed 게이트 89/100(lock: warm-dtc, 플로어 80).
- 실기기 확인 완료. 사용자 피드백 2회 반영: 아이콘이 중앙에 안 맞고 큼 → 핀 기준 정렬 + 비율 0.74→0.60→**0.50**.

### 주의: iOS 네이티브 에셋은 git에 없음
`ios/`가 `.gitignore` 대상이라 `Images.xcassets` 사본은 **커밋되지 않는다**. 이번엔 `prebuild` 없이 카탈로그 3곳(AppIcon / SplashScreenLegacy / SplashScreenBackground)만 직접 갈아끼워 Xcode Run만으로 확인 가능하게 했다. **누가 `expo prebuild`를 돌리면 초기화되므로**, `__tests__/ios-native-brand-assets.test.ts`가 `assets/`와의 드리프트를 감지한다(`ios/` 없는 환경에선 스킵).

### 남은 것
- **명도 차이 미해결 가능성** — 사용자가 "JS 화면이 조금 더 어둡다"고 보고. 코드상 양쪽 다 `#FFF9FC`로 일치(네이티브 colorset sRGB 1.0/0.9765/0.9882, PNG에 ICC 없음)라 설정 불일치는 아님. 네이티브 `UIImageView`↔RN `Image` 합성 경로 차이로 보고 크로스페이드로 가렸다. 페이드 후에도 보이면 배경색을 스플래시 이미지에 구워넣는 방식으로 전환 필요(단, 화면 위아래 여백 밴드는 여전히 색상값으로 칠해짐).
- `assets/logo.png`(500×500)는 이제 참조처 0. 삭제 보류.
- `C.textSub`(3.76:1)·`C.textMuted`(2.6:1)가 WCAG 4.5:1 미달 — 앱 전역 토큰 문제라 이 세션 범위 밖으로 두었다. 별건 처리 필요.
- **B안 미착수**: 공유 링크 OG. 조사 결과 공유 지점 3곳 중 링크가 있는 건 커플 초대 1곳뿐(`datenavi://` 커스텀 스킴 → 카톡 프리뷰 없음 + 미설치자 먹통), `share/send`·`card/[id]`는 링크조차 없이 텍스트만 보낸다. 유니버설 링크는 유료 애플 계정 필요 → 웹 랜딩+OG 먼저, 스토어 링크는 출시 후 1줄 교체.

### 브랜치 분리 경위 (중요)
작업 중 **다른 세션이 같은 체크아웃에서 병행 작업**하며 브랜치를 `main`→`feat/card-detail-hero-removal`로 옮기고, 내 로고 변경분을 자기 커밋 `24d3ebf style(card): swap reaction emoji for lucide icons`에 함께 커밋해 버렸다. 그쪽 브랜치는 미푸시 상태라 히스토리를 건드리지 않고, `main` 기준 워크트리에 이 세션 결과만 다시 담아 `feat/brand-logo-splash`로 분리·푸시했다. **`feat/card-detail-hero-removal`에는 로고 파일의 옛 스냅샷이 남아 있으므로**, 그 브랜치를 머지할 때 이 브랜치가 나중에 오도록 하거나 해당 경로를 정리해야 한다.

---

## 2026-07-23 세션 BQ — candidates 카드 상세: 빈 히어로 박스 + 하트 해제 불가 수정

> 사용자 보고: 코스 카드 상세에서 화면이 깨져 보임(납작한 빈 흰 박스), 하트는 한 번 누르면 재클릭해도 안 꺼짐.

### 원인
1. **빈 히어로 박스** — `CandidateHeroCard`가 `place_name`이 있을 때만 `PlaceRow`를 그리는데, make_course 카드는 장소가 전부 `steps` 안에 있고 카드 자체 `place_name`은 null. 결과적으로 absolute 포지션 하트만 남은 내용 0짜리 SoftCard가 렌더됨. 레이아웃 버그가 아니라 "코스형 카드에 히어로가 표시할 내용이 없다"는 설계 구멍.
2. **하트 해제 불가** — prop 이름은 `onToggleLove`인데 실제로는 `handleReact('love')`만 호출. 삭제 경로가 없어 재클릭해도 love를 다시 upsert.

### 구현 내용 (main 머지 완료)
- `shouldUnreactOnTap(current, tapped)` 순수 함수로 해제 결정 분리(단위 테스트 대상), `handleUnreact()`가 reactions row delete + `myReaction`/`myConditionTag` 리셋, `handleReactionTap()`이 하트·반응 그리드 두 진입점을 공유. burden 해제 시 조건부 섹션도 자동 소멸.
- `CandidateHeroCard` 3분기: `placeName` → 기존 PlaceRow / 없고 `steps` 있음 → 코스 요약 2줄(MapPin + "N곳 코스" + 라벨 체인, `numberOfLines=1`) / 둘 다 없음 → SoftCard 자체 미렌더(빈 박스 재발 방지). 호출부는 `steps={resolveDisplaySteps(card)}`로 summary 파싱 폴백까지 재사용.
- i18n `card.heroCourseCount` ko/en 동시 추가(`{{count}}` 보간).

### 검증
- TDD 4태스크 + 테스트 보강 1커밋. 전체 156 suites/1024 tests + tsc 클린.
- StyleSeed 게이트 96/100(lock: warm-dtc, 플로어 80).
- 코드 리뷰 서브에이전트: **merge 가능**, Critical·Important 0건. i18next `count`가 예약 복수형 키라 위험 지점이었으나 실증으로 양 언어 정상 보간 확인.
- 리뷰 Minor 중 "자명 통과로 죽은 테스트"는 반영(steps가 장소를 대신할 때 PlaceRow 미렌더 검증으로 용도 변경). 히어로 하트 `disabled={saving}` 누락은 미반영 — 정확성은 내부 `saving` 가드가 보장하고, prop 신설 대비 순수 시각적 이득이라 판단.

### 남은 것 (의도적 범위 밖)
- 히어로 코스 요약과 하단 `CourseStepList`가 같은 화면에 중복 노출. 태그 칩도 스텝 라벨과 중복.
- 목업 `08_candidate_detail` 1:1(대표 사진·D-day 배지·날짜 메타·아바타 반응·"함께 좋아요" 합의 배너)은 미착수 — 후보 단계에 날짜/사진 데이터 자체가 없어 스키마부터 필요.
- 스크린샷의 스텝 라벨↔장소 불일치("스타벅스 낙성대DT점" vs "이공커피")는 세션 BO(e1afe4d) 이전 생성 데이터. 코드 수정 대상 아님, 재생성하면 정상.

### 마무리
- 실기기 확인 완료(사용자: "정상작동"). main 머지(`9a4e9d6`, --no-ff) 후 156 suites/1024 tests·tsc 재확인, 브랜치 삭제 완료.
- 설계·계획 문서는 `docs/superpowers/specs|plans/2026-07-23-candidate-hero-fix*.md`.

### 다음 세션 후보
1. 하트 doodle 아이콘 + 코너 미니 일러스트 4화면(`card_confirm`·`memory_new`·`memory_edit`·`couple_connect_manage`) — 기계적, 데이터 변경 없음. 여기에 이번 세션이 남긴 중복 정리(히어로 코스 요약 ↔ `CourseStepList`, 태그 칩 ↔ 스텝 라벨)를 묶으면 컨텍스트가 살아 있어 싸다.
2. `feat/manual-place-pick` Phase 2(입력 핀) — Phase 0·1 완료 상태로 미머지.
3. 제품 결정 선행 필요(착수 금지): candidates 목업 분류 체계 ↔ 기존 반응 시스템 충돌, D-day·사진 스키마, 목업 08 히어로. `share/mutual` 텍스트 렌더 글리치는 Xcode View Debugger 필요.
4. 정리: `ui/*` 5개 + `feat/*` 3개 브랜치가 며칠째 방치 — 머지 여부 확인 후 삭제.

---

## 2026-07-23 세션 BP — 혼용 코스 편집 전면 실패: 진짜 원인 3개 특정·수정·배포

> 사용자 보고: BO 수정 후에도 그대로. 혼용 코스에서 AI 스텝 교체·재추천·순서 교체까지 전부 실패, 잠금/장소 추가만 동작.

### 원인 (로그·DB 실데이터·배포 번들 소스로 각각 확정)
1. **다른 장소 보기 404 (주범)** — 배포된 `replacement-candidates` v9(7/19)가 핀 계약(7/20 추가) 이전 스키마 번들. `latest_request` 파싱 시 `courseSteps`의 `pinnedKakaoPlaceId`가 `unrecognized_keys`로 실패 → 404 → 시트 자체가 안 열림. 어떤 스텝을 눌러도 동일. BO의 핀 영구 보존이 이 잠복 배포 누락을 상시 발현시킴(그 전엔 첫 뮤테이션에서 핀이 지워져 우연히 동작).
2. **재추천 422** — 재추천 요청이 미잠금 스텝들의 현재 장소를 `excludedPlaceIds`에 넣는데, 핀 스텝이 미잠금이면 자기 핀 장소가 제외돼 랭킹에서 탈락 → 핸들러 핀 실재 게이트가 `STEP_PIN_UNAVAILABLE` 422. 실제 파이프라인+핸들러 조합 테스트로 재현 확정.
3. **순서 교체 (핀 무관, 잠복 버그)** — reorder RPC는 성공(API 로그 200, DB 순서 변경 확인)하지만 route 메타데이터(인접거리)를 재계산하지 않음. 클라이언트 스냅샷 검증(`schemas.ts` route 실측 재검증, 허용오차 0.5m)이 3스텝 이상 코스에서 항상 불일치 → 파싱 예외 → 에러 표시 + **그 세션은 이후 모든 로드가 실패(먹통)**. 실제 세션 데이터(저장 1.5m vs 실측 244m)를 클라이언트 검증 코드에 넣어 재현 확정. 2스텝은 거리 대칭이라 우연히 통과해 미발견이었음.

### 구현·배포 내용
- **`replacement-candidates` 재배포** (코드 무변경, 최신 스키마 번들).
- **`recommend-date` 수정·재배포**: 핀 실재 게이트·핀 강제(pin wins)를 "이번 호출에서 실제로 핀을 골라야 하는 스텝"에만 적용 — 요청에서 잠긴 스텝(락이 자리 운반), 교체 대상 스텝, 핀 장소가 excludedPlaceIds에 있는 스텝은 핀 취급 제외(`effectiveCourseSteps`로 하위 선택·프롬프트·폴백 전 단계 일관 적용). 부수 수정: add 시 잠긴 핀 스텝 강제가 락 검증과 충돌해 조용히 결정론 폴백으로 떨어지던 문제(`ai_invalid_selection`) 해소.
- **마이그레이션 `20260723090000_reorder_route_recompute_and_pin_scope`**: ①클라이언트와 동일한 haversine SQL 헬퍼 + 세션 route 재계산 함수(인접거리·총거리·도보판정·relaxedConstraints 일관 갱신) ②reorder/delete 후 RPC가 route 재계산 ③regenerate는 새 장소가 핀 장소와 일치할 때만 핀 유지(핀 이탈=해제, BO 인바리언트 완성: "핀은 스텝이 그 장소에 있는 동안만 유효") ④기존 전체 세션 일괄 복구. 적용 후 문제 세션 인접거리 `[244.2, 1.5]`→`[244.2, 244.5]` 복구 확인.

### 검증
- TDD: 핸들러 신규 테스트 2건(제외된 핀 게이트 스킵/잠긴 핀 비강제) RED→GREEN, 마이그레이션 계약 테스트 5건 신설.
- 전체 156 suites/1020 tests + tsc 클린. 실기기 확인 완료(이슈 없음): 다른 장소 보기·재추천·순서 교체·기존 먹통 세션 복구.

### 교훈
- 공유 스키마(`shared/recommendation/schemas.ts`)를 바꾸면 **그 스키마를 번들하는 모든 엣지 함수를 함께 재배포**해야 한다(strict zod라 필드 추가도 구버전 번들에선 파싱 실패). 이번 404의 근본 원인.
- RPC가 파생 데이터(route)를 안 고치면 클라이언트 강검증이 세션을 먹통으로 만든다 — 스텝 형태를 바꾸는 뮤테이션은 파생 메타데이터까지 책임진다.

### 다음 세션
- 없음(완료).

## 2026-07-22 세션 BO — course-result AI+수동 혼용 코스 replace 실패 버그 수정

> 사용자 보고: 코스 생성 AI와 사용자가 직접 혼용했을 때, 코스 생성된 화면에서 "다른 장소 보기"(replace)가 안 됨.

### 원인
- **(A, 즉시 재현)** `recommend-date-handler.ts`의 replacement 처리 분기가 `buildCandidateOnlyCourse`를 호출할 때, 교체 대상 스텝을 의도적으로 `lockedSteps`에서 빼는데(그래야 그 스텝만 새 후보로 바뀔 수 있음) 그 스텝의 `pinnedKakaoPlaceId`(코스 생성 입력 시 직접 지정했던 옛 장소)는 그대로 남아있어, `recommendation-course-selection.ts`의 "pin wins" 검증이 "새 후보 kakaoPlaceId === 옛 pin"을 강제해 항상 `COURSE_VALIDATION_FAILED`(422)로 실패했다.
- **(B, 별개 발견)** 세션에 어떤 뮤테이션이든(잠금·교체·추가·재생성 등) 한 번 성공하면, `apply_recommendation_session_mutation` RPC가 `latest_request.courseSteps`를 DB에서 `{id, category, label}` 세 필드만 다시 읽어와 통째로 덮어써 pin 정보가 세션의 첫 뮤테이션 성공 시점부터 조용히 사라졌다(테이블에 애초에 pin 컬럼이 없었음). 방치하면 A를 고쳐도 regenerate 등 다른 경로에서 같은 증상이 재발할 수 있었다.

### 구현 내용
- **A**: `recommend-date-handler.ts`의 replacement 분기에서 `buildCandidateOnlyCourse`에 넘기는 `request.courseSteps` 중 교체 대상 스텝만 `pinnedKakaoPlaceId`/`pinnedName`을 제거한 사본을 전달 — 옛 pin이 새 후보를 막지 않도록.
- **B**: 신규 마이그레이션 `20260722110000_recommendation_course_steps_preserve_pin.sql` — `recommendation_course_steps`에 `pinned_kakao_place_id`/`pinned_name` 컬럼 추가, 세션 최초 저장 시 원본 요청에서 채움, 모든 뮤테이션에서 보존(regenerate는 stepId로 매칭해 이어붙임), replace 성공 시에만 명시적으로 지움(다음 regenerate에서 되살아나 A와 같은 방식으로 재발하는 것 방지).

### 검증
- TDD: `recommend-date-pinned-step.test.ts`에 "핀 스텝 자신을 replace 대상으로 삼아도 새 후보로 교체된다" RED→GREEN, `recommendationCourseStepsPreservePinMigration.test.ts` 신설(컬럼 추가·persist 반영·rebuild 시 pin 동반·replace 시 clear·regenerate 시 carry-over) RED→GREEN.
- 전체 스위트 155 suites/1013 tests + `npm run validate`(tsc) 클린.
- 배포: `recommend-date` 엣지 함수 CLI 재배포 완료, 마이그레이션은 CLI `db push`가 로컬에 없는 원격 전용 마이그레이션 항목과 충돌해 대신 Supabase MCP `apply_migration`으로 적용(이 프로젝트의 기존 배포 방식). Supabase advisor(security) 확인 — 이번 변경으로 인한 신규 이슈 없음(기존에 있던 무관한 경고들뿐).
- main에서 직접 작업(별도 브랜치 없음). 앱 코드(TS/TSX) 변경 없이 서버(엣지 함수+DB)만 바뀐 수정이라 클라이언트 재빌드/Xcode Run 불필요.

### 다음 세션
- 없음(완료).

## 2026-07-22 세션 BN — course-result 교체(replace) 검색 흐름 버그 수정

> 사용자 보고: AI 코스 생성 후 스텝 교체 시 "Search a place"를 누르면 바텀 모달(어두운 백드롭)이 검색 화면 위에 그대로 남아 화면을 다시 클릭해야 사라지고, 검색으로 장소를 골라도 코스에 반영되지 않음.

### 원인 (systematic-debugging Phase 1~3)
- `app/mode-flow/course-result.tsx`의 교체 바텀시트가 네이티브 `<Modal visible={!!replacementTargetId}>`로 구현돼 있는데, "Search a place" 클릭 시 `router.push`로 `place-search` 화면만 띄우고 이 Modal을 닫지 않음 → Modal이 검색 화면 위에 계속 오버레이로 남음(증상 1).
- 사용자가 그 잔상을 지우려고 백드롭을 탭하면 `closeReplacementPanel()`이 `replacementTargetId`를 `null`로 초기화함 → 이후 검색에서 장소를 골라도 `subscribePickedPlace` 리스너가 `replacementTargetId`를 `null`로 보고 `replaceWithCandidate`를 호출하지 않음(증상 2). 하나의 원인 체인.

### 구현 내용
- `searchScreenActive` 상태 추가: "Search a place" 클릭 시 `replacementTargetId`는 유지한 채 `true`로 설정 → Modal의 `visible`을 `!!replacementTargetId && !searchScreenActive`로 변경해 검색 화면 위 잔상 제거.
- `useFocusEffect`(expo-router)로 화면이 다시 포커스될 때(검색에서 선택하든 취소하든) `searchScreenActive`를 `false`로 리셋 → 교체 대상이 살아있으므로 시트가 다시 보이거나(취소 시 재시도 가능), 고른 장소가 정상적으로 `replaceWithCandidate`에 전달됨.

### 검증
- TDD: 실패 테스트 2개(모달 숨김 / 포커스 복귀 후 재표시+교체 반영) 작성 → RED 확인 → 구현 → GREEN.
- 기존 `__tests__/course-result-screen.test.tsx`가 매 테스트마다 렌더 인스턴스를 unmount하지 않아 `subscribePickedPlace` 리스너가 테스트 간 누수되는 사전 존재 문제 발견 → `afterEach`에서 공용 인스턴스를 unmount하도록 정리(전체 테스트 파일에 적용).
- `course-result-ui-polish.test.ts`의 Modal 조건 정규식 계약을 새 조건에 맞게 갱신.
- 전체 스위트 154 suites/1003 tests + `npm run validate`(tsc) 클린. main에서 직접 작업(별도 브랜치 없음), 실기기(Xcode Release) 검증 완료.

### 다음 세션
- 없음(완료).

## 2026-07-22 세션 BM — generating 화면 연속 퍼센트 진행바 교체 + 일러스트 확대

> 계획서(`docs/superpowers/plans/2026-07-22-generating-percent-progress-bar.md`)를 워크트리(`worktree-generating-progress-bar`)에서 subagent-driven-development로 실행.

### 구현 내용
- `components/ui.tsx`의 `GeneratingView` 진행바를 steps.length개 분절 박스 → 연속 퍼센트 채움 바(Animated.Value + Animated.timing, width interpolate)로 교체. `step`/`steps` prop 계약, 호출부(`generating.tsx`) 무변경.
- 코드 품질 리뷰가 지적한 이슈 수정: 새 채움 애니메이션이 기존 pulse와 달리 reduceMotion 미존중 → pulse와 동일 패턴으로 보정(reduceMotion 시 setValue로 즉시 점프).
- 사용자가 세션 중 실기기 스크린샷으로 "생성 중 화면 일러스트가 작아 보인다" 피드백 → 코스맵 일러스트(`date-course-map-vertical`) 폭 200→240으로 확대(사용자가 옵션 중 +20% 선택).

### 검증
- TDD 커밋 3개(`cd2fff2` 채움바, `5834025` reduceMotion 보정, `a4cb9c2` 일러스트 확대) + ratchet 문서 커밋(`63ec8b5`, forwardRef testID 중복 매칭 이슈).
- 스펙 준수 리뷰·코드 품질 리뷰(재리뷰 포함) 모두 통과. 전체 스위트 151 suites/999 tests + `npm run validate`(tsc) 클린.
- **잔여 이슈(Minor, 미수정)**: `fillPercent` 애니메이션에 unmount cleanup 없음(pulse는 `pulse.stop()` 있음) — 실사용 영향은 낮다고 판단했으나, 전체 스위트 실행 시 real timer 기반 Animated로 프로세스가 즉시 종료되지 않는 현상 확인(`--forceExit` 필요). 프로젝트 전역 jest 설정 변경은 스코프 밖이라 보류, 다음에 이 파일 손댈 때 cleanup 추가 권장.
- 시뮬레이터 육안 확인/`ss-verify`는 사용자가 직접 Xcode Run으로 진행하기로 함(Claude 미실행).
- main 저장소 루트에 우리 작업과 무관한 uncommitted 변경(course-result·memories·brand wordmark, 다른 세션/직접 편집분)이 있는 상태였으나, 겹치는 파일이 없어 병합해도 안전함을 확인(사용자 승인) 후 진행. `git merge --no-ff`로 main에 병합, 병합 후 154 suites/1007 tests + `tsc --noEmit` 재검증 통과, 워크트리/브랜치 정리 완료(커밋 5개 모두 main에 반영 확인 후 삭제).

### 다음 세션
- `fillPercent` Animated.timing에 unmount cleanup(stopAnimation) 추가 검토(Minor, 급하지 않음).

## 2026-07-22 세션 BL — review 화면 별점(1~5) 단일화 + 수동 추억 추가 화면 마이그레이션

> 원 계획서(`docs/superpowers/plans/2026-07-22-review-rating-overhaul.md`)는 별점 바 + 감정 5종 그리드를 병존시키는 안이었다. Task 1(마이그레이션)·Task 2(감정 4→5 확장)까지 구현한 시점에 사용자가 "둘 다 필요한가?"를 지적 → brainstorming으로 설계 재검토 → 별점(1~5) 하나로 통일하고 감정은 파생 피드백으로만 표시하는 쪽으로 확정. 새 설계 문서(`docs/superpowers/specs/2026-07-22-review-rating-star-unification-design.md`) + 새 계획서(`docs/superpowers/plans/2026-07-22-review-rating-star-unification.md`) 작성 후 워크트리(`worktree-review-rating-overhaul`)에서 subagent-driven-development로 재실행.

### 구현 내용
- `date_memories.rating`(1~5 정수, CHECK 제약) 컬럼 마이그레이션 — linked Supabase 프로젝트(Date-Navi)에 배포 완료.
- `lib/ratingFeedback.ts` 신규 — 별점→감정 아이콘/파스텔톤/i18n키 매핑 + `deriveWantAgain(rating>=4)`을 한 곳에 두는 공유 모듈. `app/card/review.tsx`와 `app/card/memory/new.tsx`가 공동 참조.
- `app/card/review.tsx`: 감정 5종 탭 그리드를 완전히 제거하고 별점(1~5) 탭 바 하나만 필수 입력으로 남김. 선택한 별점 아래에 파생된(탭 불가) 아이콘+라벨 피드백 표시.
- `app/card/memory/new.tsx`(카드 없이 수동으로 추억 추가하는 화면)도 동일 패턴으로 마이그레이션. **설계 검토 중 발견한 실제 회귀**: 이 화면이 `review.json`의 감정 로케일 키를 공유하면서도 자기만의 옛 `love/good/ok/change` 아이콘 맵을 하드코딩해뒀던 탓에, 앞선 세션(감정 4→5 확장)이 공유 키를 바꾸자 이 화면이 조용히 깨져 있었다 — 공유 모듈로 통합하며 근본 수정.
- ko/en 로케일 동시 반영(`starRatingLabel`/`noStarRatingError`/`ratingFeedback{bad,meh,okay,good,amazing}`, 옛 `ratingLabel`/`ratings[]`/`noRatingError` 제거).

### 검증
- TDD 커밋 5개(migration → 감정 4→5 확장 → 설계 전환 후 재작업 3개) + 통합 리뷰(사용자 지시로 태스크별이 아닌 전체 완료 후 한 번에 spec 준수 + 코드 품질 리뷰) 모두 통과. 코드 품질 리뷰가 지적한 "review.tsx만 실제 렌더 계약 테스트가 있고 new.tsx는 소스 텍스트 검증뿐" 갭은 `card-memory-new-screen-contract.test.tsx` 추가로 보완.
- 전체 스위트 151 suites/996 tests + `npm run validate`(tsc) 클린.
- `date_memories.rating` 마이그레이션 사용자 승인 후 원격 배포 완료(컬럼+CHECK 확인됨).
- 워크트리 커밋 8개를 main에 fast-forward 병합, main에서 재검증 후 워크트리/브랜치 정리 완료.
- 시뮬레이터/실기기 육안 확인과 `/ss-verify`는 사용자가 직접 Xcode로 진행하기로 함(Claude 미실행).

### 다음 세션
- `app/card/memory/[id].tsx`(추억 상세, 읽기 전용)는 여전히 스코프 밖 — `want_again`만 표시, `rating` 미표시. 요청 시 후속 작업.
- "AI 요약 도움" 카드는 원 계획대로 계속 제외(새 AI 백엔드 필요).

### 추가 조치 (같은 날 후속) — `app/card/memory/edit/[id].tsx` 별점 편집 통일

> 사용자가 실기기에서 이 화면("Edit memory")이 옛 "Want to do this again? Yes/No" 하트 토글 그대로인 걸 발견 → 확인 결과 이 화면은 `rating` 컬럼을 아예 select/update하지 않아, review/new에서 별점으로 저장한 추억을 여기서 수정하면 `rating`과 `want_again`이 새 파생 규칙(`rating>=4`)과 어긋나는 조합이 생길 수 있었다. 사용자가 "별점 편집으로 통일"을 선택.

- 계획서(`docs/superpowers/plans/2026-07-22-memory-edit-star-rating.md`)를 새 워크트리(`worktree-memory-edit-star-rating`)에서 실행. `Heart` 예/아니오 토글 → 기존 `lib/ratingFeedback.ts` 재사용한 별점(1~5) 바 + 파생 피드백으로 교체(review/new와 동일 패턴, 재구현 없음). `select`/`update`에 `rating` 컬럼 추가, 기존 값 로드해 별 채움 상태로 표시. `wantAgainLabel`/`wantAgainYes`/`wantAgainNo` 로케일 3키 제거(다른 화면 미사용 확인 후).
- 목업(`09_card_memory_edit`)은 원래 하트 토글이었으나, 세 화면(review/new/edit) 간 완전한 일관성을 위해 사용자가 의도적으로 목업 이탈을 선택(이전 review.tsx 별점 단일화와 같은 판단 기준).
- TDD 2커밋 + spec 준수·코드 품질 리뷰 통과(코드 품질 리뷰가 "로드된 rating=5가 실제로 반영됐는지 검증 안 함" Minor 이슈 지적 → 파생 피드백 문구 assertion 추가로 즉시 보완). 152 suites/999 tests + tsc 클린. main에 fast-forward 병합, 워크트리 정리 완료.
- 시뮬레이터/실기기 확인은 review 화면 작업과 마찬가지로 사용자가 직접 진행.

## 2026-07-22 세션 BK — memories 전체/베스트 필터 탭

> 계획서(`docs/superpowers/plans/2026-07-22-memories-filter-tabs.md`)를 격리 워크트리(`worktree-memories-filter-tabs`)에서 subagent-driven-development로 실행.

### 구현 내용
- `app/(tabs)/memories.tsx`에 "전체"/"베스트"(다시 하고 싶은 추억, `want_again`) 필터 탭 추가. 기존 `loadMemories()`가 전체 목록을 이미 로드하므로 새 쿼리 없이 클라이언트 순수 함수 필터링만 추가(`filteredItems = activeFilter === 'best' ? items.filter(i => i.want_again) : items`), `FlatList` data 교체, 통계 카드 아래 탭 바 UI.
- 목업(`06_memories.png`)은 4탭+포토그리드지만 이번 스코프는 사용자가 확정한 대로 **2탭 + 기존 리스트 카드 레이아웃 유지**로 축소. "기념일"/"장소별" 탭과 포토그리드 전환은 분류 기준 데이터 모델이 없어 미착수 — 다음 세션 대상.
- ko/en 로케일 키(`filterAll`/`filterBest`) 동시 반영.

### 검증
- TDD 진행(RED→GREEN), 커밋 2개: `49902ec`(필터 탭 추가) → 코드 품질 리뷰에서 Important 이슈(베스트 탭 want_again=true 0건일 때 리스트 본문이 빈 채로 렌더돼 고장난 것처럼 보임, `app/plans/index.tsx`의 기존 탭별 empty-state 패턴과 불일치) 발견 → `4eecbcb`(`ListEmptyComponent`로 빈 상태 문구 `memories.emptyBest` 추가)로 수정 후 재리뷰 승인.
- 스펙 준수 리뷰·코드 품질 리뷰(재리뷰 포함) 모두 통과. 전체 스위트 147 suites/983 tests + `tsc --noEmit` 클린.
- 시뮬레이터 자동 스크린샷(`expo run:ios` 네이티브 빌드)은 사용자 요청으로 중도 중단 — 대신 워크트리 커밋을 main에 병합(`git merge --no-ff`)한 뒤 사용자가 실기기(Xcode Release 빌드)로 직접 확인, 정상 동작 확인 완료.

### 다음 세션
- "기념일"/"장소별" 탭, 포토그리드 레이아웃 전환은 분류 기준(기념일 판정, 장소 그룹핑) 데이터 모델 설계가 먼저 필요 — 별도 논의 후 착수.

## 2026-07-22 세션 BJ — place-search 카테고리 자동검색 버그 + 검색 전 상태(최근검색/추천지역)

> 계획서(`docs/superpowers/plans/2026-07-22-place-search-category-recent-search.md`)를 subagent-driven-development로 실행. Task 1~4를 각각 독립 구현 서브에이전트에 위임(TDD)하고, 사용자 피드백에 따라 리뷰는 각 task 직후가 아니라 4개 task 완료 후 한 번에 통합 spec+quality 리뷰로 진행.

### 구현 내용
- **버그 수정**: `app/mode-flow/place-search.tsx` 검색 트리거 조건을 "검색어 있음" → "검색어 있음 OR categoryCode 있음"으로 확장. 이전엔 `categoryCode`만 갖고 진입(course-result "직접 검색" CTA, course.tsx "내가 직접→장소 검색해서 지정하기")해도 검색어가 없으면 `if (!q) return`으로 아예 검색이 안 일어나 빈 화면이었음.
- **신규**: `lib/recentPlaceSearches.ts`(AsyncStorage, 최근 5개, 중복시 맨앞 이동 — `lib/recentLocations.ts`와 동일 패턴) + 검색 확정 시 자동 저장 배선.
- **신규 UI**: 검색어도 categoryCode도 없는 진입(course.tsx 경로 한정)에 목업(`02_place_search.png`) 대로 "최근 검색" 칩 행 → "추천 지역"(고정 리스트: 성수동·한강·연남동·잠실·이태원) 칩 행. 칩 탭 시 검색창에 채워짐. ko/en 로케일(`modeFlow.json`) 함께 반영.
- course-result 경로는 스텝 카테고리가 `KAKAO_CATEGORY_CODE`(meal/cafe/culture/walk 등)에 매핑되면 categoryCode가 같이 넘어가 칩 없이 바로 카테고리 검색 결과가 뜸 — 칩이 항상 보장되는 건 course.tsx 경로뿐.

### 검증
- TDD 4커밋(`3daaca0`·`00e6ebe`·`1bb20af`·`d7faecf`), 통합 리뷰(스펙 100% 준수, 불필요한 변경 없음) 통과. 전체 스위트 147 suites/979 tests + tsc 클린(머지 후 재확인).
- ss-score 96/100, styleseed-design-review 98/100 — 컨트롤러가 직접 실행해 서브에이전트 자체평가(신뢰 금지 원칙)를 별도 검증.
- 목업 스크린샷 실렌더 대조(계획서 Task 5)는 시간 소요 이유로 사용자 요청에 따라 생략, 대신 실기기(Xcode Release 빌드)로 사용자가 직접 확인 완료.
- 워크트리(`worktree-place-search-category-recent-search`)에서 작업 후 로컬 main에 머지(`fb9268d`), 워크트리 정리 완료.

### 트러블슈팅 메모
- 머지 직후 사용자가 실기기에서 안 뜬다고 보고 → 원인은 이 화면과 무관한 다른 화면(`course.tsx`의 `LocationSelector`, "어디서 만나요?")을 착각해서 본 것 + 그 다음엔 실제로 머지 전 stale JS 번들(Metro 미사용, Xcode Release 빌드라 JS만 바뀌어도 재-Run 필요)을 보고 있었던 것. `git log`/소스 grep으로 main에 코드가 들어있음을 먼저 확인하고, 재-Run 후 DerivedData의 `main.jsbundle`(Hermes bytecode)을 직접 열어 `strings`로 새 키(`recentSearchesTitle` 등) 존재 + 빌드 시각(방금)을 확인해 실제 반영을 증명 — 코드가 맞다고 주장만 하지 않고 산출물(바이트코드)까지 검증한 사례로 남김.

## 2026-07-22 세션 BI — candidates·plans 목업 구조 갭 Task 1~8 (워크트리, 미병합)

> 세션 BG/BH에서 남긴 "목업 구조 갭" 중 candidates(우리 후보) 필터 체계와 plans(데이트 계획) 상태 탭을 구현. 별도 워크트리(`.claude/worktrees/candidates-plans-structural-gap`, 브랜치 `worktree-candidates-plans-structural-gap`)에서 계획서(`docs/superpowers/plans/2026-07-22-candidates-plans-structural-gap.md`) Task 1~8을 TDD로 진행. 중간에 세션이 한 번 끊겼다가(Task 1~5 커밋된 상태) 재개해 Task 5 엣지케이스 수정부터 이어갔다.

### 구현 내용
- **candidates**: 필터를 목업 체계(전체/서로 좋아요/내가 저장/상대가 저장)로 전면 교체. "내가 저장"/"상대가 저장"은 `source==='manual'` 카드에 한해 `created_by`로 판정(AI 카드는 "좋아요 미정" 배지). 정렬 드롭다운(최신순/오래된순) 재사용 컴포넌트 `SortDropdown` 신설.
- **plans**: `date_cards` 쿼리를 `active`/`confirmed`/`done`까지 확장하고 `soft_messages`+`reactions`로 "조율 중"(제안했지만 상대가 아직 반응 안 함)을 판정해 예정/조율 중/완료 3탭으로 분류. 조율 중 카드는 날짜 미확정이라 D-day 배지 대신 "상대의 응답을 기다리는 중" 문구(`PlanListRow`에 `showDday` prop 추가).
- **엣지케이스 수정**: 같은 카드에 여러 명이 제안한 경우, "마지막 제안자 1명"이 아니라 "제안한 적 있는 전원(Set)"을 제안자로 취급하도록 수정 — 안 그러면 원래 제안자의 반응을 "상대 반응"으로 오판해 조율 중 상태를 조기 종료시킴.
- 사진(썸네일) 연동은 API 키 부재로 스코프에서 완전 제외(계획 문서에 명시).

### 검증
- TDD로 8개 커밋 전부 RED→GREEN 확인 후 진행. 전체 스위트 144 suites/971 tests + tsc 클린.
- 시뮬레이터 실렌더(`EXPO_PUBLIC_SCREENSHOT=1` + 제어서버, 워크트리에서 Metro 기동): candidates 기본 상태(필터 칩 4종, 정렬 드롭다운, 배지)와 plans 기본 상태(탭 바 3종 + 빈 상태) 육안 확인 — 레이아웃/색상 정상, 어색한 여백 없음. 스크린샷 목업 fixture엔 manual 카드·조율 중 후보 데이터가 없어 "내가 저장"/"상대가 저장"/"조율 중" 목록 상태(비어있지 않은 상태)는 육안 미확인 — 해당 로직은 유닛 테스트로만 검증됨.

### 다음 세션
- **병합 필요**: 이 브랜치(`worktree-candidates-plans-structural-gap`)는 아직 main에 병합 안 됨. 병합 여부/시점 확인.
- `.env.example`에 Google Places API 키 안내 주석(미커밋, 연동 코드 미착수)이 남아있음 — 이번 스코프(사진 제외)와 무관하게 유지할지 확인 필요.
- `share/mutual` 텍스트 겹침 버그(세션 BG부터 이월) 여전히 원인 미확정, 실기기 확인 필요.

## 2026-07-22 세션 BH — 반복 누락 4패턴 + 하단 여백(bg-park) 화면 확장

> 세션 BG에서 확정한 "반복 패턴"(하트 낙서·미니 일러스트 5화면 공통 누락, pink→cream 회귀) 착수. 사용자 피드백으로 스코프가 두 번 확장됨: ①일러스트 크기 통일 + couple-connect 상단 일러스트 제거(하단에 이미 있어 중복) ②"알림 목록"(홈 벨 아이콘)에도 같은 배경 누락 발견 → 반영 ③앱 전체 36화면 육안 감사로 동일 패턴(일러스트 없음+하단 여백) 3곳 추가 발견 → 반영.

### 패턴1·2 — 하트 낙서 + 미니 일러스트 + pink→cream (4화면)
- `card/confirm`·`card/memory/new`·`card/memory/edit`·`onboarding/couple-connect`(linked) 헤딩에 `HeartDoodle`(신규, `components/ui.tsx`, lucide Heart 2개 벡터) + 미니 일러스트 배선.
- 미니 일러스트 4장 Higgsfield(`nano_banana_pro`) 신규 생성 → `remove_background` → **코너 alpha 실측 검증**(PIL로 `im.getpixel` 확인, 세션 BG의 "RGBA 태그만 믿고 안 봄" 재발 방지). 첫 시도는 프롬프트에 "transparent"라는 단어를 쓰면 모델이 체커보드 무늬를 실제 픽셀로 그려버리는 것을 발견 → "plain solid white background"로 바꿔 해결.
- 사용자 피드백 반영: 크기 들쭉날쭉하던 것을 `MINI_ILLUSTRATION_WIDTH`(130, `components/illustration.tsx`) 상수 하나로 통일. couple-connect는 하단에 bg-park가 이미 있어 상단 마스코트 일러스트(`mini-mascot-trees`)는 제거(asset도 삭제).
- `card/confirm.tsx` `rowIconWrap` 배경 `C.cream`→`C.pinkLight`.
- 패턴3(D-day 고정)은 세션 BG에서 이미 "버그 아님"으로 결론난 사안이라 스코프 제외(사용자 확인).

### 패턴4 + 확장 — bg-park 하단 풀블리드
- `onboarding/couple-connect`(linked): connected 화면과 동일 코드 패턴(SafeAreaView 밖 root에 절대위치, resizeMode=cover)으로 적용.
- `account/notifications`(홈 벨 아이콘 진입): 목업이 없는 화면이지만 사용자가 직접 지적("알람 아이콘 들어가면 나오는 창") → 동일 패턴 적용.
- 앱 전체 36개 화면(스크린샷 스크립트 전체 라우트) 시뮬레이터 실렌더 → 육안 전수 검토. "일러스트 없음+하단 크게 빔" 후보 6개 중 사용자가 3개 확정: `onboarding/couple-choice`, `mode-flow/place-search`(검색 전 빈 상태), `mode-flow/place-detail`. `plans`는 "리스트가 늘어나면 자연히 채워질 화면"이라 사용자가 스코프에서 제외 — 의도적 판단, 버그 아님.
- 법률 페이지(텍스트 전용)·로딩 화면(의도된 중앙정렬)·모달 3종(바텀시트라 배경 부적합)은 감사에서 제외.

### 검증
- TDD로 진행(RED 확인 후 구현). 테스트 946개/tsc 클린. 시뮬레이터 실렌더로 전체(4+1+3=8화면) 목업/사용자 지적과 대조 확인.
- **인프라 교훈**: 다른 세션이 이미 띄워둔 Metro/시뮬레이터 인스턴스를 재사용할 때, 코드 변경 후 `xcrun simctl terminate`+`launch`로 강제 리로드하지 않으면 스크린샷이 스테일 번들을 보여줌(처음 캡처 라운드에서 실제로 걸림 — pink 배경도 하트 낙서도 없는 옛 화면을 "실패"로 오판할 뻔함).

### 다음 세션
- **핵심 수정 예정(사용자 확정)**: 세션 BG에서 남겨둔 "목업 구조 갭"(candidates·plans·memories 필터/정렬탭, D-day 카운트다운 실데이터 검증, 진행률바, course-result 사진/소요시간/타임라인 등) — 유력 후보 핵심 플로우 4화면(홈·candidates·plans·course-result).
- `share/mutual` 텍스트 겹침 버그 원인 미확정 상태 유지(실기기 확인 필요).
- 커밋 안 함(사용자 요청 없었음) — 변경 파일 20개(수정 12 + 신규 8), git status 참조.

## 2026-07-22 세션 BG — asset 배경 버그 + 목업 정밀 감사 (세션 BF의 ss-verify가 부실했음을 정정)

> 사용자 지적: "장난해? asset들 다 배경 사각형으로 남고" — 세션 BF에서 8화면만 훑고 "ss-verify 통과"라 보고한 게 틀렸음. 정밀 재조사 요청.

### Asset 배경 불투명 버그 (근본원인 확인)
- 일러스트 asset 전체(8장 중 7장, `bg-park` 제외)가 **알파채널 없는 완전 불투명 PNG**였음 — RGBA 태그와 무관하게 코너 alpha=255. 카드로 안 감싼 자리(닉네임 마스코트 등)에서 사각형 노출.
- Higgsfield `remove_background`로 7장 처리 → 4장(마스코트 3종·브랜드로고)은 깨끗하게 성공. **`date-course-map-horizontal`(로그인)은 AI가 도시 일러스트 13.3%를 얼룩덜룩 지워버려 실패** — 원본 복원 후, 사용자가 직접 준비한 진짜 알파 PNG로 최종 교체(커밋 `b4f23e2`→`38a1ff8`).
- 로그인 히어로는 추가로 `CONTENT_WIDTH`(패딩 안쪽)에 갇혀 목업처럼 화면 전체폭으로 안 퍼지던 것도 발견 → `SCREEN_WIDTH`로 확장, TDD(커밋 `5c1c89c`). 목업 1:1 근접 확인.

### 목업 50장 vs 라이브 화면 정밀 비교 (서브에이전트 5개 병렬, 폴더별)
- iOS 시뮬레이터에서 라이브 화면 37개 재캡처(`scripts/screenshot-all.sh` + 수동 보강) 후 `UI RENEW/` 원본 목업과 1:1 대조.
- **결과: 사실상 PASS 0건.** 확정된 실제 문제 카테고리:
  - **구조/기능 통째 누락**: candidates·plans·memories 필터/정렬탭 전무, D-day 카운트다운 없이 전부 "D-DAY" 고정, 진행률(%)바·파트너 아바타 없음, course-result 사진·소요시간·타임라인 없음, place_search 결과 리스트 자체가 안 뜸, review 별점 없음(4개 옵션, 목업은 5개+AI요약카드).
  - **반복 패턴**: 카드 옆 하트 낙서 아이콘·우상단 미니 일러스트가 card_confirm·memory_new·memory_edit·couple_connect_manage·connected 5화면에서 공통 누락. pink여야 할 아이콘 배경이 cream으로 바뀐 곳 다수.
  - **매핑 자체가 다른 화면**: mutual_confirmed·share_send·share_reaction·step_action_sheet·couple_connect_manage 등은 목업과 라이브가 플로우상 다른 단계/상태.
  - **캡처 불가 화면**: enter_code·enter_code_error(네이티브 Alert로 대체, 인라인 에러 UI 없음)·candidate_detail·notifications(토글 설정) 등은 코드 리뷰로만 확인, 실렌더 미검증.
- 원인 스코프가 화면당 재작업 수준이라 **이번 세션엔 착수 안 함** — 사용자에게 우선순위 질문, "확정 버그부터"로 응답받음(구조 갭 재작업은 별도 세션).

### 확정 버그 조사
- **plans "날짜 미표시" — 버그 아님으로 정정**: 홈 화면도 동일한 `daysUntilIso`/fallback 로직이라 `confirmed_date` 없으면 둘 다 fallback 문구만 보여줌(홈="다가오는 데이트", plans="날짜·장소는 아직 정하지 않았어요"). 스크린샷 픽스처(`date_cards`)에 애초에 `confirmed_date`가 없어서 둘 다 정상 동작. 애초 감사 서브에이전트의 오독.
- **share/mutual 텍스트 겹침 — 재현되나 원인 미확정**: 같은 화면 3회 재캡처(8초 대기 포함) 모두 동일하게 재현되어 타이밍 아티팩트는 배제. `transform` 계열 스타일 전무, 유니코드 클린, footer 여백 계산상 겹칠 이유 없음 — 코드 리뷰로 원인 특정 실패. **고치지 않고 보고만 함**(원인 모르고 패딩 숫자만 바꾸는 건 지양). 실기기 Xcode 뷰 디버거 확인 필요.

### 검증
- tsc 클린, 137 suites/930 tests. 커밋: `b4f23e2`(배경제거 7장) → `38a1ff8`(로그인 최종 asset) → `5c1c89c`(로그인 전체폭 레이아웃).

### 다음 세션
- 목업 구조 갭 재작업 우선순위 결정 필요(핵심 플로우 4화면 vs 반복 패턴 5화면 vs 전체 순회).
- share/mutual 텍스트 겹침 실기기 재현 확인.

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
