import {
  View, Text, TouchableOpacity, StyleSheet, Animated, PanResponder, Pressable, TextInput, Linking, Alert,
  type ViewStyle, type TextStyle, type StyleProp,
} from 'react-native';
import { ChevronLeft, Pencil, X, Sparkles, Check, MapPin, LocateFixed } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { C } from '../constants/colors';
import { useRef, useState, type ReactNode } from 'react';
import type { GeoCoords } from '../lib/ai';

// ─── BigButton ────────────────────────────────────────────────────────────────
type BtnVariant = 'primary' | 'secondary' | 'text' | 'disabled';
export function BigButton({
  children, variant = 'primary', onPress, style,
}: { children: ReactNode; variant?: BtnVariant; onPress?: () => void; style?: StyleProp<ViewStyle> }) {
  const map: Record<BtnVariant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: C.pink, fg: C.white },
    secondary: { bg: C.pinkLight, fg: C.pinkDeep },
    text: { bg: 'transparent', fg: C.textSub },
    disabled: { bg: '#EFE7DF', fg: '#B8AEA6' },
  };
  const m = map[variant];
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[btn.base, { backgroundColor: m.bg }, style]}
    >
      <Text style={[btn.label, { color: m.fg }]}>{children}</Text>
    </TouchableOpacity>
  );
}
const btn = StyleSheet.create({
  base: { borderRadius: 18, paddingVertical: 16, alignItems: 'center', width: '100%' },
  label: { fontSize: 15, fontWeight: '600' },
});

// ─── SoftCard ─────────────────────────────────────────────────────────────────
export function SoftCard({
  children, style, onPress,
}: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  // onPress 가 없으면 순수 View 로 렌더한다. TouchableOpacity 는 onPress 가 없어도
  // 터치를 잡아먹어, 상위 Pressable(예: SwipeableCard) 의 탭이 안 먹히는 문제가 생긴다.
  if (!onPress) {
    return <View style={[card.base, style]}>{children}</View>;
  }
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[card.base, style]}
    >
      {children}
    </TouchableOpacity>
  );
}
const card = StyleSheet.create({
  base: {
    backgroundColor: C.white,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: C.borderLight,
    shadowColor: '#785046',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 7,
    elevation: 3,
  },
});

// ─── SwipeableCard ─────────────────────────────────────────────────────────────
// 카드를 왼쪽으로 밀면 오른쪽에 수정(연필)·삭제(X) 액션이 노출된다.
// 오른쪽으로 밀면(또는 열린 상태에서 탭) 다시 기본 카드로 닫힌다.
// 액션 패널은 카드와 맞닿는 왼쪽 모서리만 SoftCard 와 동일 radius(22), 바깥(오른쪽)은 직각.
const REVEAL_W = 128;

