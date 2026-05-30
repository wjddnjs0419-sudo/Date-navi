# date-planner - 설계 문서

> 버전: 1.0.0 | 작성일: 2026-05-20 | 상태: 초안
> 레벨: Dynamic | 기획 문서: `docs/01-plan/features/date-planner.plan.md`

---

## 1. 개요

### 1.1 목적

이 문서는 Date Planner 앱을 구현 가능한 수준으로 설계하기 위한 기술 문서다. 기획 문서의 요구사항과 사용자가 `#` 주석으로 추가한 변경 사항을 반영해 화면 구조, 데이터 모델, API 경계, 상태 흐름, 테스트 기준을 정의한다.

### 1.2 기획 문서 주석 반영 사항

| 위치 | 주석 | 설계 반영 |
|------|------|-----------|
| 목표가 아닌 것의 AI 추천 항목 | `#google ai studio api연결 해서 구현` | AI 데이트 추천을 MVP 필수 기능으로 승격한다. Google AI Studio API는 서버 측 추천 어댑터를 통해 호출한다. |
| 계정 및 커플 연동 | `#supanova 이용한 회원가입 및 로그인, 백엔드 구축` | 인증과 백엔드는 `supanova` 사용을 우선 반영한다. 단, 정확한 서비스 명칭과 SDK/API는 구현 전 확인한다. |
| FR-009 | `#필수` | 제안 수정 기능을 필수 요구사항으로 승격한다. |
| FR-011 | `#필수` | 실시간 또는 준실시간 동기화를 필수 요구사항으로 승격한다. |
| FR-012 | `#필수` | 상태별 필터링을 필수 요구사항으로 승격한다. |

### 1.3 설계 목표

- 모바일 우선으로 데이트 제안, 옵션 비교, 댓글, 수락 흐름을 빠르게 완료할 수 있게 한다.
- 커플 단위 접근 권한을 데이터 계층에서 강제한다.
- 백엔드 제공자가 바뀌어도 UI와 비즈니스 로직 변경을 최소화하도록 API 어댑터 계층을 둔다.
- AI 추천 기능은 필수 기능으로 포함하되, 실패해도 수동 제안 작성 흐름이 막히지 않게 한다.
- 확정된 데이트는 캘린더 또는 일정 목록에서 즉시 확인할 수 있게 한다.

## 2. 시스템 아키텍처

### 2.1 전체 구조

```text
사용자 브라우저
  -> Next.js App Router
    -> UI 컴포넌트
    -> 기능별 훅
    -> 서비스 계층
    -> Backend Adapter
      -> supanova 인증/데이터/실시간 기능
      -> Google AI Studio 추천 API
```

### 2.2 주요 계층

| 계층 | 책임 |
|------|------|
| `app` | 라우트, 페이지 레이아웃, 인증 보호 경계 |
| `components` | 재사용 UI, 기능별 화면 조각 |
| `features` | 데이트 제안, 커플 연동, 캘린더, AI 추천 도메인 로직 |
| `hooks` | 서버 상태 조회, 저장, 실시간 구독, 폼 상태 |
| `lib/backend` | 인증, 데이터 CRUD, 구독 기능을 추상화한 백엔드 어댑터 |
| `lib/ai` | Google AI Studio API 호출과 응답 정규화 |
| `types` | 도메인 타입, 요청/응답 타입, enum 정의 |

### 2.3 백엔드 선택 기준

기획 원문에는 `bkend.ai`가 있고, 사용자 주석에는 `supanova`가 있다. 설계에서는 최신 사용자 주석을 우선해 `supanova`를 기본 백엔드 후보로 둔다. 다만 정확한 서비스명, 인증 방식, 권한 규칙, 실시간 구독 API는 구현 전에 확인해야 한다.

구현 시 백엔드 의존성을 직접 UI에 넣지 않고 `BackendClient` 인터페이스 뒤에 숨긴다. 이렇게 하면 `supanova`가 실제로 Supabase 계열 SDK를 의미하거나 다른 BaaS를 의미하더라도 교체 범위가 `lib/backend`로 제한된다.

## 3. 라우트 설계

### 3.1 페이지 구조

