# Date Navi Web 분리·공개 데모·도보 경로 설계

Date: 2026-08-31

Status: 사용자 승인 완료 — 구현 기준선

Scope: 기존 `web/`을 독립 저장소로 분리하고, 로그인 없는 코스 추천 데모와 MapLibre 기반 지도·실제 도보 경로를 제공한다.

## 1. 목적

현재 `Date-navi` 저장소에는 Expo React Native 앱, Supabase 추천 백엔드, Next.js 웹사이트가 함께 있다. 웹사이트를 독립 프로젝트로 분리해 저장소와 배포 단위를 단순화하되, 모바일에서 검증한 추천 입력 방식과 추천 엔진을 복제하지 않고 그대로 활용한다.

완료된 웹 서비스는 다음 경험을 제공한다.

- 로그인 없이 Date Navi 추천 기능을 제한적으로 체험한다.
- 모바일과 같은 5단계 입력 흐름을 사용한다.
- 추천 장소를 넓은 데스크톱 지도에서 커스텀 마커로 확인한다.
- 선택된 장소 사이의 실제 도보 경로, 거리, 예상 시간을 확인한다.
- 기존 초대 링크, 동적 OG, 개인정보처리방침, 고객지원, AASA 경로를 유지한다.
- 기존 Vercel 프로젝트와 `date-navi.vercel.app` 도메인은 유지한다.

## 2. 비목표

이번 분리·웹 MVP에는 다음을 포함하지 않는다.

- 웹 회원가입, 로그인, 커플 연결, 추천 기록 저장
- 모바일 앱 추천 엔진의 별도 웹 복제
- 웹에서 장소를 직접 수정·잠금·저장·파트너에게 전송하는 기능
- 평점이나 실사진이 없는 장소에 임의 데이터를 만들어 표시하는 기능
- 원본 OpenStreetMap 타일 서버를 프로덕션 타일 CDN처럼 직접 사용하는 구성
- 실제 보행 시간을 후보 전체의 필수 랭킹 기준으로 바꾸는 작업

마지막 항목은 후속 단계에서 ORS Matrix를 추천 후보 선택에 연결할 때 다룬다. 이번 MVP는 기존 직선거리 휴리스틱으로 코스를 선택한 뒤, 최종 코스를 실제 도보 경로로 검증하고 표시한다.

## 3. 저장소 경계

### `Date-navi`

기존 저장소는 다음의 원본이다.

- Expo React Native 모바일 앱
- Supabase Edge Functions와 Postgres migration
- Naver/Kakao 장소 검색 및 추천 파이프라인
- 추천 계약과 카테고리별 키워드 카탈로그
- 웹 공개 데모 전용 `recommend-demo` Edge Function

`recommend-demo`는 기존 `_shared` 추천 모듈을 호출한다. 모바일 추천 로직을 복사하거나 웹 전용 추천 알고리즘을 새로 만들지 않는다.

### `Date-navi-web`

새 저장소는 기존 `web/`의 파일을 복사해 새 Git history로 시작한다. 다음만 포함한다.

- Next.js App Router 웹 애플리케이션
- 공개 마케팅·지원·개인정보처리방침·초대·공유 페이지
- 5단계 공개 데모 UI
- MapLibre 지도와 장소·클러스터·경로 UI
- Vercel 서버 Route Handler
- 웹 전용 타입, 표시 포맷, 테스트, 정적 디자인 자산

Supabase 추천 구현, 모바일 코드, iOS/Android 자산, 모바일 테스트, migration 전체를 새 웹 저장소로 복사하지 않는다.

## 4. 기존 웹과 Vercel 이전

새 저장소의 첫 커밋은 기존 `web/`의 동작을 그대로 보존한 상태여야 한다. 기능 개발보다 먼저 아래 경로의 회귀를 막는다.

- `/`
- `/invite`
- `/course/[shareToken]`
- `/support`
- `/privacy`
- `/api/og`
- `/.well-known/apple-app-site-association`

Vercel에서는 새 프로젝트를 만들지 않는다. 기존 프로젝트의 Git 연결만 `Date-navi-web`로 교체하고 Root Directory를 기존 `web`에서 저장소 루트로 변경한다. 기존 프로젝트 ID, 도메인, 환경 변수, 배포 기록과 설정은 유지한다.

이전 순서는 다음과 같다.

