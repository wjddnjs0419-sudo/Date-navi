import {
  View, Text, TouchableOpacity, StyleSheet,
  type ViewStyle, type TextStyle, type StyleProp,
} from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { C } from '../constants/colors';
import type { ReactNode } from 'react';

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
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.85 : 1}
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
