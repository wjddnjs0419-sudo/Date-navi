import React from 'react';
import { TouchableOpacity, Text } from 'react-native';
import { ReactionPicker } from '../components/ReactionPicker';
import { REACTIONS, ReactionType } from '../lib/reactions';

const TR = require('react-test-renderer') as {
  act: (cb: () => void | Promise<void>) => void;
  create: (el: React.ReactElement) => {
    root: {
      findAllByType: (t: unknown) => { props: any }[];
      findByProps: (props: Record<string, unknown>) => { props: any };
    };
  };
};

const labelFor = (t: ReactionType) => `label-${t}`;

describe('ReactionPicker', () => {
  it('4종 반응을 모두 렌더한다', () => {
    let tree!: ReturnType<typeof TR.create>;
    TR.act(() => {
      tree = TR.create(<ReactionPicker selected={null} onSelect={() => {}} labelFor={labelFor} />);
    });
    const labels = tree.root.findAllByType(Text).map(n => n.props.children);
    for (const r of REACTIONS) {
      expect(labels).toContain(`label-${r.type}`);
    }
  });

  it('선택된 타입 탭 콜백을 호출한다', () => {
    const onSelect = jest.fn();
    let tree!: ReturnType<typeof TR.create>;
    TR.act(() => {
      tree = TR.create(<ReactionPicker selected={null} onSelect={onSelect} labelFor={labelFor} />);
    });
    const btns = tree.root.findAllByType(TouchableOpacity);
    TR.act(() => { btns[0].props.onPress(); });
    expect(onSelect).toHaveBeenCalledWith(REACTIONS[0].type);
  });

  it('selected에 해당하는 버튼에 testID 접미사 -selected가 붙는다', () => {
    let tree!: ReturnType<typeof TR.create>;
    TR.act(() => {
      tree = TR.create(<ReactionPicker selected="love" onSelect={() => {}} labelFor={labelFor} />);
    });
    expect(tree.root.findByProps({ testID: 'reaction-love-selected' })).toBeTruthy();
  });
});
