# AI 호출 제한 및 초대 문구 AI 제거 설계

## 목표

공개 출시 전 코스 생성 AI 호출을 사용자별로 제한해 중복 실행과 비용 급증을 막는다. 현재 사용하지 않는 직접 AI 생성 경로와 초대 문구 AI는 제거한다.

## 범위

- 활성 사용자 AI quota는 코스 생성 하나(`course_generate`)만 적용한다.
- 코스 생성의 동시 실행은 사용자당 1개이며, 잠금 TTL은 2분이다.
- 코스 생성은 5분 3회, Asia/Seoul 기준 하루 20회로 제한한다.
- 초대 문구 추천 버튼과 `soft_message` AI action을 삭제한다. 기존 `soft_messages` 저장 및 사용자가 직접 편집한 문구 전송은 유지한다.
- 비활성 레거시 직접 생성 action(`cards`, `feeling_select`, `course_select`)은 서버에서 허용하지 않는다.
- 서버 내부 action(`recommend_date_select`, `estimate_place_price`)은 사용자 클라이언트가 직접 호출할 수 없게 한다.

## 비범위

- 결제, 크레딧, 남은 횟수 상시 표시, IP 기반 제한은 만들지 않는다.
- `replacement-candidates`는 현재 Claude를 호출하지 않으므로 사용자 AI quota 대상이 아니다.
- 가격 추정은 사용자 quota에서 차감하지 않는다.

## 정책

### 차감 시점

`recommend-date`는 인증 및 입력 검증 뒤 사용자별 실행 잠금을 얻고 Kakao 후보 검색을 수행한다. 후보 검색 실패, 입력 오류, 인증 오류에는 quota를 차감하지 않는다.

Claude를 호출하기 직전에 burst 및 daily bucket을 원자적으로 소비한다. 이 시점 이후 Anthropic 오류, 타임아웃, AI 응답 검증 실패가 나더라도 quota는 되돌리지 않는다. 비용이 발생할 가능성이 있는 호출을 사용자에게 정확히 귀속하기 위한 절충 정책이다.

### 동시 실행

동일 사용자의 살아 있는 `course_generate` 잠금이 있으면 새 요청은 `409 AI_REQUEST_ALREADY_RUNNING`으로 끝난다. 응답에는 기존 요청이 만든 세션 ID가 아직 없을 수 있으므로 `generationSessionId`는 제공하지 않는다. `retryAfterSeconds`는 lock의 `expires_at`과 현재 시각 차이로 계산한다.

정상·오류·취소 경로에서는 `finally`에서 잠금을 해제한다. Edge 실행 중단으로 해제가 누락돼도 `expires_at` 이후 새 요청이 만료 잠금을 인계한다.

### quota

| 기능 | burst | daily | 비고 |
| --- | --- | --- | --- |
| `course_generate` | 5분 3회 | Asia/Seoul 하루 20회 | Claude 호출 직전 소비 |
| `estimate_place_price` | 없음 | 없음 | 서버 내부·장소당 claim |

burst bucket은 5분 단위 고정 창이며, `retryAfterSeconds`는 현재 창 종료까지의 초다. daily bucket은 Asia/Seoul 자정에 경계가 바뀌며 `resetsAt`은 해당 다음 자정의 ISO timestamp다.

## 데이터 모델과 RPC 경계

모든 rate-limit 테이블은 RLS를 켜고 `anon`/`authenticated` 권한을 철회한다. 호출 RPC도 public·authenticated에서 revoke한다. Edge Function은 인증한 사용자 ID를 검증한 뒤 service-role client로만 RPC를 호출한다.

### `ai_quota_buckets`

`user_id uuid`, `action text`, `bucket_type text`, `bucket_start timestamptz`, `used_count integer`, `updated_at timestamptz`를 가진다. PK는 `(user_id, action, bucket_type, bucket_start)`이다. `bucket_type`은 `burst` 또는 `daily`로 제한하고 `used_count >= 0`를 보장한다.

`consume_ai_quota(p_user_id uuid, p_action text, p_now timestamptz default now())`는 해당 사용자의 두 bucket을 잠그거나 UPSERT한 뒤 한도를 확인하고, 둘 다 허용될 때만 두 count를 증가시킨다. burst 초과면 `burst`와 retry 초를, daily 초과면 `daily`와 reset 시간을 반환한다. 하나만 증가한 뒤 실패하는 상태가 없어야 한다.

### `ai_request_locks`

`user_id uuid`, `action text`, `request_id text`, `expires_at timestamptz`, `created_at timestamptz`를 둔다. PK는 `(user_id, action)`이다.

`acquire_ai_request_lock(...)`은 해당 행을 원자적으로 생성하거나, 만료된 행만 새 요청으로 교체한다. 살아 있는 잠금은 `acquired=false`와 재시도 시간을 반환한다. `release_ai_request_lock(...)`은 `user_id`, `action`, `request_id`가 모두 일치할 때만 삭제한다.

### `ai_rate_limit_events`

제한된 요청을 모니터링하기 위해 `user_id`, `action`, `event_type`(`lock_conflict`, `burst_rejected`, `daily_rejected`), `created_at`을 기록한다. 프롬프트 원문은 저장하지 않는다. 이 이벤트는 제한 비율과 중복 생성 차단 횟수를 집계하는 근거다.

