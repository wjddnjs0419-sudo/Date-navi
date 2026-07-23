import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { C } from '../constants/colors';

// iOS 네이티브 아이콘·스플래시는 app.json이 아니라 ios/ 안의 asset catalog 사본을 쓴다.
// 사본이 어긋나면 "앱 아이콘·네이티브 스플래시만 옛 로고"인 상태로 빌드되므로 동기화를 강제한다.
const ROOT = process.cwd();
const CATALOG = 'ios/DateNavi/Images.xcassets';

function bytes(rel: string): Buffer {
  return readFileSync(join(ROOT, rel));
}

// ios/는 gitignore 대상(prebuild 산출물)이라 클론 직후엔 없을 수 있다. 그럴 땐 검사 대상이 없다.
const nativeProjectExists = existsSync(join(ROOT, CATALOG));

(nativeProjectExists ? describe : describe.skip)('iOS native brand assets stay in sync with assets/', () => {
  it('app icon matches assets/icon.png', () => {
    expect(bytes(`${CATALOG}/AppIcon.appiconset/App-Icon-1024x1024@1x.png`))
      .toEqual(bytes('assets/icon.png'));
  });

  it.each(['image.png', 'image@2x.png', 'image@3x.png'])(
    'splash image %s matches assets/splash-icon.png',
    (file) => {
      expect(bytes(`${CATALOG}/SplashScreenLegacy.imageset/${file}`))
        .toEqual(bytes('assets/splash-icon.png'));
    },
  );

  // 배경색이 app.json과 앱 테마 두 곳에 적혀 있어 어긋나면 전환 순간 색이 튄다.
  it('app.json splash background equals the app background token', () => {
    const fromConfig = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8'))
      .expo.splash.backgroundColor as string;
    expect(fromConfig.toUpperCase()).toBe(C.bg.toUpperCase());
  });

  it('splash background color matches app.json splash backgroundColor', () => {
    const expected = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8'))
      .expo.splash.backgroundColor as string;
    const components = JSON.parse(
      readFileSync(join(ROOT, `${CATALOG}/SplashScreenBackground.colorset/Contents.json`), 'utf8'),
    ).colors[0].color.components as Record<string, string>;

    const channel = (value: string) =>
      Math.round(parseFloat(value) * 255).toString(16).padStart(2, '0').toUpperCase();

    expect(`#${channel(components.red)}${channel(components.green)}${channel(components.blue)}`)
      .toBe(expected.toUpperCase());
  });
});