| 경로 | 화면 | 접근 조건 |
|------|------|-----------|
| `/login` | 로그인 | 비로그인 |
| `/signup` | 회원가입 | 비로그인 |
| `/link-couple` | 커플 코드 생성/입력 | 로그인 |
| `/` | 홈 | 로그인 및 커플 연결 |
| `/proposals/new` | 제안 작성 | 로그인 및 커플 연결 |
| `/proposals/[proposalId]` | 제안 상세 | 해당 커플 구성원 |
| `/calendar` | 확정 일정 보기 | 로그인 및 커플 연결 |
| `/profile` | 프로필 및 연결 상태 | 로그인 |

### 3.2 보호 규칙

- 비로그인 사용자는 `/login`으로 이동한다.
- 로그인했지만 커플 연결이 없는 사용자는 `/link-couple`로 이동한다.
- 제안 상세는 `proposal.coupleId`가 현재 사용자의 `coupleId`와 일치할 때만 접근한다.
- 서버/API 계층에서도 동일한 접근 제한을 적용한다.

## 4. 컴포넌트 설계

### 4.1 공통 UI

| 컴포넌트 | 역할 |
|----------|------|
| `Button` | 주요/보조/위험 액션 버튼 |
| `Input` | 텍스트 입력 |
| `Textarea` | 상세 계획, 댓글 입력 |
| `Select` | 카테고리, 상태 필터 |
| `StatusChip` | `pending`, `accepted`, `declined` 표시 |
| `BottomNav` | 홈, 작성, 캘린더, 프로필 이동 |
| `LoadingState` | 저장/조회 중 상태 |
| `EmptyState` | 빈 목록 안내 |
| `ErrorMessage` | 저장/조회 오류 표시 |

### 4.2 기능 컴포넌트

| 컴포넌트 | 역할 |
|----------|------|
| `CoupleCodePanel` | 코드 생성, 복사, 입력, 연결 상태 표시 |
| `ProposalForm` | 데이트 제안 기본 정보 입력 |
| `DateOptionEditor` | 옵션 추가, 수정, 삭제 |
| `ProposalCard` | 홈과 목록에서 제안 요약 표시 |
| `ProposalFilterTabs` | 대기, 수락, 거절 상태 필터 |
| `DateOptionCard` | 장소 후보 정보와 선호도 표시 |
| `OptionCommentThread` | 옵션별 댓글 목록과 입력 |
| `DecisionBar` | 수락, 거절, 보류 액션 |
| `CalendarAgenda` | 확정 데이트 일정 목록 |
| `AiSuggestionPanel` | AI 추천 요청, 결과 선택, 옵션 추가 |

## 5. 데이터 모델

### 5.1 타입 정의

```ts
type ProposalStatus = 'pending' | 'accepted' | 'declined';
type CoupleStatus = 'waiting' | 'linked';
type DateCategory = 'meal' | 'movie' | 'walk' | 'cafe' | 'activity' | 'custom';
type OptionPreference = 'liked' | 'neutral' | 'not_interested';
type CommentType = 'comment' | 'request_change';
```

### 5.2 컬렉션

#### `profiles`

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `id` | string | 예 | 프로필 ID |
| `userId` | string | 예 | 인증 사용자 ID |
| `displayName` | string | 예 | 화면 표시 이름 |
| `coupleId` | string 또는 null | 아니오 | 현재 연결된 커플 ID |
| `createdAt` | string | 예 | 생성 시간 |
| `updatedAt` | string | 예 | 수정 시간 |

#### `couples`

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `id` | string | 예 | 커플 ID |
| `code` | string | 예 | 초대 코드 |
| `ownerUserId` | string | 예 | 코드를 생성한 사용자 |
| `partnerUserId` | string 또는 null | 아니오 | 코드를 입력한 사용자 |
| `status` | `CoupleStatus` | 예 | 대기 또는 연결 완료 |
| `createdAt` | string | 예 | 생성 시간 |
| `linkedAt` | string 또는 null | 아니오 | 연결 완료 시간 |

