import React from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { C, DS } from '../constants/theme';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));

type TestNode = { props: Record<string, any>; type: unknown };
type Renderer = { root: { findByProps: (props: Record<string, unknown>) => TestNode; findAll: (predicate: (node: TestNode) => boolean) => TestNode[]; findAllByType: (type: unknown) => TestNode[] } };
const TR = require('react-test-renderer') as { act: (callback: () => void) => void; create: (element: React.ReactElement) => Renderer };
const {
  InputField, SelectionCard, ProgressBar, ProgressDots, ProgressStepper, CloseButton,
} = require('../components/ui') as typeof import('../components/ui');

function render(element: React.ReactElement) {
  let tree!: Renderer;
  TR.act(() => { tree = TR.create(element); });
  return tree;
}

describe('design primitives', () => {
  it('uses the canonical InputField radius, error, and placeholder contract', () => {
    const tree = render(<InputField label="장소" value="" placeholder="입력" error="필수 항목" onChangeText={jest.fn()} testID="field" />);
    const input = tree.root.findAllByType(TextInput).find((node) => node.props.testID === 'field');
    expect(input?.type).toBe(TextInput);
    expect(input?.props.placeholderTextColor).toBe('#C8BCB1');
    expect(StyleSheet.flatten(input?.props.style)).toEqual(expect.objectContaining({
      height: DS.spacing.touch,
      minHeight: DS.spacing.touch,
      lineHeight: undefined,
      textAlignVertical: 'center',
    }));
    const shell = tree.root.findAll((node) => typeof node.type === 'string')
      .map((node) => StyleSheet.flatten(node.props.style))
      .find((style) => style?.borderRadius === 16 && style?.minHeight === 52);
    expect(shell).toEqual(expect.objectContaining({ borderColor: '#FF4F6D' }));

    const englishTree = render(<InputField value="chicken" onChangeText={jest.fn()} testID="english-field" />);
    const englishInput = englishTree.root.findAllByType(TextInput).find((node) => node.props.testID === 'english-field');
    expect(StyleSheet.flatten(englishInput?.props.style)).toEqual(expect.objectContaining({
      transform: [{ translateY: -DS.spacing.xs }],
    }));
  });

  it('keeps selection, close, dot, and bar accessibility states explicit', () => {
    const tree = render(
      <>
        <SelectionCard selected testID="selected">선택</SelectionCard>
        <CloseButton testID="close" accessibilityLabel="닫기" onPress={jest.fn()} />
        <ProgressDots current={3} total={5} variant="current-only" accessibilityLabel="입력 단계" />
        <ProgressBar value={120} accessibilityLabel="생성 진행" testID="bar" />
        <ProgressStepper
          current={2}
          accessibilityLabel="로딩 단계"
          steps={[{ label: '검색', icon: 'search' }, { label: '완료', icon: 'heart' }]}
        />
      </>,
    );
    const hostWithTestId = (testID: string) => tree.root.findAll((node) => typeof node.type === 'string' && node.props?.testID === testID)[0];
    expect(hostWithTestId('selected').props.accessibilityState).toEqual({ selected: true });
    expect(hostWithTestId('close').props.accessibilityLabel).toBe('닫기');
    expect(hostWithTestId('bar').props.accessibilityValue).toEqual({ min: 0, max: 100, now: 100 });
    const progressbars = tree.root.findAll((node) => typeof node.type === 'string' && node.props?.accessibilityRole === 'progressbar');
    expect(progressbars).toHaveLength(3);
    const activeProgressDot = tree.root.findAll((node) => {
      const style = StyleSheet.flatten(node.props?.style);
      return typeof node.type === 'string' && style?.width === 24 && style?.backgroundColor === C.pink;
    });
    expect(activeProgressDot.length).toBeGreaterThan(0);
  });
});
