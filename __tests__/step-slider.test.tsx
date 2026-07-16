import React from 'react';
import { Text } from 'react-native';

type TestNode = { props: Record<string, any> };
type TestRendererInstance = {
  root: {
    findByProps: (props: Record<string, unknown>) => TestNode;
    findAllByType: (type: unknown) => TestNode[];
  };
  update: (element: React.ReactElement) => void;
};
const TestRenderer = require('react-test-renderer') as {
  act: (callback: () => void) => void;
  create: (element: React.ReactElement) => TestRendererInstance;
};
const { act, create } = TestRenderer;
const { StepSlider } = require('../components/recommendation/step-slider') as typeof import('../components/recommendation/step-slider');

function fireA11yAction(node: TestNode, actionName: string) {
  act(() => node.props.onAccessibilityAction({ nativeEvent: { actionName } }));
}

describe('StepSlider', () => {
  it('renders the formatted current value', () => {
    let renderer!: TestRendererInstance;
    act(() => {
      renderer = create(
        <StepSlider
          min={0}
          max={10}
          step={1}
          value={4}
          onChange={jest.fn()}
          formatValue={(v) => `value:${v}`}
          accessibilityLabel="test slider"
          testID="my-slider"
        />,
      );
    });
    const label = renderer.root.findAllByType(Text).find((node) => node.props.children === 'value:4');
    expect(label).toBeDefined();
  });

  it('exposes accessibilityValue matching min/max/now/text', () => {
    let renderer!: TestRendererInstance;
    act(() => {
      renderer = create(
        <StepSlider
          min={0}
          max={10}
          step={1}
          value={4}
          onChange={jest.fn()}
          formatValue={(v) => `value:${v}`}
          accessibilityLabel="test slider"
          testID="my-slider"
        />,
      );
    });
    const track = renderer.root.findByProps({ accessibilityRole: 'adjustable' });
    expect(track.props.accessibilityValue).toEqual({ min: 0, max: 10, now: 4, text: 'value:4' });
  });

  it('increments by one step via accessibility action, clamped to max', () => {
    const onChange = jest.fn();
    let renderer!: TestRendererInstance;
    act(() => {
      renderer = create(
        <StepSlider
          min={0}
          max={10}
          step={5}
          value={8}
          onChange={onChange}
          formatValue={(v) => String(v)}
          accessibilityLabel="test slider"
          testID="my-slider"
        />,
      );
    });
    const track = renderer.root.findByProps({ accessibilityRole: 'adjustable' });
    fireA11yAction(track, 'increment');
    expect(onChange).toHaveBeenCalledWith(10);
  });

  it('decrements by one step via accessibility action, clamped to min', () => {
    const onChange = jest.fn();
    let renderer!: TestRendererInstance;
    act(() => {
      renderer = create(
        <StepSlider
          min={0}
          max={10}
          step={5}
          value={2}
          onChange={onChange}
          formatValue={(v) => String(v)}
          accessibilityLabel="test slider"
          testID="my-slider"
        />,
      );
    });
    const track = renderer.root.findByProps({ accessibilityRole: 'adjustable' });
    fireA11yAction(track, 'decrement');
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it('does not call onChange when incrementing past max', () => {
    const onChange = jest.fn();
    let renderer!: TestRendererInstance;
    act(() => {
      renderer = create(
        <StepSlider
          min={0}
          max={10}
          step={5}
          value={10}
          onChange={onChange}
          formatValue={(v) => String(v)}
          accessibilityLabel="test slider"
          testID="my-slider"
        />,
      );
    });
    const track = renderer.root.findByProps({ accessibilityRole: 'adjustable' });
    fireA11yAction(track, 'increment');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not call onChange when decrementing past min', () => {
    const onChange = jest.fn();
    let renderer!: TestRendererInstance;
    act(() => {
      renderer = create(
        <StepSlider
          min={0}
          max={10}
          step={5}
          value={0}
          onChange={onChange}
          formatValue={(v) => String(v)}
          accessibilityLabel="test slider"
          testID="my-slider"
        />,
      );
    });
    const track = renderer.root.findByProps({ accessibilityRole: 'adjustable' });
    fireA11yAction(track, 'decrement');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('claims the responder immediately when the touch starts on the thumb, so drag begins right away', () => {
    let renderer!: TestRendererInstance;
    act(() => {
      renderer = create(
        <StepSlider
          min={0}
          max={10}
          step={1}
          value={4}
          onChange={jest.fn()}
          formatValue={(v) => String(v)}
          accessibilityLabel="test slider"
          testID="my-slider"
        />,
      );
    });
    const track = renderer.root.findByProps({ accessibilityRole: 'adjustable' });
    act(() => { track.props.onLayout({ nativeEvent: { layout: { width: 300 } } }); });
    // value=4 of [0,10] over a 300-wide track lands the thumb center around x=123 (see step-slider.tsx's positionForValue/usableWidth math).
    const onThumb = track.props.onStartShouldSetResponder({ nativeEvent: { locationX: 123 } }, { dx: 0, dy: 0 });
    expect(onThumb).toBe(true);
  });

  it('does not claim the responder on start when the touch is far from the thumb, so scrolling still works there', () => {
    let renderer!: TestRendererInstance;
    act(() => {
      renderer = create(
        <StepSlider
          min={0}
          max={10}
          step={1}
          value={4}
          onChange={jest.fn()}
          formatValue={(v) => String(v)}
          accessibilityLabel="test slider"
          testID="my-slider"
        />,
      );
    });
    const track = renderer.root.findByProps({ accessibilityRole: 'adjustable' });
    act(() => { track.props.onLayout({ nativeEvent: { layout: { width: 300 } } }); });
    const farFromThumb = track.props.onStartShouldSetResponder({ nativeEvent: { locationX: 280 } }, { dx: 0, dy: 0 });
    expect(farFromThumb).toBe(false);
  });

  it('keeps the same responder handler identity across re-renders, so an in-progress drag never has its accumulated gesture distance reset', () => {
    const onChange = jest.fn();
    let renderer!: TestRendererInstance;
    act(() => {
      renderer = create(
        <StepSlider
          min={0}
          max={10}
          step={1}
          value={4}
          onChange={onChange}
          formatValue={(v) => String(v)}
          accessibilityLabel="test slider"
          testID="my-slider"
        />,
      );
    });
    const before = renderer.root.findByProps({ accessibilityRole: 'adjustable' }).props.onResponderMove;

    // Simulate what happens mid-drag: onChange fires (as commit() does on every snapped move),
    // the parent updates state, and this component re-renders with a new `value` prop — exactly
    // what happens continuously while the user's finger is still down.
    act(() => {
      renderer.update(
        <StepSlider
          min={0}
          max={10}
          step={1}
          value={5}
          onChange={onChange}
          formatValue={(v) => String(v)}
          accessibilityLabel="test slider"
          testID="my-slider"
        />,
      );
    });
    const after = renderer.root.findByProps({ accessibilityRole: 'adjustable' }).props.onResponderMove;

    expect(after).toBe(before);
  });

  // The track's onMoveShouldSetPanResponder wiring (`isHorizontalDrag(gesture.dx, gesture.dy)`)
  // is intentionally not exercised here: PanResponder's real onMoveShouldSetResponder ignores
  // any gestureState passed by a caller and only ever reads its own internal gestureState,
  // which real touch-history plumbing (unavailable in react-test-renderer) is required to
  // populate. isHorizontalDrag itself is fully covered in slider-math.test.ts; this callback
  // is a one-line pass-through to it.

  it('renders provided tick labels', () => {
    let renderer!: TestRendererInstance;
    act(() => {
      renderer = create(
        <StepSlider
          min={0}
          max={3}
          step={1}
          value={0}
          onChange={jest.fn()}
          formatValue={(v) => String(v)}
          accessibilityLabel="test slider"
          testID="my-slider"
          ticks={[
            { value: 0, label: '미선택' },
            { value: 1, label: '2~3시간' },
          ]}
        />,
      );
    });
    const tickLabel = renderer.root.findAllByType(Text).find((node) => node.props.children === '2~3시간');
    expect(tickLabel).toBeDefined();
  });
});
