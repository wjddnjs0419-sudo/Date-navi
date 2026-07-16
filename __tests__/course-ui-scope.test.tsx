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
  it('retains the pre-Phase4 default dimensions of shared controls', () => {
    const back = StyleSheet.flatten(renderButton(<BackBar />).props.style);
    const option = StyleSheet.flatten(renderButton(
      <OptionCardPicker options={[{ value: 'one', label: 'One' }]} value={undefined} onChange={jest.fn()} />,
    ).props.style);
    const big = StyleSheet.flatten(renderButton(<BigButton>Continue</BigButton>).props.style);

    expect(back).toEqual(expect.objectContaining({ marginLeft: -8, padding: 4, alignSelf: 'flex-start' }));
    expect(back.minWidth).toBeUndefined();
    expect(back.minHeight).toBeUndefined();
    expect(option.minHeight).toBeUndefined();
    expect(big.minHeight).toBeUndefined();
  });

  it('provides additive touch-target opt-ins without changing shared defaults', () => {
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

    expect(back).toEqual(expect.objectContaining({ minWidth: 44, minHeight: 44 }));
    expect(option.minHeight).toBe(44);
    expect(big.minHeight).toBe(52);
  });

  it('keeps all dimension opt-ins explicit at the make_course call site', () => {
    const source = readFileSync(join(__dirname, '../app/mode-flow/course.tsx'), 'utf8');

    expect(source).toContain('<BackBar largeTouchTarget />');
    expect(source).toContain('testID="course-duration-slider"');
    expect(source).toContain('testID="course-budget-slider"');
    expect(source).toMatch(/<BigButton[\s\S]*?style=\{styles\.generateButton\}/);
  });
});

const styles = StyleSheet.create({
  courseBigButton: { minHeight: 52 },
});
