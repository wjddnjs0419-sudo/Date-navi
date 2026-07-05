import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Check } from 'lucide-react-native';
import { C } from '../../constants/colors';
import { G } from '../../constants/theme';
import { BackBar, BigButton, ListGroup, ListRow, SectionLabel } from '../../components/ui';
import { useI18n } from '../../lib/i18n';

export default function DeleteAccountScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const REASONS = [
    t('account.deleteAccount.reasons.notUsing'),
    t('account.deleteAccount.reasons.lackingFeatures'),
    t('account.deleteAccount.reasons.usingOtherApp'),
    t('account.deleteAccount.reasons.privacyConcern'),
    t('account.deleteAccount.reasons.other'),
  ];
  const warningItems = t('account.deleteAccount.warningItems', { returnObjects: true }) as string[];

  const [reasonIdx, setReasonIdx] = useState<number | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!agreed) return;
    setDeleting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('no user');

      const { data: profile } = await supabase
        .from('date_planner_profiles')
        .select('couple_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (profile?.couple_id) {
        await supabase
          .from('date_planner_profiles')
          .update({ couple_id: null })
          .eq('couple_id', profile.couple_id)
          .neq('user_id', user.id);
        await supabase
          .from('date_planner_couples')
          .delete()
          .eq('id', profile.couple_id);
      }

      await supabase.from('user_preferences').delete().eq('user_id', user.id);
      await supabase.from('soft_messages').delete().eq('user_id', user.id);
      await supabase.from('date_memories').delete().eq('user_id', user.id);
      await supabase.from('date_planner_profiles').delete().eq('user_id', user.id);

      const { error: fnError } = await supabase.functions.invoke('delete-account', {
        body: { user_id: user.id },
      });
      if (fnError) throw fnError;

      await supabase.auth.signOut();
    } catch {
      setDeleting(false);
      Alert.alert(t('common.error'), t('account.deleteAccount.deleteError'));
    }
  }

  return (
    <SafeAreaView style={G.screen}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <BackBar />
        <View style={s.headingWrap}>
          <Text style={s.heading}>{t('account.deleteAccount.heading')}</Text>
          <Text style={s.subText}>{t('account.deleteAccount.subText')}</Text>
        </View>

        <View style={s.warningBox}>
          <Text style={s.warningTitle}>{t('account.deleteAccount.warningTitle')}</Text>
          {warningItems.map(item => (
            <Text key={item} style={s.warningItem}>· {item}</Text>
          ))}
        </View>

        <View style={s.reasonSection}>
          <SectionLabel>{t('account.deleteAccount.reasonLabel')}</SectionLabel>
          <ListGroup>
            {REASONS.map((reason, i, arr) => (
              <ListRow
                key={reason}
                onPress={() => setReasonIdx(i)}
                label={
                  <Text style={[s.reasonText, {
                    color: reasonIdx === i ? C.pinkDeep : C.text,
                    fontWeight: reasonIdx === i ? '600' : '500',
                  }]}>
                    {reason}
                  </Text>
                }
                trailing={
                  reasonIdx === i ? (
                    <View style={s.checkCircle}>
                      <Check size={11} color={C.white} strokeWidth={3} />
                    </View>
                  ) : (
                    <View style={s.emptyCircle} />
                  )
                }
                divider={i < arr.length - 1}
              />
            ))}
          </ListGroup>
        </View>

        <TouchableOpacity
          style={s.agreeRow}
          onPress={() => setAgreed(v => !v)}
          activeOpacity={0.7}
        >
          <View style={[s.checkbox, agreed && s.checkboxOn]}>
            {agreed && <Check size={11} color={C.white} strokeWidth={3} />}
          </View>
          <Text style={s.agreeText}>
            {t('account.deleteAccount.agreeText')}
          </Text>
        </TouchableOpacity>

        <View style={s.bottomSpacer} />
      </ScrollView>

      <View style={s.footer}>
        <BigButton
          onPress={handleDelete}
          variant={deleting ? 'disabled' : agreed ? 'primary' : 'disabled'}
        >
          {deleting ? <ActivityIndicator color={C.white} size="small" /> : agreed ? t('account.deleteAccount.deleteCta') : t('account.deleteAccount.needAgreeCta')}
        </BigButton>
        <TouchableOpacity style={s.cancelBtn} onPress={() => router.back()}>
          <Text style={s.cancelBtnText}>{t('account.deleteAccount.browseMoreCta')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  headingWrap: { marginTop: 16 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text },
  subText: { fontSize: 13, color: C.textSub, lineHeight: 20, marginTop: 8 },
  reasonSection: { marginTop: 24 },
  reasonText: { fontSize: 14 },
  bottomSpacer: { height: 120 },
  warningBox: {
    marginTop: 20,
    borderRadius: 18,
    padding: 16,
    backgroundColor: C.pinkLight,
    borderWidth: 1,
    borderColor: C.pinkBorder,
  },
  warningTitle: { fontSize: 13, fontWeight: '700', color: C.pinkDeep, marginBottom: 8 },
  warningItem: { fontSize: 12, color: C.grayFg, lineHeight: 22 },
  checkCircle: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: C.pink,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyCircle: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 1.5, borderColor: C.border,
  },
  agreeRow: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 4,
  },
  checkbox: {
    width: 20, height: 20, borderRadius: 6,
    borderWidth: 1.5, borderColor: C.border,
    backgroundColor: C.white,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  checkboxOn: { backgroundColor: C.pink, borderColor: C.pink },
  agreeText: { flex: 1, fontSize: 12, color: C.grayFg, lineHeight: 19 },
  footer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 12,
    backgroundColor: C.bg,
    gap: 4,
  },
  cancelBtn: { alignItems: 'center', paddingVertical: 10 },
  cancelBtnText: { fontSize: 13, color: C.textSub, fontWeight: '500' },
});
