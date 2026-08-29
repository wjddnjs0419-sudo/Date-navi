// 코스 장소별 등급 입력(B안): 만족도는 떨어진 칩 2개, 가격은 이어붙인 세그먼트 3칸.
// 두 줄의 성격(택1 의견 / 순서 있는 척도)이 라벨을 읽기 전에 형태로 구분되게 한다.
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { C, DS, SP } from '../constants/theme';
import { SoftCard } from './ui';
import { PRICE_LEVEL, type PriceLevel } from '../shared/recommendation/place-price';
import type { PlaceSatisfaction } from '../lib/placeReview';
import type { CoursePlace } from '../lib/usePlaceFeedback';

const PRICE_STEPS = [
  { level: PRICE_LEVEL.cheap, labelKey: 'priceCheap' },
  { level: PRICE_LEVEL.normal, labelKey: 'priceNormal' },
  { level: PRICE_LEVEL.expensive, labelKey: 'priceExpensive' },
] as const;

export type PlaceSectionStrings = {
  title: string;
  sub: string;
  satisfactionLabel: string;
  priceLabel: string;
  good: string;
  bad: string;
  priceCheap: string;
  priceNormal: string;
  priceExpensive: string;
  toggleHint: string;
};

export function PlaceFeedbackSection({
  places, satisfactions, prices, strings, onSatisfaction, onPrice,
}: {
  places: readonly CoursePlace[];
  satisfactions: Record<string, PlaceSatisfaction>;
  prices: Record<string, PriceLevel>;
  strings: PlaceSectionStrings;
  onSatisfaction: (stepId: string, tapped: PlaceSatisfaction) => void;
  onPrice: (stepId: string, level: PriceLevel) => void;
}) {
  if (places.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.title}>{strings.title}</Text>
      <Text style={styles.sub}>{strings.sub}</Text>
      {places.map((place) => (
        <SoftCard key={place.step_id} style={styles.card}>
          <Text style={styles.placeName} numberOfLines={1}>{place.place_name}</Text>

          <Text style={styles.rowLabel}>{strings.satisfactionLabel}</Text>
          <View style={styles.chipRow}>
            {(['good', 'bad'] as const).map((kind) => {
              const selected = satisfactions[place.step_id] === kind;
              return (
                <TouchableOpacity
                  key={kind}
                  testID={`place-${kind}-${place.step_id}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${place.place_name} ${strings[kind]}`}
                  accessibilityHint={strings.toggleHint}
                  onPress={() => onSatisfaction(place.step_id, kind)}
                  style={[styles.chip, selected && styles.chipOn]}
                  activeOpacity={0.88}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextOn]}>{strings[kind]}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.rowLabel}>{strings.priceLabel}</Text>
          <View style={styles.segment}>
            {PRICE_STEPS.map((step, index) => {
              const selected = prices[place.step_id] === step.level;
              return (
                <TouchableOpacity
                  key={step.level}
                  testID={`place-price-${place.step_id}-${step.level}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${place.place_name} ${strings[step.labelKey]}`}
                  accessibilityHint={strings.toggleHint}
                  onPress={() => onPrice(place.step_id, step.level)}
                  style={[
                    styles.segmentCell,
                    index > 0 && styles.segmentDivider,
                    selected && styles.segmentCellOn,
                  ]}
                  activeOpacity={0.88}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextOn]}>
                    {strings[step.labelKey]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </SoftCard>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: SP.xxl },
  title: { ...DS.typography.bodyCompact, fontWeight: '600', color: C.text },
  sub: { marginTop: SP.xs, marginBottom: SP.md, ...DS.typography.bodySmall, color: C.textSub },
  card: { marginBottom: SP.sm, gap: SP.xs },
  placeName: { ...DS.typography.body, fontWeight: '600', color: C.text, marginBottom: SP.xs },
  rowLabel: { ...DS.typography.bodySmall, fontWeight: '600', color: C.textSub, marginTop: SP.xs },

  chipRow: { flexDirection: 'row', gap: SP.sm },
  chip: {
    minHeight: 44,
    paddingHorizontal: SP.lg,
    justifyContent: 'center',
    borderRadius: DS.radius.button,
    borderWidth: 1,
    borderColor: C.borderLight,
    backgroundColor: C.bg,
  },
  chipOn: { backgroundColor: C.pinkMid, borderColor: C.pinkBorder },
  // 라벨은 항상 본문색 — brand deep를 파스텔 칩 위에 얹으면 대비가 낮아진다.
  // 4.5:1 바닥을 못 넘는다. 선택은 배경·보더·굵기로 표시한다.
  chipText: { ...DS.typography.bodyCompact, color: C.text },
  chipTextOn: { fontWeight: '700' },

  // 가격은 저렴↔비쌈 순서가 있는 척도다. 칸을 붙여 "한 줄에서 하나 고르는 눈금"으로 읽히게 한다.
  segment: {
    flexDirection: 'row',
    borderRadius: DS.radius.button,
    borderWidth: 1,
    borderColor: C.borderLight,
    backgroundColor: C.bg,
    overflow: 'hidden',
  },
  segmentCell: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  segmentDivider: { borderLeftWidth: 1, borderLeftColor: C.borderLight },
  segmentCellOn: { backgroundColor: C.pinkMid },
});
