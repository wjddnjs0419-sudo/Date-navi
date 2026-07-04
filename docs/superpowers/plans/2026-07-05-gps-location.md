# GPS 기반 "어디서 만나요" 위치 입력 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LocationField에 GPS 토글 버튼(SVG 아이콘)을 추가해, 현재 위치 좌표를 역지오코딩 없이 place-search 파이프라인에 직접 전달한다.

**Architecture:** `FeelingInput`에 `coords?: {x, y}` 필드를 추가하고(카카오 규약: x=경도, y=위도), 4개 모드 폼 빌더가 통과시키며, place-search 엣지 함수는 coords가 오면 `geocode()`를 건너뛴다. UI는 기존 텍스트 입력창 오른쪽에 `LocateFixed` 아이콘 토글 하나만 추가한다(B안). GPS 사용 중에는 입력창이 "내 위치 사용 중" 고정 문구로 비활성화된다.

**Tech Stack:** expo-location(신규), lucide-react-native `LocateFixed`(기설치), 카카오 로컬 API(기존), jest(기존 유닛 테스트).

**설계 문서:** `docs/superpowers/specs/2026-07-04-gps-location-design.md`

**중요 규약:** `x = String(longitude)`, `y = String(latitude)`. expo-location은 `{ latitude, longitude }`를 주므로 매핑 시 순서 주의 — 여기가 가장 흔한 실수 지점.

---

### Task 1: expo-location 설치 + app.json 플러그인 설정

**Files:**
- Modify: `package.json` (자동)
- Modify: `app.json`

- [ ] **Step 1: 패키지 설치 (SDK 54 호환 버전 자동 고정)**

Run: `npx expo install expo-location`
Expected: package.json dependencies에 `"expo-location": "~19.x"` 계열 추가.

- [ ] **Step 2: app.json plugins에 위치 권한 문구 추가**

`app.json`의 `plugins` 배열 마지막(expo-image-picker 항목 뒤)에 추가:

```json
[
  "expo-location",
  {
    "locationWhenInUsePermission": "내 위치 기반으로 주변 데이트 장소를 추천하려면 위치 권한이 필요해요."
  }
]
```

- [ ] **Step 3: 검증**

Run: `npm run validate`
Expected: 에러 없음.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json app.json
git commit -m "chore: expo-location 설치 및 위치 권한 문구 설정"
```

---

### Task 2: FeelingInput.coords 타입 + 모드 폼 빌더 통과 (TDD)

**Files:**
- Modify: `lib/ai.ts:54-64` (FeelingInput)
- Modify: `lib/modeForm.ts` (4개 빌더)
- Test: `__tests__/modeForm.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`__tests__/modeForm.test.ts`의 `describe('mode별 FeelingInput 빌더', ...)` 블록 안, `'location 공백/미입력은 undefined로 정규화'` it 뒤에 추가:

```ts
  it('모든 빌더가 coords를 전달한다', () => {
    const coords = { x: '127.05', y: '37.54' };
    expect(buildLightInput({ duration: '1h', coords }).coords).toEqual(coords);
    expect(buildPickInput({ energy: 'low', budget: 'medium', distance: 'near', duration: '2-3h', coords }).coords).toEqual(coords);
    expect(buildFeelingInput({ mood: 'quiet', budget: 'low', duration: '1h', coords }).coords).toEqual(coords);
    expect(buildCourseInput({ idea: '한강', budget: '', duration: '', coords }).coords).toEqual(coords);
  });
  it('coords 미지정 시 undefined', () => {
    expect(buildLightInput({ duration: '1h' }).coords).toBeUndefined();
    expect(buildCourseInput({ idea: '한강', budget: '', duration: '' }).coords).toBeUndefined();
  });
```

- [ ] **Step 2: 실패 확인**

Run: `npx jest __tests__/modeForm.test.ts`
Expected: FAIL — TS 컴파일 에러(`coords` 프로퍼티 없음) 또는 undefined 불일치.

- [ ] **Step 3: 최소 구현**

