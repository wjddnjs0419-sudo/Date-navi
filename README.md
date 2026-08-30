# Date Navi 💕

커플이 함께 만들고, 고르고, 기록하는 데이트 플래너입니다.

“오늘 뭐 하지?”가 막막한 날, 원하는 분위기와 조건을 고르면 Date Navi가 실제 장소를 바탕으로 데이트 코스를 제안합니다. 추천 결과는 두 사람이 함께 다듬고, 마음에 드는 코스는 일정과 추억으로 남길 수 있습니다.

## Date Navi에서 할 수 있는 일

- **커플 연결**: 카카오·Google·Apple 계정으로 로그인하고 연인과 연결합니다.
- **취향 설정**: 선호하는 데이트 스타일, 분위기, 피하고 싶은 요소 등을 설정합니다.
- **AI 데이트 코스 추천**: 위치, 시간, 분위기와 같은 조건에 맞춰 여러 장소를 잇는 코스를 받아봅니다.
- **추천 결과 수정**: 마음에 드는 장소는 잠그고, 순서를 바꾸거나 장소를 삭제·교체·추가할 수 있습니다. 지도에서 위치도 확인할 수 있습니다.
- **함께 결정하기**: 추천 후보를 상대방과 공유하고 서로의 반응을 확인하며 코스를 고릅니다.
- **일정과 추억 기록**: 확정한 데이트를 일정으로 관리하고, 다녀온 뒤 리뷰와 사진으로 추억을 남깁니다.

## 이렇게 사용하세요

1. 로그인한 뒤 커플 연결을 완료합니다.
2. 온보딩에서 데이트 취향을 설정합니다.
3. 데이트 코스를 만들며 원하는 장소·시간·분위기를 선택합니다.
4. AI 추천 결과에서 장소와 순서를 두 사람의 취향에 맞게 수정합니다.
5. 코스를 저장하거나 상대방과 공유하고, 데이트가 끝난 뒤 추억을 기록합니다.

## 추천 결과에 대해 알아두세요

AI가 제안하는 장소와 일정 정보는 실제 상황과 다를 수 있습니다. 영업시간, 휴무일, 가격, 예약 가능 여부와 이동 시간을 방문 전에 직접 확인해 주세요.

Date Navi는 데이트 아이디어를 돕는 서비스이며, 추천 결과를 그대로 따라야 하는 서비스는 아닙니다. 두 사람의 상황과 안전을 우선해 최종 결정을 내려 주세요.

## 지원 환경

- iPhone 앱
- 한국어·영어
- 카카오·Google·Apple 로그인

## 개발자 안내

앱은 React Native와 Expo로 구성되어 있으며, 인증과 데이터 저장에는 Supabase를 사용합니다. 카카오·Google·Apple 로그인 등 네이티브 모듈이 포함되어 있어 Expo Go가 아닌 iOS development build가 필요합니다.

### 준비물

- Node.js
- Xcode 및 iOS Simulator
- Docker Desktop
- Supabase CLI

### 로컬 실행

```bash
npm install
cp .env.example .env.local
supabase start
npx expo run:ios
```

iOS Simulator에서 로컬 Supabase를 사용할 때는 `.env.local`에 다음 값을 설정합니다. `EXPO_PUBLIC_SUPABASE_ANON_KEY`는 `supabase status`에서 확인한 Publishable 키를 사용합니다.

```text
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<supabase status의 Publishable 키>
```

처음 development build를 설치한 뒤에는 다음 명령으로 Metro만 실행할 수 있습니다.

```bash
npx expo start
```

환경 파일에는 실제 비밀 키를 커밋하지 마세요. 로컬 Supabase를 사용하지 않는 경우에는 프로젝트에서 안내한 원격 환경 설정이 필요합니다.

### 검증

```bash
npm test
npm run validate
```

버그 제보와 개선 제안은 [GitHub Issues](https://github.com/wjddnjs0419-sudo/Date-navi/issues)에 남겨 주세요.
