# 추천 이력 다양성 A/B — QA·분석 실행서

`RECOMMENDATION_HISTORY_EXPERIMENT=off`가 기본값이다. `ab50`은 이 문서의 QA와 출시 가드레일이 승인된 뒤에만 사용한다.

## 현재 배포 상태 (2026-07-26)

프로덕션에 `ab50`으로 활성화돼 있다. 마이그레이션 `recommendation_history_ab_metrics`
적용 완료, Edge `recommend-date` v18 / `replacement-candidates` v11 배포 완료.

이벤트 기록 트리거는 `tg_op`를 소문자와 비교해 **한 번도 발화한 적이 없었고**,
`20260726120000_fix_step_event_trigger_tg_op_case`에서 수정했다. 대소문자만으로는
부족해 `recommendation_step_events`의 `(session_id, step_id)` 복합 FK도 제거했다.
그 FK가 cascade라 `after delete`는 FK 위반으로 삭제를 깨뜨리고 `before delete`는
방금 넣은 행이 cascade로 지워졌다. 정리는 세션 FK가 담당한다.

트리거가 살아나면서 이벤트 기록 실패가 곧 원본 쓰기 실패가 되므로,
`write_recommendation_step_event`의 `actor_user_id`는 `auth.uid()`가 없을 때
세션 소유자로 폴백한다.

프로덕션에서 롤백되는 트랜잭션으로 검증했다 — 사용자 JWT 컨텍스트와 서비스 롤
컨텍스트 모두에서 `initial_recommendation`·`place_replaced`·`place_deleted`가
기록되고 스텝 삭제가 성공한다.

> **해석 주의.** behavior score와 `replacementTop3PickRate`는 트리거 수정
> **이후에 생성된 세션에만** 유효하다. 그 이전 데이터에는 부정 행동 이벤트가
> 존재하지 않으므로, 수정 시점을 기준으로 관찰창을 자르고 분석할 것.

## 분석 입력과 출력

구조화 로그와 DB에서 익명화된 export JSON을 만든 뒤 다음처럼 실행한다.

```bash
npx tsx scripts/eval-recommendation-history-ab.ts --input=/absolute/path/history-ab-export.json
```

입력은 `sessions`(id, ownerUserId, coupleId, createdAt, originalRequest.location, metadata.historyExperiment, 원본 Kakao step ID), `events`(sessionId, eventType, candidateRank), `terminalLogs` 배열을 가진 JSON이다. Edge 로그의 `sessionKey`는 원본 session ID를 포함하지 않는 단방향 상관 키이며, 분석기는 export의 session ID로 같은 키를 재계산해 관찰창·arm에 속한 로그만 결합한다. 출력에는 식별자·원본 자연어를 포함하지 않는다.

`courseGenerationFailureRate`만은 예외로 `sessionKey` 결합에 의존하지 않는다. 최초 생성이 실패하면 `recommendation_sessions` 행이 없어 결합할 세션이 없기 때문에, 실험이 요청 단위로 해석된 로그에 붙는 `experimentActive: true` marker와 arm 필드만으로 집계한다. `experimentActive`가 없는 레거시·mode=off 로그는 어느 arm에도 들어가지 않는다.

`sameAreaRepeatRate`는 현재 세션을 포함하지 않고, 동일 assignment unit의 2km 이내 **이전 두 세션**이 모두 있을 때만 계산한다. unit별 비율을 먼저 평균하므로 활동량이 큰 한 커플이 arm 결과를 지배하지 않는다. `replacementTop3PickRate`는 `candidate_rank`가 저장된 교체 선택 중 1~3위를 선택한 비율이다.

고정 fixture 기준 Treatment 출력은 다음과 같다.

```json
{
  "assignmentUnitCount": 2,
  "sameAreaRepeatRate": { "numerator": 1, "denominator": 2, "value": 0.5 },
  "recentHistoryExcludedCount": { "numerator": 7, "denominator": 7, "value": 1 },
  "replacementTop3RepeatRate": { "numerator": 1, "denominator": 3, "value": 0.3333333333333333 },
  "replacementTop3PickRate": { "numerator": 1, "denominator": 2, "value": 0.5 },
  "courseGenerationFailureRate": { "numerator": 1, "denominator": 2, "value": 0.5 }
}
```

## 기기 QA 매트릭스

| 시나리오 | 설정/행동 | 확인 결과 |
|---|---|---|
| 같은 지역 반복 | 동일 지역에서 세 번째 코스 생성 | 최근 두 코스의 장소는 1차 후보와 최종 코스에서 제외된다. |
| 다른 지역 Control | 2km를 넘는 지역에서 Control 생성 | 과거 다른 지역 장소는 제외 근거가 되지 않는다. |
| 희소 지역 완화 | 새 후보로 모든 단계를 구성할 수 없게 만든다 | 오래된 최근 장소부터 재도입되고 `recentPlaceCooldown` 안내가 한 번만 보인다. |
| 직접 지정 | 최근 장소를 핀으로 지정한다 | 핀이 유지되고 cooldown 안내는 생기지 않는다. |
| 커플 이력 | 파트너가 만든 같은 지역 코스 뒤 생성한다 | 현재 linked couple의 파트너 이력만 함께 반영한다. |
| 교체 Top 3 | 교체 후보를 열고 1~3위 하나를 선택한다 | `동선 추천`/`Route fit` 표기, 서버 attest된 `candidate_rank` 저장을 확인한다. |
| 빈 교체 후보 | 카테고리·도보 제한으로 후보를 제거한다 | 빈 상태는 정상 응답이며 `replacement_empty_rate` 로그가 남는다. |
| 이력 로더 실패 | loader 의존성을 실패시킨다 | 추천은 성공하고 effective Control·`history_load_failed`만 기록한다. |

## 출시 가드레일 (승인 필요)

`ab50`을 켜기 전에 아래 값은 제품 책임자가 정한다. 임의 숫자를 이 문서에 추가하지 않는다.

- 최소 assignment unit 표본과 관찰 기간
- Treatment 생성 실패율의 비열등 허용폭
- assignment unit cluster bootstrap 95% 신뢰구간 방식
- 자동 중지 조건(실패율·fallback rate·반복률 악화)

중지 또는 롤백은 먼저 `RECOMMENDATION_HISTORY_EXPERIMENT=off`로 설정한다. Edge 결함이 남으면 검증된 이전 `recommend-date`, `replacement-candidates` 배포본을 다시 배포한다. 메타데이터와 `candidate_rank`는 additive이므로 데이터 롤백은 하지 않는다.
