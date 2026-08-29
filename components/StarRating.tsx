import { View, StyleSheet } from 'react-native';
import { Star } from './iconography';
import { C, DS } from '../constants/theme';

// 표시 전용 별점(1~5). 리뷰 화면의 편집용 별점과 동일한 핑크 톤을 쓴다.
export function StarRating({
  rating,
  size = 14,
  testID,
}: {
  rating: number;
  size?: number;
  testID?: string;
}) {
  return (
    <View
      style={styles.row}
      testID={testID}
      accessibilityRole="image"
      accessibilityLabel={`${rating}점`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          strokeWidth={1.8}
          color={C.pinkDeep}
          fill={n <= rating ? C.pinkDeep : 'transparent'}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: DS.component.ratingGap },
});