#### `dateProposals`

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `id` | string | 예 | 제안 ID |
| `coupleId` | string | 예 | 소속 커플 ID |
| `createdByUserId` | string | 예 | 제안 작성자 |
| `title` | string | 예 | 제안 제목 |
| `proposedDate` | string | 예 | 날짜, `YYYY-MM-DD` |
| `proposedTime` | string | 예 | 시간, `HH:mm` |
| `locationArea` | string | 예 | 주요 지역 |
| `category` | `DateCategory` | 예 | 데이트 종류 |
| `details` | string | 아니오 | 상세 계획 |
| `status` | `ProposalStatus` | 예 | 결정 상태 |
| `selectedOptionId` | string 또는 null | 아니오 | 수락 시 선택 옵션 |
| `createdAt` | string | 예 | 생성 시간 |
| `updatedAt` | string | 예 | 수정 시간 |

#### `dateOptions`

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `id` | string | 예 | 옵션 ID |
| `proposalId` | string | 예 | 소속 제안 ID |
| `label` | string | 예 | Option A 같은 표시명 |
| `placeName` | string | 예 | 장소명 |
| `address` | string | 아니오 | 주소 또는 지역 |
| `description` | string | 아니오 | 장소 설명 |
| `estimatedCost` | string | 아니오 | 예상 비용 |
| `externalUrl` | string | 아니오 | 외부 링크 |
| `partnerPreference` | `OptionPreference` | 예 | 상대방 선호도 |
| `createdAt` | string | 예 | 생성 시간 |
| `updatedAt` | string | 예 | 수정 시간 |

#### `optionComments`

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `id` | string | 예 | 댓글 ID |
| `optionId` | string | 예 | 소속 옵션 ID |
| `authorUserId` | string | 예 | 작성자 |
| `type` | `CommentType` | 예 | 일반 댓글 또는 수정 요청 |
| `content` | string | 예 | 댓글 내용 |
| `createdAt` | string | 예 | 작성 시간 |

#### `aiSuggestionRequests`

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `id` | string | 예 | 추천 요청 ID |
| `coupleId` | string | 예 | 요청한 커플 ID |
| `requestedByUserId` | string | 예 | 요청자 |
| `prompt` | string | 예 | 사용자가 입력한 추천 조건 |
| `resultJson` | object 또는 null | 아니오 | 정규화된 추천 결과 |
| `status` | `pending`, `completed`, `failed` | 예 | 처리 상태 |
| `createdAt` | string | 예 | 요청 시간 |

### 5.3 관계

- `profiles.coupleId` -> `couples.id`
- `dateProposals.coupleId` -> `couples.id`
- `dateOptions.proposalId` -> `dateProposals.id`
- `optionComments.optionId` -> `dateOptions.id`
- `dateProposals.selectedOptionId` -> `dateOptions.id`
- `aiSuggestionRequests.coupleId` -> `couples.id`

## 6. API 및 서비스 설계

### 6.1 Backend Adapter 인터페이스

```ts
interface BackendClient {
  auth: AuthService;
  couples: CoupleService;
  proposals: ProposalService;
  options: DateOptionService;
  comments: CommentService;
  realtime: RealtimeService;
}
```

이 인터페이스는 실제 `supanova` SDK/API 호출을 감싼다. UI와 훅은 이 인터페이스만 사용한다.

### 6.2 인증 서비스

| 메서드 | 입력 | 출력 | 설명 |
|--------|------|------|------|
| `signUp` | email, password, displayName | user, profile | 회원가입 |
| `signIn` | email, password | session, profile | 로그인 |
| `signOut` | 없음 | void | 로그아웃 |
| `getCurrentUser` | 없음 | user 또는 null | 현재 사용자 조회 |

### 6.3 커플 서비스

| 메서드 | 입력 | 출력 | 설명 |
|--------|------|------|------|
| `createCoupleCode` | userId | couple | 커플 코드 생성 |
| `joinCoupleByCode` | userId, code | couple | 코드 입력으로 연결 |
| `getMyCouple` | userId | couple 또는 null | 현재 커플 조회 |

### 6.4 제안 서비스

