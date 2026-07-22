import {
  View, Text, TouchableOpacity, StyleSheet, Animated, PanResponder, Pressable, TextInput, Linking, Alert,
  AccessibilityInfo, Easing, Modal, Image,
  type ViewStyle, type TextStyle, type StyleProp, type ImageSourcePropType,
} from 'react-native';
import { ChevronLeft, Pencil, X, MapPin, LocateFixed, ChevronDown, MoreVertical, Trash2, Clock, Footprints, Calendar, ChevronRight, Wallet, Heart } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { C, SP, R } from '../constants/theme';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Illustration } from './illustration';
import type { GeoCoords } from '../lib/ai';
import type { CourseStep } from '../lib/course';
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
  children, variant = 'primary', onPress, style, disabled = false, accessibilityLabel,
}: {
  children: ReactNode;
  variant?: BtnVariant;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const m = BTN_VARIANTS[variant];
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      activeOpacity={0.85}
      disabled={disabled}
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
  largeTouchTarget = false,
}: {
  options: OptionCard[];
  value: string | undefined;
  onChange: (value: string) => void;
  columns?: number;
  largeTouchTarget?: boolean;
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
                style={[
                  optionCardS.card,
                  largeTouchTarget && optionCardS.largeTouchTarget,
                  selected && optionCardS.cardSelected,
                ]}
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
  largeTouchTarget: { minHeight: 44 },
  cardSelected: { backgroundColor: C.pinkLight, borderColor: C.pinkBorder },
  emoji: { fontSize: 18, marginBottom: 4 },
  label: { fontSize: 13, color: C.inkSoft, fontWeight: '600', textAlign: 'center' },
  labelSelected: { color: C.pinkDeep },
});

// ─── Badge ────────────────────────────────────────────────────────────────────
type BadgeTone = 'gray' | 'pink' | 'mint' | 'lavender' | 'blue' | 'orange';
const BADGE_TONES: Record<BadgeTone, { bg: string; fg: string }> = {
  gray: { bg: C.gray, fg: C.textSub },
  pink: { bg: C.pinkLight, fg: C.pinkDeep },
  mint: { bg: C.mint, fg: C.mintFg },
  lavender: { bg: C.lavender, fg: C.lavenderFg },
  blue: { bg: '#E8F1FC', fg: C.catCafe },
  orange: { bg: C.cream, fg: C.creamFg },
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

// ─── HeartDoodle ──────────────────────────────────────────────────────────────
// 헤딩 옆에 붙는 작은 손그림 하트 2개. 목업의 반복 장식 요소 — 순수 장식이라 스크린리더에서 숨긴다.
export function HeartDoodle({ filled = false, style }: { filled?: boolean; style?: StyleProp<ViewStyle> }) {
  const fill = filled ? C.pink : 'none';
  return (
    <View style={[heartDoodleS.wrap, style]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Heart size={10} color={C.pink} strokeWidth={2} fill={fill} style={heartDoodleS.small} />
      <Heart size={15} color={C.pink} strokeWidth={2} fill={fill} />
    </View>
  );
}
const heartDoodleS = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  small: { marginBottom: 4 },
});

// ─── DdayBadge ────────────────────────────────────────────────────────────────
// "다가오는 데이트" 리스트 행 우측에 붙는 D-day 표시. 진한 핑크 텍스트의 옅은 핑크 알약.
export function DdayBadge({ days }: { days: number }) {
  const label = days > 0 ? `D-${days}` : days === 0 ? 'D-DAY' : `D+${Math.abs(days)}`;
  return (
    <View style={ddayS.base}>
      <Text style={ddayS.label}>{label}</Text>
    </View>
  );
}
const ddayS = StyleSheet.create({
  base: {
    backgroundColor: C.pinkLight,
    borderRadius: R.badge,
    paddingHorizontal: SP.sm,
    paddingVertical: SP.xs / 2,
    alignSelf: 'flex-start',
  },
  label: { fontSize: 12, fontWeight: '700', color: C.pinkDeep },
});

