import {
  View, Text, TouchableOpacity, StyleSheet, Animated, PanResponder, Pressable, TextInput, Linking, Alert,
  AccessibilityInfo, ActivityIndicator, Easing, Modal, Image, Platform,
  useWindowDimensions,
  type ViewStyle, type TextStyle, type StyleProp, type ImageSourcePropType, type TextInputProps,
} from 'react-native';
import { ChevronLeft, Pencil, X, MapPin, LocateFixed, ChevronDown, MoreVertical, Trash2, Clock, Footprints, Calendar, ChevronRight, Wallet, Heart } from './iconography';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { C, DS, SP, R, T } from '../constants/theme';
import { AppIcon, type AppIconName } from './iconography';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Illustration } from './illustration';
import type { GeoCoords } from '../lib/ai';
import type { CourseStep } from '../lib/course';
import { useI18n } from '../lib/i18n';
import { useOptionalSafeAreaInsets } from '../lib/use-optional-safe-area-insets';

// ─── BigButton ────────────────────────────────────────────────────────────────
type BtnVariant = 'primary' | 'secondary' | 'text' | 'disabled';
const BTN_VARIANTS: Record<BtnVariant, { bg: string; fg: string }> = {
  primary: { bg: C.pink, fg: C.white },
  secondary: { bg: C.pinkLight, fg: C.pinkDeep },
  text: { bg: 'transparent', fg: C.textSub },
  disabled: { bg: C.disabledBg, fg: C.textLight },
};
export function BigButton({
  children, variant = 'primary', onPress, style, disabled = false, accessibilityLabel, testID,
}: {
  children: ReactNode;
  variant?: BtnVariant;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const m = BTN_VARIANTS[variant];
  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      activeOpacity={0.88}
      disabled={disabled}
      accessibilityState={{ disabled }}
      style={[btn.base, { backgroundColor: m.bg }, disabled && btn.disabled, style]}
    >
      <Text style={[btn.label, { color: m.fg }]}>{children}</Text>
    </TouchableOpacity>
  );
}
const btn = StyleSheet.create({
  base: { minHeight: DS.spacing.input, borderRadius: DS.radius.button, paddingHorizontal: DS.spacing.lg, paddingVertical: DS.spacing.md, alignItems: 'center', justifyContent: 'center', width: '100%' },
  disabled: { opacity: 0.72 },
  label: { ...DS.typography.button },
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
      activeOpacity={0.88}
      accessibilityRole="button"
      style={[card.base, style]}
    >
      {children}
    </TouchableOpacity>
  );
}
const card = StyleSheet.create({
  base: {
    backgroundColor: C.white,
    borderRadius: DS.radius.card,
    padding: DS.spacing.lg,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
});

// ─── InputField ──────────────────────────────────────────────────────────────
// 새 Input 화면의 표준 표면. feature-specific 입력은 이 컴포넌트를 감싸서 사용한다.
export function InputField({
  label,
  value,
  placeholder,
  error,
  leading,
  trailing,
  onChangeText,
  multiline = false,
  editable = true,
  style,
  inputStyle,
  testID,
  ...inputProps
}: {
  label?: string;
  value: string;
  placeholder?: string;
  error?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  onChangeText: (value: string) => void;
  multiline?: boolean;
  editable?: boolean;
  style?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  testID?: string;
} & Omit<TextInputProps, 'value' | 'placeholder' | 'onChangeText' | 'multiline' | 'editable' | 'style'>) {
  const [focused, setFocused] = useState(false);
  const hasLatinText = !multiline && /[A-Za-z]/.test(value);
  return (
    <View style={style}>
      {label && <Text style={inputFieldS.label}>{label}</Text>}
      <View style={[inputFieldS.shell, multiline && inputFieldS.multiline, focused && inputFieldS.focused, !editable && inputFieldS.disabled, !!error && inputFieldS.error]}>
        {leading && <View style={inputFieldS.leading}>{leading}</View>}
        <TextInput
          {...inputProps}
          testID={testID}
          value={value}
          placeholder={placeholder}
          placeholderTextColor={C.textFaint}
          onChangeText={onChangeText}
          onFocus={(event) => { setFocused(true); inputProps.onFocus?.(event); }}
          onBlur={(event) => { setFocused(false); inputProps.onBlur?.(event); }}
          multiline={multiline}
          editable={editable}
          style={[inputFieldS.input, !multiline && inputFieldS.singleLine, hasLatinText && inputFieldS.latinText, multiline && inputFieldS.inputMultiline, inputStyle]}
        />
        {trailing && <View style={inputFieldS.trailing}>{trailing}</View>}
      </View>
      {!!error && <Text style={inputFieldS.errorText}>{error}</Text>}
    </View>
  );
}
const inputFieldS = StyleSheet.create({
  label: { ...DS.typography.label, color: C.text, marginBottom: DS.spacing.sm },
  shell: {
    minHeight: DS.spacing.input, flexDirection: 'row', alignItems: 'center', gap: DS.spacing.sm,
    paddingHorizontal: DS.spacing.md, borderRadius: DS.radius.input, borderWidth: 1,
    borderColor: C.border, backgroundColor: C.white,
  },
  multiline: { minHeight: DS.spacing.multilineInput, alignItems: 'flex-start', paddingVertical: DS.spacing.md },
  focused: { borderColor: C.pink, borderWidth: 1.5 },
  disabled: { backgroundColor: C.disabledBg },
  error: { borderColor: C.danger },
  leading: { flexShrink: 0, paddingTop: DS.component.iconOpticalOffset },
  trailing: { flexShrink: 0 },
  input: {
    flex: 1, minWidth: 0, height: DS.spacing.touch, minHeight: DS.spacing.touch, ...DS.typography.body,
    color: C.text, padding: 0, textAlignVertical: 'center',
  },
  singleLine: Platform.select({ ios: { lineHeight: undefined }, default: {} }),
  // iOS positions Latin glyphs lower than its Korean fallback in a single-line TextInput.
  latinText: Platform.select({ ios: { transform: [{ translateY: -DS.spacing.xs }] }, default: {} }),
  inputMultiline: {
    height: DS.spacing.multilineInput - (DS.spacing.md * 2),
    minHeight: DS.spacing.multilineInput - (DS.spacing.md * 2),
    textAlignVertical: 'top',
  },
  errorText: { ...DS.typography.caption, color: C.danger, marginTop: DS.spacing.xs },
});

// ─── SelectionCard ───────────────────────────────────────────────────────────
export function SelectionCard({
  children,
  selected = false,
  onPress,
  style,
  accessibilityLabel,
  testID,
}: {
  children: ReactNode;
  selected?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        selectionCardS.base,
        selected && selectionCardS.selected,
        pressed && selectionCardS.pressed,
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}
const selectionCardS = StyleSheet.create({
  base: { minHeight: DS.spacing.touch, borderRadius: DS.radius.input, borderWidth: 1, borderColor: C.border, backgroundColor: C.white, padding: DS.spacing.lg },
  selected: { borderColor: C.pinkBorder, backgroundColor: C.pinkLight },
  pressed: { opacity: 0.88 },
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
          activeOpacity={0.88}
          onPress={() => { snap(false); onEdit(); }}
        >
          <Pencil size={20} color={C.lavenderFg} strokeWidth={2} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[swipe.actionBtn, swipe.deleteBtn]}
          activeOpacity={0.88}
          onPress={() => { snap(false); onDelete(); }}
        >
          <X size={20} color={C.white} strokeWidth={2.5} />
        </TouchableOpacity>
      </Animated.View>
      <Animated.View style={{ transform: [{ translateX }] }} {...pan.panHandlers}>
        <Pressable accessibilityRole={onPress ? 'button' : undefined} onPress={handlePress}>{children}</Pressable>
      </Animated.View>
    </View>
  );
}
const swipe = StyleSheet.create({
  container: { position: 'relative' },
  actions: {
    position: 'absolute', right: 0, top: 0, bottom: 0, width: REVEAL_W,
    flexDirection: 'row', overflow: 'hidden',
    borderTopLeftRadius: DS.radius.card, borderBottomLeftRadius: DS.radius.card,
  },
  actionBtn: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  deleteBtn: { backgroundColor: C.danger },
});

// ─── Chip ─────────────────────────────────────────────────────────────────────
type ChipTone = 'pink' | 'lavender' | 'mint' | 'cream' | 'gray';
const CHIP_TONES: Record<ChipTone, { bg: string; fg: string; sel: string }> = {
  pink: { bg: C.pinkLight, fg: C.pinkDeep, sel: C.pinkMid },
  lavender: { bg: C.lavender, fg: C.lavenderFg, sel: DS.color.lavenderSelected },
  mint: { bg: C.mint, fg: C.mintFg, sel: DS.color.mintSelected },
  cream: { bg: C.cream, fg: C.creamFg, sel: DS.color.creamSelected },
  gray: { bg: C.gray, fg: C.grayFg, sel: DS.color.graySelected },
};
export function Chip({
  children, selected, tone = 'pink', onPress,
}: { children: ReactNode; selected?: boolean; tone?: ChipTone; onPress?: () => void }) {
  const t = CHIP_TONES[tone];
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={{ selected }}
      style={[chipS.base, { backgroundColor: selected ? t.sel : t.bg }]}
    >
      <Text style={[chipS.label, { color: t.fg, fontWeight: selected ? '600' : '500' }]}>
        {children}
      </Text>
    </TouchableOpacity>
  );
}
const chipS = StyleSheet.create({
  base: { minHeight: DS.spacing.touch, borderRadius: DS.radius.chip, paddingHorizontal: DS.component.chipPaddingHorizontal, paddingVertical: DS.component.chipPaddingVertical, alignItems: 'center', justifyContent: 'center' },
  label: { ...DS.typography.bodySmall },
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
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityState={{ selected }}
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
  wrap: { gap: SP.sm },
  row: { flexDirection: 'row', gap: SP.sm },
  card: {
    flex: 1,
    minWidth: DS.component.optionCardMinWidth,
    borderRadius: DS.radius.input,
    paddingVertical: DS.spacing.md,
    paddingHorizontal: DS.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.white,
    borderWidth: 1.5,
    borderColor: C.border,
  },
  largeTouchTarget: { minHeight: DS.spacing.touch },
  cardSelected: { backgroundColor: C.pinkLight, borderColor: C.pinkBorder },
  emoji: { ...DS.typography.sectionTitle, marginBottom: SP.xs },
  label: { ...DS.typography.bodyCompact, color: C.inkSoft, fontWeight: '600', textAlign: 'center' },
  labelSelected: { color: C.pinkDeep },
});

