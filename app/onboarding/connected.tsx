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
      <Illustration name="mascot-heart-couple-check" width={200} />
    </Animated.View>
  );
}

export default function CoupleConnectedScreen() {
  const router = useRouter();
  const { t } = useI18n();
  return (
    <SafeAreaView style={s.safe}>
      <Illustration name="bg-park" style={s.bgPark} />
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
  );
}

const anim = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', marginBottom: SP.xl },
});

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bgSplash },
  bgPark: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
  },
  container: { flex: 1, paddingHorizontal: 24, paddingBottom: 24 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 29, textAlign: 'center', marginTop: 8 },
  sub: { fontSize: 13, color: C.textSub, lineHeight: 20, textAlign: 'center', marginTop: 12 },
  footer: {},
});
