import { buildPushNavigationTarget } from '../lib/push';

describe('buildPushNavigationTarget', () => {
  it('new_card(데이트 제안) 타입이면 알림함으로 (모달에서 문구 확인)', () => {
    expect(buildPushNavigationTarget('new_card', { card_id: 'abc' })).toBe('/account/notifications');
  });

  it('reaction 타입이고 card_id 있으면 카드 상세로', () => {
    expect(buildPushNavigationTarget('reaction', { card_id: 'xyz' })).toBe('/card/xyz');
  });

  it('soft_message(legacy) 타입이면 알림함으로', () => {
    expect(buildPushNavigationTarget('soft_message', {})).toBe('/account/notifications');
  });
});
