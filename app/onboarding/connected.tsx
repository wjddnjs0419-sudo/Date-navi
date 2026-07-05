import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Heart } from 'lucide-react-native';
import { C } from '../../constants/colors';
import { BigButton } from '../../components/ui';
import { useI18n } from '../../lib/i18n';

function ConnectAnimation() {
  const { t } = useI18n();
  const leftX = useRef(new Animated.Value(-120)).current;
  const rightX = useRef(new Animated.Value(120)).current;
  const heartScale = useRef(new Animated.Value(0)).current;
  const heartOpacity = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(leftX, { toValue: -34, useNativeDriver: true, tension: 60, friction: 9 }),
        Animated.spring(rightX, { toValue: 34, useNativeDriver: true, tension: 60, friction: 9 }),
      ]),
      Animated.parallel([
        Animated.spring(heartScale, { toValue: 1, useNativeDriver: true, tension: 60, friction: 7 }),
        Animated.timing(heartOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]),
    ]).start(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.06, duration: 700, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        ]),
      ).start();
    });
  }, []);

  return (
    <View style={anim.container}>
      <Animated.View style={[
        anim.heartBg,
        { opacity: heartOpacity, transform: [{ scale: Animated.multiply(heartScale, pulse) }] },
      ]}>
        <Heart size={220} color={C.pink} fill={C.pink} strokeWidth={0} />
      </Animated.View>

      <Animated.View style={[anim.avatar, { transform: [{ translateX: leftX }] }]}>
        <Text style={anim.avatarInitial}>{t('card.memory.meFallback')}</Text>
      </Animated.View>

      <Animated.View style={[anim.avatar, anim.avatarB, { transform: [{ translateX: rightX }] }]}>
        <Text style={anim.avatarInitial}>💕</Text>
      </Animated.View>
    </View>
  );
}

export default function CoupleConnectedScreen() {
  const router = useRouter();
  const { t } = useI18n();
  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        <View style={s.content}>
          <ConnectAnimation />
          <Text style={s.heading}>{t('onboarding.connected.heading')}</Text>
          <Text style={s.sub}>
            {t('onboarding.connected.subtitle')}
          </Text>
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
  container: {
    width: 280,
    height: 240,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartBg: {
    position: 'absolute',
  },
  avatar: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: C.pinkLight,
    borderWidth: 4,
    borderColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.pinkDeep,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 6,
    zIndex: 10,
  },
  avatarB: {
    backgroundColor: '#FFE0B2',
  },
  avatarInitial: { fontSize: 32, fontWeight: '700', color: C.pinkDeep },
});

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bgSplash },
  container: { flex: 1, paddingHorizontal: 24, paddingBottom: 24 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 29, textAlign: 'center', marginTop: 8 },
  sub: { fontSize: 13, color: C.textSub, lineHeight: 20, textAlign: 'center', marginTop: 12 },
  footer: {},
});
