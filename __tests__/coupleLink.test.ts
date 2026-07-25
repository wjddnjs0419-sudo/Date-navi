import {
  INVITE_WEB_BASE,
  buildInviteUrl,
  isCoupleRowLinked,
  parseInviteCodeFromUrl,
  resolveCoupleConnectDestination,
} from '../lib/couple-invite';

describe('buildInviteUrl', () => {
  it('공개 웹 랜딩 https URL에 코드와 초대자 언어를 싣는다', () => {
    expect(buildInviteUrl('DN-8K2P', 'ko')).toBe(
      `${INVITE_WEB_BASE}/invite?code=DN-8K2P&l=ko`,
    );
  });

  it('코드를 정규화해서 담는다(소문자·공백·접두사 누락 허용)', () => {
    expect(buildInviteUrl('8k2p', 'en')).toBe(
      `${INVITE_WEB_BASE}/invite?code=DN-8K2P&l=en`,
    );
  });

  it('코드가 비면 빈 문자열', () => {
    expect(buildInviteUrl('', 'ko')).toBe('');
  });
});

describe('parseInviteCodeFromUrl (https 랜딩 링크도 파싱)', () => {
  it('웹 랜딩 https 링크에서 코드를 뽑는다', () => {
    expect(parseInviteCodeFromUrl('https://date-navi.vercel.app/invite?code=DN-8K2P&l=ko'))
      .toBe('DN-8K2P');
  });

  it('기존 커스텀 스킴 링크도 계속 파싱한다', () => {
    expect(parseInviteCodeFromUrl('datenavi://onboarding/couple-connect?code=DN-8K2P'))
      .toBe('DN-8K2P');
  });

  it('코드가 없으면 빈 문자열', () => {
    expect(parseInviteCodeFromUrl('https://date-navi.vercel.app/invite')).toBe('');
  });
});

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
