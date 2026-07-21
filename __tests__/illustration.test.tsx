import React from 'react';
import { Image } from 'react-native';
import { Illustration } from '../components/illustration';

const TestRenderer = require('react-test-renderer') as {
  act: (callback: () => void | Promise<void>) => void | Promise<void>;
  create: (element: React.ReactElement) => { root: { findByType: (type: unknown) => { props: Record<string, any> } } };
};
const { act, create } = TestRenderer;

describe('Illustration', () => {
  it('renders an Image for a known asset name', () => {
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<Illustration name="home-map-book" />); });
    const img = tree.root.findByType(Image);
    expect(img.props.source).toBeTruthy();
    expect(img.props.accessible).toBe(true);
  });
  it('applies explicit height when given', () => {
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<Illustration name="bg-park" height={120} />); });
    const img = tree.root.findByType(Image);
    const flat = Array.isArray(img.props.style) ? Object.assign({}, ...img.props.style) : img.props.style;
    expect(flat.height).toBe(120);
  });
});
