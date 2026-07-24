import { Flame, Smile, Meh, Clock } from 'lucide-react-native';
import { C } from '../constants/colors';

export type ReactionType = 'love' | 'like' | 'burden' | 'next_time';

export const REACTIONS: { type: ReactionType; color: string; bg: string }[] = [
  { type: 'love', color: C.danger, bg: C.pinkLight },
  { type: 'like', color: C.creamFg, bg: C.cream },
  { type: 'burden', color: C.coolGray, bg: C.gray },
  { type: 'next_time', color: C.lavenderFg, bg: C.lavender },
];

// 이모지 대신 아이콘 — 알림 본문처럼 텍스트뿐인 자리에서는 이모지를 그대로 쓴다.
export const REACTION_ICONS: Record<ReactionType, typeof Clock> = {
  love: Flame,
  like: Smile,
  burden: Meh,
  next_time: Clock,
};
