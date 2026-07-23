import { socialButtonHeight, socialButtonRadius } from '../lib/socialButtonMetrics';

describe('social login button metrics', () => {
  it('derives the button height from the official Kakao button aspect ratio', () => {
    // 카카오 공식 이미지 600×90 → 폭 342pt(=390-48)일 때 51pt.
    expect(socialButtonHeight(390)).toBe(51);
  });

  it('never goes below the 44pt minimum Apple requires for the Sign in with Apple button', () => {
    // 폭 320pt 화면이면 비율상 41pt가 나오지만, 44pt 미만은 허용되지 않는다.
    expect(socialButtonHeight(320)).toBe(44);
  });

  it('matches the corner radius baked into the Kakao button image', () => {
    // 이미지 실측 7px / 원본 높이 90px.
    expect(socialButtonRadius(51)).toBe(4);
    expect(socialButtonRadius(90)).toBe(7);
  });
});