// ─── Badge ────────────────────────────────────────────────────────────────────
type BadgeTone = 'gray' | 'pink' | 'mint' | 'lavender' | 'blue' | 'orange';
const BADGE_TONES: Record<BadgeTone, { bg: string; fg: string }> = {
  gray: { bg: C.gray, fg: C.textSub },
  pink: { bg: C.pinkLight, fg: C.pinkDeep },
  mint: { bg: C.mint, fg: C.mintFg },
  lavender: { bg: C.lavender, fg: C.lavenderFg },
  blue: { bg: DS.color.blueSurface, fg: C.catCafe },
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
  base: { borderRadius: DS.radius.badge, paddingHorizontal: SP.sm, paddingVertical: DS.spacing.micro, alignSelf: 'flex-start' },
  label: { ...DS.typography.badge },
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
  wrap: { flexDirection: 'row', alignItems: 'flex-end', gap: DS.spacing.micro },
  small: { marginBottom: SP.xs },
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
    paddingVertical: DS.component.badgePaddingVertical,
    alignSelf: 'flex-start',
  },
  label: { ...DS.typography.bodySmall, fontWeight: '700', color: C.pinkDeep },
});

// ─── PlanListRow ──────────────────────────────────────────────────────────────
// "다가오는 데이트" 리스트 행. 홈/전체 계획 화면이 공유한다.
export function PlanListRow({
  title, dateLabel, days, imageSource, onPress, showDday = true,
}: {
  title: string;
  dateLabel: string;
  days: number;
  imageSource?: ImageSourcePropType;
  onPress: () => void;
  showDday?: boolean;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.88} style={planRowS.row}>
      {/* 사진 등록 기능 전까지 썸네일 숨김 (imageSource 있을 때만 표시) */}
      {imageSource && <Image source={imageSource} style={planRowS.thumb} />}
      <View style={planRowS.body}>
        <Text style={planRowS.title} numberOfLines={1}>{title}</Text>
        <View style={planRowS.dateRow}>
          <Calendar size={13} color={C.textSub} strokeWidth={2} />
          <Text style={planRowS.date}>{dateLabel}</Text>
        </View>
      </View>
      <View style={planRowS.right}>
        {showDday && <DdayBadge days={days} />}
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
  title: { ...DS.typography.cardTitle, color: C.text },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: SP.xs, marginTop: SP.xs },
  date: { ...DS.typography.bodySmall, color: C.textSub },
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
  label: { ...DS.typography.bodySmall, color: C.textSub },
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
      activeOpacity={0.88}
      style={[backS.btn, largeTouchTarget && backS.largeTouchTarget]}
    >
      <ChevronLeft size={24} color={C.text} strokeWidth={2} />
    </TouchableOpacity>
  );
}
const backS = StyleSheet.create({
  // 우측 액션(공유·⋮ MoreMenu)과 동일하게 44×44 중앙정렬로 통일.
  btn: { width: DS.spacing.touch, height: DS.spacing.touch, alignItems: 'center', justifyContent: 'center' },
  largeTouchTarget: {},
});