1. `Date-navi-web` 새 저장소와 첫 커밋을 만든다.
2. 로컬 빌드와 기존 URL 계약 테스트를 통과시킨다.
3. 기존 Vercel 프로젝트에 새 저장소를 연결하고 Preview 배포를 검증한다.
4. Root Directory를 저장소 루트로 설정한다.
5. 기존 환경 변수가 Preview와 Production에 남아 있는지 확인한다.
6. Production 배포 후 도메인과 AASA·OG·초대 링크를 다시 검증한다.
7. 안정화 후에만 기존 저장소에서 `web/`을 제거한다.

`Date-navi`의 `web/` 삭제와 Vercel 전환은 같은 커밋이나 같은 순간에 수행하지 않는다. 새 배포가 검증될 때까지 기존 소스는 복구 경로로 보존한다.

## 5. 사용자 흐름

웹의 추천 입력을 단순화하지 않는다. 모바일의 다음 5단계를 같은 순서와 의미로 유지한다.

1. 코스 카테고리와 순서 선택
2. 만날 지역 선택
3. 날짜와 시간 선택
4. 분위기 선택
5. 최종 확인과 추천 생성

첫 단계에서는 카테고리마다 기존 질문과 키워드를 제공한다.

- 식사: 아무거나, 고기, 한식, 일식, 양식, 가볍게와 기존 추천 키워드
- 카페: 루프탑 카페, 디저트, 북카페와 개인 입력
- 술집: 와인바, 칵테일, 수제맥주와 개인 입력
- 액티비티: 보드게임, 방탈출, 볼링, 클라이밍과 개인 입력
- 문화: 전시, 미술관, 공연과 개인 입력
- 산책: 한강 산책, 공원 산책과 개인 입력

코스는 2~4단계이며 순서를 보존한다. `AI가 결정`과 `아무거나`의 기존 의미도 유지한다. 시간 선택과 분위기 6종, 추천에 맡기기, 최대 도보 시간 선택도 모바일 계약을 따른다.

데스크톱에서는 좌측 고정 패널에 현재 입력 단계를 표시하고, 우측 지도를 계속 노출한다. 모바일 폭에서는 입력과 지도를 세로로 배치하며 핵심 CTA와 입력은 지도보다 먼저 제공한다.

## 6. 로딩 화면

기존 `QuickPlanningLoading`의 시각 언어와 자산을 웹에 이식한다.

- 제목: 둘에게 맞는 코스를 찾고 있어요
- 단계: 취향 분석 → 장소 탐색 → 동선 정리 → 코스 완성
- 마스코트 자산:
  - `mascot-heart-loading-preference`
  - `mascot-heart-loading-places`
  - `mascot-heart-loading-route`
  - `mascot-heart-loading-finish`
- 선택한 지역·시간·분위기 조건 카드
- 단계별 말풍선과 상태 문구
- 0~100% 연속 진행 표시

단계 경계는 기존 동작과 맞춘다.

- 0~24%: 취향 분석
- 25~52%: 장소 탐색
- 53~76%: 동선 정리
- 77~100%: 코스 완성

웹에서는 좌측 패널이 로딩 화면으로 전환되고 우측 지도는 유지된다. `동선 정리` 단계에서는 지도 위에 임의 경로를 미리 그리지 않는다. 실제 ORS 응답이 도착한 뒤에만 도보 경로를 표시한다. Reduce Motion 사용자는 마스코트 전환과 경로 드로잉 애니메이션을 최소화한다.

## 7. 지도와 장소 표시

MapLibre GL JS는 지도 렌더러다. 장소 검색 데이터와 도보 경로 데이터는 지도 타일과 별도로 가져온다.

- 지도: MapLibre GL JS
- 베이스맵: OSM 기반 상용 또는 운영 가능한 타일 스타일 URL
- 장소: 기존 Naver 우선 + Kakao fallback 추천 응답
- 도보 경로: openrouteservice `foot-walking`
- 지도 데이터 형식: GeoJSON

타일 스타일 URL은 `NEXT_PUBLIC_MAP_STYLE_URL`로 주입한다. 개발용 데모 스타일과 프로덕션 타일 제공자를 분리할 수 있어야 한다. MapLibre 데모 타일이나 `tile.openstreetmap.org`를 트래픽이 있는 프로덕션의 무제한 타일 서비스로 간주하지 않는다. OSM 저작자 표시를 지도에 항상 노출한다.

### 마커

개별 장소 마커는 다음 정보를 표시한다.

- 코스 순서
- 카테고리 색상과 아이콘
- 장소명
- 카테고리
- 사용 가능한 경우에만 실사진과 평점

현재 Naver/Kakao Local 응답 계약에는 신뢰할 수 있는 실사진과 평점이 없으므로 초기 버전은 카테고리 일러스트와 `Date Navi 추천` 배지를 사용한다. 평점 자리가 비어 있어도 레이아웃이 무너지지 않아야 하며 가짜 평점을 표시하지 않는다.

