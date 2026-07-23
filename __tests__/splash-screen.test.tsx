import React from 'react';
import { Dimensions, Image, Text } from 'react-native';

const calls: string[] = [];
const mockHideAsync = jest.fn((..._args: unknown[]) => { calls.push('hide'); return Promise.resolve(); });
const mockSetOptions = jest.fn((..._args: unknown[]) => { calls.push('setOptions'); });
jest.mock('expo-splash-screen', () => ({
  hideAsync: (...args: unknown[]) => mockHideAsync(...args),
  setOptions: (...args: unknown[]) => mockSetOptions(...args),
}));

jest.mock('../lib/i18n', () => ({
  useI18n: () => ({ language: 'ko', t: (key: string) => key }),
}));

type TestNode = { props: Record<string, any>; type: unknown };
type TestRendererInstance = {
  root: {
    findByProps: (props: Record<string, unknown>) => TestNode;
    findByType: (type: unknown) => TestNode;
  };
};
const TestRenderer = require('react-test-renderer') as {
  act: (callback: () => void | Promise<void>) => void | Promise<void>;
  create: (element: React.ReactElement) => TestRendererInstance;
};
const { act, create } = TestRenderer;
const SplashScreen = require('../app/index').default as React.ComponentType;

function render(): TestRendererInstance {
  let renderer!: TestRendererInstance;
  act(() => { renderer = create(<SplashScreen />); });
  return renderer;
}

describe('splash screen matches UI RENEW mockup', () => {
  // 네이티브 스플래시와 이음매를 없애려면 같은 이미지를, 같은 좌표에, 같은 크기로 그려야 한다.
  it('renders the same mark asset the native splash uses', () => {
    const renderer = render();
    const mark = renderer.root.findByProps({ testID: 'splash-mark' });
    expect(mark.type).toBe(Image);
    expect(mark.props.source).toBe(require('../assets/splash-icon.png'));
    expect(mark.props.resizeMode).toBe('contain');
  });

  it('positions the mark exactly where the native splash contain-fits it', () => {
    const { width, height } = Dimensions.get('window');
    const renderer = render();
    const style = renderer.root.findByProps({ testID: 'splash-mark' }).props.style;
    const flat = Array.isArray(style) ? Object.assign({}, ...style) : style;

    expect(flat).toMatchObject({
      position: 'absolute',
      left: (width - Math.min(width, height)) / 2,
      top: (height - Math.min(width, height)) / 2,
      width: Math.min(width, height),
      height: Math.min(width, height),
    });
  });

  it('renders the "Date Navi" title', () => {
    const renderer = render();
    const title = renderer.root.findByProps({ children: 'Date Navi' });
    expect(title.type).toBe(Text);
  });

  it('renders the tagline and loading copy', () => {
    const renderer = render();
    expect(renderer.root.findByProps({ children: 'splash.tagline' }).type).toBe(Text);
    expect(renderer.root.findByProps({ children: 'splash.loading' }).type).toBe(Text);
  });

  it('still hides the native splash screen on mount', () => {
    render();
    expect(mockHideAsync).toHaveBeenCalled();
  });

  // 네이티브 UIImageView와 RN Image는 합성 경로가 달라 같은 색이라도 미세한 톤 차이가 남는다.
  // 하드컷이면 그게 "화면이 바뀌었다"로 보이므로 크로스페이드로 넘긴다.
  it('cross-fades the native splash out instead of cutting to the JS screen', () => {
    calls.length = 0;
    render();

    expect(mockSetOptions).toHaveBeenCalledWith(expect.objectContaining({ fade: true }));
    expect(calls.indexOf('setOptions')).toBeLessThan(calls.indexOf('hide'));
  });
});
