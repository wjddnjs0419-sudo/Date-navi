import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { C } from '../../constants/colors';
import { G } from '../../constants/theme';
import { BigButton, Chip } from '../../components/ui';
import { useI18n } from '../../lib/i18n';

export default function SoftMessageScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const SOFT_CARDS = [
    t('softMessage.quickCards.tired'),
    t('softMessage.quickCards.budget'),
    t('softMessage.quickCards.far'),
    t('softMessage.quickCards.crowded'),
    t('softMessage.quickCards.changeDate'),
    t('softMessage.quickCards.placeOkMoodGood'),
    t('softMessage.quickCards.stillWantTogether'),
  ];
  const SOFT_TONES = [t('softMessage.tones.warm'), t('softMessage.tones.light'), t('softMessage.tones.honest')];
  const [selTone, setSelTone] = useState(0);
  const [freeText, setFreeText] = useState('');

  function handleGenerate() {
    const text = freeText.trim();
    if (!text) return;
    router.push({
      pathname: '/soft-message/result',
      params: {
        tone: SOFT_TONES[selTone],
        free: text,
      },
    });
  }

  return (
    <SafeAreaView style={G.screen}>
      <View style={s.flex1}>
        <ScrollView
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={s.heading}>{t('softMessage.composeHeading')}</Text>
          <Text style={s.subText}>{t('softMessage.composeSubtitle')}</Text>

          <View style={[s.freeInputWrap, s.freeInputWrapSpacing]}>
            <TextInput
              style={s.freeInput}
              value={freeText}
              onChangeText={setFreeText}
              placeholder={t('softMessage.freeTextPlaceholder')}
              placeholderTextColor={C.textFaint}
              multiline
              maxLength={200}
            />
          </View>

          <Text style={s.sectionLabel}>{t('softMessage.situationLabel')}</Text>
          <View style={s.chipWrap}>
            {SOFT_CARDS.map((c) => (
              <Chip key={c} tone="pink" onPress={() => setFreeText(c)}>
                {c}
              </Chip>
            ))}
          </View>

          <Text style={s.sectionLabel}>{t('softMessage.toneSectionLabel')}</Text>
          <View style={s.toneRow}>
            {SOFT_TONES.map((tone, i) => {
              const sel = i === selTone;
              return (
                <TouchableOpacity
                  key={tone}
                  onPress={() => setSelTone(i)}
                  activeOpacity={0.7}
                  style={[s.toneBtn, sel && s.toneBtnOn]}
                >
                  <Text style={[s.toneBtnText, sel && s.toneBtnTextOn]}>{tone}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={s.bottomSpacer} />
        </ScrollView>

        <View style={s.footer}>
          <BigButton
            onPress={handleGenerate}
            variant={freeText.trim() === '' ? 'disabled' : 'primary'}
          >
            {t('softMessage.generateCta')}
          </BigButton>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  flex1: { flex: 1 },
  bottomSpacer: { height: 120 },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 29 },
  subText: { fontSize: 13, color: C.textSub, lineHeight: 20, marginTop: 8 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: C.text, marginTop: 20, marginBottom: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  toneRow: { flexDirection: 'row', gap: 8 },
  toneBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: C.white,
    borderWidth: 1.5,
    borderColor: C.border,
  },
  toneBtnOn: { backgroundColor: C.lavender, borderColor: '#C9B8FF' },
  toneBtnText: { fontSize: 13, color: C.inkSoft, fontWeight: '500' },
  toneBtnTextOn: { color: C.lavenderFg, fontWeight: '600' },
  freeInputWrap: {
    backgroundColor: C.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    minHeight: 80,
  },
  freeInputWrapSpacing: { marginTop: 20 },
  freeInput: { fontSize: 13, color: C.text, lineHeight: 20 },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 12,
    backgroundColor: C.bg,
  },
});
