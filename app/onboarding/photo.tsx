import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Camera } from 'lucide-react-native';
import { C } from '../../constants/colors';
import { G } from '../../constants/theme';
import { BackBar, BigButton, ProgressDots } from '../../components/ui';
import { useI18n } from '../../lib/i18n';

export default function PhotoScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const [initial] = useState(t('onboarding.photo.initial'));

  function handlePickPhoto() {
    Alert.alert(t('onboarding.photo.pickTitle'), t('onboarding.photo.pickBody'));
  }

  return (
    <SafeAreaView style={G.screen}>
      <View style={s.container}>
        <BackBar />
        <View style={s.progressRow}>
          <ProgressDots current={2} total={4} />
          <Text style={s.stepCount}>2 / 4</Text>
        </View>

        <View style={s.headingBlock}>
          <Text style={s.heading}>{t('onboarding.photo.title')}</Text>
          <Text style={s.subText}>{t('onboarding.photo.sub')}</Text>
        </View>

        <View style={s.avatarWrap}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{initial}</Text>
          </View>
          <TouchableOpacity style={s.cameraBtn} onPress={handlePickPhoto}>
            <Camera size={18} color={C.pinkDeep} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={s.changeBtn} onPress={handlePickPhoto}>
          <Text style={s.changeBtnText}>{t('onboarding.photo.change')}</Text>
        </TouchableOpacity>

        <Text style={s.hint}>{t('onboarding.photo.hint')}</Text>

        <View style={s.spacer} />

        <BigButton onPress={() => router.push('/onboarding/anniversary' as any)}>
          {t('onboarding.photo.next')}
        </BigButton>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32 },
  progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  stepCount: { fontSize: 11, color: C.textMuted },
  headingBlock: { marginTop: 20 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 29 },
  subText: { fontSize: 13, color: C.textSub, marginTop: 8 },
  avatarWrap: {
    alignSelf: 'center',
    marginTop: 36,
    position: 'relative',
  },
  avatar: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: C.pinkLight,
    borderWidth: 1.5,
    borderColor: '#F2D6DA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 46, fontWeight: '700', color: C.pinkDeep },
  cameraBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  changeBtn: {
    alignSelf: 'center',
    marginTop: 20,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
  },
  changeBtnText: { fontSize: 13, fontWeight: '600', color: C.pinkDeep },
  hint: { fontSize: 11, color: C.textMuted, textAlign: 'center', marginTop: 12 },
  spacer: { flex: 1 },
});
