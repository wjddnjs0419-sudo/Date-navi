import React from 'react';
import { Text } from 'react-native';

let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));
jest.mock('../lib/i18n', () => ({
  useI18n: () => ({ t: (k: string) => k }),
}));

import PlaceDetailScreen from '../app/mode-flow/place-detail';

const TR = require('react-test-renderer') as {
  create: (el: React.ReactElement) => {
    root: { findAllByType: (t: unknown) => { props: any }[] };
    unmount: () => void;
  };
  act: (cb: () => void) => void;
};

const textOf = (tree: ReturnType<typeof TR.create>) =>
  tree.root.findAllByType(Text).map((n: any) => n.props.children).flat().join(' ');

describe('PlaceDetailScreen', () => {
  it('renders the place name and both external-link actions', () => {
    mockParams = { name: '성수 감성 카페', address: '서울 성동구', kakaoPlaceId: '123', mapUrl: 'http://k' };
    let tree!: ReturnType<typeof TR.create>;
    TR.act(() => { tree = TR.create(<PlaceDetailScreen />); });
    const txt = textOf(tree);
    expect(txt).toContain('성수 감성 카페');
    expect(txt).toContain('modeFlow.courseResult.naverReviews');
    expect(txt).toContain('modeFlow.courseResult.kakaoMap');
    TR.act(() => { tree.unmount(); });
  });

  it('shows the load error when required params are missing', () => {
    mockParams = { name: '', kakaoPlaceId: '' };
    let tree!: ReturnType<typeof TR.create>;
    TR.act(() => { tree = TR.create(<PlaceDetailScreen />); });
    expect(textOf(tree)).toContain('modeFlow.courseResult.loadError');
    TR.act(() => { tree.unmount(); });
  });
});
