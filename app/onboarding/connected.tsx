import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, AccessibilityInfo } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { C } from '../../constants/colors';
import { SP } from '../../constants/theme';
import { BigButton } from '../../components/ui';
import { Illustration } from '../../components/illustration';
import { useI18n } from '../../lib/i18n';

// 연결 성공 화면. 커플 체크 마스코트 일러스트가 살짝 커지며 나타난다.
// useNativeDriver:false — 테스트 환경(react-test-renderer)의 NativeAnimated 크래시 회피.
function SuccessMascot() {
  const scale = useRef(new Animated.Value(0.7)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((on) => { if (mounted) setReduceMotion(on); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      scale.setValue(1);
      opacity.setValue(1);
      return;
    }
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: false, tension: 60, friction: 7 }),
      Animated.timing(opacity, { toValue: 1, duration: 320, useNativeDriver: false }),
    ]).start();
  }, [scale, opacity, reduceMotion]);

  return (
    <Animated.View style={[anim.wrap, { opacity, transform: [{ scale }] }]}>
      <Illustration name="mascot-heart-couple-check" width={260} />
    </Animated.View>
  );
}

export default function CoupleConnectedScreen() {
  const router = useRouter();
  const { t } = useI18n();
  return (
    <View style={s.root}>
      <Illustration name="bg-park" resizeMode="cover" height={340} style={s.bgPark} />
      <SafeAreaView style={s.safe}>
        <View style={s.container}>
          <View style={s.content}>
            <SuccessMascot />
            <Text style={s.heading}>{t('onboarding.connected.heading')}</Text>
            <Text style={s.sub}>{t('onboarding.connected.subtitle')}</Text>
          </View>

          <View style={s.footer}>
            <BigButton onPress={() => router.replace('/onboarding/preferences' as any)}>
              {t('onboarding.connected.ctaText')}
            </BigButton>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const anim = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', marginBottom: SP.xl },
});

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bgSplash },
  safe: { flex: 1 },
  bgPark: {
    // root(SafeAreaView 밖)에 그려서 홈 인디케이터 영역까지 완전히 붙게 한다 —
    // SafeAreaView 안에 있으면 bottom:0이 세이프에어리어 안쪽에서 끊겨 틈이 생긴다.
    // height를 고정하고 resizeMode="cover"를 써서 aspectRatio 계산에 기대지 않고
    // 무조건 이 박스를 꽉 채운다 — 그래야 버튼 아래 진짜 화면 끝까지 빈틈이 안 생긴다.
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  container: { flex: 1, paddingHorizontal: 24, paddingBottom: 24 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 29, textAlign: 'center', marginTop: 8 },
  sub: { fontSize: 13, color: C.textSub, lineHeight: 20, textAlign: 'center', marginTop: 12 },
  footer: {},
});
