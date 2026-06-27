import { View, Text, Image, StyleSheet, Animated, Easing } from 'react-native';
import { useRef, useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { LinearGradient } from 'expo-linear-gradient';

const logo = require('../assets/logo.png');

export default function Index() {
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
    <LinearGradient
      colors={['#FCE9E5', '#FFF8F3']}
      style={s.container}
    >
      <View style={s.center}>
        <Animated.View style={{ transform: [{ scale }, { translateY }], opacity }}>
          <Image source={logo} style={s.logo} />
        </Animated.View>
        <Animated.View style={{ opacity, marginTop: 16, alignItems: 'center' }}>
          <Text style={s.appName}>Date Navi</Text>
          <Text style={s.tagline}>우리 데이트의 작은 나침반이 되어줄게요.</Text>
        </Animated.View>
      </View>
      <View style={s.bottom}>
        <View style={s.dots}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[s.dot, { opacity: 0.3 + i * 0.25 }]} />
          ))}
        </View>
        <Text style={s.loadingText}>둘의 마음을 모으는 중</Text>
      </View>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 56,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 240, height: 240, resizeMode: 'contain' },
  appName: { fontSize: 30, fontWeight: '800', color: '#3A2E2E', textAlign: 'center', letterSpacing: -0.6 },
  tagline: { fontSize: 13, color: '#8A7F76', textAlign: 'center', marginTop: 8 },
  bottom: { alignItems: 'center', gap: 6 },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#F26B7A' },
  loadingText: { fontSize: 11, color: '#A89B92' },
});
