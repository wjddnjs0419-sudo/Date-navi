import React from 'react';
import { Text } from 'react-native';
import { Wallet } from 'lucide-react-native';
import { DdayBadge, MetaChipRow } from '../components/ui';

const TR = require('react-test-renderer') as {
  create: (el: React.ReactElement) => { root: { findAllByType: (t: unknown) => { props: any }[] } };
  act: (cb: () => void) => void;
};

describe('DdayBadge', () => {
  it('formats positive days as D-n', () => {
    let tree: any;
    TR.act(() => { tree = TR.create(<DdayBadge days={2} />); });
    const txt = tree.root.findAllByType(Text).map((n: any) => n.props.children).flat().join('');
    expect(txt).toContain('D-2');
  });
  it('formats zero as D-DAY', () => {
    let tree: any;
    TR.act(() => { tree = TR.create(<DdayBadge days={0} />); });
    const txt = tree.root.findAllByType(Text).map((n: any) => n.props.children).flat().join('');
    expect(txt).toContain('D-DAY');
  });
});

describe('MetaChipRow', () => {
  it('renders each chip label', () => {
    let tree: any;
    TR.act(() => {
      tree = TR.create(
        <MetaChipRow items={[{ icon: 'map', label: '성수동 중심' }, { icon: 'clock', label: '약 3시간' }]} />,
      );
    });
    const texts = tree.root.findAllByType(Text).map((n: any) => n.props.children);
    expect(texts).toEqual(expect.arrayContaining(['성수동 중심', '약 3시간']));
  });

  it('wallet 아이콘 변형을 렌더한다', () => {
    let tree: any;
    TR.act(() => {
      tree = TR.create(<MetaChipRow items={[{ icon: 'wallet', label: '10만원대' }]} />);
    });
    expect(tree.root.findAllByType(Wallet).length).toBe(1);
  });
});