// ─── PlanListRow ──────────────────────────────────────────────────────────────
// "다가오는 데이트" 리스트 행. 홈/전체 계획 화면이 공유한다.
export function PlanListRow({
  title, dateLabel, days, imageSource, onPress,
}: {
  title: string;
  dateLabel: string;
  days: number;
  imageSource?: ImageSourcePropType;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={planRowS.row}>
      {imageSource
        ? <Image source={imageSource} style={planRowS.thumb} />
        : <View style={planRowS.thumbPlaceholder} />}
      <View style={planRowS.body}>
        <Text style={planRowS.title} numberOfLines={1}>{title}</Text>
        <View style={planRowS.dateRow}>
          <Calendar size={13} color={C.textSub} strokeWidth={2} />
          <Text style={planRowS.date}>{dateLabel}</Text>
        </View>
      </View>
      <View style={planRowS.right}>
        <DdayBadge days={days} />
        <ChevronRight size={18} color={C.textLight} strokeWidth={2} />
      </View>
    </TouchableOpacity>
  );
}
const planRowS = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP.md,
    paddingVertical: SP.md,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: R.sm,
  },
  thumbPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: R.sm,
    backgroundColor: C.pinkLight,
  },
  body: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: '700', color: C.text },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: SP.xs, marginTop: 4 },
  date: { fontSize: 12, color: C.textSub },
  right: { flexDirection: 'row', alignItems: 'center', gap: SP.sm, flexShrink: 0 },
});

// ─── MetaChipRow ──────────────────────────────────────────────────────────────
// 코스 카드 하단의 요약 정보(지역·소요시간·이동거리) 아웃라인 칩 행.
const META_ICONS = { map: MapPin, clock: Clock, walk: Footprints, wallet: Wallet } as const;
export function MetaChipRow({ items }: { items: { icon: 'map' | 'clock' | 'walk' | 'wallet'; label: string }[] }) {
  return (
    <View style={metaChipS.row}>
      {items.map((item, i) => {
        const Icon = META_ICONS[item.icon];
        return (
          <View key={i} style={metaChipS.chip}>
            <Icon size={13} color={C.textSub} strokeWidth={2} />
            <Text style={metaChipS.label}>{item.label}</Text>
          </View>
        );
      })}
    </View>
  );
}
const metaChipS = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP.xs,
    borderRadius: R.xl,
    paddingHorizontal: SP.md,
    paddingVertical: SP.xs,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.white,
  },
  label: { fontSize: 12, color: C.textSub, fontWeight: '500' },
});

// ─── BackBar ─────────────────────────────────────────────────────────────────
export function BackBar({
  onPress,
  largeTouchTarget = false,
}: {
  onPress?: () => void;
  largeTouchTarget?: boolean;
}) {
  const router = useRouter();
  return (
    <TouchableOpacity
      onPress={onPress ?? (() => router.back())}
      activeOpacity={0.7}
      style={[backS.btn, largeTouchTarget && backS.largeTouchTarget]}
    >
      <ChevronLeft size={24} color={C.text} strokeWidth={2} />
    </TouchableOpacity>
  );
}
const backS = StyleSheet.create({
  btn: { marginLeft: -8, padding: 4, alignSelf: 'flex-start' },
  largeTouchTarget: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
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
// AI 생성 로딩 화면 공통 UI. 헤딩 + 코스맵 일러스트 + 단계 진행바만 담당하고,
// 단계 진행(setInterval)과 실제 생성 호출은 각 화면이 맡는다.
export function GeneratingView({ heading, steps, step }: { heading: string; steps: string[]; step: number }) {
  const pulseScale = useRef(new Animated.Value(1)).current;
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
      return;
    }

    // 코스맵 일러스트가 은은하게 숨쉬는 로딩 애니메이션. reduceMotion 이면 정지한다.
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseScale, {
          toValue: 1.03,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulseScale, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    pulse.start();
    return () => pulse.stop();
  }, [pulseScale, reduceMotion]);

  // step/steps 로직 유지: 진행 단계(current)와 현재 단계 라벨(statusLabel)을 파생한다.
  const total = Math.max(steps.length, 1);
  const current = Math.min(Math.max(step, 0), total - 1);
  const statusLabel = steps[current] ?? '';

  return (
    <View style={genS.container}>
      <Text style={genS.heading}>{heading}</Text>

      <Animated.View style={[genS.illustrationWrap, { transform: [{ scale: pulseScale }] }]}>
        <Illustration name="date-course-map-vertical" width={200} />
      </Animated.View>

      <View style={genS.progressBlock}>
        <View style={genS.progressHeader}>
          <Text style={genS.statusLabel} numberOfLines={1}>{statusLabel}</Text>
          <Text style={genS.progressCount}>{current + 1} / {total}</Text>
        </View>
        <View style={genS.progressTrack}>
          {steps.map((label, i) => (
            <View
              key={`${label}-${i}`}
              style={[genS.progressSegment, i <= current ? genS.progressSegmentOn : genS.progressSegmentOff]}
            />
          ))}
        </View>
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
    paddingHorizontal: SP.xxxl,
  },
  heading: {
    fontSize: 22, fontWeight: '700', color: C.text,
    textAlign: 'center', lineHeight: 29,
    marginBottom: SP.xxl,
  },
  illustrationWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SP.xxxl,
  },
  progressBlock: { width: '100%', maxWidth: 280, gap: SP.md },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SP.sm,
  },
  statusLabel: { flex: 1, fontSize: 13, fontWeight: '600', color: C.text },
  progressCount: { fontSize: 13, fontWeight: '600', color: C.pink },
  progressTrack: { flexDirection: 'row', gap: SP.xs },
  progressSegment: { flex: 1, height: 6, borderRadius: R.badge },
  progressSegmentOn: { backgroundColor: C.pink },
  progressSegmentOff: { backgroundColor: C.pinkMid },
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