장소가 겹치는 탐색 상태에서는 GeoJSON clustering을 사용해 `2`, `7`처럼 개수를 표시한다. 최종 2~4개 코스는 번호 마커와 경로 가독성을 우선하며 같은 위치가 아닌 한 클러스터링하지 않는다.

좌측 결과 카드, 지도 마커, 경로 구간은 같은 `stepId`를 공유한다. 카드 또는 마커를 선택하면 나머지 요소도 같은 단계로 활성화되고 지도 카메라가 해당 장소로 이동한다.

## 8. 도보 경로

### 현재 상태

현재 추천은 하버사인 직선거리로 후보의 중심 거리와 장소 간 거리를 계산한다. `maxWalkingMinutes`는 `분 × 80m`로 환산하며 결과 메타데이터는 `haversine_straight_line`, `hardConstraintValidated: false`다. 이 값은 빠른 후보 축소와 임시 동선 적합성 판단에 계속 사용한다.

### MVP 처리

추천이 최종 장소 2~4개의 위도·경도를 반환하면 Vercel 서버가 openrouteservice Directions의 `foot-walking` 프로필을 한 번 호출한다. 모든 장소를 순서대로 한 요청의 waypoint로 전달한다.

서버는 다음 계약으로 정규화한다.

```ts
type WalkingRoute = {
  status: 'available' | 'unavailable';
  provider: 'openrouteservice';
  profile: 'foot-walking';
  geometry?: GeoJSON.LineString;
  totalDistanceMeters?: number;
  totalDurationSeconds?: number;
  legs?: Array<{
    fromStepId: string;
    toStepId: string;
    distanceMeters: number;
    durationSeconds: number;
    exceedsRequestedMaximum: boolean;
  }>;
};
```

MapLibre는 `geometry`를 별도 GeoJSON source와 line layer로 그린다. 결과 카드 사이에는 `도보 8분 · 540m`처럼 실제 구간 정보를 표시한다.

`maxWalkingMinutes`가 설정된 경우 실제 각 leg의 시간을 비교한다. 초과 구간이 있으면 같은 공개 요청 안에서 자동 대체를 최대 1회 시도한다. 가장 크게 초과한 구간의 도착 스텝을 대상으로 기존 장소를 제외하고, 나머지 스텝은 고정한 채 기존 추천 파이프라인을 다시 호출한다. 대체 결과는 ORS로 한 번 더 검증한다.

자동 대체는 무한 재생성을 허용하지 않는다. 공개 요청 하나에서 추천 선택은 최대 2회, ORS Directions는 최대 2회다. 한 번의 대체 후에도 제한을 초과하거나 대체 후보가 없으면 코스를 반환하되 초과 구간을 명확히 표시하고, 기존 추천 응답의 `relaxedConstraints` 설명과 함께 보여준다.

후속 단계에서는 카테고리별 상위 후보를 25개 이하로 줄인 뒤 ORS Matrix를 한 번 호출해 실제 보행 시간을 코스 선택에 반영한다. 이 단계가 완료되기 전에는 UI에서 최대 도보 시간을 절대 보장값으로 표현하지 않고 `우선 반영` 또는 `기준`으로 표현한다.

### 실패 처리

도보 경로 계산은 추천 성공과 분리한다.

- ORS timeout, 429, 5xx: 추천 장소는 표시하고 경로 상태만 `unavailable`로 반환한다.
- 경로 없음: 직선 연결선을 도보 경로처럼 표시하지 않는다.
- 일부 좌표 누락: 유효한 장소 카드는 표시하고 경로를 생략한다.
- 응답 geometry 또는 leg 개수 불일치: 서버 검증에서 폐기하고 오류 로그를 남긴다.

## 9. 서버 데이터 흐름

```text
브라우저
  → POST /api/demo/recommend
  → 요청 검증 + 익명 사용량 제한
  → Supabase recommend-demo
  → 기존 Naver/Kakao 검색 + 추천 파이프라인
  → 최종 장소 좌표 반환
  → ORS foot-walking 경로 계산
  → 추천 코스 + WalkingRoute 응답
  → MapLibre 마커·클러스터·도보 경로 표시
```

브라우저는 Naver, Kakao, AI, ORS 비밀 키를 받지 않는다. Vercel Route Handler는 공개 웹의 단일 오케스트레이션 경계이며, Supabase `recommend-demo`도 자체 입력 검증과 사용량 검사를 수행한다.

