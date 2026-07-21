import React from 'react';
import { Wordmark } from '../components/brand';

type TestNode = { props: Record<string, any>; type: unknown };
type TestRendererInstance = {
  root: {
    findAll: (predicate: (node: TestNode) => boolean) => TestNode[];
  };
};
const TestRenderer = require('react-test-renderer') as {
  act: (callback: () => void | Promise<void>) => void | Promise<void>;
  create: (element: React.ReactElement) => TestRendererInstance;
};
const { act, create } = TestRenderer;

describe('Wordmark', () => {
  it('renders and is accessible as Date Navi', () => {
    let tree!: TestRendererInstance;
    act(() => { tree = create(<Wordmark />); });
    const match = tree.root.findAll(
      (n) => n.props?.accessibilityLabel === 'Date Navi',
    );
    expect(match.length).toBeGreaterThan(0);
  });

  it('supports a size variant without crashing', () => {
    let tree!: TestRendererInstance;
    act(() => { tree = create(<Wordmark size="lg" />); });
    expect(tree.root).toBeTruthy();
  });
});
