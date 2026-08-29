import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Check, TriangleAlert } from '../../components/iconography';
import { C } from '../../constants/colors';
import { DS, G, SP } from '../../constants/theme';
import { BigButton, Header, ListGroup, ListRow, ScreenHeading, SectionLabel } from '../../components/ui';
import { useI18n } from '../../lib/i18n';
import { useOptionalSafeAreaInsets } from '../../lib/use-optional-safe-area-insets';

export default function DeleteAccountScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const insets = useOptionalSafeAreaInsets();
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
      const { error: fnError } = await supabase.functions.invoke('delete-account', { body: {} });
      if (fnError) throw fnError;

      await supabase.auth.signOut();
    } catch {
      setDeleting(false);
      Alert.alert(t('common.error'), t('account.deleteAccount.deleteError'));
    }
  }

  return (
    <SafeAreaView style={G.screen} edges={['top']}>
      <Header onBack={() => router.back()} />
      <ScreenHeading title={t('account.deleteAccount.heading')} />
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.cautionBox}>
          <TriangleAlert size={18} strokeWidth={2} color={C.pinkDeep} />
          <Text style={s.cautionText}>{t('account.deleteAccount.subText')}</Text>
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
          testID="delete-agree-row"
          style={s.agreeRow}
          onPress={() => setAgreed(v => !v)}
          activeOpacity={0.88}
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

      <View style={[s.footer, { paddingBottom: SP.screen + insets.bottom }]}>
        <BigButton
          onPress={handleDelete}
          variant={deleting ? 'disabled' : agreed ? 'primary' : 'disabled'}
        >
          {deleting ? <ActivityIndicator color={C.white} size="small" /> : agreed ? t('account.deleteAccount.deleteCta') : t('account.deleteAccount.needAgreeCta')}
        </BigButton>
        <TouchableOpacity style={s.cancelBtn} onPress={() => router.back()} activeOpacity={0.88}>
          <Text style={s.cancelBtnText}>{t('account.deleteAccount.browseMoreCta')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: SP.screen, paddingTop: SP.xxl, paddingBottom: SP.xxxl + SP.sm },
  reasonSection: { marginTop: SP.xxl },
  reasonText: { ...DS.typography.body },
  bottomSpacer: { height: SP.hero + SP.section + SP.lg },
  cautionBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SP.sm,
    marginTop: SP.lg,
    borderRadius: DS.radius.button,
    padding: SP.lg,
    backgroundColor: C.pinkLight,
    borderWidth: 1,
    borderColor: C.pinkBorder,
  },
  cautionText: { flex: 1, ...DS.typography.bodyCompact, color: C.pinkDeep, fontWeight: '600' },
  warningBox: {
    marginTop: SP.md,
    borderRadius: DS.radius.button,
    padding: SP.lg,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
  },
  warningTitle: { ...DS.typography.bodyCompact, fontWeight: '700', color: C.text, marginBottom: SP.sm },
  warningItem: { ...DS.typography.bodySmall, color: C.grayFg },
  checkCircle: {
    width: 20, height: 20, borderRadius: DS.radius.full,
    backgroundColor: C.pink,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyCircle: {
    width: 20, height: 20, borderRadius: DS.radius.full,
    borderWidth: 1.5, borderColor: C.border,
  },
  agreeRow: {
    marginTop: SP.xxl,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SP.md,
    paddingHorizontal: SP.xs,
  },
  checkbox: {
    width: 20, height: 20, borderRadius: DS.radius.badge,
    borderWidth: 1.5, borderColor: C.border,
    backgroundColor: C.white,
    alignItems: 'center', justifyContent: 'center',
    marginTop: DS.spacing.micro,
  },
  checkboxOn: { backgroundColor: C.pink, borderColor: C.pink },
  agreeText: { flex: 1, ...DS.typography.bodySmall, color: C.grayFg },
  footer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: SP.screen,
    paddingBottom: SP.screen,
    paddingTop: SP.lg,
    backgroundColor: C.bg,
    gap: SP.xs,
  },
  cancelBtn: { alignItems: 'center', paddingVertical: SP.md },
  cancelBtnText: { ...DS.typography.bodyCompact, color: C.textSub },
});