// ─── MoreMenu ─────────────────────────────────────────────────────────────────
// 상세 화면 우상단 ⋮ 트리거. 누르면 아이콘 바로 아래 드롭다운 팝오버로 수정/삭제를 띄운다.
// 트리거 위치를 measureInWindow로 재서 화면 어디에 놓여도 메뉴가 아이콘 밑에 붙는다.
export function MoreMenu({ onEdit, onDelete, testID }: {
  onEdit: () => void; onDelete: () => void; testID?: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [menuTop, setMenuTop] = useState(0);
  const triggerRef = useRef<View>(null);

  function openMenu() {
    triggerRef.current?.measureInWindow((_x, y, _w, h) => {
      setMenuTop(y + h + 4);
      setOpen(true);
    });
  }

  function pick(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <>
      <TouchableOpacity
        ref={triggerRef as any}
        accessibilityRole="button"
        accessibilityLabel={t('common.moreActions')}
        onPress={openMenu}
        testID={testID}
        style={moreS.trigger}
      >
        <MoreVertical size={20} color={C.textSub} />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={moreS.backdrop} onPress={() => setOpen(false)}>
          {/* 메뉴 상자 안(버튼 아닌 영역) 탭이 배경 Pressable로 새서 닫히지 않게 터치를 삼킨다. */}
          <Pressable style={[moreS.menu, { top: menuTop }]} onPress={() => {}}>
            <TouchableOpacity accessibilityRole="button" onPress={() => pick(onEdit)} style={moreS.item}>
              <Pencil size={15} color={C.text} strokeWidth={2} />
              <Text style={moreS.itemText}>{t('common.edit')}</Text>
            </TouchableOpacity>
            <View style={moreS.divider} />
            <TouchableOpacity accessibilityRole="button" onPress={() => pick(onDelete)} style={moreS.item}>
              <Trash2 size={15} color={C.danger} strokeWidth={2} />
              <Text style={[moreS.itemText, moreS.itemTextDanger]}>{t('common.delete')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
const moreS = StyleSheet.create({
  trigger: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1 },
  menu: {
    position: 'absolute', right: 16, width: 150,
    backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.border,
    shadowColor: C.shadow, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 16,
    elevation: 6, overflow: 'hidden',
  },
  item: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 },
  itemText: { fontSize: 13, fontWeight: '700', color: C.text },
  itemTextDanger: { color: C.danger },
  divider: { height: 1, backgroundColor: C.border },
});

// ─── SuccessModal ─────────────────────────────────────────────────────────────
export function SuccessModal({
  visible, message, onHide,
}: { visible: boolean; message: string; onHide: () => void }) {
  const { t } = useI18n();
  // 목업대로 버튼 닫힘: '확인'(onHide) 또는 하드웨어 back(onRequestClose)으로만 닫는다. 자동닫힘 없음.
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onHide}>
      <View style={successS.backdrop}>
        <View style={successS.card}>
          <Illustration name="mascot-heart-couple-check" width={148} style={successS.mascot} />
          <Text style={successS.message}>{message}</Text>
          <BigButton onPress={onHide} style={successS.cta}>{t('common.ok')}</BigButton>
        </View>
      </View>
    </Modal>
  );
}
const successS = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(40,30,25,0.4)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: SP.xxl,
  },
  card: {
    width: '100%', maxWidth: 320, backgroundColor: C.white,
    borderRadius: R.hero, paddingTop: SP.xl, paddingBottom: SP.xxl, paddingHorizontal: SP.xxl,
    alignItems: 'center', gap: SP.md,
  },
  mascot: { marginBottom: SP.xs },
  message: { fontSize: 19, fontWeight: '700', color: C.text, textAlign: 'center', lineHeight: 26 },
  cta: { marginTop: SP.sm },
});

