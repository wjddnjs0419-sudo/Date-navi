import { StyleSheet } from 'react-native';
import { C, DS } from './colors';

export { C, DS } from './colors';

// 간격 스케일. 새 스타일을 쓸 때 이 값을 우선 사용한다.
export const SP = {
  micro: DS.spacing.micro,
  xs: DS.spacing.xs,
  sm: DS.spacing.sm,
  md: DS.spacing.md,
  lg: DS.spacing.lg,
  screen: DS.spacing.screen,
  xl: DS.spacing.xl,
  xxl: DS.spacing.xxl,
  section: DS.spacing.section,
  xxxl: DS.spacing.xxxl,
  hero: DS.spacing.hero,
  art: DS.spacing.art,
  splash: DS.spacing.splash,
  tab: DS.spacing.tab,
  touch: DS.spacing.touch,
  input: DS.spacing.input,
  multilineInput: DS.spacing.multilineInput,
} as const;

// 모서리 반경 스케일. 기존 화면에서 실제 쓰이는 값만 담는다.
export const R = {
  badge: DS.radius.badge,
  sm: DS.radius.small,
  md: DS.radius.legacyInput,
  lg: DS.radius.input,
  btn: DS.radius.button,
  xl: DS.radius.chip,
  card: DS.radius.card,
  hero: DS.radius.modal,
  input: DS.radius.input,
  button: DS.radius.button,
  chip: DS.radius.chip,
  modal: DS.radius.modal,
  full: DS.radius.full,
} as const;

// 화면 전반에서 반복되는 타이포그래피 프리셋.
export const T = StyleSheet.create({
  display: { ...DS.typography.display, color: C.text },
  inputTitle: { ...DS.typography.inputTitle, color: C.text },
  heading: { ...DS.typography.heading, color: C.text },
  sectionTitle: { ...DS.typography.sectionTitle, color: C.text },
  cardTitle: { ...DS.typography.cardTitle, color: C.text },
  bodyLarge: { ...DS.typography.bodyLarge, color: C.text },
  body: { ...DS.typography.body, color: C.text },
  bodyCompact: { ...DS.typography.bodyCompact, color: C.text },
  bodySmall: { ...DS.typography.bodySmall, color: C.text },
  caption: { ...DS.typography.caption, color: C.textSub },
  button: { ...DS.typography.button, color: C.white },
  buttonCompact: { ...DS.typography.buttonCompact, color: C.white },
  h1: { ...DS.typography.headingLegacy, color: C.text },
  sub: { ...DS.typography.bodyCompact, color: C.textSub },
});

// 전역 레이아웃 프리셋.
export const G = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
});
