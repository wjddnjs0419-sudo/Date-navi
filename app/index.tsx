import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { useRef, useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { C, SP } from '../constants/theme';
import { useI18n } from '../lib/i18n';
import { Illustration } from '../components/illustration';

export default function Index() {
  const { t } = useI18n();
  const scale = useRef(new Animated.Value(0.85)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    // 네이티브 스플래시를 숨기고 JS 스플래시를 보여줌
    SplashScreen.hideAsync();

    Animated.parallel([
      Animated.timing(scale, {
        toValue: 1, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1, duration: 700, useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <View style={s.container}>
      <View style={s.center}>
        <Animated.View style={{ transform: [{ scale }, { translateY }], opacity }}>
          <Illustration name="brand-pin-logo" width={200} />
        </Animated.View>
        <Animated.View style={[s.titleBlock, { opacity }]}>
          <Text style={s.appName}>Date Navi</Text>
          <Text style={s.tagline}>{t('splash.tagline')}</Text>
        </Animated.View>
      </View>
      <View style={s.bottom}>
        <View style={s.dots}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[s.dot, { opacity: 0.3 + i * 0.25 }]} />
          ))}
        </View>
        <Text style={s.loadingText}>{t('splash.loading')}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 56,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  titleBlock: { marginTop: SP.lg, alignItems: 'center' },
  appName: { fontSize: 30, fontWeight: '800', color: C.text, textAlign: 'center', letterSpacing: -0.6 },
  tagline: { fontSize: 13, color: C.textSub, textAlign: 'center', marginTop: SP.sm },
  bottom: { alignItems: 'center', gap: 6 },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.pink },
  loadingText: { fontSize: 11, color: C.textMuted },
});
