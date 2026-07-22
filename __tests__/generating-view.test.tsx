import React from 'react';
import { Text } from 'react-native';
import { GeneratingView } from '../components/ui';
import { Illustration } from '../components/illustration';

// repo convention: require + act() wrapper, and unmount() inside act() so the
// GeneratingView pulse loop is stopped (otherwise the Animated timer leaks past
// Jest teardown and crashes the run).
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

  it('renders one continuous progress fill, not one segment per step', () => {
    let tree!: ReturnType<typeof TR.create>;
    TR.act(() => {
      tree = TR.create(
        <GeneratingView heading="코스를 만드는 중" steps={['a', 'b', 'c', 'd']} step={2} />,
      );
    });
    // View/Animated.View는 forwardRef 컴포넌트 + 실제 호스트 노드로 구성되므로
    // testID만으로 찾으면 같은 요소가 composite/host 레이어별로 중복 매칭된다.
    // 실제로 렌더되는 노드(호스트, type이 문자열)만 세어야 "요소 1개"를 정확히 검증한다.
    const isHostNode = (n: any) => typeof n.type === 'string';
    const track = tree.root.findAll((n: any) => n.props.testID === 'generating-progress-track' && isHostNode(n));
    const fill = tree.root.findAll((n: any) => n.props.testID === 'generating-progress-fill' && isHostNode(n));
    expect(track.length).toBe(1);
    expect(fill.length).toBe(1);
    TR.act(() => { tree.unmount(); });
  });

  it('keeps showing the "current / total" count label', () => {
    let tree!: ReturnType<typeof TR.create>;
    TR.act(() => {
      tree = TR.create(
        <GeneratingView heading="코스를 만드는 중" steps={['a', 'b', 'c', 'd']} step={2} />,
      );
    });
    const txt = tree.root.findAllByType(Text).map((n: any) => n.props.children).flat().join(' ');
    expect(txt).toContain('3 / 4');
    TR.act(() => { tree.unmount(); });
  });

  it('renders the course-map illustration at 240 width', () => {
    let tree!: ReturnType<typeof TR.create>;
    TR.act(() => {
      tree = TR.create(
        <GeneratingView heading="코스를 만드는 중" steps={['a', 'b']} step={0} />,
      );
    });
    const illustration = tree.root.findAllByType(Illustration)[0];
    expect(illustration.props.width).toBe(240);
    TR.act(() => { tree.unmount(); });
  });
});
