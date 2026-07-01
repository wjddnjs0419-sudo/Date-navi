import {
  View, Text, TouchableOpacity, StyleSheet, Animated, PanResponder, Pressable,
  type ViewStyle, type TextStyle, type StyleProp,
} from 'react-native';
import { ChevronLeft, Pencil, X } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { C } from '../constants/colors';
import { useRef, type ReactNode } from 'react';

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
