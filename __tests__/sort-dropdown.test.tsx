import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { SortDropdown } from '../components/ui';

const TR = require('react-test-renderer') as {
  act: (cb: () => void | Promise<void>) => Promise<void>;
  create: (el: React.ReactElement) => { root: { findAllByType: (t: unknown) => { props: any }[] } };
};

describe('SortDropdown', () => {
  const options = [{ value: 'newest', label: '최신순' }, { value: 'oldest', label: '오래된순' }];

  it('선택된 옵션 라벨을 트리거에 표시한다', async () => {
    let tree!: ReturnType<typeof TR.create>;
    await TR.act(async () => {
      tree = TR.create(<SortDropdown value="newest" options={options} onChange={() => {}} />);
    });
    const texts = tree.root.findAllByType(Text).map(n => n.props.children).flat(Infinity);
    expect(texts).toContain('최신순');
  });

  it('옵션을 누르면 onChange가 그 value로 호출된다', async () => {
    const onChange = jest.fn();
    let tree!: ReturnType<typeof TR.create>;
    await TR.act(async () => {
      tree = TR.create(<SortDropdown value="newest" options={options} onChange={onChange} />);
    });
    await TR.act(async () => {
      tree.root.findAllByType(TouchableOpacity)[0].props.onPress();
    });
    await TR.act(async () => {
      const oldestOption = tree.root.findAllByType(TouchableOpacity)
        .find(n => n.props.testID === 'sort-option-oldest');
      oldestOption?.props.onPress();
    });
    expect(onChange).toHaveBeenCalledWith('oldest');
  });
});
