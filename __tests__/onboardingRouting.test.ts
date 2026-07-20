import { resolveOnboardingDestination } from '../lib/onboarding-routing';

const base = {
  hasSession: true,
  displayName: '지원',
  linked: false,
  pendingCode: null,
  onboardingCompleted: true,
};

describe('resolveOnboardingDestination', () => {
  it('세션이 없으면 인증 화면으로', () => {
    expect(resolveOnboardingDestination({ ...base, hasSession: false })).toBe('/(auth)');
  });

  it('닉네임(display_name)이 없으면 온보딩 닉네임 화면으로', () => {
    expect(resolveOnboardingDestination({ ...base, displayName: null })).toBe('/onboarding/nickname');
  });

  it('닉네임만 하고 이탈한 뒤 재진입하면 preferences로 (커플 강제 안 함)', () => {
    expect(
      resolveOnboardingDestination({ ...base, onboardingCompleted: false }),
    ).toBe('/onboarding/preferences');
  });

  it('"나중에"로 솔로 온보딩 완료한 사용자는 tabs로 (couple-connect로 안 튕김)', () => {
    expect(
      resolveOnboardingDestination({ ...base, linked: false, onboardingCompleted: true }),
    ).toBe('/(tabs)');
  });

  it('커플 연결 완료 + 온보딩 완료면 tabs로', () => {
    expect(
      resolveOnboardingDestination({ ...base, linked: true, onboardingCompleted: true }),
    ).toBe('/(tabs)');
  });

  it('딥링크 초대 코드가 있고 아직 미연결이면 코드 포함 couple-connect로', () => {
    expect(
      resolveOnboardingDestination({ ...base, linked: false, pendingCode: 'DN-AB12' }),
    ).toBe('/onboarding/couple-connect?code=DN-AB12');
  });

  it('초대 코드가 있어도 이미 연결된 사용자면 무시하고 tabs로', () => {
    expect(
      resolveOnboardingDestination({ ...base, linked: true, pendingCode: 'DN-AB12' }),
    ).toBe('/(tabs)');
  });

  it('초대 코드는 URL 인코딩된다', () => {
    expect(
      resolveOnboardingDestination({ ...base, linked: false, pendingCode: 'DN-AB 12' }),
    ).toBe('/onboarding/couple-connect?code=DN-AB%2012');
  });
});
