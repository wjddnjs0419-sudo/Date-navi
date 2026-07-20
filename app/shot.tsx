import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { C } from '../constants/colors';
import { SuccessModal, GeneratingView } from '../components/ui';
import { PickerSheet } from '../components/pickers';
import { StepActionSheet } from '../components/recommendation/step-action-sheet';

/**
 * 스크린샷 dev 하네스 — 화면 전환 없이 여는(visible prop 기반) 모달들을 캡처하기 위한 라우트.
 * EXPO_PUBLIC_SCREENSHOT=1 이 아니면 아무것도 렌더하지 않아 프로덕션에는 무해하다.
 * 사용: datenavi:///shot?m=success | picker | stepaction
 */
export default function ShotHarness() {
  const { m } = useLocalSearchParams<{ m?: string }>();
  const screenshotMode = process.env.EXPO_PUBLIC_SCREENSHOT === '1';

  if (!screenshotMode) return null;

  if (m === 'generating') {
    return (
      <View style={s.bg}>
        <GeneratingView
          heading={'끌리는 데이트를\n찾고 있어요'}
          steps={['조건을 정리하고 있어요', '장소를 찾고 있어요', '코스를 다듬고 있어요']}
          step={1}
        />
      </View>
    );
  }

  return (
    <View style={s.bg}>
      <Text style={s.label}>모달 하네스: {m ?? '(m 파라미터 없음)'}</Text>

      <SuccessModal visible={m === 'success'} message="저장했어요!" onHide={() => {}} />

      <PickerSheet
        visible={m === 'picker'}
        title="분위기 선택"
        onCancel={() => {}}
        onConfirm={() => {}}
      >
        <View />
      </PickerSheet>

      <StepActionSheet
        visible={m === 'stepaction'}
        placeName="어니언 성수"
        locked={false}
        canDelete
        onLockToggle={() => {}}
        onReplace={() => {}}
        onDelete={() => {}}
        onClose={() => {}}
      />
    </View>
  );
}

const s = StyleSheet.create({
  bg: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  label: { color: C.textMuted, fontSize: 13 },
});
