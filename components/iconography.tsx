import Svg, { Circle, Line, Path, Polygon, Rect } from 'react-native-svg';
import type { ReactElement } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import iconNodesJson from '../assets/icons/app-icon-nodes.json';
import { C } from '../constants/theme';

/**
 * One app-facing icon contract backed by the frozen local SVG node catalog.
 * Screens never import an icon library directly, so the production shapes stay
 * aligned with the reviewed Figma inventory.
 */
export type AppIconProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
  fill?: string;
  style?: StyleProp<ViewStyle>;
};

export type IconComponent = (props: AppIconProps) => ReactElement;
export type LucideIcon = IconComponent;

export type AppIconName =
  | 'angry'
  | 'bike'
  | 'bell'
  | 'bellOff'
  | 'bookmark'
  | 'calendar'
  | 'calendarClock'
  | 'calendarDays'
  | 'calendarHeart'
  | 'camera'
  | 'car'
  | 'check'
  | 'chevronDown'
  | 'chevronLeft'
  | 'chevronRight'
  | 'chevronUp'
  | 'clock'
  | 'clock3'
  | 'coffee'
  | 'flame'
  | 'walk'
  | 'footprints'
  | 'frown'
  | 'fileText'
  | 'gift'
  | 'globe'
  | 'heart'
  | 'helpCircle'
  | 'home'
  | 'image'
  | 'info'
  | 'locateFixed'
  | 'lock'
  | 'laugh'
  | 'mail'
  | 'map'
  | 'mapPin'
  | 'meh'
  | 'messageCircle'
  | 'moon'
  | 'moonStar'
  | 'moreVertical'
  | 'navigation'
  | 'palette'
  | 'partyPopper'
  | 'pencil'
  | 'plane'
  | 'plus'
  | 'refreshCw'
  | 'rotateCcw'
  | 'rotateCw'
  | 'search'
  | 'send'
  | 'settings'
  | 'shield'
  | 'shieldCheck'
  | 'share2'
  | 'shoppingBag'
  | 'signpost'
  | 'sofa'
  | 'smile'
  | 'sparkles'
  | 'star'
  | 'trash2'
  | 'trees'
  | 'triangleAlert'
  | 'unlock'
  | 'user'
  | 'users'
  | 'utensils'
  | 'wallet'
  | 'wine'
  | 'x'
  | 'xCircle'
  | 'zap'
  | 'route';

export const APP_ICON_NAMES: readonly AppIconName[] = [
  'angry', 'bike', 'bell', 'bellOff', 'bookmark', 'calendar', 'calendarClock', 'calendarDays', 'calendarHeart', 'camera', 'car', 'check',
  'chevronDown', 'chevronLeft', 'chevronRight', 'chevronUp', 'clock', 'clock3', 'coffee',
  'flame', 'walk', 'footprints', 'frown', 'fileText', 'gift', 'globe', 'heart', 'helpCircle', 'home', 'image', 'info', 'locateFixed',
  'lock', 'laugh', 'mail', 'map', 'mapPin', 'meh', 'messageCircle', 'moon', 'moonStar', 'moreVertical', 'navigation',
  'palette', 'partyPopper', 'pencil', 'plane', 'plus', 'refreshCw', 'rotateCcw', 'rotateCw', 'search', 'send',
  'settings', 'share2', 'shield', 'shieldCheck', 'shoppingBag', 'signpost', 'sofa', 'smile', 'sparkles', 'star', 'trash2', 'trees',
  'triangleAlert', 'unlock', 'user', 'users', 'utensils', 'wallet', 'wine', 'x', 'xCircle', 'zap', 'route',
];

type SvgNodeName = 'circle' | 'line' | 'path' | 'polygon' | 'rect';
type SvgNode = readonly [SvgNodeName, Readonly<Record<string, string>>];
const ICON_NODES = iconNodesJson as unknown as Record<Exclude<AppIconName, 'route'>, readonly SvgNode[]>;

function renderSvgNode([name, rawProps]: SvgNode, index: number, color: string) {
  const props = {
    ...rawProps,
    fill: rawProps.fill === 'currentColor' ? color : rawProps.fill,
  };
  const key = `${name}-${index}`;
  switch (name) {
    case 'circle': return <Circle key={key} {...props} />;
    case 'line': return <Line key={key} {...props} />;
    case 'polygon': return <Polygon key={key} {...props} />;
    case 'rect': return <Rect key={key} {...props} />;
    default: return <Path key={key} {...props} />;
  }
}

