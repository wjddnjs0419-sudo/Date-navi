export type PickedPlace = {
  kakaoPlaceId: string;
  name: string;
  address: string;
  longitude: number;
  latitude: number;
};

type Listener = (place: PickedPlace) => void;

let listeners: Listener[] = [];

export function subscribePickedPlace(fn: Listener): () => void {
  listeners = [...listeners, fn];
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

export function publishPickedPlace(place: PickedPlace): void {
  listeners.forEach((l) => l(place));
}