// ─── Header / ScreenHeading ──────────────────────────────────────────────────
// Header는 Safe Area 아래의 내비게이션 행만 담당한다. 화면 제목은 항상
// ScreenHeading으로 분리해 44pt 내비게이션 행 아래 16pt에서 시작한다.
export function Header({
  onBack,
  left,
  center,
  right,
  testID,
}: {
  onBack?: () => void;
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
  testID?: string;
}) {
  const leftSlot = left ?? (onBack ? <BackBar onPress={onBack} /> : null);
  return (
    <View testID={testID} style={headerS.wrap}>
      <View style={headerS.row}>
        <View style={headerS.leftSlot}>{leftSlot}</View>
        {!!center && <View pointerEvents="box-none" style={headerS.centerSlot}>{center}</View>}
        {!!right && <View style={headerS.rightSlot}>{right}</View>}
      </View>
    </View>
  );
}

export function HeaderActions({
  children,
  separated = false,
}: {
  children: ReactNode;
  separated?: boolean;
}) {
  return <View style={[headerS.actions, separated && headerS.actionsSeparated]}>{children}</View>;
}

export function ScreenHeading({
  title,
  subtitle,
  helper,
  accessory,
  variant = 'default',
  placement = 'below-header',
  style,
  testID,
}: {
  title: string;
  subtitle?: string;
  helper?: string;
  accessory?: ReactNode;
  variant?: 'default' | 'input';
  placement?: 'below-header' | 'root';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <View testID={testID} style={[screenHeadingS.wrap, placement === 'root' && screenHeadingS.root, style]}>
      <View style={screenHeadingS.titleRow}>
        <Text style={screenHeadingS.title}>{title}</Text>
        {!!accessory && <View style={screenHeadingS.accessory}>{accessory}</View>}
      </View>
      {!!subtitle && <Text style={[screenHeadingS.subtitle, variant === 'input' && screenHeadingS.inputSubtitle]}>{subtitle}</Text>}
      {!!helper && <Text style={screenHeadingS.helper}>{helper}</Text>}
    </View>
  );
}
const headerS = StyleSheet.create({
  wrap: { paddingTop: DS.layout.headerTopInset, paddingHorizontal: DS.layout.pageInset },
  row: { height: DS.spacing.touch, flexDirection: 'row', alignItems: 'center', position: 'relative' },
  leftSlot: { minWidth: DS.spacing.touch, minHeight: DS.spacing.touch, alignItems: 'flex-start', justifyContent: 'center' },
  centerSlot: { position: 'absolute', left: DS.spacing.touch, right: DS.spacing.touch, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  rightSlot: { position: 'absolute', right: 0, top: 0, bottom: 0, alignItems: 'flex-end', justifyContent: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: DS.layout.headerActionGap },
  actionsSeparated: { gap: DS.layout.headerActionGroupGap },
});
const screenHeadingS = StyleSheet.create({
  wrap: { marginTop: DS.layout.headerTitleOffset, paddingHorizontal: DS.layout.pageInset, gap: DS.spacing.xs },
  root: { marginTop: DS.layout.headerTopInset },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start' },
  title: { ...DS.typography.screenTitle, color: C.text, flexShrink: 1 },
  accessory: { marginLeft: DS.layout.titleAccessoryGap, minWidth: DS.spacing.touch, minHeight: DS.spacing.touch, alignItems: 'flex-start', justifyContent: 'center', marginTop: -(DS.spacing.xs + DS.spacing.micro) },
  subtitle: { ...DS.typography.bodySmall, color: C.textSub },
  inputSubtitle: { ...DS.typography.bodyLarge, color: C.textSub },
  helper: { ...DS.typography.body, color: C.pinkDeep },
});

// ─── SegmentedControl ────────────────────────────────────────────────────────
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  testID,
  itemTestID,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  testID?: string;
  itemTestID?: (value: T) => string;
}) {
  return (
    <View testID={testID} style={segmentedS.shell} accessibilityRole="tablist">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            testID={itemTestID?.(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [segmentedS.item, selected && segmentedS.selected, pressed && segmentedS.pressed]}
          >
            <Text style={[segmentedS.label, selected && segmentedS.labelSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
const segmentedS = StyleSheet.create({
  shell: { minHeight: DS.spacing.touch, flexDirection: 'row', alignItems: 'stretch', gap: DS.spacing.xs, padding: DS.spacing.xs, borderRadius: DS.radius.input, backgroundColor: C.borderLight },
  item: { flex: 1, minHeight: DS.spacing.touch - (DS.spacing.xs * 2), alignItems: 'center', justifyContent: 'center', paddingHorizontal: DS.spacing.sm, borderRadius: DS.radius.compact },
  selected: { backgroundColor: C.white },
  pressed: { opacity: 0.88 },
  label: { ...DS.typography.bodySmall, color: C.textSub, textAlign: 'center' },
  labelSelected: { color: C.text, fontWeight: '600' },
});

// ─── BottomTab ───────────────────────────────────────────────────────────────
// Expo Router owns the actual tab button; this component standardizes the
// visual icon frame used by every tab route.
export function BottomTab({ icon, color, focused, accessibilityLabel }: {
  icon: AppIconName;
  color: string;
  focused: boolean;
  accessibilityLabel?: string;
}) {
  void accessibilityLabel;
  return <AppIcon name={icon} size={24} color={color} strokeWidth={focused ? 2.2 : 1.7} />;
}

// ─── ModalSurface ────────────────────────────────────────────────────────────
export function ModalSurface({
  visible,
  onClose,
  children,
  title,
  variant = 'center',
  containerStyle,
  testID,
  scrimTestID,
  titleTestID,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  variant?: 'center' | 'sheet';
  containerStyle?: StyleProp<ViewStyle>;
  testID?: string;
  scrimTestID?: string;
  titleTestID?: string;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable testID={scrimTestID} style={[modalSurfaceS.scrim, variant === 'sheet' && modalSurfaceS.sheetScrim]} onPress={onClose}>
        <Pressable testID={testID} style={[modalSurfaceS.container, variant === 'sheet' && modalSurfaceS.sheet, containerStyle]} onPress={() => {}}>
          {variant === 'sheet' && <View testID="modal-sheet-handle" style={modalSurfaceS.handle} />}
          {!!title && <Text testID={titleTestID} style={modalSurfaceS.title}>{title}</Text>}
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
const modalSurfaceS = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: DS.color.overlayScrim, alignItems: 'center', justifyContent: 'center', paddingHorizontal: DS.spacing.xxl },
  sheetScrim: { alignItems: 'stretch', justifyContent: 'flex-end', paddingHorizontal: 0 },
  container: { width: '100%', maxWidth: 360, backgroundColor: C.white, borderRadius: DS.radius.modal, padding: DS.spacing.xxl, alignItems: 'stretch' },
  sheet: { maxWidth: 480, alignSelf: 'stretch', borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  handle: { width: DS.component.sheetHandleWidth, height: DS.component.sheetHandleHeight, borderRadius: DS.radius.full, backgroundColor: C.border, alignSelf: 'center', marginBottom: DS.spacing.lg },
  title: { ...DS.typography.sectionTitle, color: C.text, textAlign: 'center', marginBottom: DS.spacing.md },
});

/** Modal/sheet-only close action. It intentionally has no router.back() fallback. */
export function CloseButton({ onPress, accessibilityLabel, testID }: { onPress: () => void; accessibilityLabel: string; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [closeS.button, pressed && closeS.pressed]}
    >
      <X size={20} color={C.text} strokeWidth={2} />
    </Pressable>
  );
}
const closeS = StyleSheet.create({
  button: { width: DS.spacing.touch, height: DS.spacing.touch, alignItems: 'center', justifyContent: 'center', borderRadius: DS.radius.full },
  pressed: { backgroundColor: C.pinkLight },
});

// ─── ProgressDots ─────────────────────────────────────────────────────────────
export function ProgressDots({
  current,
  total,
  variant = 'default',
  accessibilityLabel,
}: {
  current: number;
  total: number;
  variant?: 'default' | 'current-only';
  accessibilityLabel?: string;
}) {
  const currentStep = Math.min(total, Math.max(1, current));
  const currentOnly = variant === 'current-only';

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'progressbar' : undefined}
      accessibilityValue={accessibilityLabel ? { min: 1, max: total, now: currentStep } : undefined}
      style={dotsS.row}
    >
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            dotsS.dot,
            i + 1 === currentStep && dotsS.dotCurrent,
            !currentOnly && i + 1 <= currentStep && dotsS.dotDone,
          ]}
        />
      ))}
    </View>
  );
}
const dotsS = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SP.xs + DS.spacing.micro },
  dot: { width: 8, height: 8, borderRadius: DS.radius.full, backgroundColor: C.border },
  dotCurrent: { width: 24, backgroundColor: C.pink },
  dotDone: { backgroundColor: C.pink },
});

