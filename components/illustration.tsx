import { Image, type StyleProp, type ImageStyle, type ImageResizeMode } from 'react-native';

const SOURCES = {
  'date-course-map-horizontal': require('../assets/illustrations/date-course-map-horizontal.png'),
  'date-course-map-vertical': require('../assets/illustrations/date-course-map-vertical.png'),
  'home-map-book': require('../assets/illustrations/home-map-book.png'),
  'brand-pin-logo': require('../assets/illustrations/brand-pin-logo.png'),
  'mascot-heart-single': require('../assets/illustrations/mascot-heart-single.png'),
  'mascot-heart-couple': require('../assets/illustrations/mascot-heart-couple.png'),
  'mascot-heart-couple-check': require('../assets/illustrations/mascot-heart-couple-check.png'),
  'bg-park': require('../assets/illustrations/bg-park.png'),
  'mini-skyline-route': require('../assets/illustrations/mini-skyline-route.png'),
  'mini-park-bench': require('../assets/illustrations/mini-park-bench.png'),
  'mini-trees-heart': require('../assets/illustrations/mini-trees-heart.png'),
} as const;

export type IllustrationName = keyof typeof SOURCES;

// 헤딩 옆 미니 일러스트(mini-*)는 화면마다 원본 비율이 달라도 항상 이 너비로 통일한다.
export const MINI_ILLUSTRATION_WIDTH = 130;

export function Illustration({
  name, width, height, style, resizeMode = 'contain',
}: {
  name: IllustrationName;
  width?: number;
  height?: number;
  style?: StyleProp<ImageStyle>;
  resizeMode?: ImageResizeMode;
}) {
  const source = SOURCES[name];
  const meta = Image.resolveAssetSource(source);
  const ratio = meta && meta.height ? meta.width / meta.height : 1;
  const sizeStyle: ImageStyle =
    height != null ? { height, width: width ?? height * ratio }
    : width != null ? { width, height: width / ratio }
    : { width: '100%', aspectRatio: ratio };
  return (
    <Image
      source={source}
      accessible
      accessibilityRole="image"
      resizeMode={resizeMode}
      style={[sizeStyle, style]}
    />
  );
}
