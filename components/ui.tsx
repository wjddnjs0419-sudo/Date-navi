import {
  View, Text, TouchableOpacity, StyleSheet, Animated, PanResponder, Pressable, TextInput, Linking, Alert,
  AccessibilityInfo, Easing, Modal,
  type ViewStyle, type TextStyle, type StyleProp,
} from 'react-native';
import { ChevronLeft, Pencil, X, Sparkles, Check, MapPin, LocateFixed } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { C } from '../constants/theme';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { GeoCoords } from '../lib/ai';
import { useI18n } from '../lib/i18n';

// ─── BigButton ────────────────────────────────────────────────────────────────
type BtnVariant = 'primary' | 'secondary' | 'text' | 'disabled';
const BTN_VARIANTS: Record<BtnVariant, { bg: string; fg: string }> = {
  primary: { bg: C.pink, fg: C.white },
  secondary: { bg: C.pinkLight, fg: C.pinkDeep },
  text: { bg: 'transparent', fg: C.textSub },
  disabled: { bg: C.disabledBg, fg: C.textLight },
};
export function BigButton({
  children, variant = 'primary', onPress, style,
}: { children: ReactNode; variant?: BtnVariant; onPress?: () => void; style?: StyleProp<ViewStyle> }) {
  const m = BTN_VARIANTS[variant];
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
    shadowColor: C.shadow,
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
          style={[swipe.actionBtn, swipe.deleteBtn]}
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
  deleteBtn: { backgroundColor: C.danger },
});