// ─── ProgressStepper ─────────────────────────────────────────────────────────
export type ProgressStep = { label: string; icon: AppIconName };
export function ProgressStepper({
  steps,
  current,
  accessibilityLabel,
  testID,
  accessible = true,
}: {
  steps: readonly ProgressStep[];
  current: number;
  accessibilityLabel: string;
  testID?: string;
  accessible?: boolean;
}) {
  const currentStep = Math.min(steps.length, Math.max(1, current));
  return (
    <View
      testID={testID}
      style={stepperS.row}
      accessible={accessible}
      accessibilityRole={accessible ? 'progressbar' : undefined}
      accessibilityLabel={accessible ? accessibilityLabel : undefined}
      accessibilityValue={accessible ? { min: 1, max: steps.length, now: currentStep } : undefined}
    >
      {steps.map((step, index) => {
        const reached = index + 1 <= currentStep;
        const active = index + 1 === currentStep;
        return (
          <View key={`${step.label}-${index}`} style={stepperS.item}>
            {index < steps.length - 1 && <View style={[stepperS.connector, reached && stepperS.connectorActive]} />}
            <View style={[stepperS.circle, reached && stepperS.circleReached]}>
              <AppIcon name={step.icon} size={18} color={reached ? C.pinkDeep : C.textSub} strokeWidth={1.5} />
            </View>
            <Text style={[stepperS.label, active && stepperS.labelActive]} numberOfLines={1}>{step.label}</Text>
          </View>
        );
      })}
    </View>
  );
}
const stepperS = StyleSheet.create({
  row: { width: '100%', height: 76, flexDirection: 'row' },
  item: { flex: 1, alignItems: 'center', position: 'relative' },
  connector: { position: 'absolute', top: 21, left: '50%', width: '100%', height: DS.spacing.micro, backgroundColor: C.borderLight },
  connectorActive: { backgroundColor: C.pink },
  circle: {
    zIndex: 1, width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
    borderRadius: DS.radius.full, borderWidth: 1, borderColor: C.borderLight, backgroundColor: C.white,
  },
  circleReached: { borderColor: C.pink, backgroundColor: C.pinkLight },
  label: { maxWidth: 82, marginTop: DS.spacing.sm, ...DS.typography.caption, color: C.textSub, textAlign: 'center' },
  labelActive: { color: C.pinkDeep },
});