export function SwipeableCard({
  children, onPress, onEdit, onDelete,
}: { children: ReactNode; onPress?: () => void; onEdit: () => void; onDelete: () => void }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const openRef = useRef(false);
  const startX = useRef(0);

  function snap(open: boolean) {
    openRef.current = open;
    Animated.spring(translateX, { toValue: open ? -REVEAL_W : 0, useNativeDriver: true, bounciness: 0 }).start();
  }

  function handlePress() {
    if (openRef.current) { snap(false); return; }
    onPress?.();
  }

  const pan = useRef(
    PanResponder.create({
      // 가로 드래그가 세로보다 확실히 우세할 때만 스와이프로 인식한다.
      // 문턱을 10px 로 둬, 탭 시 생기는 미세한 손가락 흔들림(수 px)은 스와이프로 가로채지 않고
      // 자식 Pressable 의 onPress 로 흘려보낸다.
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy),
      onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy),
      // 한 번 스와이프로 잡으면 자식(Pressable)에게 뺏기지 않게 한다.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => { startX.current = openRef.current ? -REVEAL_W : 0; },
      onPanResponderMove: (_, g) => {
        const x = Math.max(-REVEAL_W, Math.min(0, startX.current + g.dx));
        translateX.setValue(x);
      },
      onPanResponderRelease: (_, g) => {
        // 스와이프로 잡았어도 이동량이 거의 없으면 탭으로 간주해 눌림을 그대로 전달한다.
        if (Math.abs(g.dx) < 10) {
          if (openRef.current) snap(false);
          else onPress?.();
          return;
        }
        snap(startX.current + g.dx < -REVEAL_W / 2);
      },
      onPanResponderTerminate: () => snap(openRef.current),
    }),
  ).current;

  // 스와이프 전(닫힘)에는 패널을 완전히 숨겨, 카드 터치 시 뒤 패널이 비치지 않게 한다.
  const actionsOpacity = translateX.interpolate({
    inputRange: [-REVEAL_W, 0], outputRange: [1, 0], extrapolate: 'clamp',
  });

  return (
    <View style={swipe.container}>
      <Animated.View style={[swipe.actions, { opacity: actionsOpacity }]} pointerEvents="box-none">
        <TouchableOpacity
          style={[swipe.actionBtn, { backgroundColor: C.lavender }]}
          activeOpacity={0.8}
          onPress={() => { snap(false); onEdit(); }}
        >
          <Pencil size={20} color={C.lavenderFg} strokeWidth={2} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[swipe.actionBtn, { backgroundColor: '#FF4F6D' }]}
          activeOpacity={0.8}
          onPress={() => { snap(false); onDelete(); }}
        >
          <X size={20} color={C.white} strokeWidth={2.5} />
        </TouchableOpacity>
      </Animated.View>
      <Animated.View style={{ transform: [{ translateX }] }} {...pan.panHandlers}>
        <Pressable onPress={handlePress}>{children}</Pressable>
      </Animated.View>
    </View>
  );
}
const swipe = StyleSheet.create({
  container: { position: 'relative' },
  actions: {
    position: 'absolute', right: 0, top: 0, bottom: 0, width: REVEAL_W,
    flexDirection: 'row', overflow: 'hidden',
    borderTopLeftRadius: 22, borderBottomLeftRadius: 22,
  },
  actionBtn: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

// ─── Chip ─────────────────────────────────────────────────────────────────────
type ChipTone = 'pink' | 'lavender' | 'mint' | 'cream' | 'gray';
export function Chip({
  children, selected, tone = 'pink', onPress,
}: { children: ReactNode; selected?: boolean; tone?: ChipTone; onPress?: () => void }) {
  const tones: Record<ChipTone, { bg: string; fg: string; sel: string }> = {
    pink: { bg: C.pinkLight, fg: C.pinkDeep, sel: C.pinkMid },
    lavender: { bg: C.lavender, fg: C.lavenderFg, sel: '#D7CAFF' },
    mint: { bg: C.mint, fg: C.mintFg, sel: '#B7DDC6' },
    cream: { bg: C.cream, fg: C.creamFg, sel: '#FFDDB0' },
    gray: { bg: C.gray, fg: C.grayFg, sel: '#DDD2C5' },
  };
  const t = tones[tone];
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[chipS.base, { backgroundColor: selected ? t.sel : t.bg }]}
    >
      <Text style={[chipS.label, { color: t.fg, fontWeight: selected ? '600' : '500' }]}>
        {children}
      </Text>
    </TouchableOpacity>
  );
}
const chipS = StyleSheet.create({
  base: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  label: { fontSize: 12 },
});

// ─── Badge ────────────────────────────────────────────────────────────────────
type BadgeTone = 'gray' | 'pink' | 'mint' | 'lavender';
export function Badge({ children, tone = 'gray' }: { children: ReactNode; tone?: BadgeTone }) {
  const colors: Record<BadgeTone, { bg: string; fg: string }> = {
    gray: { bg: C.gray, fg: C.textSub },
    pink: { bg: C.pinkLight, fg: C.pinkDeep },
    mint: { bg: C.mint, fg: C.mintFg },
    lavender: { bg: C.lavender, fg: C.lavenderFg },
  };
  const c = colors[tone];
  return (
    <View style={[badgeS.base, { backgroundColor: c.bg }]}>
      <Text style={[badgeS.label, { color: c.fg }]}>{children}</Text>
    </View>
  );
}
const badgeS = StyleSheet.create({
  base: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' },
  label: { fontSize: 10, fontWeight: '600', letterSpacing: 0.2 },
});

// ─── BackBar ─────────────────────────────────────────────────────────────────
export function BackBar({ onPress }: { onPress?: () => void }) {
  const router = useRouter();
  return (
    <TouchableOpacity
      onPress={onPress ?? (() => router.back())}
      activeOpacity={0.7}
      style={backS.btn}
    >
      <ChevronLeft size={24} color={C.text} strokeWidth={2} />
    </TouchableOpacity>
  );
}
const backS = StyleSheet.create({
  btn: { marginLeft: -8, padding: 4, alignSelf: 'flex-start' },
});

// ─── ProgressDots ─────────────────────────────────────────────────────────────
export function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={{
            width: i + 1 === current ? 24 : 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: i + 1 <= current ? C.pink : C.border,
          }}
        />
      ))}
    </View>
  );
}

// ─── ListGroup ────────────────────────────────────────────────────────────────
export function ListGroup({ children }: { children: ReactNode }) {
  return (
    <View style={listGroupS.wrap}>{children}</View>
  );
}
const listGroupS = StyleSheet.create({
  wrap: {
    backgroundColor: C.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
    shadowColor: '#785046',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.09,
    shadowRadius: 7,
    elevation: 2,
  },
});

