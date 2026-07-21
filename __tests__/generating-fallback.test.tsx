import React from 'react';
import { Text } from 'react-native';

// generating.tsx pulls expo-router at module load; mock it so the module imports.
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

import { GeneratingFallback } from '../app/mode-flow/generating';
import { Illustration } from '../components/illustration';

const TR = require('react-test-renderer') as {
  create: (el: React.ReactElement) => {
    root: { findAllByType: (t: unknown) => { props: any }[] };
    unmount: () => void;
  };
  act: (cb: () => void) => void;
};

describe('GeneratingFallback', () => {
  it('renders the mascot illustration, heading, message, and primary action', () => {
    let tree!: ReturnType<typeof TR.create>;
    TR.act(() => {
      tree = TR.create(
        <GeneratingFallback
          heading="다시 시도해볼까요?"
          message="추천을 불러오지 못했어요"
          primaryLabel="다시 시도"
          onPrimary={() => {}}
        />,
      );
    });
    const illus = tree.root.findAllByType(Illustration);
    expect(illus.some((n: any) => n.props.name === 'mascot-heart-single')).toBe(true);
    const txt = tree.root.findAllByType(Text).map((n: any) => n.props.children).flat().join(' ');
    expect(txt).toContain('다시 시도해볼까요?');
    expect(txt).toContain('추천을 불러오지 못했어요');
    expect(txt).toContain('다시 시도');
    TR.act(() => { tree.unmount(); });
  });

  it('renders a secondary action only when provided', () => {
    let withSecondary!: ReturnType<typeof TR.create>;
    TR.act(() => {
      withSecondary = TR.create(
        <GeneratingFallback
          heading="h" message="m" primaryLabel="p" onPrimary={() => {}}
          secondaryLabel="수정하기" onSecondary={() => {}}
        />,
      );
    });
    const txt = withSecondary.root.findAllByType(Text).map((n: any) => n.props.children).flat().join(' ');
    expect(txt).toContain('수정하기');
    TR.act(() => { withSecondary.unmount(); });
  });
});