지역 선택은 모바일과 같이 현재 위치 또는 Kakao 기반 검색 결과를 사용한다. 기존 `location-autocomplete`의 검색·정렬 코어를 공유하되, 웹은 Vercel의 same-origin `/api/demo/locations`를 통해서만 호출한다. 검색은 2글자부터 300ms debounce하고 최대 8개 결과만 반환한다.

## 10. 공개 데모 제한과 보안

로그인 없는 공개 서비스이므로 모바일의 사용자 ID 기반 제한을 그대로 사용할 수 없다. 다음 두 식별자를 함께 사용한다.

- 서버가 발급한 HttpOnly 익명 방문자 쿠키
- HMAC 처리한 IP 또는 네트워크 prefix

원본 IP는 추천 로그나 데이터베이스에 저장하지 않는다. HMAC secret은 서버 환경 변수로 관리한다.

초기 기본 제한은 다음과 같다.

- 방문자당 24시간 동안 추천 3회
- IP hash당 24시간 동안 추천 30회
- 방문자당 동시 추천 1회, stale lock 2분
- 도보 경로 요청은 성공한 추천 요청에 귀속하고 별도 공개 범용 라우팅 API로 제공하지 않음
- 한 공개 요청 안의 자동 대체는 최대 1회
- 서비스 전체 일일 상한은 환경 변수로 설정
- 지역 자동완성은 방문자당 24시간 60회, IP hash당 24시간 300회, 서비스 전체 일일 상한 3,000회

한 번의 공개 추천에 ORS Directions 호출은 기본 1회, 도보 제한 초과에 따른 자동 대체가 실행될 때만 최대 2회다. 동일한 waypoint 순서와 profile은 서버 캐시 키로 정규화해 재사용한다. 캐시는 최소 24시간 유지하고 사용자 입력 문구나 IP를 키에 포함하지 않는다.

현재 ORS Standard 제한인 Directions 2,000회/일·40회/분보다 낮은 서비스 전체 상한을 둔다. 자동 대체의 최악 조건인 요청당 2회를 기준으로 용량을 계산한다. 한도 임박, ORS 429, API 장애 시 추천 결과만 반환하고 도보 경로는 일시적으로 생략한다.

요청 본문은 크기와 스키마를 제한한다. 자유 입력 키워드와 추가 요청은 기존 최대 길이를 유지하고 로그에는 원문 대신 필요한 운영 메타데이터만 남긴다. CORS는 `date-navi.vercel.app`과 Preview origin 정책으로 제한한다.

## 11. 공개 계약

웹 요청은 모바일의 추천 계약에서 로그인·세션 저장에 필요한 필드만 제거한다. 핵심 의미는 유지한다.

```ts
type WebDemoRecommendationRequest = {
  courseSteps: Array<{
    id: string;
    category: 'meal' | 'cafe' | 'drinks' | 'activity' | 'culture' | 'walk' | 'ai_decide';
    intentTags?: string[];
  }>;
  location: { label: string; latitude: number; longitude: number };
  meetingTime: string;
  moods: string[];
  maxWalkingMinutes?: 5 | 10 | 20;
  language: 'ko' | 'en';
};
```

응답 장소는 최소한 `stepId`, 순서, 이름, 주소, 카테고리, 위도, 경도, provider와 map URL을 포함한다. `rating`, `photoUrl`은 optional이며 검증된 출처가 있을 때만 채운다. 응답에는 모바일 인증 세션 ID나 내부 candidate ID를 노출하지 않는다.

웹과 Supabase 간 계약은 Zod 또는 동등한 런타임 스키마로 양쪽에서 검증한다. 계약 변경은 호환 가능한 optional 필드 추가를 우선한다.

## 12. 디자인 시스템

웹은 모바일 화면을 그대로 확대하지 않고 데스크톱 레이아웃으로 번역하되 브랜드 토큰을 유지한다.

- Canvas: `#FFF9FC`
- Loading background: `#FFF1F6`
- Surface: `#FFFFFF`
- Brand primary: `#F26B7A`
- Brand deep: `#C24B57`
- Brand subtle: `#FFEEF0`
- Text primary: `#3B2E2E`
- Text secondary: `#8A7F76`
- Border default: `#F2E0DC`
- Card radius: 22px, 기본 shadow 없음
- Input radius: 16px
- Primary CTA radius: 18px
- Typography: Inter

일반 카드와 입력에 임의 raw 색상·간격·radius를 추가하지 않고 웹 CSS custom properties로 의미 토큰을 정의한다. 기존 마스코트와 카테고리 아이콘은 라이선스와 출처를 함께 복사한다.

## 13. 접근성·반응형

