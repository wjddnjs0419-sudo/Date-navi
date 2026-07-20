import { subscribePickedPlace, publishPickedPlace, type PickedPlace } from '../lib/place-pick-bridge';

it('delivers a picked place to a subscriber and stops after unsubscribe', () => {
  const seen: PickedPlace[] = [];
  const unsub = subscribePickedPlace((p) => seen.push(p));
  publishPickedPlace({ kakaoPlaceId: 'k1', name: '블루보틀', address: '서울', longitude: 127, latitude: 37 });
  expect(seen).toHaveLength(1);
  unsub();
  publishPickedPlace({ kakaoPlaceId: 'k2', name: 'x', address: 'y', longitude: 127, latitude: 37 });
  expect(seen).toHaveLength(1);
});
