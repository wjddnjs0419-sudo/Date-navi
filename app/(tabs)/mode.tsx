import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MessageCircle, Map, Plane, Check } from '../../components/iconography';
import { C, DS, G } from '../../constants/theme';
import { BigButton, ScreenHeading } from '../../components/ui';
import { useI18n } from '../../lib/i18n';
import { ENABLED_DATE_MODE_IDS, DATE_MODE_ROUTES, type DateModeId } from '../../lib/dateModes';

const MODE_ICONS: Record<DateModeId, typeof MessageCircle> = {
  feeling: MessageCircle,
  make_course: Map,
  next_meet: Plane,
};

export default function ModeScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const MODES = ENABLED_DATE_MODE_IDS.map((id) => ({
    id,
    title: t(`mode.tabModes.${id}.title`),
    desc: t(`mode.tabModes.${id}.desc`),
    Icon: MODE_ICONS[id],
  }));
  const [selIdx, setSelIdx] = useState(0);

  function handleStart() {
    const mode = MODES[selIdx];
    const path = DATE_MODE_ROUTES[mode.id];
    if (path) router.push(path as any);
  }

  return (
    <SafeAreaView style={G.screen}>
      <View style={s.flex1}>
        <ScreenHeading title={t('mode.tabHeading')} subtitle={t('mode.tabSubtitle')} placement="root" />
        <ScrollView
          contentContainerStyle={s.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={s.modeList}>
            {MODES.map((m, i) => {
              const sel = i === selIdx;
              return (
                <TouchableOpacity
                  key={m.id}
                  onPress={() => setSelIdx(i)}
                  activeOpacity={0.88}
                  style={[s.modeCard, sel && s.modeCardOn]}
                >
                  <View style={s.modeCardLeft}>
                    <View style={[s.iconBox, sel ? s.iconBoxOn : s.iconBoxOff]}>
                      <m.Icon size={20} strokeWidth={1.8} color={sel ? C.pinkDeep : C.creamFg} />
                    </View>
                    <View style={s.flex1}>
                      <Text style={[s.modeTitle, sel && s.modeTitleOn]}>{m.title}</Text>
                      <Text style={s.modeDesc}>{m.desc}</Text>
                    </View>
                  </View>
                  {sel && <Check size={18} color={C.pink} strokeWidth={2.5} />}
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={s.footer}>
            <BigButton onPress={handleStart}>{t('mode.tabStartCta')}</BigButton>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  flex1: { flex: 1 },
  content: { paddingHorizontal: DS.spacing.screen, paddingTop: DS.spacing.xxl, paddingBottom: DS.spacing.section },
  modeList: { gap: DS.spacing.md },
  modeCard: {
    minHeight: DS.spacing.touch,
    borderRadius: DS.radius.card,
    padding: DS.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
  },
  modeCardOn: { backgroundColor: C.pinkLight, borderWidth: 1.5, borderColor: C.pinkBorder },
  modeCardLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: DS.spacing.md, flex: 1 },
  iconBox: {
    width: 44, height: 44, borderRadius: DS.radius.input,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  iconBoxOn: { backgroundColor: C.white },
  iconBoxOff: { backgroundColor: C.cream },
  modeTitle: { ...DS.typography.body, fontWeight: '700', color: C.text },
  modeTitleOn: { color: C.pinkDeep },
  modeDesc: { ...DS.typography.bodySmall, color: C.textSub, marginTop: DS.spacing.xs },
  footer: {
    marginTop: DS.spacing.lg,
  },
});