`lib/ai.ts` — `FeelingInput` 타입에 필드 추가 및 좌표 타입 export (location 필드 아래):

```ts
// 카카오 규약 좌표. x=경도(longitude), y=위도(latitude).
export type GeoCoords = { x: string; y: string };
```

```ts
  location?: string;
  // GPS 현재 위치 (LocationField의 내 위치 토글 사용 시에만 채워진다)
  coords?: GeoCoords;
```

`lib/modeForm.ts` — import에 GeoCoords 추가, 4개 Args 타입에 `coords?: GeoCoords` 추가, 4개 빌더 return에 `coords: a.coords,` 추가:

```ts
import type { FeelingInput, GeoCoords } from './ai';

type PickArgs = { energy: string; budget: string; distance: string; duration: string; location?: string; coords?: GeoCoords };
type FeelingArgs = { mood: string; budget: string; duration: string; freeText?: string; location?: string; coords?: GeoCoords };
type LightArgs = { duration: string; location?: string; coords?: GeoCoords };
type CourseArgs = { idea: string; budget: string; duration: string; location?: string; coords?: GeoCoords };
```

각 빌더의 return 객체에 `location: norm(a.location),` 다음 줄로 `coords: a.coords,` 추가 (4곳 모두).

- [ ] **Step 4: 통과 확인**

Run: `npx jest __tests__/modeForm.test.ts && npm run validate`
Expected: 전부 PASS, tsc 에러 없음.

- [ ] **Step 5: Commit**

```bash
git add lib/ai.ts lib/modeForm.ts __tests__/modeForm.test.ts
git commit -m "feat: FeelingInput에 GPS coords 필드 추가, 모드 폼 빌더 통과"
```

---

### Task 3: lib/ai.ts — searchPlaces가 coords를 전달하도록 변경

**Files:**
- Modify: `lib/ai.ts` (searchPlaces, generateDateCards)

기존 유닛 테스트가 없는 파일(supabase 의존)이므로 기존 관례대로 typecheck + 전체 스위트 회귀로 검증한다.

- [ ] **Step 1: searchPlaces 시그니처 변경**

```ts
// 카카오 로컬 검색은 place-search Edge Function이 대행한다 (REST 키는 함수 시크릿).
// location(텍스트) 또는 coords(GPS 좌표) 중 하나를 받는다. 실패하면 빈 배열 → 장소 없는 프롬프트로 폴백.
async function searchPlaces(
  query: { location?: string; coords?: GeoCoords },
  radius: number,
  focus: PlaceFocus | null,
): Promise<KakaoPlace[]> {
  try {
    const { data, error } = await supabase.functions.invoke('place-search', {
      body: { location: query.location, coords: query.coords, radius, focus: focus ?? undefined },
    });
    if (error) throw error;
    const places = (data as { places?: KakaoPlace[] })?.places;
    return Array.isArray(places) ? places : [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 2: generateDateCards 조건 변경**

```ts
    // 위치(텍스트 또는 GPS 좌표)가 있으면 실제 장소를 먼저 가져와 프롬프트에 주입한다.
    // freeText에 "카페"/"맛집" 등 카테고리가 콕 집혀 있으면 그 카테고리만 검색해 후보를 좁힌다.
    let placesBlock = '';
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

- [ ] **Step 3: 검증**

Run: `npm run validate && npx jest`
Expected: tsc 에러 없음, 기존 테스트 전부 PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/ai.ts
git commit -m "feat: generateDateCards가 GPS coords를 place-search에 전달"
```

---

### Task 4: place-search 엣지 함수 — coords 직접 수신

**Files:**
- Modify: `supabase/functions/place-search/index.ts:93-107`

Deno 함수 테스트 하네스가 없으므로(기존 관례) 코드 리뷰 + 배포 후 수동 확인.

- [ ] **Step 1: 요청 파싱에 coords 분기 추가**

기존:

```ts
    const { location, radius, focus } = await req.json();
    if (typeof location !== 'string' || !location.trim()) {
      return json({ error: 'Invalid request' }, 400);
    }
