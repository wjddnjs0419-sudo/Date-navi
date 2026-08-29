import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Wallet } from '../../components/iconography';
import { C, DS, G, SP, R } from '../../constants/theme';
import { BigButton, CourseStepList, Header, MetaChipRow, ScreenHeading, SectionLabel, SoftCard } from '../../components/ui';
import { ReactionPicker } from '../../components/ReactionPicker';
import { ReactionType } from '../../lib/reactions';
import { useI18n } from '../../lib/i18n';
import { resolveDisplaySteps, type CourseStep } from '../../lib/course';
import { useOptionalSafeAreaInsets } from '../../lib/use-optional-safe-area-insets';

type ReactionCard = {
  title: string;
  summary: string;
  estimated_time?: string;
  estimated_budget?: string;
  steps?: CourseStep[];
};

export default function ReactionScreen() {
  const { cardId } = useLocalSearchParams<{ cardId: string }>();
  const router = useRouter();
  const { t, strings: s } = useI18n();
  const insets = useOptionalSafeAreaInsets();

  const [selected, setSelected] = useState<ReactionType | null>(null);
  const [saving, setSaving] = useState(false);
  const [partnerName, setPartnerName] = useState(t('share.reaction.partnerFallback'));
  const [card, setCard] = useState<ReactionCard | null>(null);
  const [sentMessage, setSentMessage] = useState('');

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('date_planner_profiles')
        .select('couple_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!profile?.couple_id) return;

      const { data: partnerProfile } = await supabase
        .from('date_planner_profiles')
        .select('display_name')
        .eq('couple_id', profile.couple_id)
        .neq('user_id', user.id)
        .maybeSingle();

      if (partnerProfile?.display_name) {
        setPartnerName(partnerProfile.display_name);
      }

      if (cardId) {
        const { data: cardRow } = await supabase
          .from('date_cards')
          .select('title, summary, estimated_time, estimated_budget, steps')
          .eq('id', cardId)
          .maybeSingle();
        if (cardRow) setCard(cardRow);

        // 이 후보로 보낸 한마디(가장 최근)를 가져와 보여준다.
        const { data: msgRow } = await supabase
          .from('soft_messages')
          .select('generated_text')
          .eq('card_id', cardId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (msgRow?.generated_text) setSentMessage(msgRow.generated_text);
      }
    })();
  }, [cardId]);

  async function handleSubmit() {
    if (!cardId) {
      router.push('/share/mutual' as any);
      return;
    }
    if (!selected) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from('reactions')
        .upsert(
          { card_id: cardId, user_id: user.id, reaction_type: selected },
          { onConflict: 'card_id,user_id' },
        );

      router.push('/share/mutual' as any);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={G.screen} edges={['top']}>
      <Header onBack={() => router.back()} />
      <ScreenHeading title={t('share.reaction.heading')} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.senderRow}>
          <View style={styles.senderAvatar}>
            <Text style={styles.senderAvatarText}>{partnerName.slice(0, 1)}</Text>
          </View>
          <View>
            <Text style={styles.senderName}>{t('share.reaction.senderSent', { name: partnerName })}</Text>
            <Text style={styles.senderTime}>{t('share.reaction.justNow')}</Text>
          </View>
        </View>

        <SoftCard style={styles.cardBox}>
          <Text style={styles.cardTitle}>{card?.title ?? t('share.cardTitleFallback')}</Text>
          <Text style={styles.cardDesc}>{card?.summary ?? t('share.cardDescFallback')}</Text>

          <View style={styles.stepsWrap}>
            <CourseStepList steps={resolveDisplaySteps(card ?? {})} summary={card?.summary} />
          </View>

          {(!!card?.estimated_time || !!card?.estimated_budget) && (
            <View style={styles.metaRow}>
              {!!card?.estimated_time && (
                <MetaChipRow items={[{ icon: 'clock', label: card.estimated_time }]} />
              )}
              {!!card?.estimated_budget && (
                <View style={styles.budgetChip}>
                  <Wallet size={13} color={C.textSub} strokeWidth={2} />
                  <Text style={styles.budgetChipText}>{card.estimated_budget}</Text>
                </View>
              )}
            </View>
          )}

          {!!sentMessage && (
            <View style={styles.noteBubble}>
              <Text style={styles.noteBubbleText}>{sentMessage}</Text>
            </View>
          )}
        </SoftCard>

        <View style={styles.sectionBlock}>
          <SectionLabel>{t('share.reaction.chooseReaction')}</SectionLabel>
          <ReactionPicker
            selected={selected}
            onSelect={setSelected}
            labelFor={(type) => s.card.reactionLabels[type].label}
          />
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: SP.screen + insets.bottom }]}>
        <BigButton
          onPress={selected ? handleSubmit : undefined}
          variant={saving || !selected ? 'disabled' : 'primary'}
        >
          {saving ? <ActivityIndicator color={C.white} size="small" /> : t('share.reaction.submitCta')}
        </BigButton>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: SP.screen, paddingTop: SP.xxl, paddingBottom: SP.xxxl + SP.lg },
  senderRow: { flexDirection: 'row', alignItems: 'center', gap: SP.md, marginTop: SP.md },
  senderAvatar: {
    width: 40, height: 40, borderRadius: DS.radius.full,
    backgroundColor: C.pinkLight,
    alignItems: 'center', justifyContent: 'center',
  },
  senderAvatarText: { ...DS.typography.bodyCompact, fontWeight: '700', color: C.pinkDeep },
  senderName: { ...DS.typography.bodyCompact, fontWeight: '600', color: C.text },
  senderTime: { ...DS.typography.caption, color: C.textLight, marginTop: DS.spacing.micro },
  sectionBlock: { marginTop: SP.xxl },
  bottomSpacer: { height: SP.hero + SP.section + SP.lg },
  cardBox: {
    marginTop: SP.lg,
  },
  cardTitle: { ...DS.typography.body, fontWeight: '700', color: C.text },
  cardDesc: { ...DS.typography.bodySmall, color: C.textSub, marginTop: SP.xs },
  stepsWrap: { marginTop: SP.md },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: SP.md, marginTop: SP.md },
  budgetChip: { flexDirection: 'row', alignItems: 'center', gap: SP.xs },
  budgetChipText: { ...DS.typography.bodySmall, color: C.textSub },
  noteBubble: {
    marginTop: SP.md,
    borderRadius: R.btn,
    padding: SP.md,
    backgroundColor: C.pinkLight,
  },
  noteBubbleText: { ...DS.typography.bodySmall, color: C.pinkDeep },
  footer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: SP.screen,
    paddingBottom: SP.screen,
    paddingTop: SP.lg,
    backgroundColor: C.bg,
  },
});