// ─── ProgressBar / LoadingState ──────────────────────────────────────────────
export function ProgressBar({
  value,
  accessibilityLabel,
  testID,
}: {
  value: number;
  accessibilityLabel: string;
  testID?: string;
}) {
  const progress = Math.min(100, Math.max(0, Math.round(value)));
  return (
    <View
      testID={testID}
      style={progressBarS.track}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: progress }}
    >
      <View style={[progressBarS.fill, { width: `${progress}%` }]} />
    </View>
  );
}
const progressBarS = StyleSheet.create({
  track: { width: '100%', height: DS.spacing.sm, overflow: 'hidden', borderRadius: DS.radius.full, backgroundColor: C.pinkLight },
  fill: { height: '100%', borderRadius: DS.radius.full, backgroundColor: C.pink },
});

export function LoadingState({ label, description, testID }: { label: string; description?: string; testID?: string }) {
  return (
    <View testID={testID} style={loadingStateS.wrap} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator color={C.pink} />
      <Text style={loadingStateS.label}>{label}</Text>
      {!!description && <Text style={loadingStateS.description}>{description}</Text>}
    </View>
  );
}
const loadingStateS = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', gap: DS.spacing.sm, padding: DS.spacing.lg },
  label: { ...DS.typography.body, color: C.text, textAlign: 'center' },
  description: { ...DS.typography.bodySmall, color: C.textSub, textAlign: 'center' },
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
    borderRadius: DS.radius.chip,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
    ...DS.elevation.raised,
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
        activeOpacity={0.88}
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
    paddingHorizontal: SP.lg,
    paddingVertical: SP.md,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: SP.md, flex: 1, minWidth: 0 },
  icon: {},
  label: { ...DS.typography.body, color: C.text },
  labelWrap: { flex: 1 },
  right: { flexDirection: 'row', alignItems: 'center', gap: SP.xs + DS.spacing.micro, flexShrink: 0 },
  value: { ...DS.typography.bodyCompact, color: C.textMuted },
  divider: { height: 1, marginLeft: SP.lg, backgroundColor: C.borderLight },
});

