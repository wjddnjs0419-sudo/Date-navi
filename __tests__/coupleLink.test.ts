import { isCoupleRowLinked } from '../lib/couple-invite';

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
