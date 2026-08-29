import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
}));

type TestNode = { props: Record<string, any> };
type TestRendererInstance = {
  root: { findByType: (type: unknown) => TestNode };
};
const TestRenderer = require('react-test-renderer') as {
  act: (callback: () => void) => void;
  create: (element: React.ReactElement) => TestRendererInstance;
};
const { act, create } = TestRenderer;
const {
  BackBar,
  BigButton,
  OptionCardPicker,
} = require('../components/ui') as typeof import('../components/ui');

function renderButton(element: React.ReactElement): TestNode {
  let renderer!: TestRendererInstance;
  act(() => { renderer = create(element); });
  return renderer.root.findByType(TouchableOpacity);
}

describe('Phase 4 shared UI scope', () => {
  it('keeps BackBar a uniform 44×44 target while OptionCardPicker and BigButton stay minimal by default', () => {
    const back = StyleSheet.flatten(renderButton(<BackBar />).props.style);
    const option = StyleSheet.flatten(renderButton(
      <OptionCardPicker options={[{ value: 'one', label: 'One' }]} value={undefined} onChange={jest.fn()} />,
    ).props.style);
    const big = StyleSheet.flatten(renderButton(<BigButton>Continue</BigButton>).props.style);

    // 31d63b6: BackBar is a fixed 44×44 box (HIG minimum tap target, aligned with the
    // 44×44 share/⋮ header actions), so 44×44 is now its shared default — not an opt-in.
    expect(back).toEqual(expect.objectContaining({
      width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
    }));
    // OptionCardPicker and BigButton keep minimal defaults; enlargements stay opt-in.
    expect(option.minHeight).toBeUndefined();
    expect(big.minHeight).toBe(52);
  });

  it('provides additive touch-target opt-ins for OptionCardPicker and BigButton', () => {
    // BackBar is already 44×44; largeTouchTarget is a no-op kept for API compatibility.
    const back = StyleSheet.flatten(renderButton(<BackBar largeTouchTarget />).props.style);
    const option = StyleSheet.flatten(renderButton(
      <OptionCardPicker
        largeTouchTarget
        options={[{ value: 'one', label: 'One' }]}
        value={undefined}
        onChange={jest.fn()}
      />,
    ).props.style);
    const big = StyleSheet.flatten(renderButton(
      <BigButton style={styles.courseBigButton}>Continue</BigButton>,
    ).props.style);

    expect(back).toEqual(expect.objectContaining({ width: 44, height: 44 }));
    expect(option.minHeight).toBe(44);
    expect(big.minHeight).toBe(52);
  });

  it('keeps the redesigned five-step flow and its course-only controls in the course screen', () => {
    const source = readFileSync(join(__dirname, '../app/mode-flow/course.tsx'), 'utf8');

    expect(source).toContain('<Header');
    expect(source).toContain('center={<ProgressDots');
    expect(source).toContain('<ScreenHeading');
    expect(source).toContain('testID="course-flow-step-5"');
    expect(source).toContain('automaticallyAdjustKeyboardInsets');
    expect(source).toContain('<CourseTimeSelector');
    // 5단계 review CTA는 긴 내용에서도 화면 하단에 남아야 한다.
    expect(source).toContain("generateButton: { marginTop: 'auto' }");
  });
});

const styles = StyleSheet.create({
  courseBigButton: { minHeight: 52 },
});
