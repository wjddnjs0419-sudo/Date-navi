import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Wallet } from 'lucide-react-native';
import { C } from '../../constants/colors';
import { G, SP, R, T } from '../../constants/theme';
import { BackBar, BigButton, CourseStepList, MetaChipRow, OptionCardPicker, SectionLabel, SoftCard } from '../../components/ui';
import { useI18n } from '../../lib/i18n';
import { resolveDisplaySteps, type CourseStep } from '../../lib/course';

const REACTION_OPTIONS: { id: string; type: string }[] = [
  { id: 'full', type: 'love' },
  { id: 'good', type: 'love' },
  { id: 'niceFeel', type: 'like' },
  { id: 'closer', type: 'like' },
  { id: 'burdenToday', type: 'burden' },
  { id: 'nextTime', type: 'next_time' },
  { id: 'ifMoneyComes', type: 'next_time' },
  { id: 'notFarWalk', type: 'like' },
];

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
  const { t } = useI18n();

  const [selectedId, setSelectedId] = useState(REACTION_OPTIONS[3].id);
  const [note, setNote] = useState('');
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
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const reactionType = REACTION_OPTIONS.find((opt) => opt.id === selectedId)?.type ?? 'like';
      await supabase
        .from('reactions')
        .upsert(
          { card_id: cardId, user_id: user.id, reaction_type: reactionType },
          { onConflict: 'card_id,user_id' },
        );

      router.push('/share/mutual' as any);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={G.screen}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <BackBar />

        <View style={s.senderRow}>
          <View style={s.senderAvatar}>
            <Text style={s.senderAvatarText}>{partnerName.slice(0, 1)}</Text>
          </View>
          <View>
            <Text style={s.senderName}>{t('share.reaction.senderSent', { name: partnerName })}</Text>
            <Text style={s.senderTime}>{t('share.reaction.justNow')}</Text>
          </View>
        </View>

        <Text style={[T.h1, s.headingSpacing]}>{t('share.reaction.heading')}</Text>

        <SoftCard style={s.cardBox}>
          <Text style={s.cardTitle}>{card?.title ?? t('share.cardTitleFallback')}</Text>
          <Text style={s.cardDesc}>{card?.summary ?? t('share.cardDescFallback')}</Text>

          <View style={s.stepsWrap}>
            <CourseStepList steps={resolveDisplaySteps(card ?? {})} summary={card?.summary} />
          </View>

          {(!!card?.estimated_time || !!card?.estimated_budget) && (
            <View style={s.metaRow}>
              {!!card?.estimated_time && (
                <MetaChipRow items={[{ icon: 'clock', label: card.estimated_time }]} />
              )}
              {!!card?.estimated_budget && (
                <View style={s.budgetChip}>
                  <Wallet size={13} color={C.textSub} strokeWidth={2} />
                  <Text style={s.budgetChipText}>{card.estimated_budget}</Text>
                </View>
              )}
            </View>
          )}

          {!!sentMessage && (
            <View style={s.noteBubble}>
              <Text style={s.noteBubbleText}>{sentMessage}</Text>
            </View>
          )}
        </SoftCard>

        <View style={s.sectionBlock}>
          <SectionLabel>{t('share.reaction.chooseReaction')}</SectionLabel>
          <OptionCardPicker
            columns={2}
            largeTouchTarget
            value={selectedId}
            onChange={setSelectedId}
            options={REACTION_OPTIONS.map((opt) => ({ value: opt.id, label: t(`share.reaction.options.${opt.id}`) }))}
          />
        </View>

        <View style={s.sectionBlock}>
          <SectionLabel>{t('share.reaction.noteLabel')}</SectionLabel>
          <View style={s.noteInputBox}>
            <TextInput
              style={s.noteInput}
              value={note}
              onChangeText={setNote}
              placeholder={t('share.reaction.notePlaceholder')}
              placeholderTextColor={C.textFaint}
              multiline
            />
          </View>
        </View>

        <View style={s.bottomSpacer} />
      </ScrollView>

      <View style={s.footer}>
        <BigButton onPress={handleSubmit} variant={saving ? 'disabled' : 'primary'}>
          {saving ? <ActivityIndicator color={C.white} size="small" /> : t('share.reaction.submitCta')}
        </BigButton>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: SP.xl, paddingTop: SP.lg, paddingBottom: SP.xxxl + SP.lg },
  senderRow: { flexDirection: 'row', alignItems: 'center', gap: SP.md, marginTop: SP.md },
  senderAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: C.pinkLight,
    alignItems: 'center', justifyContent: 'center',
  },
  senderAvatarText: { fontSize: 13, fontWeight: '700', color: C.pinkDeep },
  senderName: { fontSize: 13, fontWeight: '600', color: C.text },
  senderTime: { fontSize: 11, color: C.textLight, marginTop: 1 },
  headingSpacing: { marginTop: SP.lg },
  sectionBlock: { marginTop: SP.xl },
  bottomSpacer: { height: 120 },
  cardBox: {
    marginTop: SP.lg,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: C.text },
  cardDesc: { fontSize: 12, color: C.textSub, marginTop: SP.xs },
  stepsWrap: { marginTop: SP.md },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: SP.md, marginTop: SP.md },
  budgetChip: { flexDirection: 'row', alignItems: 'center', gap: SP.xs },
  budgetChipText: { fontSize: 12, color: C.textSub, fontWeight: '500' },
  noteBubble: {
    marginTop: SP.md,
    borderRadius: R.btn,
    padding: SP.md,
    backgroundColor: C.pinkLight,
  },
  noteBubbleText: { fontSize: 12, color: C.pinkDeep, lineHeight: 18 },
  noteInputBox: {
    backgroundColor: C.white,
    borderRadius: R.btn,
    padding: SP.lg,
    borderWidth: 1,
    borderColor: C.border,
    minHeight: 70,
  },
  noteInput: { fontSize: 13, color: C.text, lineHeight: 20 },
  footer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: SP.xl,
    paddingBottom: SP.xxxl,
    paddingTop: SP.md,
    backgroundColor: C.bg,
  },
});