## Edge Function 경계

### `recommend-date`

1. 인증과 요청 스키마 검증을 수행한다.
2. `course_generate` lock을 얻는다. 충돌 시 409 오류를 반환한다.
3. Kakao 검색 및 후보 랭킹을 수행한다. 이 단계의 실패는 quota 미차감이며 `finally`에서 lock만 해제한다.
4. `generateSelection`을 실행하기 직전에 `consume_ai_quota`를 호출한다. 거절 시 429 오류를 반환한다.
5. 내부 인증 헤더를 넣어 `generate-ai`의 `recommend_date_select`를 호출한다.
6. 기존 코스 조립·attestation·응답 처리를 유지한다.
7. 모든 종료 경로에서 본인 요청 ID의 lock만 해제한다.

이 순서는 quota를 실제 Claude 호출과 한 번만 연결한다. 가격 추정은 응답 뒤 `EdgeRuntime.waitUntil`에서 계속 실행되므로 이 lock과 quota에 영향을 주지 않는다.

### `generate-ai`

`CLIENT_ACTIONS`는 빈 집합으로 만든다. `INTERNAL_ACTIONS`는 `recommend_date_select`, `estimate_place_price`만 둔다.

내부 action은 `X-Internal-AI-Token`이 `INTERNAL_AI_TOKEN` Edge secret과 timing-safe 비교로 일치할 때만 수행한다. downstream helper는 이 헤더를 전달한다. 누락·불일치는 `403 { error: { code: 'AI_ACTION_FORBIDDEN' } }`로 반환한다.

`soft_message`, `cards`, `feeling_select`, `course_select`, `replacement_select`, `parse_step_intents`는 action config, schema, passthrough 목록에서 제거한다. 알 수 없는 action도 동일한 403 오류를 반환한다. 인증 실패는 현행 401을 유지한다.

각 내부 action의 실제 조립 프롬프트에는 서버 상한을 적용한다. `recommend_date_select`는 20,000자, `estimate_place_price`는 1,000자다. 한도 초과는 Anthropic 호출 전에 `413 { error: { code: 'AI_PROMPT_TOO_LARGE' } }`를 반환한다.

### 가격 추정 claim

`places`에 `price_estimation_status`(`pending`, `claimed`, `estimated`), `price_estimation_claim_id`, `price_estimation_claimed_at`을 추가한다. 원자적 claim RPC는 `estimated_at is null`이고 claim이 없거나 2분보다 오래된 행만 `claimed`로 바꾼다.

claim을 얻은 요청만 `estimate_place_price`를 호출한다. 성공 시 가격·`estimated_at`·상태 `estimated`를 기록하고, 실패 시 claim을 풀어 다음 노출에서 재시도 가능하게 한다.

## 오류 계약과 앱 UX

`recommend-date`는 기존 오류 envelope를 유지하며 다음 코드와 필드를 추가한다.

| HTTP | code | 추가 필드 | 화면 |
| --- | --- | --- | --- |
| 409 | `AI_REQUEST_ALREADY_RUNNING` | `retryAfterSeconds` | “코스를 만들고 있어요” 안내 |
| 429 | `AI_RATE_LIMITED` | `limitType: 'burst'`, `retryAfterSeconds` | 남은 시간을 보여 주는 가벼운 안내 |
| 429 | `AI_DAILY_LIMIT_REACHED` | `limitType: 'daily'`, `resetsAt` | 자정 이후 재시도를 알리는 모달 |

생성 화면은 위 세 코드를 일반 네트워크 오류와 분리한다. 같은 화면의 생성 버튼은 기존 진행 상태에서 비활성화해 이중 탭을 먼저 막는다. 서버 제한은 다른 기기와 직접 호출을 막는 최종 방어선이다.

## 초대 문구 변경

`app/share/send.tsx`에서 Sparkles import, 문구 추천 handler, 버튼, generating state를 제거한다. `lib/ai.ts`에서 invite 프롬프트, fallback 상수, `generateInviteMessage`, `soft_message` action type을 제거한다. 전송 화면은 초기 기본 문구를 편집하고 `soft_messages.generated_text`로 저장하는 현재 동작만 남긴다.

## 테스트와 검증

- SQL/RPC 테스트는 동시 lock 1개 보장, 만료 lock 인계, lock 소유자만 해제, burst 경계, Asia/Seoul daily 경계, 두 bucket의 원자적 소비를 검증한다.
- `recommend-date-handler` 테스트는 Kakao 실패 시 quota 미차감, Claude 직전 소비, 409/429 오류 envelope, 모든 종료 경로의 lock release를 검증한다.
- downstream 및 `generate-ai` 테스트는 내부 헤더의 전달·거부, 제거된 action의 403, 프롬프트 413을 검증한다.
- place ledger 테스트는 동일 장소의 병렬 claim에서 한 요청만 추정하고, 실패 claim이 재시도 가능함을 검증한다.
- 공유 화면 테스트는 문구 추천 버튼과 `generateInviteMessage` 참조가 없고, 직접 편집·전송이 유지됨을 검증한다.
- 전체 `npm run validate`와 대상 Jest 테스트를 실행한다. 실제 Supabase 배포 후에는 service-role-only RPC, 409/429 payload, Seoul 자정 계산을 SQL Editor에서 검증한다.
