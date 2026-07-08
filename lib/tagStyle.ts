import {
  Home, Trees, Heart, Wallet, Moon, PartyPopper, Camera, Coffee, ShieldCheck, MapPin, Sparkles,
} from 'lucide-react-native';
import { C } from '../constants/colors';

export type CardStyle = { Icon: typeof Sparkles; bg: string; fg: string };

type TagRule = { keywords: string[] } & CardStyle;

const RULES: TagRule[] = [
  { keywords: ['indoor', '실내'], Icon: Home, bg: C.gray, fg: C.grayFg },
  { keywords: ['outdoor', '야외'], Icon: Trees, bg: C.mint, fg: C.mintFg },
  { keywords: ['romantic', '로맨틱', 'cozy', '아늑'], Icon: Heart, bg: C.pinkLight, fg: C.pinkDeep },
  { keywords: ['cheap', '저예산', '돈 적게'], Icon: Wallet, bg: C.cream, fg: C.creamFg },
  { keywords: ['quiet', '조용'], Icon: Moon, bg: C.lavender, fg: C.lavenderFg },
  { keywords: ['fun', '재밌'], Icon: PartyPopper, bg: C.pinkLight, fg: C.pinkDeep },
  { keywords: ['photo', '사진'], Icon: Camera, bg: C.lavender, fg: C.lavenderFg },
  { keywords: ['tired', '피곤'], Icon: Coffee, bg: C.cream, fg: C.creamFg },
  { keywords: ['low risk', '실패 확률'], Icon: ShieldCheck, bg: C.mint, fg: C.mintFg },
  { keywords: ['low travel', '이동 적음', '가까운', '가벼운 이동'], Icon: MapPin, bg: C.gray, fg: C.grayFg },
];

const DEFAULT_STYLE: CardStyle = { Icon: Sparkles, bg: C.pinkLight, fg: C.pinkDeep };

export function getCardStyle(tags?: string[] | null): CardStyle {
  if (!tags) return DEFAULT_STYLE;
  for (const tag of tags) {
    const lower = tag.toLowerCase();
    const rule = RULES.find(r => r.keywords.some(kw => lower.includes(kw.toLowerCase())));
    if (rule) return { Icon: rule.Icon, bg: rule.bg, fg: rule.fg };
  }
  return DEFAULT_STYLE;
}