// ─── SectionLabel ─────────────────────────────────────────────────────────────
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Text style={sectionS.label}>{children}</Text>
  );
}
const sectionS = StyleSheet.create({
  label: {
    ...DS.typography.caption,
    color: C.textMuted,
    fontWeight: '700',
    letterSpacing: DS.component.sectionLabelLetterSpacing,
    textTransform: 'uppercase',
    paddingHorizontal: SP.xs,
    marginBottom: SP.sm,
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
            activeOpacity={0.88}
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
  label: { ...DS.typography.bodyCompact, fontWeight: '600', color: C.text, marginTop: SP.xxl, marginBottom: SP.sm },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: SP.sm,
    backgroundColor: C.white, borderRadius: DS.radius.input, paddingHorizontal: SP.md, paddingVertical: SP.md,
    borderWidth: 1.5, borderColor: C.border,
  },
  input: { flex: 1, ...DS.typography.body, color: C.text, padding: 0 },
  inputGps: { color: C.pinkDeep, fontWeight: '600' },
  gpsBtn: {
    width: 30, height: 30, borderRadius: DS.radius.small,
    backgroundColor: C.pinkLight, alignItems: 'center', justifyContent: 'center',
  },
  gpsBtnOn: { backgroundColor: C.pink },
  hint: { ...DS.typography.caption, color: C.textSub, marginTop: SP.sm },
});

// ─── PlaceRow ─────────────────────────────────────────────────────────────────
// 카드에 붙은 실제 카카오 장소. url이 있으면 탭 시 지도(카카오 place) 링크를 연다.
export function PlaceRow({
  name, address, url, onPress, style, size = 'default',
}: {
  name?: string;
  address?: string;
  url?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  size?: 'default' | 'compact';
}) {
  const { t } = useI18n();
  if (!name) return null;
  const compact = size === 'compact';
  const interactive = Boolean(url || onPress);
  return (
    <TouchableOpacity
      style={[placeS.wrap, style]}
      accessibilityRole={interactive ? 'link' : undefined}
      activeOpacity={interactive ? 0.88 : 1}
      disabled={!interactive}
      onPress={onPress ?? (url ? () => { Linking.openURL(url); } : undefined)}
    >
      <MapPin size={compact ? 14 : 16} color={compact ? C.textSub : C.text} strokeWidth={2} style={placeS.icon} />
      <View style={placeS.body}>
        <Text style={[placeS.name, compact && placeS.nameCompact]} numberOfLines={1}>{name}</Text>
        {!!address && <Text style={[placeS.addr, compact && placeS.addrCompact]} numberOfLines={1}>{address}</Text>}
      </View>
      {interactive && <Text style={[placeS.link, compact && placeS.linkCompact]}>{t('location.map')}</Text>}
    </TouchableOpacity>
  );
}
const placeS = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'flex-start', gap: SP.sm },
  icon: { marginTop: DS.component.iconOpticalOffset },
  body: { flex: 1 },
  name: { ...DS.typography.cardTitle, color: C.text },
  nameCompact: { ...DS.typography.bodyCompact, fontWeight: '600' },
  addr: { ...DS.typography.bodyCompact, color: C.textSub, marginTop: SP.micro },
  addrCompact: { ...DS.typography.caption },
  link: { ...DS.typography.bodyCompact, fontWeight: '600', color: C.textSub, marginTop: DS.spacing.micro },
  linkCompact: { ...DS.typography.caption },
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
  wrap: { backgroundColor: C.cream, borderRadius: DS.radius.input, paddingHorizontal: SP.md, paddingVertical: SP.sm },
  text: { ...DS.typography.caption, color: C.creamFg },
});

