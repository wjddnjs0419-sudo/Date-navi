import React from 'react';
import { Text } from 'react-native';
import { GeneratingView } from '../components/ui';

// repo convention: require + act() wrapper, and unmount() inside act() so the
// GeneratingView pulse loop is stopped (otherwise the Animated timer leaks past
// Jest teardown and crashes the run).
const TR = require('react-test-renderer') as {
  create: (el: React.ReactElement) => {
    root: { findAllByType: (t: unknown) => { props: any }[] };
    unmount: () => void;
  };
  act: (cb: () => void) => void;
};

describe('GeneratingView contract', () => {
  it('renders heading and step labels', () => {
    let tree!: ReturnType<typeof TR.create>;
    TR.act(() => {
      tree = TR.create(<GeneratingView heading="코스를 만드는 중" steps={['장소 찾기', '코스 짜기']} step={0} />);
    });
    const txt = tree.root.findAllByType(Text).map((n: any) => n.props.children).flat().join(' ');
    expect(txt).toContain('코스를 만드는 중');
    expect(txt).toContain('장소 찾기');
    TR.act(() => { tree.unmount(); });
  });
});
