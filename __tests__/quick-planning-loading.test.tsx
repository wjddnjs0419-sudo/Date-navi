import React from 'react';
import { Text } from 'react-native';
import {
  getQuickPlanningStageIndex,
  QuickPlanningLoading,
} from '../components/recommendation/quick-planning-loading';

const TR = require('react-test-renderer') as {
  create: (el: React.ReactElement) => {
    root: {
      findAllByType: (t: unknown) => { props: any }[];
      findAll: (predicate: (node: any) => boolean) => { props: any }[];
    };
    unmount: () => void;
  };
  act: (cb: () => void) => void;
};

const props = {
  heading: '둘에게 맞는\n코스를 찾고 있어요',
  subtitle: '조금만 기다려주세요!',
  stageLabels: ['취향 분석', '장소 탐색', '동선 정리', '코스 완성'],
  bubbleMessages: ['취향과 분위기를\n분석하고 있어요', '장소를\n찾고 있어요', '동선을\n정리 중이에요', '코스를\n마무리해요'],
  statusMessages: ['취향 분석 중', '장소 탐색 중', '동선 정리 중', '코스 완성 중'],
  progressPercent: 52,
  conditions: { location: '성수역', time: '오늘 오후 7시', mood: '조용한 분위기' },
  conditionsLabel: '선택한 조건',
  language: 'ko' as const,
};

describe('QuickPlanningLoading', () => {
  it.each([
    [0, 0], [24, 0], [25, 1], [52, 1], [53, 2], [76, 2], [77, 3], [100, 3],
  ])('maps %s%% to Figma stage %s', (progress, expected) => {
    expect(getQuickPlanningStageIndex(progress)).toBe(expected);
  });

  it('renders the redesigned copy, conditions, stage labels, and continuous progress', () => {
    let tree!: ReturnType<typeof TR.create>;
    TR.act(() => {
      tree = TR.create(<QuickPlanningLoading {...props} />);
    });

    const text = tree.root.findAllByType(Text).map((node: any) => node.props.children).flat().join(' ');
    expect(text).toContain('둘에게 맞는');
    expect(text).toContain('선택한 조건');
    expect(text).toContain('성수역');
    expect(text).toContain('장소 탐색');
    expect(text).toContain('52');

    const host = (node: any) => typeof node.type === 'string';
    expect(tree.root.findAll((node: any) => node.props.testID === 'quick-planning-progress-track' && host(node))).toHaveLength(1);
    expect(tree.root.findAll((node: any) => node.props.testID === 'quick-planning-progress-fill' && host(node))).toHaveLength(1);
    expect(tree.root.findAll((node: any) => node.props.testID === 'quick-planning-mascot-1' && host(node))).toHaveLength(1);
    expect(tree.root.findAll((node: any) => node.props.testID === 'quick-planning-condition-meta' && host(node))).toHaveLength(1);

    TR.act(() => { tree.unmount(); });
  });
});