// ─── GeneratingView ───────────────────────────────────────────────────────────
// AI 생성 로딩 화면 공통 UI. 헤딩 + 코스맵 일러스트 + 단계 진행바만 담당하고,
// 단계 진행(setInterval)과 실제 생성 호출은 각 화면이 맡는다.
export function GeneratingView({
  heading,
  steps,
  step,
  progressPercent: progressPercentOverride,
}: {
  heading: string;
  steps: string[];
  step: number;
  progressPercent?: number;
}) {
  const insets = useOptionalSafeAreaInsets();
  const pulseScale = useRef(new Animated.Value(1)).current;
  const fillPercent = useRef(new Animated.Value(0)).current;
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

  // 첫 단계는 0%에서 시작하고, 마지막 단계에서 100%가 되도록 진행률을 계산한다.
  const total = Math.max(steps.length, 1);
  const current = Math.min(Math.max(step, 0), total - 1);
  const statusLabel = steps[current] ?? '';
  const derivedProgressPercent = total === 1 ? 100 : Math.round((current / (total - 1)) * 100);
  const progressPercent = Math.min(100, Math.max(0, progressPercentOverride ?? derivedProgressPercent));

  useEffect(() => {
    const target = progressPercent;
    if (reduceMotion) {
      fillPercent.setValue(target);
      return;
    }
    Animated.timing(fillPercent, {
      toValue: target,
      duration: 400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // width 애니메이션은 layout 속성이라 native driver 불가
    }).start();
  }, [fillPercent, progressPercent, reduceMotion]);

  const fillWidth = fillPercent.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={[genS.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Text style={genS.heading}>{heading}</Text>

      <Animated.View style={[genS.illustrationWrap, { transform: [{ scale: pulseScale }] }]}>
        <Illustration name="date-course-map-vertical" width={240} />
      </Animated.View>

      <View style={genS.progressBlock}>
        <View style={genS.progressHeader}>
          <Text style={genS.statusLabel} numberOfLines={1}>{statusLabel}</Text>
          <Text style={genS.progressCount}>{`${progressPercent}%`}</Text>
        </View>
        <View style={genS.progressTrack} testID="generating-progress-track">
          <Animated.View
            testID="generating-progress-fill"
            style={[genS.progressFill, { width: fillWidth }]}
          />
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
    ...DS.typography.headingLegacy, color: C.text,
    textAlign: 'center',
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
  statusLabel: { flex: 1, ...DS.typography.bodyCompact, fontWeight: '600', color: C.text },
  progressCount: { ...DS.typography.bodyCompact, fontWeight: '600', color: C.pink },
  progressTrack: {
    height: 8, borderRadius: DS.radius.badge, backgroundColor: C.pinkMid, overflow: 'hidden',
  },
  progressFill: {
    height: '100%', borderRadius: DS.radius.badge, backgroundColor: C.pink,
  },
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
    borderRadius: DS.radius.input,
    paddingHorizontal: SP.lg,
    paddingVertical: SP.md,
    borderWidth: 1,
    borderColor: C.border,
  },
  label: { ...DS.typography.caption, color: C.textLight, marginBottom: SP.xs },
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
        activeOpacity={0.88}
        testID={testID}
        style={moreS.trigger}
      >
        <MoreVertical size={20} color={C.textSub} />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={moreS.backdrop} onPress={() => setOpen(false)}>
          {/* 메뉴 상자 안(버튼 아닌 영역) 탭이 배경 Pressable로 새서 닫히지 않게 터치를 삼킨다. */}
          <Pressable style={[moreS.menu, { top: menuTop }]} onPress={() => {}}>
            <TouchableOpacity accessibilityRole="button" onPress={() => pick(onEdit)} activeOpacity={0.88} style={moreS.item}>
              <Pencil size={15} color={C.text} strokeWidth={2} />
              <Text style={moreS.itemText}>{t('common.edit')}</Text>
            </TouchableOpacity>
            <View style={moreS.divider} />
            <TouchableOpacity accessibilityRole="button" onPress={() => pick(onDelete)} activeOpacity={0.88} style={moreS.item}>
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
  trigger: { width: DS.spacing.touch, height: DS.spacing.touch, borderRadius: DS.radius.full, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1 },
  menu: {
    position: 'absolute', right: SP.lg, width: 150,
    backgroundColor: C.white, borderRadius: DS.radius.legacyInput, borderWidth: 1, borderColor: C.border,
    ...DS.elevation.popover, overflow: 'hidden',
  },
  item: { minHeight: DS.spacing.touch, flexDirection: 'row', alignItems: 'center', gap: SP.sm, paddingHorizontal: SP.md },
  itemText: { ...DS.typography.bodyCompact, fontWeight: '700', color: C.text },
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
    <ModalSurface visible={visible} onClose={onHide} containerStyle={successS.card}>
      <Illustration name="mascot-heart-couple-check" width={148} style={successS.mascot} />
      <Text style={successS.message}>{message}</Text>
      <BigButton onPress={onHide} style={successS.cta}>{t('common.ok')}</BigButton>
    </ModalSurface>
  );
}
const successS = StyleSheet.create({
  card: {
    maxWidth: 320, paddingTop: SP.xxl, paddingBottom: SP.xxl, paddingHorizontal: SP.xxl,
    alignItems: 'center', gap: SP.md,
  },
  mascot: { marginBottom: SP.xs },
  message: { ...DS.typography.sectionTitle, color: C.text, textAlign: 'center' },
  cta: { marginTop: SP.sm },
});

