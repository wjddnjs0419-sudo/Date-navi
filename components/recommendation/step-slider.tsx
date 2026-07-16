import { useEffect, useRef, useState } from 'react';
import {
  Animated, PanResponder, StyleSheet, Text, View,
  type LayoutChangeEvent,
} from 'react-native';
import { C, R, SP } from '../../constants/theme';
import { fractionToValue, isHorizontalDrag, snapToStep, valueToFraction } from '../../lib/slider-math';

const THUMB_SIZE = 24;
const THUMB_HIT_RADIUS = THUMB_SIZE / 2 + 10;

export type SliderTick = { value: number; label: string };

type StepSliderProps = {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  formatValue: (value: number) => string;
  accessibilityLabel: string;
  ticks?: SliderTick[];
  testID?: string;
};

export function StepSlider({
  min, max, step, value, onChange, formatValue, accessibilityLabel, ticks, testID,
}: StepSliderProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;
  const dragStartX = useRef(0);
  const lastEmitted = useRef(value);
  const isDragging = useRef(false);

  // Track content box, inset on both sides so the thumb never overflows past the padded track bounds.
  const usableWidth = Math.max(0, trackWidth - THUMB_SIZE - 2 * SP.xs);

  // The PanResponder below is created exactly once (see the `pan` useRef) so its internal
  // gesture-distance tracking survives an entire continuous drag — recreating it on every
  // render (e.g. every time onChange fires mid-drag and the parent re-renders this component
  // with a new `value`) would reset that internal state and make dragging feel like it keeps
  // snapping back to where it started. To keep its callbacks from then seeing stale
  // min/max/step/usableWidth/value/onChange, they read everything through this ref instead,
  // which is refreshed on every render regardless of the responder's own stable identity.
  const latest = useRef({ min, max, step, value, usableWidth, onChange });
  latest.current = { min, max, step, value, usableWidth, onChange };

  useEffect(() => {
    if (!isDragging.current) lastEmitted.current = value;
  }, [value]);

  function positionForValue(v: number) {
    const { min, max, usableWidth } = latest.current;
    return valueToFraction(v, min, max) * usableWidth;
  }

  function thumbCenterX() {
    return SP.xs + positionForValue(latest.current.value) + THUMB_SIZE / 2;
  }

  function setPosition(px: number, animated: boolean) {
    const clamped = Math.max(0, Math.min(latest.current.usableWidth, px));
    if (animated) {
      Animated.spring(translateX, { toValue: clamped, useNativeDriver: true, bounciness: 0 }).start();
    } else {
      translateX.setValue(clamped);
    }
  }

  function commit(px: number) {
    const { min, max, step, usableWidth, onChange } = latest.current;
    const fraction = usableWidth === 0 ? 0 : px / usableWidth;
    const snapped = fractionToValue(fraction, min, max, step);
    if (snapped !== lastEmitted.current) {
      lastEmitted.current = snapped;
      onChange(snapped);
    }
    return snapped;
  }

  // A single PanResponder lives on the track (not a separate overlay on the thumb) so there is
  // never a sibling touch conflict between two competing responders at the same pixel. Whether
  // a touch-down immediately claims the gesture depends on WHERE it starts: within reach of the
  // thumb, it claims right away (pressing the thumb unambiguously means "drag this" — no need
  // to wait for a move threshold). Anywhere else on the track, it only claims once a clearly
  // horizontal drag is underway (same idiom as SwipeableCard in components/ui.tsx), so a
  // vertical scroll that merely passes over the slider band is never hijacked.
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt) => Math.abs(evt.nativeEvent.locationX - thumbCenterX()) <= THUMB_HIT_RADIUS,
      onMoveShouldSetPanResponder: (_, gesture) => isHorizontalDrag(gesture.dx, gesture.dy),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        isDragging.current = true;
        dragStartX.current = positionForValue(latest.current.value);
      },
      onPanResponderMove: (_, gesture) => {
        const px = dragStartX.current + gesture.dx;
        setPosition(px, false);
        commit(Math.max(0, Math.min(latest.current.usableWidth, px)));
      },
      onPanResponderRelease: (_, gesture) => {
        isDragging.current = false;
        const px = dragStartX.current + gesture.dx;
        const snapped = commit(Math.max(0, Math.min(latest.current.usableWidth, px)));
        setPosition(positionForValue(snapped), true);
      },
      onPanResponderTerminate: () => { isDragging.current = false; },
    }),
  ).current;

  function onLayout(e: LayoutChangeEvent) {
    const width = e.nativeEvent.layout.width;
    setTrackWidth(width);
    if (!isDragging.current) {
      translateX.setValue(valueToFraction(value, min, max) * Math.max(0, width - THUMB_SIZE - 2 * SP.xs));
    }
  }

  function handleAccessibilityAction(event: { nativeEvent: { actionName: string } }) {
    const direction = event.nativeEvent.actionName === 'increment' ? 1 : event.nativeEvent.actionName === 'decrement' ? -1 : 0;
    if (direction === 0) return;
    const next = snapToStep(value + direction * step, min, max, step);
    if (next === value) return;
    lastEmitted.current = next;
    onChange(next);
    setPosition(positionForValue(next), true);
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.valueLabel}>{formatValue(value)}</Text>
      <View
        style={styles.track}
        onLayout={onLayout}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ min, max, now: value, text: formatValue(value) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={handleAccessibilityAction}
        testID={testID}
        {...pan.panHandlers}
      >
        <View style={styles.trackFill} />
        <Animated.View style={[styles.thumb, { transform: [{ translateX }] }]} />
      </View>
      {!!ticks && (
        <View style={styles.tickRow}>
          {ticks.map((tick) => (
            <Text key={tick.value} style={styles.tickLabel}>{tick.label}</Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: SP.xs },
  valueLabel: { fontSize: 14, fontWeight: '700', color: C.pinkDeep },
  track: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: SP.xs,
    borderRadius: R.md,
  },
  trackFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
  },
  thumb: {
    position: 'absolute',
    left: SP.xs,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: C.white,
    borderWidth: 2,
    borderColor: C.pink,
    shadowColor: C.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  tickRow: { flexDirection: 'row', justifyContent: 'space-between' },
  tickLabel: { fontSize: 11, color: C.textMuted },
});
