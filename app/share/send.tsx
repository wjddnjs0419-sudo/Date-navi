import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { generateInviteMessage } from '../../lib/ai';
import { Share2, Sparkles } from 'lucide-react-native';
import { C } from '../../constants/colors';
import { G, SP, R, T } from '../../constants/theme';
import { BackBar, BigButton, Chip, CourseStepList, MetaChipRow, SectionLabel, SoftCard, SuccessModal } from '../../components/ui';
import { useI18n } from '../../lib/i18n';
import { localizeCardContent } from '../../lib/card-i18n';
import { resolveDisplaySteps, type CourseStep } from '../../lib/course';

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
  const { cardId } = useLocalSearchParams<{ cardId: string }>();
  const router = useRouter();
  const { t, language } = useI18n();

  const [card, setCard] = useState<CardInfo | null>(null);
  const [message, setMessage] = useState(t('share.send.defaultMessage'));
  const [loading, setLoading] = useState(!!cardId);
  const [generating, setGenerating] = useState(false);
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
    await Share.share({ title, message: `${title}\n${summary}` });
  }

  async function handleSuggestMessage() {
    setGenerating(true);
    try {
      const text = await generateInviteMessage(
        { title: card?.title ?? t('share.cardTitleFallback'), summary: card?.summary, tags: card?.tags },
        language,
      );
      setMessage(text);
    } finally {
      setGenerating(false);
    }
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

      await supabase.from('soft_messages').insert({
        id: `sm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        couple_id: profile.couple_id,
        user_id: user.id,
        card_id: cardId ?? null,
        reason_tags: [],
        free_text: null,
        generated_text: message,
        used: true,
      });

      setSuccessVisible(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <SafeAreaView style={G.screen}>
      <SuccessModal
        visible={successVisible}
        message={t('share.send.sentMessage')}
        onHide={() => { setSuccessVisible(false); router.replace('/(tabs)/' as any); }}
      />
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <BackBar />
        <View style={s.introWrap}>
          <Text style={T.h1}>{t('share.send.heading')}</Text>
          <Text style={[T.sub, s.subTextSpacing]}>{t('share.send.subText')}</Text>
        </View>

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
            testID="send-native-share"
          >
            <Share2 size={16} color={C.text} strokeWidth={2} />
            <Text style={s.nativeShareBtnText}>{t('share.send.nativeShareCta')}</Text>
          </TouchableOpacity>
        </View>

        <View style={s.sectionBlock}>
          <SectionLabel>{t('share.send.sectionLabel')}</SectionLabel>
          <View style={s.messageBox}>
            <TextInput
              style={s.messageInput}
              value={message}
              onChangeText={setMessage}
              multiline
              placeholder={t('share.send.messagePlaceholder')}
              placeholderTextColor={C.textFaint}
            />
          </View>
          <TouchableOpacity
            style={s.suggestBtn}
            onPress={handleSuggestMessage}
            disabled={generating}
          >
            {generating
              ? <ActivityIndicator size="small" color={C.lavenderFg} />
              : <>
                  <Sparkles size={13} color={C.lavenderFg} />
                  <Text style={s.suggestBtnText}>{t('share.send.suggestCta')}</Text>
                </>}
          </TouchableOpacity>
        </View>

        <View style={s.bottomSpacer} />
      </ScrollView>

      <View style={s.footer}>
        <BigButton onPress={handleSend} variant={sending ? 'disabled' : 'primary'}>
          {t('share.send.sendCta')}
        </BigButton>
        <TouchableOpacity style={s.textBtn} onPress={() => router.back()}>
          <Text style={s.textBtnText}>{t('share.send.editCta')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: SP.xl, paddingTop: SP.lg, paddingBottom: SP.xxxl + SP.lg },
  introWrap: { marginTop: SP.lg },
  subTextSpacing: { marginTop: SP.sm },
  loadingSpinner: { marginTop: SP.xxxl + SP.sm },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.sm - 2, marginTop: SP.md },
  sectionBlock: { marginTop: SP.xl },
  bottomSpacer: { height: 120 },
  cardBox: {
    marginTop: SP.xl,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: C.text },
  cardDesc: { fontSize: 12, color: C.textSub, marginTop: SP.xs },
  stepsWrap: { marginTop: SP.md },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: SP.md, marginTop: SP.md },
  nativeShareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SP.sm,
    borderRadius: R.btn,
    paddingVertical: SP.md,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
  },
  nativeShareBtnText: { fontSize: 13, fontWeight: '600', color: C.text },
  messageBox: {
    backgroundColor: C.white,
    borderRadius: R.btn,
    padding: SP.lg,
    borderWidth: 1,
    borderColor: C.border,
    minHeight: 80,
  },
  messageInput: { fontSize: 13, color: C.text, lineHeight: 22 },
  suggestBtn: {
    marginTop: SP.sm,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP.xs + 2,
    borderRadius: R.xl,
    paddingHorizontal: SP.md,
    paddingVertical: SP.xs + 2,
    backgroundColor: C.lavender,
  },
  suggestBtnText: { fontSize: 12, fontWeight: '600', color: C.lavenderFg },
  footer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: SP.xl,
    paddingBottom: SP.xxxl,
    paddingTop: SP.md,
    backgroundColor: C.bg,
    gap: SP.xs,
  },
  textBtn: { alignItems: 'center', paddingVertical: SP.sm + 2 },
  textBtnText: { fontSize: 13, color: C.textSub, fontWeight: '500' },
});