// ─── Chip ─────────────────────────────────────────────────────────────────────
type ChipTone = 'pink' | 'lavender' | 'mint' | 'cream' | 'gray';
const CHIP_TONES: Record<ChipTone, { bg: string; fg: string; sel: string }> = {
  pink: { bg: C.pinkLight, fg: C.pinkDeep, sel: C.pinkMid },
  lavender: { bg: C.lavender, fg: C.lavenderFg, sel: '#D7CAFF' },
  mint: { bg: C.mint, fg: C.mintFg, sel: '#B7DDC6' },
  cream: { bg: C.cream, fg: C.creamFg, sel: '#FFDDB0' },
  gray: { bg: C.gray, fg: C.grayFg, sel: '#DDD2C5' },
};
export function Chip({
  children, selected, tone = 'pink', onPress,
}: { children: ReactNode; selected?: boolean; tone?: ChipTone; onPress?: () => void }) {
  const t = CHIP_TONES[tone];
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

// ─── OptionCardPicker ────────────────────────────────────────────────────────
// flexWrap과 flex:1을 같은 컨테이너에 함께 쓰면 두 번째 줄이 아래 요소와
// 겹치는 RN/Yoga 레이아웃 버그가 있어, 줄바꿈 대신 행을 직접 나눠 렌더링한다.
type OptionCard = { value: string; label: string; emoji?: string };
export function OptionCardPicker({
  options,
  value,
  onChange,
  columns = 4,
}: {
  options: OptionCard[];
  value: string;
  onChange: (value: string) => void;
  columns?: number;
}) {
  const rows: OptionCard[][] = [];
  for (let i = 0; i < options.length; i += columns) {
    rows.push(options.slice(i, i + columns));
  }
  return (
    <View style={optionCardS.wrap}>
      {rows.map((row, rowIdx) => (
        <View key={rowIdx} style={optionCardS.row}>
          {row.map((option) => {
            const selected = value === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                onPress={() => onChange(option.value)}
                activeOpacity={0.72}
                style={[optionCardS.card, selected && optionCardS.cardSelected]}
              >
                {option.emoji && <Text style={optionCardS.emoji}>{option.emoji}</Text>}
                <Text style={[optionCardS.label, selected && optionCardS.labelSelected]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}
const optionCardS = StyleSheet.create({
  wrap: { gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  card: {
    flex: 1,
    minWidth: 76,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.white,
    borderWidth: 1.5,
    borderColor: C.border,
  },
  cardSelected: { backgroundColor: C.pinkLight, borderColor: C.pinkBorder },
  emoji: { fontSize: 18, marginBottom: 4 },
  label: { fontSize: 13, color: C.inkSoft, fontWeight: '600', textAlign: 'center' },
  labelSelected: { color: C.pinkDeep },
});

// ─── Badge ────────────────────────────────────────────────────────────────────
type BadgeTone = 'gray' | 'pink' | 'mint' | 'lavender';
const BADGE_TONES: Record<BadgeTone, { bg: string; fg: string }> = {
  gray: { bg: C.gray, fg: C.textSub },
  pink: { bg: C.pinkLight, fg: C.pinkDeep },
  mint: { bg: C.mint, fg: C.mintFg },
  lavender: { bg: C.lavender, fg: C.lavenderFg },
};
export function Badge({ children, tone = 'gray' }: { children: ReactNode; tone?: BadgeTone }) {
  const c = BADGE_TONES[tone];
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
    <View style={dotsS.row}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            dotsS.dot,
            i + 1 === current && dotsS.dotCurrent,
            i + 1 <= current && dotsS.dotDone,
          ]}
        />
      ))}
    </View>
  );
}
const dotsS = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.border },
  dotCurrent: { width: 24 },
  dotDone: { backgroundColor: C.pink },
});

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
    shadowColor: C.shadow,
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
            : <View style={listRowS.labelWrap}>{label}</View>}
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
  labelWrap: { flex: 1 },
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
export function LocationField({
  value, onChangeText, coords, onCoordsChange, style,
}: {
  value: string;
  onChangeText: (v: string) => void;
  coords?: GeoCoords | null;
  onCoordsChange?: (c: GeoCoords | null) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useI18n();
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
        Alert.alert(t('location.permissionTitle'), t('location.permissionBody'), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('common.settingsOpen'), onPress: () => Linking.openSettings() },
        ]);
        return;
      }
      // 드물게 GPS 조회가 무한 대기하면 버튼이 영구 비활성화되므로 10초 타임아웃을 건다.
      const pos = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('gps-timeout')), 10000)),
      ]);
      // 카카오 규약: x=경도(longitude), y=위도(latitude)
      onCoordsChange({ x: String(pos.coords.longitude), y: String(pos.coords.latitude) });
      onChangeText(t('location.gpsActive'));
    } catch {
      Alert.alert(t('location.fetchError'), t('location.fetchErrorBody'));
    } finally {
      setLocating(false);
    }
  }

  return (
    <View style={style}>
      <Text style={locS.label}>{t('location.label')}</Text>
      <View style={locS.inputWrap}>
        <MapPin size={18} color={C.pink} strokeWidth={2} />
        <TextInput
          style={[locS.input, gpsOn && locS.inputGps]}
          placeholder={t('location.placeholder')}
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
      <Text style={locS.hint}>{t('location.hint')}</Text>
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
  name, address, url, style, size = 'default',
}: { name?: string; address?: string; url?: string; style?: StyleProp<ViewStyle>; size?: 'default' | 'compact' }) {
  const { t } = useI18n();
  if (!name) return null;
  const compact = size === 'compact';
  return (
    <TouchableOpacity
      style={[placeS.wrap, style]}
      activeOpacity={url ? 0.7 : 1}
      disabled={!url}
      onPress={url ? () => { Linking.openURL(url); } : undefined}
    >
      <MapPin size={compact ? 14 : 16} color={compact ? C.textSub : C.text} strokeWidth={2} style={placeS.icon} />
      <View style={placeS.body}>
        <Text style={[placeS.name, compact && placeS.nameCompact]} numberOfLines={1}>{name}</Text>
        {!!address && <Text style={[placeS.addr, compact && placeS.addrCompact]} numberOfLines={1}>{address}</Text>}
      </View>
      {!!url && <Text style={[placeS.link, compact && placeS.linkCompact]}>{t('location.map')}</Text>}
    </TouchableOpacity>
  );
}
const placeS = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  icon: { marginTop: 1 },
  body: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700', color: C.text },
  nameCompact: { fontSize: 13, fontWeight: '600' },
  addr: { fontSize: 13, color: C.textSub, marginTop: 2 },
  addrCompact: { fontSize: 11 },
  link: { fontSize: 13, fontWeight: '600', color: C.textSub, marginTop: 1 },
  linkCompact: { fontSize: 11 },
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
  const pulseScale = useRef(new Animated.Value(1)).current;
  const haloOpacity = useRef(new Animated.Value(0.24)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(enabled => {
      if (mounted) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      pulseScale.setValue(1);
      haloOpacity.setValue(0.18);
      return;
    }

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseScale, {
            toValue: 1.08,
            duration: 360,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(haloOpacity, {
            toValue: 0.36,
            duration: 360,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(pulseScale, {
          toValue: 0.98,
          duration: 180,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.parallel([
          Animated.timing(pulseScale, {
            toValue: 1,
            duration: 300,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(haloOpacity, {
            toValue: 0.2,
            duration: 300,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.delay(520),
      ]),
    );

    pulse.start();
    return () => pulse.stop();
  }, [haloOpacity, pulseScale, reduceMotion]);

  const haloScale = pulseScale.interpolate({
    inputRange: [0.98, 1.08],
    outputRange: [1.04, 1.18],
  });

  return (
    <View style={genS.container}>
      <View style={genS.iconStage}>
        <Animated.View style={[genS.iconHalo, { opacity: haloOpacity, transform: [{ scale: haloScale }] }]} />
        <Animated.View style={[genS.iconWrap, { transform: [{ scale: pulseScale }] }]}>
          <Sparkles size={56} strokeWidth={1.5} color={C.pink} />
        </Animated.View>
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
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  iconStage: {
    width: 166,
    height: 166,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconHalo: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: C.pinkMid,
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
  label: { fontSize: 11, color: C.textLight, marginBottom: 4 },
  content: {},
});

// ─── SuccessModal ─────────────────────────────────────────────────────────────
const SUCCESS_MODAL_DURATION_MS = 1100;

export function SuccessModal({
  visible, message, onHide,
}: { visible: boolean; message: string; onHide: () => void }) {
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(onHide, SUCCESS_MODAL_DURATION_MS);
    return () => clearTimeout(timer);
  }, [visible, onHide]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onHide}>
      <View style={successS.backdrop}>
        <View style={successS.card}>
          <View style={successS.iconWrap}>
            <Check size={28} color={C.white} strokeWidth={3} />
          </View>
          <Text style={successS.message}>{message}</Text>
        </View>
      </View>
    </Modal>
  );
}
const successS = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(40,30,25,0.4)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24,
  },
  card: {
    width: '100%', maxWidth: 280, backgroundColor: C.white,
    borderRadius: 24, paddingVertical: 32, paddingHorizontal: 24,
    alignItems: 'center', gap: 14,
  },
  iconWrap: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: C.pink, alignItems: 'center', justifyContent: 'center',
  },
  message: { fontSize: 15, fontWeight: '700', color: C.text, textAlign: 'center' },
});

// ─── TriOptionRow ───────────────────────────────────────────────────────────
// 균등폭 3버튼(텍스트만) 선택 행. feeling.tsx의 예산 선택 UI에서 추출됨.
export function TriOptionRow<T extends string>({
  options, value, onChange,
}: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={triS.row}>
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            onPress={() => onChange(opt.value)}
            activeOpacity={0.7}
            style={[triS.btn, selected && triS.btnOn]}
          >
            <Text style={[triS.btnText, selected && triS.btnTextOn]}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
const triS = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center', backgroundColor: C.white, borderWidth: 1.5, borderColor: C.border },
  btnOn: { backgroundColor: C.pinkLight, borderColor: C.pinkBorder },
  btnText: { fontSize: 13, color: C.inkSoft, fontWeight: '500' },
  btnTextOn: { color: C.pinkDeep, fontWeight: '600' },
});
