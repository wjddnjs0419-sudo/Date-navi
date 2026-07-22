// lib/ratingFeedback.ts
import { Star, Smile, Meh, Frown, Angry } from 'lucide-react-native';
import { C } from '../constants/theme';

export type Rating = 1 | 2 | 3 | 4 | 5;

export const RATING_FEEDBACK_KEY: Record<Rating, 'bad' | 'meh' | 'okay' | 'good' | 'amazing'> = {
  1: 'bad',
  2: 'meh',
  3: 'okay',
  4: 'good',
  5: 'amazing',
};

export const RATING_FEEDBACK_ICON: Record<Rating, typeof Star> = {
  1: Angry,
  2: Frown,
  3: Meh,
  4: Smile,
  5: Star,
};

// 목업(09_review)의 emoji 5종을 lock의 파스텔 톤 패밀리로 재현한다.
export const RATING_FEEDBACK_TONE: Record<Rating, { fg: string; bg: string }> = {
  1: { fg: C.grayFg, bg: C.gray },
  2: { fg: C.lavenderFg, bg: C.lavender },
  3: { fg: C.mintFg, bg: C.mint },
  4: { fg: C.creamFg, bg: C.cream },
  5: { fg: C.danger, bg: C.pinkLight },
};

export function deriveWantAgain(rating: Rating): boolean {
  return rating >= 4;
}
