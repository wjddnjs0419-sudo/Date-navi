import { splashMarkLayout } from '../lib/splash-layout';

// 네이티브 스플래시(iOS SplashScreen.storyboard)는 정사각 이미지를 contain으로 깔기 때문에
// 화면 폭에 꽉 맞춘 정사각이 세로 정중앙에 놓인다. JS 스플래시가 그 위에 정확히
// 겹쳐 시작해야 전환 시 로고가 튀지 않는다.
describe('splashMarkLayout', () => {
  it('세로 화면에서 마크 정사각을 화면 폭에 맞추고 세로 중앙에 놓는다', () => {
    expect(splashMarkLayout({ width: 393, height: 852 })).toEqual({
      left: 0,
      top: (852 - 393) / 2,
      size: 393,
    });
  });

  it('가로가 더 긴 화면에서는 세로 길이에 맞춰 정사각이 잘리지 않게 한다', () => {
    expect(splashMarkLayout({ width: 1024, height: 768 })).toEqual({
      left: (1024 - 768) / 2,
      top: 0,
      size: 768,
    });
  });
});