// ─── ListRow ─────────────────────────────────────────────────────────────────
export function ListRow({
  icon, label, value, trailing, onPress, destructive, divider = true,
}: {
  icon?: ReactNode;
  label: ReactNode;
  value?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  destructive?: boolean;
  divider?: boolean;
}) {
  const fg = destructive ? C.pinkDeep : C.text;
  const iconFg = destructive ? C.pinkDeep : C.textSub;
  return (
    <>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        style={listRowS.row}
      >
        <View style={listRowS.left}>
          {icon && <View style={listRowS.icon}>{icon}</View>}
          {typeof label === 'string'
            ? <Text style={[listRowS.label, { color: fg }]}>{label}</Text>
            : <View style={{ flex: 1 }}>{label}</View>}
        </View>
        <View style={listRowS.right}>
          {value !== undefined && (
            <Text style={listRowS.value}>{value}</Text>
          )}
          {trailing}
        </View>
      </TouchableOpacity>
      {divider && <View style={listRowS.divider} />}
    </>
  );
}
const listRowS = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
  icon: {},
  label: { fontSize: 14, fontWeight: '500', color: C.text },
  right: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  value: { fontSize: 13, color: C.textMuted },
  divider: { height: 1, marginLeft: 16, backgroundColor: C.borderLight },
});

// ─── SectionLabel ─────────────────────────────────────────────────────────────
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Text style={sectionS.label}>{children}</Text>
  );
}
const sectionS = StyleSheet.create({
  label: {
    fontSize: 11,
    color: C.textMuted,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingHorizontal: 4,
    marginBottom: 8,
  },
});

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

// ─── PlaceRow ─────────────────────────────────────────────────────────────────
// 카드에 붙은 실제 카카오 장소. url이 있으면 탭 시 지도(카카오 place) 링크를 연다.
export function PlaceRow({
  name, address, url, style,
}: { name?: string; address?: string; url?: string; style?: StyleProp<ViewStyle> }) {
  if (!name) return null;
  return (
    <TouchableOpacity
      style={[placeS.wrap, style]}
      activeOpacity={url ? 0.7 : 1}
      disabled={!url}
      onPress={url ? () => { Linking.openURL(url); } : undefined}
    >
      <MapPin size={16} color={C.text} strokeWidth={2} style={placeS.icon} />
      <View style={{ flex: 1 }}>
        <Text style={placeS.name} numberOfLines={1}>{name}</Text>
        {!!address && <Text style={placeS.addr} numberOfLines={1}>{address}</Text>}
      </View>
      {!!url && <Text style={placeS.link}>지도 →</Text>}
    </TouchableOpacity>
  );
}
const placeS = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  icon: { marginTop: 1 },
  name: { fontSize: 15, fontWeight: '700', color: C.text },
  addr: { fontSize: 13, color: C.textSub, marginTop: 2 },
  link: { fontSize: 13, fontWeight: '600', color: C.textSub, marginTop: 1 },
});

// ─── InfoNote ─────────────────────────────────────────────────────────────────
export function InfoNote({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[noteS.wrap, style]}>
      <Text style={noteS.text}>{children}</Text>
    </View>
  );
}
const noteS = StyleSheet.create({
  wrap: { backgroundColor: C.cream, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  text: { fontSize: 11, color: C.creamFg, lineHeight: 17 },
});

// ─── GeneratingView ───────────────────────────────────────────────────────────
// AI 생성 로딩 화면 공통 UI. 아이콘 + 헤딩 + 단계별 체크리스트만 담당하고,
// 단계 진행(setInterval)과 실제 생성 호출은 각 화면이 맡는다.
export function GeneratingView({ heading, steps, step }: { heading: string; steps: string[]; step: number }) {
  return (
    <View style={genS.container}>
      <View style={genS.iconWrap}>
        <Sparkles size={56} strokeWidth={1.5} color={C.pink} />
      </View>

      <Text style={genS.heading}>{heading}</Text>

      <View style={genS.stepList}>
        {steps.map((label, i) => (
          <View key={label} style={genS.stepRow}>
            <View style={[
              genS.stepDot,
              { backgroundColor: step > i ? C.mintFg : step === i ? C.pink : '#E0D5CB' },
            ]}>
              {step > i && <Check size={10} color={C.white} strokeWidth={3} />}
            </View>
            <Text style={[
              genS.stepText,
              {
                color: step > i ? C.mintFg : step === i ? C.text : C.textMuted,
                fontWeight: step === i ? '600' : '500',
                opacity: step < i ? 0.4 : 1,
              },
            ]}>
              {label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
const genS = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF8F3',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  iconWrap: {
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: C.white,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: C.pink,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  heading: {
    fontSize: 22, fontWeight: '700', color: C.text,
    textAlign: 'center', lineHeight: 29,
    marginTop: 32, marginBottom: 32,
  },
  stepList: { width: '100%', maxWidth: 260, gap: 10 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepDot: {
    width: 16, height: 16, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  stepText: { fontSize: 13 },
});

// ─── FieldBox ─────────────────────────────────────────────────────────────────
export function FieldBox({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <View style={fieldS.wrap}>
      {label && <Text style={fieldS.label}>{label}</Text>}
      <View style={fieldS.content}>{children}</View>
    </View>
  );
}
const fieldS = StyleSheet.create({
  wrap: {
    backgroundColor: C.white,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  label: { fontSize: 11, color: '#B8AEA6', marginBottom: 4 },
  content: {},
});
