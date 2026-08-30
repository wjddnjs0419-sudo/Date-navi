import { createElement } from 'react';
import { useSegments } from 'expo-router';
import { logScreenView } from '../lib/analytics';
import { AnalyticsScreenTracker } from '../components/analytics/screen-tracker';

jest.mock('expo-router', () => ({
  useSegments: jest.fn(),
}));

jest.mock('../lib/analytics', () => ({
  logScreenView: jest.fn(() => Promise.resolve()),
}));

type TestRendererInstance = {
  update: (element: React.ReactElement) => void;
  unmount: () => void;
};

const TestRenderer = require('react-test-renderer') as {
  act: (callback: () => void) => void;
  create: (element: React.ReactElement) => TestRendererInstance;
};

const mockedUseSegments = useSegments as jest.MockedFunction<typeof useSegments>;
const mockedLogScreenView = logScreenView as jest.MockedFunction<typeof logScreenView>;

function mockRouteSegments(segments: readonly string[]) {
  mockedUseSegments.mockReturnValue(segments as unknown as ReturnType<typeof useSegments>);
}

describe('AnalyticsScreenTracker', () => {
  beforeEach(() => {
    mockedUseSegments.mockReset();
    mockedLogScreenView.mockReset();
    mockedLogScreenView.mockResolvedValue(undefined);
  });

  it('does not log duplicate screen views for a same-screen rerender', () => {
    mockRouteSegments(['(tabs)', 'index']);
    let renderer: TestRendererInstance;

    TestRenderer.act(() => {
      renderer = TestRenderer.create(createElement(AnalyticsScreenTracker));
    });
    TestRenderer.act(() => {
      renderer.update(createElement(AnalyticsScreenTracker));
    });

    expect(mockedLogScreenView).toHaveBeenCalledTimes(1);
    expect(mockedLogScreenView).toHaveBeenCalledWith('home');
    TestRenderer.act(() => {
      renderer!.unmount();
    });
  });

  it('logs a screen again after passing through an untracked route', () => {
    mockRouteSegments(['(tabs)', 'index']);
    let renderer: TestRendererInstance;

    TestRenderer.act(() => {
      renderer = TestRenderer.create(createElement(AnalyticsScreenTracker));
    });

    mockRouteSegments(['mode-flow', 'feeling']);
    TestRenderer.act(() => {
      renderer.update(createElement(AnalyticsScreenTracker));
    });

    mockRouteSegments(['(tabs)', 'index']);
    TestRenderer.act(() => {
      renderer.update(createElement(AnalyticsScreenTracker));
    });

    expect(mockedLogScreenView).toHaveBeenCalledTimes(2);
    expect(mockedLogScreenView).toHaveBeenNthCalledWith(1, 'home');
    expect(mockedLogScreenView).toHaveBeenNthCalledWith(2, 'home');
    TestRenderer.act(() => {
      renderer!.unmount();
    });
  });
});