```

변경:

```ts
    const { location, radius, focus, coords } = await req.json();
    // GPS 좌표가 오면 지오코딩 없이 그대로 사용한다 (x=경도, y=위도).
    const hasCoords = coords && typeof coords.x === 'string' && typeof coords.y === 'string';
    if (!hasCoords && (typeof location !== 'string' || !location.trim())) {
      return json({ error: 'Invalid request' }, 400);
    }
```

- [ ] **Step 2: geocode 호출 분기**

기존:

```ts
    const coord = await geocode(key, location.trim());
    if (!coord) return json({ places: [] });
```

변경:

```ts
    const coord = hasCoords
      ? { x: coords.x, y: coords.y }
      : await geocode(key, (location as string).trim());
    if (!coord) return json({ places: [] });
```

- [ ] **Step 3: 검증**

Run: `npm run validate`
Expected: 에러 없음 (supabase/functions는 tsconfig exclude라 영향 없음 — 형식 확인용).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/place-search/index.ts
git commit -m "feat: place-search가 GPS 좌표를 직접 받아 지오코딩 생략"
```

---

### Task 5: LocationField — GPS 토글 버튼 (B안, LocateFixed 아이콘)

**Files:**
- Modify: `components/ui.tsx:340-372` (LocationField), 상단 import

`coords`/`onCoordsChange`는 optional prop — 안 넘기면 기존과 동일하게 렌더(GPS 버튼 숨김)되어 화면별 배선 전까지도 컴파일·동작이 깨지지 않는다. RN 컴포넌트 테스트 하네스가 없으므로 수동 확인.

- [ ] **Step 1: import 추가**

`components/ui.tsx` 상단:

```ts
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, PanResponder, Pressable, TextInput, Linking, Alert,
  type ViewStyle, type TextStyle, type StyleProp,
} from 'react-native';
import { ChevronLeft, Pencil, X, Sparkles, Check, MapPin, LocateFixed } from 'lucide-react-native';
import { useRef, useState, type ReactNode } from 'react';
import * as Location from 'expo-location';
import type { GeoCoords } from '../lib/ai';
```

(기존 import 줄에 `Alert`, `LocateFixed`, `useState` 추가 + 아래 2줄 신규. `import type`은 런타임 로드 없음.)

- [ ] **Step 2: LocationField 교체**

