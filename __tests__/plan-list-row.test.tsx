import React from 'react';
import { Text } from 'react-native';
import { PlanListRow } from '../components/ui';

const TR = require('react-test-renderer') as {
  create: (el: React.ReactElement) => { root: { findAllByType: (t: unknown) => { props: any }[] } };
  act: (cb: () => void) => void;
};

describe('PlanListRow', () => {
  it('renders title, date, and D-day', () => {
    let tree: any;
    TR.act(() => {
      tree = TR.create(
        <PlanListRow title="성수동 감성 데이트 코스" dateLabel="7월 22일 (목) 오후 2:00" days={2} onPress={() => {}} />,
      );
    });
    const texts = tree.root.findAllByType(Text).map((n: any) => n.props.children).flat().join(' ');
    expect(texts).toContain('성수동 감성 데이트 코스');
    expect(texts).toContain('7월 22일');
    expect(texts).toContain('D-2');
  });
});
