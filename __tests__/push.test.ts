import { buildPushNavigationTarget } from '../lib/push';

describe('buildPushNavigationTarget', () => {
  it('new_card 타입이고 card_id 있으면 카드 상세로', () => {
    expect(buildPushNavigationTarget('new_card', { card_id: 'abc' })).toBe('/card/abc');
  });

  it('reaction 타입이고 card_id 있으면 카드 상세로', () => {
    expect(buildPushNavigationTarget('reaction', { card_id: 'xyz' })).toBe('/card/xyz');
  });

  it('soft_message 타입이면 알림함으로', () => {
    expect(buildPushNavigationTarget('soft_message', {})).toBe('/account/notifications');
  });

  it('new_card인데 card_id가 없으면 알림함으로 폴백', () => {
    expect(buildPushNavigationTarget('new_card', {})).toBe('/account/notifications');
  });
});