```tsx
// ─── LocationField ────────────────────────────────────────────────────────────
// 데이트 지역(동네) 입력. 값이 있으면 카카오 로컬로 실제 장소를 붙인다. 선택 입력.
// onCoordsChange를 넘기면 우측에 GPS 토글 버튼이 생긴다. GPS 사용 중에는
// 입력창이 "내 위치 사용 중" 고정 문구로 비활성화되고, 아이콘 재탭으로만 해제된다.
const GPS_ACTIVE_TEXT = '내 위치 사용 중';

export function LocationField({
  value, onChangeText, coords, onCoordsChange, style,
}: {
  value: string;
  onChangeText: (v: string) => void;
  coords?: GeoCoords | null;
  onCoordsChange?: (c: GeoCoords | null) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const [locating, setLocating] = useState(false);
  const gpsOn = !!coords;

  async function handleGpsPress() {
    if (!onCoordsChange || locating) return;
    if (gpsOn) {
      onCoordsChange(null);
      onChangeText('');
      return;
    }
    setLocating(true);
    try {
      let { status, canAskAgain } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted' && canAskAgain) {
        ({ status } = await Location.requestForegroundPermissionsAsync());
      }
      if (status !== 'granted') {
        Alert.alert('위치 권한이 꺼져 있어요', '내 위치를 사용하려면 설정에서 위치 권한을 켜주세요.', [
          { text: '취소', style: 'cancel' },
          { text: '설정 열기', onPress: () => Linking.openSettings() },
        ]);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      // 카카오 규약: x=경도(longitude), y=위도(latitude)
      onCoordsChange({ x: String(pos.coords.longitude), y: String(pos.coords.latitude) });
      onChangeText(GPS_ACTIVE_TEXT);
    } catch {
      Alert.alert('위치를 가져오지 못했어요', '잠시 후 다시 시도하거나 직접 입력해주세요.');
    } finally {
      setLocating(false);
    }
  }

  return (
    <View style={style}>
      <Text style={locS.label}>어디서 만나요? (선택)</Text>
      <View style={locS.inputWrap}>
        <MapPin size={18} color={C.pink} strokeWidth={2} />
        <TextInput
          style={[locS.input, gpsOn && locS.inputGps]}
          placeholder="예: 성수동, 홍대입구역"
          placeholderTextColor={C.textFaint}
          value={value}
          onChangeText={onChangeText}
          returnKeyType="done"
          editable={!gpsOn}
        />
        {!!onCoordsChange && (
          <TouchableOpacity
            style={[locS.gpsBtn, gpsOn && locS.gpsBtnOn]}
            onPress={handleGpsPress}
            activeOpacity={0.7}
            disabled={locating}
          >
            <LocateFixed size={16} color={gpsOn ? C.white : C.pinkDeep} strokeWidth={2} />
          </TouchableOpacity>
        )}
      </View>
      <Text style={locS.hint}>동네를 알려주면 실제 장소·맛집으로 추천해드려요.</Text>
    </View>
  );
}
const locS = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: C.text, marginTop: 20, marginBottom: 8 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.white, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1.5, borderColor: C.border,
  },
  input: { flex: 1, fontSize: 14, color: C.text, padding: 0 },
  inputGps: { color: C.pinkDeep, fontWeight: '600' },
  gpsBtn: {
    width: 30, height: 30, borderRadius: 10,
    backgroundColor: C.pinkLight, alignItems: 'center', justifyContent: 'center',
  },
  gpsBtnOn: { backgroundColor: C.pink },
  hint: { fontSize: 11, color: C.textSub, marginTop: 6, lineHeight: 16 },
});
```

- [ ] **Step 3: 검증**

Run: `npm run validate && npx jest`
Expected: 에러 없음, 기존 테스트 PASS.

- [ ] **Step 4: Commit**

```bash
git add components/ui.tsx
git commit -m "feat: LocationField에 GPS 내 위치 토글 버튼 추가"
```

---

### Task 6: 4개 모드 화면 배선 (course/pick/feeling/light)

**Files:**
- Modify: `app/mode-flow/course.tsx`
- Modify: `app/mode-flow/pick.tsx`
- Modify: `app/mode-flow/feeling.tsx`
- Modify: `app/mode-flow/light.tsx`

4개 화면 모두 동일 패턴 3줄 변경. `generating` 화면으로 넘어가는 input JSON에 coords가 자동 직렬화되므로 다른 변경 불필요.

- [ ] **Step 1: 각 화면에 coords 상태 추가**

각 화면의 `const [location, setLocation] = useState('');` 바로 아래에:

```tsx
  const [coords, setCoords] = useState<{ x: string; y: string } | null>(null);
```

- [ ] **Step 2: 빌더 호출에 coords 전달**

- course.tsx: `buildCourseInput({ idea, budget, duration, location, coords: coords ?? undefined })`
- pick.tsx: `buildPickInput({ energy, budget, distance, duration, location, coords: coords ?? undefined })`
- feeling.tsx: `buildFeelingInput({ mood, freeText, location, coords: coords ?? undefined, budget: ..., duration: ... })` (기존 budget/duration 변환 그대로)
- light.tsx: `buildLightInput({ duration, location, coords: coords ?? undefined })`

- [ ] **Step 3: LocationField에 props 전달 (4곳 동일)**

```tsx
<LocationField value={location} onChangeText={setLocation} coords={coords} onCoordsChange={setCoords} />
```

- [ ] **Step 4: 검증**

Run: `npm run validate && npx jest`
Expected: 에러 없음, 전부 PASS.

- [ ] **Step 5: Commit**

```bash
git add app/mode-flow/course.tsx app/mode-flow/pick.tsx app/mode-flow/feeling.tsx app/mode-flow/light.tsx
git commit -m "feat: 4개 모드 화면에 GPS 위치 토글 배선"
```