// ─── SortDropdown ─────────────────────────────────────────────────────────────
// 재사용 가능한 정렬 드롭다운. MoreMenu와 동일하게 트리거 위치를 measureInWindow로 재서
// 화면 어디에 놓여도 옵션 팝오버가 트리거 바로 아래에 붙는다.
export function SortDropdown<T extends string>({
  value, options, onChange, testID,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  testID?: string;
}) {
  const [open, setOpen] = useState(false);
  // null = 아직 위치를 측정하지 못함. 0으로 기본값을 두면 measureInWindow 콜백이 오기 전
  // 한 프레임 동안 메뉴가 top:0(화면 맨 위)에 잘못 그려졌다 제자리로 튀는 게 보인다.
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<View>(null);
  const { width: windowWidth } = useWindowDimensions();
  const current = options.find(o => o.value === value) ?? options[0];
  const measured = menuPosition !== null;

  function openMenu() {
    // 위치 측정과 별개로 즉시 연다: measureInWindow 콜백이 늦거나(혹은 테스트 환경처럼 아예
    // 호출되지 않으면) 메뉴가 영영 안 열리는 문제를 막는다. 측정 전에는 opacity:0으로 숨겨,
    // 잘못된 위치(top:0)가 잠깐이라도 보이지 않게 한다.
    setOpen(true);
    setMenuPosition(null);
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setMenuPosition(resolveSortDropdownPosition({ x, y, width, height, windowWidth }));
    });
  }

  return (
    <>
      <TouchableOpacity
        ref={triggerRef as any}
        accessibilityRole="button"
        onPress={openMenu}
        testID={testID}
        style={sortDropdownS.trigger}
      >
        <Text style={sortDropdownS.triggerText}>{current.label}</Text>
        <ChevronDown size={14} color={C.textSub} strokeWidth={2} />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={sortDropdownS.backdrop} onPress={() => setOpen(false)}>
          <Pressable
            style={[sortDropdownS.menu, menuPosition ?? sortDropdownS.unmeasuredPosition, !measured && sortDropdownS.menuHidden]}
            onPress={() => {}}
          >
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
const SORT_DROPDOWN_MENU_WIDTH = 140;
export function resolveSortDropdownPosition({
  x, y, width, height, windowWidth,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  windowWidth: number;
}) {
  const rightAlignedLeft = x + width - SORT_DROPDOWN_MENU_WIDTH;
  const maxLeft = windowWidth - DS.layout.pageInset - SORT_DROPDOWN_MENU_WIDTH;
  return {
    top: y + height + DS.spacing.xs,
    left: Math.max(DS.layout.pageInset, Math.min(rightAlignedLeft, maxLeft)),
  };
}
const sortDropdownS = StyleSheet.create({
  trigger: {
    flexDirection: 'row', alignItems: 'center', gap: SP.xs,
    minHeight: 36, paddingHorizontal: SP.md,
    borderRadius: DS.radius.button, borderWidth: 1, borderColor: C.border, backgroundColor: C.white,
  },
  triggerText: { ...DS.typography.bodySmall, fontWeight: '600', color: C.textSub },
  backdrop: { flex: 1 },
  menu: {
    position: 'absolute', width: SORT_DROPDOWN_MENU_WIDTH,
    backgroundColor: C.white, borderRadius: DS.radius.legacyInput, borderWidth: 1, borderColor: C.border,
    ...DS.elevation.popover, overflow: 'hidden',
  },
  unmeasuredPosition: { top: 0, left: 0 },
  // 위치 측정 전(top이 아직 확정 안 됨) 잘못된 위치가 눈에 보이지 않도록 숨긴다.
  // display:'none'이 아닌 opacity로 숨겨, 테스트에서 findAllByType으로는 여전히 옵션을 찾아 누를 수 있다.
  menuHidden: { opacity: 0 },
  item: { minHeight: DS.spacing.touch, justifyContent: 'center', paddingHorizontal: SP.md },
  itemText: { ...DS.typography.bodyCompact, fontWeight: '600', color: C.textSub },
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

function StepCard({ step, index, onPlacePress }: { step: CourseStep; index: number; onPlacePress?: (step: CourseStep) => void }) {
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
          onPress={onPlacePress && (step.kakaoPlaceId || step.map_url) ? () => onPlacePress(step) : undefined}
          size="compact"
          style={stepS.placeRow}
        />
      )}
    </View>
  );
}

// 코스 단계별 동선 표시 — course-result.tsx(추천 직후)와 card/[id].tsx(저장된 카드 재조회)가 공유한다.
export function CourseStepList({
  steps,
  summary,
  onPlacePress,
}: {
  steps: CourseStep[];
  summary?: string;
  onPlacePress?: (step: CourseStep) => void;
}) {
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
          <StepCard step={step} index={i} onPlacePress={onPlacePress} />
          {i < steps.length - 1 && <StepConnector />}
        </View>
      ))}
    </View>
  );
}
const stepS = StyleSheet.create({
  card: {
    backgroundColor: C.white,
    borderRadius: DS.radius.chip,
    paddingVertical: DS.component.stepCardPaddingVertical,
    paddingHorizontal: SP.lg,
    borderWidth: 1,
    borderColor: C.border,
    ...DS.elevation.raised,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: SP.sm },
  badge: {
    width: 24, height: 24, borderRadius: DS.radius.full,
    borderWidth: 2, borderColor: C.pink, backgroundColor: C.white,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  badgeNum: { ...DS.typography.badge, fontWeight: '700', color: C.pink },
  title: { ...DS.typography.cardTitle, color: C.text },
  desc: { ...DS.typography.bodySmall, color: C.textSub, marginTop: SP.xs, marginLeft: DS.component.stepContentOffset },
  placeRow: { marginTop: SP.sm, marginLeft: DS.component.stepContentOffset },
  connector: { alignItems: 'center', height: 30, justifyContent: 'center' },
  connectorLine: { width: 1.5, height: 8, backgroundColor: C.borderLight },
  connectorDot: {
    width: 22, height: 22, borderRadius: DS.radius.full,
    backgroundColor: C.pinkLight, alignItems: 'center', justifyContent: 'center',
  },
  fallbackText: { ...DS.typography.body, color: C.text },
});
