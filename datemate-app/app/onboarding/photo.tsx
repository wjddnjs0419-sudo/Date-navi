import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Camera } from 'lucide-react-native';
import { C } from '../../constants/colors';
import { BackBar, BigButton, ProgressDots } from '../../components/ui';

export default function PhotoScreen() {
  const router = useRouter();
  const [initial] = useState('나');

  function handlePickPhoto() {
    Alert.alert('사진 선택', '갤러리에서 사진을 선택하는 기능은 곧 추가될 예정이에요.');
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.container}>
        <BackBar />
        <View style={s.progressRow}>
          <ProgressDots current={2} total={4} />
          <Text style={s.stepCount}>2 / 4</Text>
        </View>

        <View style={{ marginTop: 20 }}>
          <Text style={s.heading}>{'프로필 사진을\n골라주세요'}</Text>
          <Text style={s.subText}>지금 건너뛰어도 괜찮아요.</Text>
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
          <Text style={s.changeBtnText}>사진 변경하기</Text>
        </TouchableOpacity>

        <Text style={s.hint}>연인에게도 이 사진이 보여요.</Text>

        <View style={{ flex: 1 }} />

        <BigButton onPress={() => router.replace('/onboarding/anniversary' as any)}>
          다음
        </BigButton>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32 },
  progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  stepCount: { fontSize: 11, color: C.textMuted },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 29 },
  subText: { fontSize: 13, color: C.textSub, marginTop: 8 },
  avatarWrap: {
    alignSelf: 'center',
    marginTop: 36,
    position: 'relative',
  },
  avatar: {
    width: 124,
    height: 124,
    borderRadius: 62,
    backgroundColor: C.pinkLight,
    borderWidth: 1.5,
    borderColor: '#F2D6DA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 38, fontWeight: '700', color: C.pinkDeep },
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
    shadowColor: '#785046',
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
});
