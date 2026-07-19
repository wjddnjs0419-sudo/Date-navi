# Step Intent Phase 2·3 설계 (Phase 4 연기)

> 작성: 2026-07-19 · 선행: `docs/superpowers/plans/2026-07-19-step-intent-phase1.md`(완료), `docs/AI_RECOMMENDATION_V4_STEP_INTENT_RECONCILIATION.md`
> 성격: Phase 1(결정론 규칙 파서) 위에 AI fallback·부정어·충돌/미지원 감지·감지 칩 UI·완화 UI를 쌓는다. Phase 4(가격/외부증거)는 데이터 소스 부재로 연기.

## 목표

- **Phase 2**: 사전에 없는 자유텍스트도 처리(AI fallback), 부정("삼겹살 말고")·미지원("이 코스에 없는 방탈출")·충돌 감지, 감지된 의도를 사용자에게 칩으로 노출, 파서 메트릭 수집.
- **Phase 3**: required intent 미충족(422) 시 조건 완화 제안 UI.
- **Phase 4**: 가격/외부증거 — **연기**(§7). 카카오 무료 티어에 가격·평점 데이터 없음. 별도 데이터 소스 확보 세션 필요.

## 결정 사항 (사용자 확정 2026-07-19)

| 항목 | 결정 |
|---|---|
| Phase 4 | 연기 — 문서화만 |
| AI 파서 호출 조건 | 스펙 §8.2 **전체** 신호(2026-07-19 사용자 재확정, 비용 감수). `additionalRequest` 있음 **AND** 사전어+불용어 제거 후 **유의미 잔여 텍스트 존재**(다중타깃·복합패러프레이즈·저신뢰·미등재영어·부정보강 포괄). 사전 통문장 히트 = 잔여 0 = AI 0건 |
| UI 범위 | 감지 칩 + 완화 UI 둘 다 |
| 칩 데이터 출처 | 응답 metadata 기반(클라 사전 미러 없음) |

---

## 핵심 아키텍처 — resolvedStepIntents 부착

Phase 1은 각 모듈(search-plan/ranking/selection/prompt)이 `parseStepIntents(request)`를 각자 재호출한다(순수·마이크로초, "파싱 1회" 원칙은 AI 비용 얘기). AI 파서는 네트워크 호출이라 모듈별 재호출 불가.

**패턴**: 핸들러에서 intent를 **1회 resolve**(규칙 → 필요 시 AI 병합)한 뒤 **서버 내부 request 객체에 `resolvedStepIntents` 필드로 부착**한다. 하위 순수함수는:

```ts
const intents = request.resolvedStepIntents ?? parseStepIntents(request).stepIntents;
```

- `resolvedStepIntents`는 **서버 내부 타입에만** 존재(클라 요청 스키마 무변경, breaking 없음).
- 부착 없으면(기존 유닛테스트·규칙 전용 경로) 규칙 파서로 폴백 → 무회귀.
- 부착값에는 AI 유래 intent·부정 intent·소스 태그가 포함.

### resolve 파이프라인 (핸들러)

```
additionalRequest?
 ├─ 없음 → resolved = { intents: [], source: 'none' }
 └─ 있음 → rule = parseStepIntents(request)
      ├─ rule.stepIntents 충분(≥1, 저신뢰 아님) → resolved = { rule.stepIntents, source: 'rule' }
      └─ 미검출/저신뢰 → AI parse_step_intents 호출
            ├─ 성공 → resolved = { merge(rule, ai), source: 'ai' }
            └─ 실패/타임아웃 → resolved = { rule.stepIntents, source: 'rule', aiError: true }  // 규칙 결과로 graceful degrade
```

**AI 게이트(고재현, 스펙 §8.2)**: `additionalRequest`를 정규화한 뒤 **사전의 모든 alias(canonical/ko/en) 스팬 + 도메인 불용어(조사·동사·required/negation 마커)**를 제거한다. 남은 토큰 중 한글 2자↑ 또는 라틴 3자↑ **content 토큰이 하나라도 있으면 AI 호출**. 없으면(사전 통문장·단순 부정문) 규칙으로 충분 → AI 0. 이 잔여 신호가 §8.2의 다중타깃·복합패러프레이즈·저신뢰·미등재영어를 모두 포괄한다. 비용보다 커버리지 우선(사용자 확정).