| 메서드 | 입력 | 출력 | 설명 |
|--------|------|------|------|
| `listProposals` | coupleId, status? | proposal[] | 제안 목록 및 필터 |
| `getProposalDetail` | proposalId | proposal, options, comments | 상세 조회 |
| `createProposal` | proposalInput, optionInputs[] | proposal | 제안 생성 |
| `updateProposal` | proposalId, patch | proposal | 필수 수정 기능 |
| `deleteProposal` | proposalId | void | 제안 삭제 |
| `decideProposal` | proposalId, status, selectedOptionId? | proposal | 수락/거절/보류 변경 |

### 6.5 댓글 서비스

| 메서드 | 입력 | 출력 | 설명 |
|--------|------|------|------|
| `listComments` | optionId | comment[] | 옵션 댓글 조회 |
| `createComment` | optionId, type, content | comment | 댓글 또는 수정 요청 작성 |
| `deleteComment` | commentId | void | 본인 댓글 삭제 |

### 6.6 AI 추천 서비스

| 메서드 | 입력 | 출력 | 설명 |
|--------|------|------|------|
| `generateDateOptions` | prompt, date, area, category, budget? | optionDraft[] | Google AI Studio API로 후보 옵션 생성 |
| `saveSuggestionRequest` | request, result | aiSuggestionRequest | 추천 요청과 결과 저장 |

AI 추천은 서버 측 또는 보호된 API 라우트에서 호출한다. 브라우저에 Google AI Studio API 키를 노출하지 않는다.

### 6.7 실시간 동기화

필수 동기화 대상:

- `dateProposals`: 상태 변경, 수정, 삭제.
- `dateOptions`: 옵션 추가, 수정, 삭제.
- `optionComments`: 댓글 추가, 삭제.

실시간 구독이 불안정하거나 제공자 API 확인 전이라면 다음 순서로 구현한다.

1. 저장 성공 후 관련 쿼리 무효화 및 재조회.
2. 화면 포커스 복귀 시 재조회.
3. 백엔드 제공자의 실시간 구독 API 연결.

## 7. 상태 및 흐름 설계

### 7.1 제안 상태 전이

```text
pending
  -> accepted
  -> declined

accepted
  -> pending  (작성자 또는 상대방이 재논의할 때)

declined
  -> pending  (수정 후 다시 제안할 때)
```

### 7.2 수락 규칙

- `accepted` 상태로 변경하려면 `selectedOptionId`가 필요하다.
- 선택 옵션은 해당 제안에 포함된 옵션이어야 한다.
- 커플 구성원이 아닌 사용자는 상태를 변경할 수 없다.

### 7.3 수정 규칙

- FR-009가 필수로 승격되었으므로 `pending` 상태의 제안은 작성자가 수정할 수 있어야 한다.
- `accepted` 또는 `declined` 상태의 제안 수정은 먼저 `pending`으로 되돌리는 확인 절차를 둔다.
- 옵션이 삭제될 때 `selectedOptionId`가 해당 옵션이면 상태를 `pending`으로 되돌린다.

### 7.4 필터링 규칙

- 홈 또는 제안 목록에서 `all`, `pending`, `accepted`, `declined` 필터를 제공한다.
- 필터 상태는 URL 쿼리 또는 클라이언트 상태로 관리한다.
- 기본값은 `pending`으로 둔다.

## 8. 화면별 상세 설계

### 8.0 디자인 시스템 적용 기준

이 프로젝트는 루트의 `Design.md`를 공식 디자인 시스템 기준으로 사용한다. Date Planner는 커플 플래너 앱이지만, 시각 언어는 `Design.md`의 Airbnb 스타일 시스템을 따른다. 즉, 과한 파스텔 배경을 쓰기보다 흰 캔버스, 사진 중심 카드, Rausch 포인트 컬러, 부드러운 둥근 UI, 제한된 그림자 사용을 기본값으로 삼는다.

#### 핵심 토큰

| 영역 | 적용 값 | Date Planner 적용 방식 |
|------|---------|------------------------|
| 기본 배경 | `#ffffff` | 모든 주요 화면의 기본 캔버스 |
| 기본 텍스트 | `#222222` | 제목, 본문, 주요 라벨 |
| 보조 텍스트 | `#6a6a6a` | 설명, 날짜 보조 정보, 빈 상태 문구 |
| 포인트 컬러 | `#ff385c` | 주요 CTA, 수락 버튼, 선택 상태, AI 추천 실행 버튼 |
| 활성 포인트 | `#e00b41` | 버튼 누름 상태 |
| 비활성 포인트 | `#ffd1da` | 비활성 CTA |
| 경계선 | `#dddddd` | 입력창, 카드 구분선, 검색/필터 세그먼트 |
| 부드러운 표면 | `#f7f7f7` | 필터 배경, 비활성 입력, 보조 영역 |
| 오류 텍스트 | `#c13515` | 입력 검증 오류 |