// ─── SortDropdown ─────────────────────────────────────────────────────────────
// 재사용 가능한 정렬 드롭다운. MoreMenu와 동일하게 트리거 위치를 measureInWindow로 재서
// 화면 어디에 놓여도 옵션 팝오버가 트리거 바로 아래에 붙는다.
export function SortDropdown<T extends string>({
  value, options, onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuTop, setMenuTop] = useState(0);
  const triggerRef = useRef<View>(null);
  const current = options.find(o => o.value === value) ?? options[0];

  function openMenu() {
    // 위치 측정과 별개로 즉시 연다: measureInWindow 콜백이 늦거나(혹은 테스트 환경처럼 아예
    // 호출되지 않으면) 메뉴가 영영 안 열리는 문제를 막는다. menuTop은 측정되는 대로 갱신된다.
    setOpen(true);
    triggerRef.current?.measureInWindow((_x, y, _w, h) => {
      setMenuTop(y + h + 4);
    });
  }

  return (
    <>
      <TouchableOpacity
        ref={triggerRef as any}
        accessibilityRole="button"
        onPress={openMenu}
        style={sortDropdownS.trigger}
      >
        <Text style={sortDropdownS.triggerText}>{current.label}</Text>
        <ChevronDown size={14} color={C.textSub} strokeWidth={2} />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={sortDropdownS.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[sortDropdownS.menu, { top: menuTop }]} onPress={() => {}}>
            {options.map((opt, i) => (
              <View key={opt.value}>
                {i > 0 && <View style={sortDropdownS.divider} />}
                <TouchableOpacity
                  accessibilityRole="button"
                  testID={`sort-option-${opt.value}`}
                  onPress={() => { setOpen(false); onChange(opt.value); }}
                  style={sortDropdownS.item}
                >
                  <Text style={[sortDropdownS.itemText, opt.value === value && sortDropdownS.itemTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
const sortDropdownS = StyleSheet.create({
  trigger: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    minHeight: 36, paddingHorizontal: 12,
    borderRadius: 18, borderWidth: 1, borderColor: C.border, backgroundColor: C.white,
  },
  triggerText: { fontSize: 12, fontWeight: '600', color: C.textSub },
  backdrop: { flex: 1 },
  menu: {
    position: 'absolute', left: 20, width: 140,
    backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.border,
    shadowColor: C.shadow, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 16,
    elevation: 6, overflow: 'hidden',
  },
  item: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14 },
  itemText: { fontSize: 13, fontWeight: '600', color: C.textSub },
  itemTextActive: { color: C.pinkDeep, fontWeight: '700' },
  divider: { height: 1, backgroundColor: C.border },
});

// ─── CourseStepList ───────────────────────────────────────────────────────────
function StepConnector() {
  return (
    <View style={stepS.connector}>
      <View style={stepS.connectorLine} />
      <View style={stepS.connectorDot}>
        <ChevronDown size={12} color={C.pinkDeep} strokeWidth={2.5} />
      </View>
      <View style={stepS.connectorLine} />
    </View>
  );
}

function StepCard({ step, index }: { step: CourseStep; index: number }) {
  return (
    <View style={stepS.card}>
      <View style={stepS.titleRow}>
        <View style={stepS.badge}>
          <Text style={stepS.badgeNum}>{index + 1}</Text>
        </View>
        <Text style={stepS.title}>{step.label}</Text>
      </View>
      {!!step.desc && <Text style={stepS.desc}>{step.desc}</Text>}
      {!!step.place_name && (
        <PlaceRow
          name={step.place_name}
          address={step.place_address}
          url={step.map_url}
          size="compact"
          style={stepS.placeRow}
        />
      )}
    </View>
  );
}

// 코스 단계별 동선 표시 — course-result.tsx(추천 직후)와 card/[id].tsx(저장된 카드 재조회)가 공유한다.
export function CourseStepList({ steps, summary }: { steps: CourseStep[]; summary?: string }) {
  if (steps.length === 0) {
    if (!summary) return null;
    return (
      <View style={stepS.card}>
        <Text style={stepS.fallbackText}>{summary}</Text>
      </View>
    );
  }
  return (
    <View>
      {steps.map((step, i) => (
        <View key={i}>
          <StepCard step={step} index={i} />
          {i < steps.length - 1 && <StepConnector />}
        </View>
      ))}
    </View>
  );
}
const stepS = StyleSheet.create({
  card: {
    backgroundColor: C.white,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: C.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, borderColor: C.pink, backgroundColor: C.white,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  badgeNum: { fontSize: 11, fontWeight: '700', color: C.pink, lineHeight: 11 },
  title: { fontSize: 15, fontWeight: '700', color: C.text },
  desc: { fontSize: 12, color: C.textSub, marginTop: 3, marginLeft: 34 },
  placeRow: { marginTop: 9, marginLeft: 34 },
  connector: { alignItems: 'center', height: 30, justifyContent: 'center' },
  connectorLine: { width: 1.5, height: 8, backgroundColor: C.borderLight },
  connectorDot: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: C.pinkLight, alignItems: 'center', justifyContent: 'center',
  },
  fallbackText: { fontSize: 14, color: C.text, lineHeight: 20 },
});