---

## Phase 2 — 서버

### §1. AI 파서 fallback

`generate-ai/index.ts`에 새 action:

```ts
parse_step_intents: { schema: PARSE_STEP_INTENTS_SCHEMA, maxTokens: 512, temperature: 0, logged: true }
```

- 모델: 기존 `MODEL = 'claude-haiku-4-5'` 재사용.
- 프롬프트: courseSteps(id/category) + additionalRequest + 사전 canonical 목록을 주고, **사전 canonical에 매핑**하도록 강제. 미매핑 자유어는 `unsupported`로.
- 출력 스키마:

```ts
{
  stepIntents: [{
    targetCategory: string,      // 사전 enum 중 하나
    canonicalTerm: string,       // 사전 canonical (미등재면 AI가 음차한 한국어)
    intentType: string,
    strength: 'required' | 'preferred',
    negated: boolean,            // "말고" → true
    kakaoSearchTerms: string[]   // [canonical, ...expansions]
  }],
  unsupported: [{ term: string, reason: string }],  // 대상 step 없음 / 미지원
  conflicts: [{ description: string }]              // required 모순 등
}
```

- 병합: AI `stepIntents` → 규칙 `ParsedStepIntent[]` 형태로 변환, stepId 바인딩은 규칙과 동일 로직(`normalizeRecommendationCategory` 기준 첫 미사용 step). 규칙이 이미 잡은 canonical은 규칙 우선.

**invoke**: `recommend-date-downstream.ts`에 `invokeParseStepIntents`(action `parse_step_intents`) 추가 또는 기존 `invokeGenerateAiSelection`에 action 파라미터로 재사용. 타임아웃은 짧게(예: 8s) — fallback이므로 전체 지연 최소화.

### §2. 부정어

규칙 파서(`step-intent.ts`)에 부정 감지:

- 마커: `말고`, `말구`, `빼고`, `제외`, `아니`, `not`, `except`, `no`(단어경계).
- 매칭 term 앞뒤 window에 부정 마커 → 해당 intent `negated: true`.
- `negated` intent는 **positive stepIntents에서 제외**하고 `excludedIntents`로 분리.
- **랭킹**: negated canonical에 매칭되는 장소 → 페널티(`RANKING_SCORE_WEIGHTS.stepIntentNegatedPenalty`, 예: -60). 또는 선택 후보에서 제외.
- **선택검증**: negated term에 매칭되는 후보를 AI가 고르면 완화(soft) — 페널티로 하위 랭크 유도, 하드 게이트는 아님(오탐 위험). 확정은 플랜.

### §3. 충돌 / 미지원 감지

- **unsupported**: 규칙/AI가 intent를 잡았으나 대상 category step이 코스에 없음(Phase 1은 조용히 drop). Phase 2는 `unsupportedIntents: [{ term, reason }]`로 수집 → 응답 노출.
- **conflicts**: 같은 step에 required intent 2개 이상, required와 그 negated 동시, 등. `conflicts: [{ description }]`로 수집.
- 둘 다 추천을 **막지 않음**(경고만). required 미충족만 §Phase3 게이트(기존 422).

### §4. 메트릭

응답 `metadata`에 신규 optional 블록:

```ts
metadata.stepIntent?: {
  parserSource: 'none' | 'rule' | 'ai',
  aiFallbackUsed: boolean,
  resolved: Array<{ canonicalTerm, displayLabel, strength, negated, stepId }>,
  unsupported: Array<{ term, reason }>,
  conflicts: Array<{ description }>,
}
```

- generate-ai 로깅: `parse_step_intents` action이 `LOGGED_ACTIONS`에 자동 포함(logged:true) → AI fallback 호출률 집계 가능.
- 서버 추가 로그 최소화(기존 로깅 인프라 재사용).

---

## Phase 2 — UI (감지 칩)

### §5. 감지된 의도 칩