#### 타이포그래피

- 기본 폰트는 `Airbnb Cereal VF, Circular, Inter, -apple-system, system-ui, Roboto, "Helvetica Neue", sans-serif` 순서로 사용한다.
- 앱 구현 시 실제 Airbnb Cereal을 사용할 수 없으면 `Inter`를 기본 대체 폰트로 사용한다.
- 화면 제목은 22-28px 범위에서 사용하고, 큰 마케팅 히어로 타입은 사용하지 않는다.
- 카드 본문, 일정 메타, 댓글은 14-16px 범위로 유지한다.
- 버튼 라벨은 14-16px, weight 500을 기준으로 한다.

#### 형태와 간격

- 기본 버튼 반경은 8px로 한다.
- 데이트 옵션 카드와 일정 카드는 14px 안팎의 부드러운 둥근 모서리를 사용한다.
- 검색/필터 바, 커플 코드 입력 보조 영역은 pill 형태를 사용할 수 있다.
- 기본 간격은 4px 단위 토큰을 사용하고, 주요 카드 간격은 16px, 카드 내부 여백은 16-24px를 사용한다.
- 화면 전체 섹션은 64px보다 과하게 벌리지 않는다. 모바일 앱이므로 정보 밀도를 유지한다.

#### 그림자

- 그림자는 `Design.md`의 단일 shadow tier만 사용한다.
- 기본 화면과 섹션에는 그림자를 사용하지 않는다.
- 옵션 카드 hover, 드롭다운, 모달, 검색/필터 표면에만 제한적으로 사용한다.

#### Date Planner 전용 컴포넌트 매핑

| Date Planner 컴포넌트 | 디자인 시스템 기준 |
|----------------------|-------------------|
| `ProposalCard` | 사진 우선 `property-card` 구조를 응용한다. 장소 이미지가 없으면 부드러운 표면과 메타 정보 중심으로 표시한다. |
| `DateOptionCard` | 사진 영역, 장소명, 설명, 비용, 선호도, 댓글 요약을 가진 카드로 구성한다. |
| `ProposalFilterTabs` | pill형 카테고리 스트립을 응용한다. 선택된 탭은 ink 또는 Rausch로 강조한다. |
| `AiSuggestionPanel` | 검색 바 pill 패턴을 응용해 추천 조건 입력과 실행 버튼을 결합한다. |
| `DecisionBar` | 모바일에서는 하단 sticky bar로 배치하고, 수락 CTA에 Rausch를 사용한다. |
| `CalendarAgenda` | 카드형 목록을 사용하되 과한 배경색 없이 흰 캔버스 위 경계선과 여백으로 구분한다. |
| `OptionCommentThread` | 완전한 채팅 UI보다 리뷰/댓글 카드처럼 조용한 텍스트 스택으로 구성한다. |

#### 사용하지 않을 것

- 보라색, 베이지색, 과한 파스텔 배경을 주 색상으로 사용하지 않는다.
- 여러 단계의 그림자나 떠 있는 중첩 카드를 만들지 않는다.
- 랜딩 페이지식 대형 히어로 영역을 만들지 않는다.
- 데이트 앱이라는 이유만으로 하트, 그라데이션, 장식형 일러스트를 과하게 사용하지 않는다.

### 8.1 로그인 / 회원가입

- 이메일, 비밀번호, 표시 이름을 입력한다.
- 로그인 성공 후 커플 연결 상태에 따라 `/` 또는 `/link-couple`로 이동한다.
- 오류 메시지는 사용자에게 이해 가능한 한국어 문장으로 표시한다.

### 8.2 커플 연동

