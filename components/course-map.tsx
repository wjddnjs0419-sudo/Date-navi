import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Coffee, MapPin, Trees, Utensils, type LucideIcon } from 'lucide-react-native';
import { C, R, SP } from '../constants/theme';

export type CoursePinCategory = 'meal' | 'cafe' | 'walk' | 'generic';

// 카테고리 → 색상 / 아이콘 룩업 (작은 내부 매핑).
const CAT_COLOR: Record<CoursePinCategory, string> = {
  meal: C.catMeal,
  cafe: C.catCafe,
  walk: C.catWalk,
  generic: C.pink,
};

const CAT_ICON: Record<CoursePinCategory, LucideIcon> = {
  meal: Utensils,
  cafe: Coffee,
  walk: Trees,
  generic: MapPin,
};

const PIN_SIZE = 52;
const BADGE_SIZE = 22;
// 대시 트레일을 핀 원의 수직 중심에 맞추기 위한 오프셋.
const TRAIL_CENTER = PIN_SIZE / 2;

/**
 * 카테고리 색으로 채운 원형 핀. 안에 흰색 lucide 아이콘.
 */
export function CoursePin({
  category,
  size = PIN_SIZE,
}: {
  category: CoursePinCategory;
  size?: number;
}) {
  const Icon = CAT_ICON[category];
  return (
    <View
      style={[
        s.pin,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: CAT_COLOR[category] },
      ]}
    >
      <Icon size={size * 0.46} color={C.white} strokeWidth={2.2} />
    </View>
  );
}

/**
 * 카테고리 원형 핀 + 상단 번호 뱃지 (index + 1).
 */
export function StepPin({ category, index }: { category: CoursePinCategory; index: number }) {
  return (
    <View style={s.stepPin}>
      <CoursePin category={category} />
      <View style={s.badge}>
        <Text style={[s.badgeText, { color: CAT_COLOR[category] }]}>{index + 1}</Text>
      </View>
    </View>
  );
}

/**
 * 가로 3스텝 코스 미리보기: 각 스텝(번호 핀 + 라벨)을
 * 핑크 대시 트레일로 연결하고, 마지막에 핑크 목적지 핀으로 마무리한다.
 */
export function CourseMapPreview({
  steps,
}: {
  steps: { category: CoursePinCategory; label: string }[];
}) {
  return (
    <View style={s.wrap}>
      <View style={s.row}>
        {steps.map((step, i) => (
          <React.Fragment key={`${step.category}-${i}`}>
            <View style={s.col}>
              <StepPin category={step.category} index={i} />
              <Text style={s.label} numberOfLines={1}>
                {step.label}
              </Text>
            </View>
            <View style={s.trail} />
          </React.Fragment>
        ))}
        <View style={s.destCol}>
          <MapPin size={40} color={C.white} fill={C.pink} strokeWidth={2} />
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  col: {
    alignItems: 'center',
  },
  pin: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 5,
    elevation: 3,
  },
  stepPin: {
    // 뱃지를 원 상단에 겹치기 위한 relative 컨테이너. 뱃지는 absolute라 레이아웃 높이에 영향 없음.
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -BADGE_SIZE / 3,
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  label: {
    marginTop: SP.sm,
    fontSize: 13,
    fontWeight: '600',
    color: C.text,
  },
  trail: {
    flex: 1,
    marginTop: TRAIL_CENTER - 1,
    marginHorizontal: SP.xs,
    borderTopWidth: 2,
    borderStyle: 'dashed',
    borderColor: C.pink,
    borderRadius: R.badge,
  },
  destCol: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: TRAIL_CENTER - 20,
  },
});
