# GPS 기반 "어디서 만나요" 위치 입력 — 설계

## 배경

`LocationField`([components/ui.tsx:340-372](../../../components/ui.tsx#L340-L372))는 자유 텍스트로만 동네를 입력받아, `place-search` 엣지 함수가 카카오 텍스트 검색으로 좌표를 얻는다(`geocode()`, [supabase/functions/place-search/index.ts:50-57](../../../supabase/functions/place-search/index.ts#L50-L57)). 사용자가 매번 동네 이름을 타이핑해야 하는 불편을 없애기 위해, GPS로 현재 위치를 얻어 그대로 검색에 쓰는 기능을 추가한다.

## 목표

- `LocationField`에 "내 위치 사용" 토글 버튼(SVG 아이콘)을 추가한다.
- GPS 좌표를 역지오코딩 없이 그대로 place-search 파이프라인에 전달한다(정확도 우선, 추가 API 호출 없음).
- 위치 권한은 iOS/Android 표준 방식대로 버튼 탭 시점에 요청하고, 설정 화면에도 상태 확인 경로를 둔다.

## 비목표

- 좌표 → 실제 주소/동네 이름 역지오코딩(표시용 라벨 개선)은 하지 않는다. GPS 사용 중에는 고정 문구 "내 위치 사용 중"만 보여준다.
- 위치 자동 추적/백그라운드 위치는 다루지 않는다. 매번 사용자가 명시적으로 탭해야 한다.

## 데이터 타입 & 흐름

`FeelingInput`([lib/ai.ts:54-64](../../../lib/ai.ts#L54-L64))에 필드 추가:

```ts
export type FeelingInput = {
  // ...기존 필드
  location?: string;
  coords?: { x: string; y: string }; // x=경도(longitude), y=위도(latitude) — KakaoPlace와 동일 규약
};
```

`expo-location`의 `getCurrentPositionAsync()`는 `{ coords: { latitude, longitude } }`를 반환한다. 매핑 시 **`x = String(longitude)`, `y = String(latitude)`** — 순서를 뒤바꾸지 않도록 주의(흔한 실수 지점).

`lib/modeForm.ts`의 4개 `build*Input`(course/pick/feeling/light)는 각각의 Args 타입에 `coords?: { x: string; y: string }`를 추가하고 그대로 통과시킨다. `location`과 `coords`는 상호 배타적으로 쓰이지만 타입상 강제하지 않는다(둘 다 optional).

`lib/ai.ts`의 `generateDateCards`:

```ts
if (input.location || input.coords) {
  const focus = detectPlaceFocus(input.freeText);
  const places = await searchPlaces(
    { location: input.location, coords: input.coords },
    distanceToRadius(input.distance),
    focus,
  );
  placesBlock = formatPlacesBlock(places, language, focus?.label);
}
```

`searchPlaces`는 문자열 하나 대신 `{ location?: string; coords?: { x: string; y: string } }` 객체를 받아 place-search 바디에 그대로 실어 보낸다.

## LocationField 컴포넌트

기존 `TextInput`은 그대로 두고, 입력창 오른쪽 끝에 SVG 아이콘 버튼(`LocateFixed`, lucide-react-native — 이미 설치된 패키지, 신규 의존성 없음)을 추가한다. 새 props:

```ts
export function LocationField({
  value, onChangeText, coords, onCoordsChange, style,
}: {
  value: string;
  onChangeText: (v: string) => void;
  coords: { x: string; y: string } | null;
  onCoordsChange: (c: { x: string; y: string } | null) => void;
  style?: StyleProp<ViewStyle>;
})
```

버튼은 **단일 온/오프 토글**로 동작한다:

- **끄기 → 켜기**: `Location.getForegroundPermissionsAsync()` 확인 → `undetermined`면 `requestForegroundPermissionsAsync()` → 거부되었거나 재요청 불가면 설정 화면과 동일한 Alert("설정 열기" → `Linking.openSettings()`) → 승인되면 `getCurrentPositionAsync()`로 좌표 획득 → `onCoordsChange({ x, y })` 호출, `onChangeText('내 위치 사용 중')` 호출, 입력창은 `editable={false}`로 전환, 아이콘은 활성 스타일(분홍 배경)로 표시.
- **켜기 → 끄기**: 같은 아이콘 재탭 → `onCoordsChange(null)`, `onChangeText('')`, 입력창 다시 `editable={true}`.
- GPS 조회 실패(위치 서비스 꺼짐, 타임아웃 등) → Alert로 안내, 상태 변경 없음(입력창은 그대로 활성 유지).

텍스트를 직접 지우거나 고쳐서 GPS를 해제하는 경로는 없다 — 아이콘 탭만이 유일한 스위치다(입력창이 비활성화되어 있으므로 자연히 타이핑도 불가능).

각 화면(course/pick/feeling/light)은 `const [coords, setCoords] = useState<{ x: string; y: string } | null>(null)`을 추가하고, `<LocationField coords={coords} onCoordsChange={setCoords} .../>`로 연결하며, `buildXInput({ ..., coords })` 호출에 그대로 넘긴다.

## place-search 엣지 함수

[supabase/functions/place-search/index.ts:93-107](../../../supabase/functions/place-search/index.ts#L93-L107) 요청 파싱에 `coords` 분기 추가:

```ts
const { location, radius, focus, coords } = await req.json();
const hasCoords = coords && typeof coords.x === 'string' && typeof coords.y === 'string';
if (!hasCoords && (typeof location !== 'string' || !location.trim())) {
  return json({ error: 'Invalid request' }, 400);
}
// ...
const coord = hasCoords ? { x: coords.x, y: coords.y } : await geocode(key, location.trim());
if (!coord) return json({ places: [] });
```

이후 카테고리/키워드 검색, focus 분기 로직은 완전히 동일하게 재사용한다.

## 설정 화면

[app/settings.tsx](../../../app/settings.tsx)의 "환경설정" 섹션에 `handleNotifications`([settings.tsx:110-138](../../../app/settings.tsx#L110-L138))와 동일한 패턴으로 "위치 정보" row를 추가한다: 상태 미결정이면 권한 요청, 이미 결정됐으면 상태 안내 + "설정 열기". 실제 GPS 사용 트리거는 여전히 LocationField 아이콘이며, 이 row는 사전 확인/관리용 보조 경로다.

## 의존성 & 설정

- `expo-location` 패키지 추가 (`npx expo install expo-location`로 SDK 54 호환 버전 고정).
- `app.json`의 `plugins`에 `expo-location` 추가, iOS `locationWhenInUsePermission`에 한국어 안내 문구("내 위치 기반으로 주변 데이트 장소를 추천하려면 위치 권한이 필요해요." 등) 설정.

## 에러 처리

- 권한 거부: Alert + 설정 앱 딥링크 (기존 알림 권한 패턴과 동일).
- GPS 조회 실패/타임아웃: Alert로 안내, 상태는 변경하지 않음(사용자가 다시 시도하거나 수동 입력 가능).
- place-search에서 좌표 기반 검색도 결과가 0건이면 기존과 동일하게 `{ places: [] }` → 프롬프트는 장소 블록 없이 폴백.

## 테스트 범위

- `lib/modeForm.ts`의 `coords` 통과 로직: TDD 유닛 테스트 추가 (기존 `__tests__/modeForm.test.ts` 패턴).
- `place-search/index.ts`의 좌표 분기: 이 프로젝트에는 Deno 함수용 테스트 하네스가 없고 기존 place-search 로직도 미검증 상태라, 신규 테스트 인프라를 만들지 않고 기존 관례를 따른다(코드 리뷰로 검증).
- `LocationField`의 GPS 인터랙션: RN 컴포넌트 테스트 하네스가 프로젝트에 없어 자동 테스트 대상에서 제외, 시뮬레이터/기기에서 수동 확인.