- 커플 코드가 없으면 코드 생성 버튼을 제공한다.
- 생성된 코드는 복사 버튼과 함께 표시한다.
- 상대방은 코드를 입력해 연결한다.
- 이미 커플이 있는 사용자는 새 코드 생성과 코드 입력을 막는다.

### 8.3 홈

- 대기 중 제안을 가장 위에 표시한다.
- 다가오는 확정 데이트를 표시한다.
- 상태 필터를 제공한다.
- 빠른 제안 작성 버튼을 제공한다.

### 8.4 제안 작성

- 기본 정보 입력 영역과 옵션 편집 영역으로 나눈다.
- 최소 하나 이상의 옵션이 있어야 저장 가능하다.
- AI 추천 버튼을 제공하고, 추천 결과를 옵션 초안으로 추가할 수 있게 한다.
- 수동 입력과 AI 추천 결과 편집을 모두 허용한다.

### 8.5 제안 상세

- 제안 상태, 날짜, 시간, 지역, 상세 계획을 표시한다.
- 옵션 카드를 세로 목록으로 표시한다.
- 각 옵션 카드 아래에 댓글 스레드를 제공한다.
- 상대방은 선호도를 표시하고, 옵션을 선택한 뒤 수락할 수 있다.
- 거절 시 이유 댓글 작성을 권장하되 필수는 아니다.

### 8.6 캘린더

- 첫 구현은 일정 목록형 `CalendarAgenda`를 우선한다.
- `accepted` 상태이며 `selectedOptionId`가 있는 제안만 표시한다.
- 날짜 오름차순으로 묶어 표시한다.
- 월간 달력 UI는 이후 확장 가능 항목으로 둔다.

## 9. 파일 구조 계획

```text
src/
  app/
    login/page.tsx
    signup/page.tsx
    link-couple/page.tsx
    page.tsx
    proposals/new/page.tsx
    proposals/[proposalId]/page.tsx
    calendar/page.tsx
    profile/page.tsx
  components/
    ui/
      design-tokens.ts
    layout/
    features/
      auth/
      couple/
      proposals/
      calendar/
      ai/
  features/
    auth/
    couple/
    proposals/
    comments/
    calendar/
    ai/
  hooks/
  lib/
    backend/
      client.ts
      types.ts
      supanova-client.ts
    ai/
      google-ai-studio.ts
      normalize-date-options.ts
    validation/
  types/
    date-planner.ts
```

## 10. 입력 검증

### 10.1 제안 생성

- `title`: 1자 이상 80자 이하.
- `proposedDate`: 오늘 또는 미래 날짜 권장. 과거 날짜는 경고 표시.
- `proposedTime`: `HH:mm` 형식.
- `locationArea`: 1자 이상 80자 이하.
- `category`: 허용된 카테고리만 가능.
- `options`: 최소 1개 이상, 권장 2개 이상.

### 10.2 옵션

- `placeName`: 필수.
- `externalUrl`: URL 형식일 때만 저장.
- `estimatedCost`: 자유 텍스트로 두되 40자 이하.

### 10.3 댓글

- `content`: 1자 이상 500자 이하.
- 빈 댓글은 저장하지 않는다.

## 11. 보안 및 권한

- 인증 토큰과 세션 정보는 백엔드 권장 방식에 따른다.
- Google AI Studio API 키는 서버 환경 변수로만 관리한다.
- 모든 읽기/쓰기 작업은 `coupleId` 기준으로 접근을 제한한다.
- 클라이언트의 숨김 처리만 믿지 않고 백엔드 규칙에서도 권한을 검증한다.
- 커플 코드는 충분히 예측하기 어렵게 생성하고, 이미 사용 중인 코드는 재사용하지 않는다.
- 댓글과 상세 계획은 화면 출력 시 XSS 방지를 위해 텍스트로 렌더링한다.