---

### Task 7: 설정 화면 위치 권한 row + i18n

**Files:**
- Modify: `lib/i18n.ts` (타입 ~85행, ko ~397행, en ~845행)
- Modify: `app/settings.tsx`

- [ ] **Step 1: i18n 문자열 추가**

`lib/i18n.ts` settings 타입에 `rowLanguage: string;` 아래:

```ts
    rowLocation: string;
```

ko 블록 `rowLanguage: '언어',` 아래:

```ts
      rowLocation: '위치 정보',
```

en 블록 `rowLanguage: 'Language',` 아래:

```ts
      rowLocation: 'Location',
```

- [ ] **Step 2: settings.tsx에 핸들러 추가**

import에 추가: `import * as ExpoLocation from 'expo-location';` 및 lucide 아이콘 `MapPin`.

`handleNotifications` 함수 아래에 (동일 패턴, Alert 문구도 기존처럼 한국어 하드코딩):

```ts
  async function handleLocation() {
    const { status, canAskAgain } = await ExpoLocation.getForegroundPermissionsAsync();

    // 아직 한 번도 안 물어봤으면 OS 권한 팝업을 띄운다.
    if (status === 'undetermined' && canAskAgain) {
      const res = await ExpoLocation.requestForegroundPermissionsAsync();
      if (res.status === 'granted') {
        Alert.alert('위치 켜짐', '이제 내 위치로 데이트 장소를 추천받을 수 있어요.');
      } else {
        Alert.alert('위치 꺼짐', '나중에 설정에서 위치 권한을 켤 수 있어요.', [
          { text: '확인', style: 'cancel' },
          { text: '설정 열기', onPress: () => Linking.openSettings() },
        ]);
      }
      return;
    }

    // 이미 결정된 상태면(허용/거부) OS 설정에서 직접 바꾸게 안내.
    Alert.alert(
      '위치 설정',
      status === 'granted'
        ? '위치 권한이 켜져 있어요. 끄려면 설정을 열어주세요.'
        : '위치 권한이 꺼져 있어요. 켜려면 설정을 열어주세요.',
      [
        { text: '취소', style: 'cancel' },
        { text: '설정 열기', onPress: () => Linking.openSettings() },
      ],
    );
  }
```

- [ ] **Step 3: 환경설정 섹션에 row 추가**

알림 row와 언어 row 사이에:

```tsx
            <ListRow
              icon={<MapPin size={16} strokeWidth={1.8} color={C.text} />}
              label={t.rowLocation}
              trailing={<ChevronRight size={14} color={C.textFaint} />}
              onPress={handleLocation}
            />
```

(언어 row가 `divider={false}`로 마지막 유지.)

- [ ] **Step 4: 검증**

Run: `npm run validate && npx jest`
Expected: 에러 없음, 전부 PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/i18n.ts app/settings.tsx
git commit -m "feat: 설정 화면에 위치 권한 확인 row 추가"
```

---

### Task 8: 엣지 함수 배포 + 수동 확인

- [ ] **Step 1: place-search 배포**

Supabase MCP `deploy_edge_function` 또는 CLI:

```bash
supabase functions deploy place-search
```

- [ ] **Step 2: 수동 확인 (시뮬레이터/기기)**

1. 모드 화면(예: 골라주기)에서 GPS 아이콘 탭 → 권한 팝업 → 허용 → 입력창이 "내 위치 사용 중"으로 바뀌고 비활성화되는지.
2. 아이콘 재탭 → 해제되고 직접 입력 가능해지는지.
3. GPS 켠 채 후보 생성 → 결과 카드에 현재 위치 주변 실제 장소(place_name)가 붙는지.
4. 권한 거부 상태에서 아이콘 탭 → "설정 열기" Alert가 뜨는지.
5. 설정 → 환경설정 → 위치 정보 row 동작 확인.

- [ ] **Step 3: 마무리**

`PLAN.md`/`RESULT.md` 세션 기록 갱신, 루트에서 `npm run validate` 최종 확인.
