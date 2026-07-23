import {
  isCoupleRowLinked,
  resolveCoupleConnectDestination,
} from '../lib/couple-invite';

describe('isCoupleRowLinked', () => {
  it('파트너가 연결되고 status가 linked면 true', () => {
    expect(isCoupleRowLinked({ status: 'linked', partner_user_id: 'partner-1' })).toBe(true);
  });

  it('status가 waiting이면 파트너 유무와 상관없이 false', () => {
    expect(isCoupleRowLinked({ status: 'waiting', partner_user_id: null })).toBe(false);
  });

  it('status는 linked인데 partner_user_id가 없으면 false', () => {
    expect(isCoupleRowLinked({ status: 'linked', partner_user_id: null })).toBe(false);
  });

  it('row 자체가 없으면(null) false', () => {
    expect(isCoupleRowLinked(null)).toBe(false);
  });
});

describe('resolveCoupleConnectDestination', () => {
  it('온보딩 중 + linked + 파트너 있으면 connected로 이동', () => {
    expect(resolveCoupleConnectDestination({
      status: 'linked', partnerUserId: 'partner-1', onboardingCompleted: false,
    })).toBe('connected');
  });

  it('온보딩 완료 유저는 linked여도 이동하지 않음(null)', () => {
    expect(resolveCoupleConnectDestination({
      status: 'linked', partnerUserId: 'partner-1', onboardingCompleted: true,
    })).toBeNull();
  });

  it('linked인데 partnerUserId가 없으면 이동하지 않음(null)', () => {
    expect(resolveCoupleConnectDestination({
      status: 'linked', partnerUserId: null, onboardingCompleted: false,
    })).toBeNull();
  });

  it('waiting 상태면 이동하지 않음(null)', () => {
    expect(resolveCoupleConnectDestination({
      status: 'waiting', partnerUserId: null, onboardingCompleted: false,
    })).toBeNull();
  });

  it('none 상태면 이동하지 않음(null)', () => {
    expect(resolveCoupleConnectDestination({
      status: 'none', partnerUserId: null, onboardingCompleted: false,
    })).toBeNull();
  });
});
