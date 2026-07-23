import { View, Text, StyleSheet, Animated, Easing, Image, useWindowDimensions } from 'react-native';
import { useRef, useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { C, SP } from '../constants/theme';
import { useI18n } from '../lib/i18n';
import { splashMarkLayout } from '../lib/splash-layout';

const MARK = require('../assets/splash-icon.png');

// splash-icon.png 안에서 마크가 차지하는 세로 비율(build_assets.py의 SPLASH_MARK_RATIO 기준).
// 마크 바로 아래에 타이틀을 붙이기 위한 값.
const MARK_BOTTOM_RATIO = 0.81;

export default function Index() {
  const { t } = useI18n();
  const { width, height } = useWindowDimensions();
  const mark = splashMarkLayout({ width, height });
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 네이티브 스플래시를 숨기고 JS 스플래시를 보여줌.
    // 마크는 네이티브와 같은 위치·크기라 그대로 두고, 텍스트만 얹히듯 나타난다.
    SplashScreen.hideAsync();

    Animated.timing(opacity, {
      toValue: 1, duration: 500, easing: Easing.out(Easing.quad), useNativeDriver: true,
    }).start();
  }, []);

  return (
    <View style={s.container}>
      <Image
        testID="splash-mark"
        source={MARK}
        resizeMode="contain"
        accessible
        accessibilityRole="image"
        accessibilityLabel="Date Navi"
        style={{ position: 'absolute', left: mark.left, top: mark.top, width: mark.size, height: mark.size }}
      />
      {/* 위치는 일반 View가 잡는다. useNativeDriver는 opacity/transform만 다룰 수 있다. */}
      <View style={[s.titleBlock, { top: mark.top + mark.size * MARK_BOTTOM_RATIO }]}>
        <Animated.View style={{ opacity, alignItems: 'center' }}>
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
    justifyContent: 'flex-end',
    paddingBottom: 56,
  },
  titleBlock: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingTop: SP.lg },
  appName: { fontSize: 30, fontWeight: '800', color: C.text, textAlign: 'center', letterSpacing: -0.6 },
  tagline: { fontSize: 13, color: C.textSub, textAlign: 'center', marginTop: SP.sm },
  bottom: { alignItems: 'center', gap: 6 },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.pink },
  loadingText: { fontSize: 11, color: C.textMuted },
});
