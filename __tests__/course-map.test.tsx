import React from 'react';
import { Text } from 'react-native';
import { CourseMapPreview } from '../components/course-map';

// repo convention: require + act() wrapper (Jest/React19/RN scheduler crashes otherwise)
const TestRenderer = require('react-test-renderer') as {
  create: (el: React.ReactElement) => { root: { findAllByType: (t: unknown) => { props: any }[] } };
  act: (cb: () => void) => void;
};

describe('CourseMapPreview', () => {
  const steps = [
    { category: 'meal' as const, label: '식사' },
    { category: 'cafe' as const, label: '카페' },
    { category: 'walk' as const, label: '산책' },
  ];
  it('renders one label per step', () => {
    let tree: any;
    TestRenderer.act(() => { tree = TestRenderer.create(<CourseMapPreview steps={steps} />); });
    const texts = tree.root.findAllByType(Text).map((n: any) => n.props.children);
    expect(texts).toEqual(expect.arrayContaining(['식사', '카페', '산책']));
  });
});