/** Product Route icon path, stored as the canonical 18pt app asset. */
function RouteIcon({ size = 20, color = C.textSub, strokeWidth = 1.5, ...rest }: AppIconProps) {
  return (
    <Svg {...rest} width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Path
        d="M4.5 16.5C5.74264 16.5 6.75 15.4926 6.75 14.25C6.75 13.0074 5.74264 12 4.5 12C3.25736 12 2.25 13.0074 2.25 14.25C2.25 15.4926 3.25736 16.5 4.5 16.5Z"
        stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      />
      <Path
        d="M6.75 14.25H13.125C13.8212 14.25 14.4889 13.9734 14.9812 13.4812C15.4734 12.9889 15.75 12.3212 15.75 11.625C15.75 10.9288 15.4734 10.2611 14.9812 9.76884C14.4889 9.27656 13.8212 9 13.125 9H4.875C4.17881 9 3.51113 8.72344 3.01884 8.23116C2.52656 7.73887 2.25 7.07119 2.25 6.375C2.25 5.67881 2.52656 5.01113 3.01884 4.51884C3.51113 4.02656 4.17881 3.75 4.875 3.75H11.25"
        stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      />
      <Path
        d="M13.5 6C14.7426 6 15.75 4.99264 15.75 3.75C15.75 2.50736 14.7426 1.5 13.5 1.5C12.2574 1.5 11.25 2.50736 11.25 3.75C11.25 4.99264 12.2574 6 13.5 6Z"
        stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

export function AppIcon({ name, size = 20, color = C.textSub, strokeWidth = 1.5, fill = 'none', style }: AppIconProps & { name: AppIconName }) {
  if (name === 'route') return <RouteIcon size={size} color={color} strokeWidth={strokeWidth} fill={fill} style={style} />;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      {ICON_NODES[name].map((node, index) => renderSvgNode(node, index, color))}
    </Svg>
  );
}

function createIcon(name: Exclude<AppIconName, 'route'>): IconComponent {
  return (props) => <AppIcon name={name} {...props} />;
}

// Compatibility exports for feature modules. New screens should prefer AppIcon
// with a registry name so the source inventory stays explicit.
export const Angry = createIcon('angry');
export const Bike = createIcon('bike');
export const Bell = createIcon('bell');
export const BellOff = createIcon('bellOff');
export const Bookmark = createIcon('bookmark');
export const Calendar = createIcon('calendar');
export const CalendarClock = createIcon('calendarClock');
export const CalendarDays = createIcon('calendarDays');
export const CalendarHeart = createIcon('calendarHeart');
export const Camera = createIcon('camera');
export const Car = createIcon('car');
export const Check = createIcon('check');
export const ChevronDown = createIcon('chevronDown');
export const ChevronLeft = createIcon('chevronLeft');
export const ChevronRight = createIcon('chevronRight');
export const ChevronUp = createIcon('chevronUp');
export const Clock = createIcon('clock');
export const Clock3 = createIcon('clock3');
export const Coffee = createIcon('coffee');
export const Flame = createIcon('flame');
export const Footprints = createIcon('footprints');
export const Frown = createIcon('frown');
export const FileText = createIcon('fileText');
export const Gift = createIcon('gift');
export const Globe = createIcon('globe');
export const Heart = createIcon('heart');
export const HelpCircle = createIcon('helpCircle');
export const Home = createIcon('home');
export const Image = createIcon('image');
export const Info = createIcon('info');
export const LocateFixed = createIcon('locateFixed');
export const Lock = createIcon('lock');
export const Laugh = createIcon('laugh');
export const Mail = createIcon('mail');
export const Map = createIcon('map');
export const MapPin = createIcon('mapPin');
export const Meh = createIcon('meh');
export const MessageCircle = createIcon('messageCircle');
export const Moon = createIcon('moon');
export const MoonStar = createIcon('moonStar');
export const MoreVertical = createIcon('moreVertical');
export const Navigation = createIcon('navigation');
export const Palette = createIcon('palette');
export const PartyPopper = createIcon('partyPopper');
export const Pencil = createIcon('pencil');
export const Plane = createIcon('plane');
export const Plus = createIcon('plus');
export const RefreshCw = createIcon('refreshCw');
export const RotateCcw = createIcon('rotateCcw');
export const RotateCw = createIcon('rotateCw');
export const Search = createIcon('search');
export const Send = createIcon('send');
export const Settings = createIcon('settings');
export const Shield = createIcon('shield');
export const ShieldCheck = createIcon('shieldCheck');
export const Share2 = createIcon('share2');
export const ShoppingBag = createIcon('shoppingBag');
export const Signpost = createIcon('signpost');
export const Sofa = createIcon('sofa');
export const Smile = createIcon('smile');
export const Sparkles = createIcon('sparkles');
export const Star = createIcon('star');
export const Trash2 = createIcon('trash2');
export const Trees = createIcon('trees');
export const TriangleAlert = createIcon('triangleAlert');
export const Unlock = createIcon('unlock');
export const User = createIcon('user');
export const Users = createIcon('users');
export const Utensils = createIcon('utensils');
export const Wallet = createIcon('wallet');
export const Wine = createIcon('wine');
export const X = createIcon('x');
export const XCircle = createIcon('xCircle');
export const Zap = createIcon('zap');
export const Route = (props: AppIconProps) => <AppIcon name="route" {...props} />;
