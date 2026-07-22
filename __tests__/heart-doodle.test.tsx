import React from 'react';
import { View } from 'react-native';
import { Heart } from 'lucide-react-native';
import { HeartDoodle } from '../components/ui';

const TestRenderer = require('react-test-renderer') as {
  act: (callback: () => void | Promise<void>) => void | Promise<void>;
  create: (element: React.ReactElement) => {
    root: { findByType: (type: unknown) => { props: Record<string, any> }; findAllByType: (type: unknown) => { props: Record<string, any> }[] };
  };
};
const { act, create } = TestRenderer;

describe('HeartDoodle', () => {
  it('renders two small decorative hearts', () => {
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<HeartDoodle />); });
    const hearts = tree.root.findAllByType(Heart);
    expect(hearts.length).toBe(2);
  });

  it('is hidden from screen readers (purely decorative)', () => {
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<HeartDoodle />); });
    expect(tree.root.findByType(View).props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('renders filled hearts when filled=true', () => {
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<HeartDoodle filled />); });
    const hearts = tree.root.findAllByType(Heart);
    expect(hearts.every((h) => !!h.props.fill && h.props.fill !== 'none')).toBe(true);
  });

  it('defaults to outline (unfilled) hearts', () => {
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<HeartDoodle />); });
    const hearts = tree.root.findAllByType(Heart);
    expect(hearts.every((h) => !h.props.fill || h.props.fill === 'none')).toBe(true);
  });
});
