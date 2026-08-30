import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Share2 } from '../../components/iconography';
import { C, DS, G, SP, R } from '../../constants/theme';
import { BigButton, Chip, CourseStepList, Header, InputField, MetaChipRow, ScreenHeading, SectionLabel, SoftCard, SuccessModal } from '../../components/ui';
import { useI18n } from '../../lib/i18n';
import { localizeCardContent } from '../../lib/card-i18n';
import { resolveDisplaySteps, type CourseStep } from '../../lib/course';
import { logEvent } from '../../lib/analytics';
import { buildProposalSentParams, shouldTrackProposalSent } from '../../lib/analytics-course-save';
import { useOptionalSafeAreaInsets } from '../../lib/use-optional-safe-area-insets';

type CardInfo = {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  estimated_time?: string;
  estimated_budget?: string;
  steps?: CourseStep[];
};

export default function SendScreen() {
  const { cardId, sourceScreen } = useLocalSearchParams<{ cardId: string; sourceScreen?: string }>();
  const router = useRouter();
  const { t, language } = useI18n();
  const insets = useOptionalSafeAreaInsets();

  const [card, setCard] = useState<CardInfo | null>(null);
  const [message, setMessage] = useState(t('share.send.defaultMessage'));
  const [loading, setLoading] = useState(!!cardId);
  const [sending, setSending] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);

  useEffect(() => {
    if (!cardId) return;
    (async () => {
      try {
        const { data } = await supabase
          .from('date_cards')
          .select('id, title, summary, tags, content_i18n, estimated_time, estimated_budget, steps')
          .eq('id', cardId)
          .maybeSingle();
        if (data) setCard(localizeCardContent(data, language));
      } finally {
        setLoading(false);
      }
    })();
  }, [cardId]);

  async function handleNativeShare() {
    const title = card?.title ?? t('share.cardTitleFallback');
    const summary = card?.summary ?? t('share.cardDescFallback');
    void logEvent('native_share_opened');
    await Share.share({ title, message: `${title}\n${summary}` });
  }

  async function handleSend() {
    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('date_planner_profiles')
        .select('couple_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!profile?.couple_id) return;

      const { error } = await supabase.from('soft_messages').insert({
        id: `sm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        couple_id: profile.couple_id,
        user_id: user.id,
        card_id: cardId ?? null,
        reason_tags: [],
        free_text: null,
        generated_text: message,
        used: true,
      });
      if (error) throw error;

      if (shouldTrackProposalSent(sourceScreen)) {
        void logEvent('proposal_sent', buildProposalSentParams());
      }
      setSuccessVisible(true);
    } catch {
      Alert.alert(t('common.error'), t('modeFlow.result.sendError'));
    } finally {
      setSending(false);
    }
  }

  return (
    <SafeAreaView style={G.screen} edges={['top']}>
      <SuccessModal
        visible={successVisible}
        message={t('share.send.sentMessage')}
        onHide={() => { setSuccessVisible(false); router.replace('/(tabs)/' as any); }}
      />
      <Header onBack={() => router.back()} />
      <ScreenHeading title={t('share.send.heading')} subtitle={t('share.send.subText')} />
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {loading ? (
          <ActivityIndicator color={C.pink} style={s.loadingSpinner} />
        ) : (
          <SoftCard style={s.cardBox}>
            <Text style={s.cardTitle}>{card?.title ?? t('share.cardTitleFallback')}</Text>
            <Text style={s.cardDesc}>{card?.summary ?? t('share.cardDescFallback')}</Text>

            <View style={s.stepsWrap}>
              <CourseStepList steps={resolveDisplaySteps(card ?? {})} summary={card?.summary} />
            </View>

            {(!!card?.estimated_time || !!card?.estimated_budget) && (
              <View style={s.metaRow}>
                <MetaChipRow
                  items={[
                    ...(card?.estimated_time ? [{ icon: 'clock' as const, label: card.estimated_time }] : []),
                    ...(card?.estimated_budget ? [{ icon: 'wallet' as const, label: card.estimated_budget }] : []),
                  ]}
                />
              </View>
            )}

            <View style={s.tagsRow}>
              {(card?.tags ?? t('share.send.tagsFallback', { returnObjects: true }) as string[]).slice(0, 3).map((tag) => (
                <Chip key={tag} tone="gray">{tag}</Chip>
              ))}
            </View>
          </SoftCard>
        )}

        <View style={s.sectionBlock}>
          <SectionLabel>{t('share.send.shareChannelsLabel')}</SectionLabel>
          <TouchableOpacity
            style={s.nativeShareBtn}
            onPress={handleNativeShare}
            activeOpacity={0.88}
            testID="send-native-share"
          >
            <Share2 size={16} color={C.text} strokeWidth={2} />
            <Text style={s.nativeShareBtnText}>{t('share.send.nativeShareCta')}</Text>
          </TouchableOpacity>
        </View>

        <View style={s.sectionBlock}>
          <SectionLabel>{t('share.send.sectionLabel')}</SectionLabel>
          <InputField
            value={message}
            onChangeText={setMessage}
            multiline
            placeholder={t('share.send.messagePlaceholder')}
          />
        </View>

        <View style={s.bottomSpacer} />
      </ScrollView>

      <View style={[s.footer, { paddingBottom: SP.screen + insets.bottom }]}>
        <BigButton onPress={handleSend} variant={sending ? 'disabled' : 'primary'}>
          {t('share.send.sendCta')}
        </BigButton>
        <TouchableOpacity style={s.textBtn} onPress={() => router.back()} activeOpacity={0.88}>
          <Text style={s.textBtnText}>{t('share.send.editCta')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: SP.screen, paddingTop: SP.xxl, paddingBottom: SP.xxxl + SP.lg },
  loadingSpinner: { marginTop: SP.xxxl + SP.sm },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.xs, marginTop: SP.md },
  sectionBlock: { marginTop: SP.xxl },
  bottomSpacer: { height: SP.hero + SP.section + SP.lg },
  cardBox: {
    marginTop: SP.xxl,
  },
  cardTitle: { ...DS.typography.body, fontWeight: '700', color: C.text },
  cardDesc: { ...DS.typography.bodySmall, color: C.textSub, marginTop: SP.xs },
  stepsWrap: { marginTop: SP.md },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: SP.md, marginTop: SP.md },
  nativeShareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SP.sm,
    minHeight: DS.spacing.touch,
    borderRadius: R.btn,
    paddingVertical: SP.md,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
  },
  nativeShareBtnText: { ...DS.typography.bodyCompact, fontWeight: '600', color: C.text },
  footer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: SP.screen,
    paddingBottom: SP.screen,
    paddingTop: SP.lg,
    backgroundColor: C.bg,
    gap: SP.xs,
  },
  textBtn: { alignItems: 'center', paddingVertical: SP.sm },
  textBtnText: { ...DS.typography.bodyCompact, color: C.textSub },
});