- 모든 입력, 탭, 마커 선택은 키보드로 조작 가능해야 한다.
- 현재 단계, 로딩 상태, 추천 완료, 경로 실패는 적절한 live region으로 알린다.
- 지도만으로 장소 순서와 구간 정보를 전달하지 않고 좌측 목록에 같은 정보를 텍스트로 제공한다.
- 색상만으로 카테고리와 선택 상태를 구분하지 않는다.
- Reduce Motion을 존중한다.
- 데스크톱은 좌측 패널 + 지도, 좁은 화면은 입력/결과 + 지도 순서로 재배치한다.
- 320px에서도 핵심 CTA, 입력, 결과 목록이 가로로 잘리지 않아야 한다.

## 14. 관측과 분석

개인정보를 남기지 않는 범위에서 다음 이벤트를 집계한다.

- 데모 시작
- 각 입력 단계 완료
- 추천 요청 성공·실패·제한 거부
- 장소 provider와 fallback 사용 여부
- 도보 경로 성공·실패·timeout·429
- 실제 도보 제한 초과 구간 수
- 결과 카드·지도 마커 선택
- App Store CTA 클릭

추천 원문, 자유 입력 원문, 원본 IP, 정밀한 개인 위치 이력은 분석 이벤트에 저장하지 않는다.

## 15. 테스트와 검증

### `Date-navi`

- `recommend-demo` 입력 스키마와 익명 rate limit 단위 테스트
- 기존 `_shared` 추천 파이프라인 재사용 회귀 테스트
- 웹 요청이 모바일 사용자의 quota·세션을 소비하지 않는지 확인
- 비밀 키·내부 ID 미노출 계약 테스트
- 전체 TypeScript 검증과 대상 Edge 통합 테스트

### `Date-navi-web`

- 기존 공개 URL·AASA·OG 회귀 테스트
- 5단계 입력 상태와 카테고리별 키워드 테스트
- 추천 요청·rate limit·오류 UI 테스트
- ORS 응답 정규화와 잘못된 geometry/leg 거부 테스트
- 거리·초 단위 표시 포맷 테스트
- 카드·마커·경로 선택 동기화 테스트
- MapLibre cluster와 route source 브라우저 검증
- 한국어·영어, 데스크톱·모바일 폭, Reduce Motion 시각 검증
- Next.js production build 검증

### 배포 후

- 홈·지원·개인정보처리방침 200 응답
- AASA content type과 appID 확인
- OG PNG 응답과 공유 미리보기 확인
- 초대 링크의 앱 열기·스토어 fallback 확인
- 추천 1회 전체 흐름과 ORS 도보 경로 확인
- 제한 초과와 ORS 장애 fallback 확인
- 기존 Vercel 도메인이 새 저장소 배포를 가리키는지 확인

## 16. 구현 순서

1. 새 웹 저장소 생성과 기존 웹 기능의 무변경 이전
2. Vercel Preview 연결과 기존 URL 회귀 검증
3. 모바일 추천 계약을 사용하는 `recommend-demo`와 익명 제한 구현
4. 웹 5단계 입력과 기존 로딩 화면 이식
5. MapLibre 지도·커스텀 마커·클러스터 구현
6. ORS 도보 경로와 결과 카드 구간 표시 구현
7. 오류·한도·캐시·분석 이벤트 구현
8. 전체 브라우저·빌드 검증
9. 기존 Vercel Production 연결 전환
10. 안정화 후 기존 저장소의 `web/` 제거

## 17. 승인 기준

이 설계가 승인되면 별도 구현 계획에서 작업을 두 저장소의 원자적 태스크로 나눈다. 실제 코드·Supabase·Vercel 변경은 구현 계획 승인 후 시작한다.

## 18. 참고 근거

- 기존 직선거리 코스 계산: `lib/courseRoute.ts`
- 서버 추천·도보 휴리스틱: `supabase/functions/_shared/recommendation-ranking.ts`
- provider-neutral 코스 메타데이터: `supabase/functions/_shared/provider-neutral-course-selection.ts`
- 모바일 5단계 입력: `app/mode-flow/course.tsx`, `locales/ko/course.json`
- 모바일 로딩 화면: `app/mode-flow/generating.tsx`, `components/recommendation/quick-planning-loading.tsx`
- 디자인 시스템: `docs/design-system/README.md`, `constants/design-tokens.ts`
- MapLibre GeoJSON line: <https://www.maplibre.org/maplibre-gl-js/docs/examples/add-a-geojson-line/>
- openrouteservice 계획: <https://account.heigit.org/info/plans>
- openrouteservice 요청 제한: <https://openrouteservice.org/restrictions/>