- **데이터 출처**: 추천 응답 `metadata.stepIntent`(클라 사전 미러 없음 — YAGNI). 라이브 타이핑 피드백은 미제공.
- **노출 위치**: 결과 화면(코스 표시) 상단 또는 [generating.tsx](app/mode-flow/generating.tsx) 완료 직전.
  - `resolved` intent → 칩: "삼겹살", "루프탑 카페"(displayLabel, i18n).
  - `negated` → 취소선/제외 스타일 칩: "삼겹살 제외".
  - `unsupported` → 경고 배너: "'방탈출'은 이 코스 구성에 없어 반영하지 못했어요".
  - `conflicts` → 경고(있을 때만).
- StyleSeed 게이트 대상(ss-score ≥80, styleseed-design-review).
- i18n: `locales/ko.json`·`en.json` 동시.

---

## Phase 3 — 완화 UI

### §6. required intent 미충족 완화

- 서버: 기존 422 `STEP_INTENT_UNSATISFIED` 에러 메타에 `unsatisfiedIntents: [{ canonicalTerm, displayLabel }]` 추가.
- 클라 [generating.tsx](app/mode-flow/generating.tsx): 해당 에러 수신 시 완화 카드:
  - 문구: "'무조건 삼겹살' 조건에 딱 맞는 곳을 근처에서 못 찾았어요."
  - 액션 ①: **[조건 완화하고 다시 찾기]** → 같은 요청을 `additionalRequest`의 required 마커 제거(또는 클라가 서버에 `relaxRequiredIntents: true` 플래그) 재전송 → required→preferred 다운그레이드.
  - 액션 ②: **[조건 수정]** → [course.tsx](app/mode-flow/course.tsx)로 복귀.
- 완화 재요청 방식 확정 필요(플랜): (a) 클라가 additionalRequest에서 required 마커 스트립 후 재전송(서버 무변경), (b) 서버에 `relaxRequiredIntents` 요청 플래그 신설. **(a) 추천**(계약 최소 변경).
- StyleSeed 게이트. i18n 동시.

---

## §7. Phase 4 — 연기 (문서화만)

- **블로킹 사유**: 가격/외부증거(평점·리뷰수) 소프트 시그널은 데이터 소스가 필요하나, 현재 파이프라인의 유일 장소 소스인 **카카오 로컬 검색 무료 티어는 가격·평점을 반환하지 않는다**. `recommendation-prompt.ts`의 price 언급은 프롬프트 텍스트일 뿐 실데이터 없음.
- **선행 조건**: 네이버/구글 플레이스 등 유료 API 배선(비용·키 발급·크로스유저 캐시 프라이버시 재검토) 또는 자체 크롤링(ToS 리스크). 별도 스코프.
- **현 세션 산출물**: 본 문서에 사유 기록. 코드 변경 없음.

---

## 계약 변경 요약 (breaking 없음, 전부 optional)

| 위치 | 신규 |
|---|---|
| 응답 `metadata.stepIntent` | parserSource/aiFallbackUsed/resolved/unsupported/conflicts |
| 에러 메타(STEP_INTENT_UNSATISFIED) | `unsatisfiedIntents` |
| 서버 내부 request | `resolvedStepIntents` (클라 스키마 무변경) |
| generate-ai | action `parse_step_intents` |
| 요청 스키마 | (완화 방식 (a) 채택 시) 변경 없음 |

## 테스트 전략

- 규칙 부정어: `__tests__/stepIntent.test.ts` 확장.
- AI 파서 병합·게이트: 핸들러 테스트 + downstream mock.
- 랭킹 negated 페널티: `recommend-date-ranking-server.test.ts`.
- 응답 metadata.stepIntent: 핸들러 테스트.
- UI 칩·완화: 컴포넌트 테스트 + StyleSeed 게이트(ss-score/ss-verify).
- 전체 회귀: `npx jest`(현 기준선 767) + `npm run validate`.

## 배포

- Phase 2 서버 = `recommend-date` + `generate-ai` edge function 재배포(사용자 승인 후).
- Phase 1 미배포분과 함께 배포 판단. 캐시 히트율 일시 하락 가능성 사전 보고(Phase 1 RESULT 기재).
