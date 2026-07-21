import { Image, type StyleProp, type ImageStyle } from 'react-native';

const RATIO = 375 / 81;
const HEIGHTS = { sm: 24, lg: 44 } as const;

export function Wordmark({
  size = 'sm',
  style,
}: {
  size?: 'sm' | 'lg';
  style?: StyleProp<ImageStyle>;
}) {
  const height = HEIGHTS[size];
  return (
    <Image
      source={require('../assets/brand/wordmark.png')}
      accessibilityLabel="Date Navi"
      accessibilityRole="image"
      resizeMode="contain"
      style={[{ height, width: height * RATIO }, style]}
    />
  );
}