## 12. 환경 변수

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_BACKEND_PROVIDER=supanova
NEXT_PUBLIC_SUPANOVA_URL=
NEXT_PUBLIC_SUPANOVA_ANON_KEY=
SUPANOVA_SERVICE_KEY=
GOOGLE_AI_STUDIO_API_KEY=
```

`SUPANOVA_SERVICE_KEY`와 `GOOGLE_AI_STUDIO_API_KEY`는 브라우저에 노출하지 않는다.

## 13. 구현 순서

1. Next.js, TypeScript, Tailwind CSS 기본 구조 생성.
2. `Design.md` 기반 색상, 타이포그래피, 반경, 그림자 토큰 정의.
3. 공통 레이아웃과 모바일 하단 내비게이션 구현.
4. 버튼, 입력창, 카드, 필터 탭, 상태 칩 같은 기본 UI 컴포넌트 구현.
5. `BackendClient` 인터페이스와 `supanova` 어댑터 초안 작성.
6. 인증, 회원가입, 로그인, 로그아웃 구현.
7. 커플 코드 생성과 연결 구현.
8. 제안/옵션 타입과 검증 로직 구현.
9. 제안 작성, 수정, 삭제 구현.
10. 제안 목록, 상태 필터, 상세 화면 구현.
11. 댓글과 수정 요청 구현.
12. 수락/거절/보류 상태 변경 구현.
13. 확정 일정 목록형 캘린더 구현.
14. Google AI Studio 기반 후보 옵션 추천 구현.
15. 실시간 또는 준실시간 동기화 구현.
16. 접근성, 반응형, 오류 상태, 빈 상태, 디자인 시스템 일관성 점검.

## 14. 테스트 계획

### 14.1 단위 테스트

- 제안 입력 검증이 필수 항목 누락을 잡는지 확인한다.
- 옵션 URL 검증이 잘못된 URL을 거부하는지 확인한다.
- `accepted` 상태 변경 시 `selectedOptionId`가 없으면 실패하는지 확인한다.
- 상태 필터가 `pending`, `accepted`, `declined` 목록을 올바르게 나누는지 확인한다.
- AI 추천 응답 정규화가 옵션 초안 배열로 변환되는지 확인한다.

### 14.2 통합 테스트

- 회원가입 후 커플 코드 생성 흐름.
- 두 번째 사용자가 코드로 커플에 연결되는 흐름.
- 제안 생성 후 상대방 화면에서 조회되는 흐름.
- 옵션 댓글 작성 후 양쪽 화면에서 댓글이 보이는 흐름.
- 옵션 선택 후 수락하면 캘린더에 표시되는 흐름.
- 제안 상태별 필터링이 동작하는 흐름.
- AI 추천 결과를 옵션으로 추가해 저장하는 흐름.

### 14.3 수동 QA 체크리스트

- 360px 모바일 폭에서 버튼과 텍스트가 겹치지 않는다.
- 모든 저장 버튼은 로딩 상태를 표시한다.
- 빈 홈, 빈 캘린더, 빈 댓글 상태가 자연스럽게 표시된다.
- 잘못된 커플 코드를 입력하면 명확한 오류가 나온다.
- 권한이 없는 제안 URL 접근은 차단된다.
- AI 추천 실패 시 수동 옵션 입력은 계속 가능하다.
- `Design.md`의 흰 캔버스, Rausch CTA, 8px/14px 반경, 제한된 그림자 규칙을 따른다.
- 주요 CTA 외에는 Rausch 색상을 남용하지 않는다.
- 모바일 sticky 결정 바가 본문 내용을 가리지 않는다.

## 15. 미확정 사항

- `supanova`가 정확한 백엔드 서비스명인지, 또는 Supabase를 의미하는지 확인이 필요하다.
- Google AI Studio API의 실제 모델명, 호출 SDK, 과금 제한은 구현 전에 확인해야 한다.
- 실시간 동기화는 백엔드 제공자의 구독 기능을 확인한 뒤 구현 방식을 확정한다.
- 제안 작성자가 자신의 제안을 수락할 수 있는지 정책 결정이 필요하다.

## 16. 완료 기준

- 모든 필수 기능 요구사항이 설계에 매핑되어 있다.
- 데이터 모델과 권한 규칙이 구현 가능한 수준으로 정의되어 있다.
- AI 추천, 제안 수정, 실시간 동기화, 상태 필터링이 필수 범위에 포함되어 있다.
- `Design.md` 디자인 시스템이 구현 기준으로 명시되어 있고, UI 컴포넌트에 매핑되어 있다.
- 구현자가 파일 구조와 작업 순서만 보고 개발을 시작할 수 있다.
