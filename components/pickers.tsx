import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { C } from '../constants/colors';
import { BigButton } from './ui';

export type PickerOption = { label: string; value: string };

const ITEM_H = 58;
const VISIBLE_ITEMS = 5;
const PICKER_H = ITEM_H * VISIBLE_ITEMS;
const PICKER_PAD = ITEM_H * Math.floor(VISIBLE_ITEMS / 2);

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function pad2(n: number | string) {
  return String(n).padStart(2, '0');
}

export function daysInMonth(year: string, month: string) {
  return new Date(Number(year), Number(month), 0).getDate();
}

export function parseIsoDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  if (Number(month) < 1 || Number(month) > 12) return null;
  if (Number(day) < 1 || Number(day) > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function formatDateLabel(value: string, fallback = '날짜 선택') {
  const parsed = parseIsoDate(value);
  if (!parsed) return value || fallback;
  const d = new Date(`${parsed.year}-${parsed.month}-${parsed.day}T00:00:00`);
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  return `${Number(parsed.month)}월 ${Number(parsed.day)}일 (${weekday})`;
}

export function defaultIsoDate() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseTimeParts(value: string) {
  const compact = value.replace(/\s/g, '');
  const ampm = compact.includes('오전') || /\bAM\b/i.test(value)
    ? '오전'
    : compact.includes('오후') || compact.includes('저녁') || /\bPM\b/i.test(value)
      ? '오후'
      : '오후';
  const colon = compact.match(/(\d{1,2}):(\d{2})/);
  const hourOnly = compact.match(/(\d{1,2})시?/);
  const hour = colon?.[1] ?? hourOnly?.[1] ?? '7';
  const minute = colon?.[2] ?? '00';
  return {
    period: ampm,
    hour: String(clamp(Number(hour), 1, 12)),
    minute: ['00', '30'].includes(minute) ? minute : '00',
  };
}

export function formatTimeValue(period: string, hour: string, minute: string) {
  return `${period} ${Number(hour)}:${minute}`;
}

export function WheelPicker({
  options,
  value,
  onChange,
  style,
}: {
  options: PickerOption[];
  value: string;
  onChange: (value: string) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const ref = useRef<ScrollView>(null);
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestYRef = useRef(selectedIndex * ITEM_H);
  const tapScrollingRef = useRef(false);

  useEffect(() => {
    if (tapScrollingRef.current) return;
    const t = setTimeout(() => {
      ref.current?.scrollTo({ y: selectedIndex * ITEM_H, animated: false });
    }, 0);
    return () => clearTimeout(t);
  }, [selectedIndex, options.length]);

  useEffect(() => () => {
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
  }, []);

  function settle(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (options.length === 0) return;
    latestYRef.current = e.nativeEvent.contentOffset.y;
    snapToNearest(true);
  }

  function scheduleSnap() {
    if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
    snapTimerRef.current = setTimeout(() => {
      snapToNearest(true);
      snapTimerRef.current = setTimeout(() => snapToNearest(false), 130);
    }, 90);
  }

  function snapToNearest(animated: boolean) {
    if (options.length === 0) return;
    const idx = clamp(Math.round(latestYRef.current / ITEM_H), 0, options.length - 1);
    commitIndex(idx, animated);
  }

  function commitIndex(idx: number, animated: boolean) {
    const next = options[idx]?.value;
    latestYRef.current = idx * ITEM_H;
    ref.current?.scrollTo({ y: idx * ITEM_H, animated });
    if (next !== undefined && next !== value) onChange(next);
  }

  function handleItemPress(idx: number) {
    const next = options[idx]?.value;
    if (next === undefined) return;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);

    tapScrollingRef.current = true;
    latestYRef.current = idx * ITEM_H;
    ref.current?.scrollTo({ y: idx * ITEM_H, animated: true });

    tapTimerRef.current = setTimeout(() => {
      tapScrollingRef.current = false;
      if (next !== value) onChange(next);
    }, 220);
  }

  return (
    <View style={[pickerS.wheel, style]}>
      <View pointerEvents="none" style={pickerS.selection} />
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        nestedScrollEnabled
        contentContainerStyle={pickerS.wheelContent}
        scrollEventThrottle={16}
        onScroll={(e) => { latestYRef.current = e.nativeEvent.contentOffset.y; }}
        onMomentumScrollEnd={settle}
        onScrollEndDrag={(e) => {
          latestYRef.current = e.nativeEvent.contentOffset.y;
          scheduleSnap();
        }}
      >
        {options.map((option, idx) => {
          const selected = option.value === value;
          return (
            <Pressable key={option.value} style={pickerS.item} onPress={() => handleItemPress(idx)}>
              <Text
                style={[pickerS.itemText, selected && pickerS.itemTextSelected]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.15}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function PickerSheet({
  visible,
  title,
  children,
  onCancel,
  onConfirm,
  confirmLabel = '완료',
}: {
  visible: boolean;
  title: string;
  children: React.ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={sheetS.wrap}>
        <Pressable style={sheetS.backdrop} onPress={onCancel} />
        <View style={sheetS.panel}>
          <View style={sheetS.handle} />
          <Text style={sheetS.title}>{title}</Text>
          {children}
          <View style={sheetS.actions}>
            <Pressable style={sheetS.cancelBtn} onPress={onCancel}>
              <Text style={sheetS.cancelText}>취소</Text>
            </Pressable>
            <BigButton onPress={onConfirm} style={sheetS.doneBtn}>{confirmLabel}</BigButton>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function DateWheelPicker({
  value,
  onChange,
  minYear,
  maxYear,
}: {
  value: string;
  onChange: (value: string) => void;
  minYear?: number;
  maxYear?: number;
}) {
  const now = new Date();
  const parsed = parseIsoDate(value) ?? parseIsoDate(defaultIsoDate())!;
  const from = minYear ?? now.getFullYear();
  const to = maxYear ?? now.getFullYear() + 2;
  const yearOptions = useMemo(
    () => Array.from({ length: to - from + 1 }, (_, i) => {
      const year = String(from + i);
      return { value: year, label: year };
    }),
    [from, to],
  );
  const monthOptions = useMemo(
    () => Array.from({ length: 12 }, (_, i) => {
      const month = pad2(i + 1);
      return { value: month, label: `${i + 1}월` };
    }),
    [],
  );
  const dayOptions = useMemo(
    () => Array.from({ length: daysInMonth(parsed.year, parsed.month) }, (_, i) => {
      const day = pad2(i + 1);
      return { value: day, label: `${i + 1}일` };
    }),
    [parsed.year, parsed.month],
  );

  function update(partial: Partial<typeof parsed>) {
    const nextYear = partial.year ?? parsed.year;
    const nextMonth = partial.month ?? parsed.month;
    const maxDay = daysInMonth(nextYear, nextMonth);
    const nextDay = pad2(clamp(Number(partial.day ?? parsed.day), 1, maxDay));
    onChange(`${nextYear}-${nextMonth}-${nextDay}`);
  }

  return (
    <View style={pickerS.dateRow}>
      <WheelPicker options={yearOptions} value={parsed.year} onChange={(year) => update({ year })} style={pickerS.yearWheel} />
      <WheelPicker options={monthOptions} value={parsed.month} onChange={(month) => update({ month })} style={pickerS.shortWheel} />
      <WheelPicker options={dayOptions} value={parsed.day} onChange={(day) => update({ day })} style={pickerS.shortWheel} />
    </View>
  );
}

export function TimeWheelPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const parts = parseTimeParts(value);
  const periods = useMemo(() => ['오전', '오후'].map((v) => ({ value: v, label: v })), []);
  const hours = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const hour = String(i + 1);
    return { value: hour, label: `${i + 1}시` };
  }), []);
  const minutes = useMemo(() => ['00', '30'].map((v) => ({ value: v, label: `${v}분` })), []);

  function update(next: Partial<typeof parts>) {
    onChange(formatTimeValue(next.period ?? parts.period, next.hour ?? parts.hour, next.minute ?? parts.minute));
  }

  return (
    <View style={pickerS.dateRow}>
      <WheelPicker options={periods} value={parts.period} onChange={(period) => update({ period })} style={pickerS.shortWheel} />
      <WheelPicker options={hours} value={parts.hour} onChange={(hour) => update({ hour })} style={pickerS.shortWheel} />
      <WheelPicker options={minutes} value={parts.minute} onChange={(minute) => update({ minute })} style={pickerS.shortWheel} />
    </View>
  );
}

export function DurationWheelPicker({
  options,
  value,
  onChange,
}: {
  options: PickerOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <WheelPicker options={options} value={value} onChange={onChange} style={pickerS.durationWheel} />
  );
}

const pickerS = StyleSheet.create({
  wheel: {
    height: PICKER_H,
    overflow: 'hidden',
  },
  wheelContent: {
    paddingVertical: PICKER_PAD,
  },
  selection: {
    position: 'absolute',
    top: PICKER_PAD,
    left: 0,
    right: 0,
    height: ITEM_H,
    borderRadius: 12,
    backgroundColor: C.pinkLight,
    borderWidth: 1,
    borderColor: C.pinkBorder,
  },
  item: {
    height: ITEM_H,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  itemText: {
    fontSize: 15,
    lineHeight: 22,
    color: C.textMuted,
    fontWeight: '500',
  },
  itemTextSelected: {
    color: C.pinkDeep,
    fontWeight: '700',
    fontSize: 20,
    lineHeight: 28,
  },
  dateRow: {
    flexDirection: 'row',
    gap: 8,
  },
  yearWheel: { flex: 1.2 },
  shortWheel: { flex: 1 },
  durationWheel: { width: '100%' },
});

const sheetS = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(31, 31, 36, 0.28)',
  },
  panel: {
    backgroundColor: C.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    alignSelf: 'center',
    marginBottom: 18,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: C.text,
    textAlign: 'center',
    marginBottom: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  cancelBtn: {
    width: 92,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: C.textSub,
  },
  doneBtn: {
    flex: 1,
  },
});
