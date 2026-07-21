import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Sparkles, Clock, Wallet } from 'lucide-react-native';
import { C } from '../../constants/colors';
import { G, SP, R, T } from '../../constants/theme';
import { BackBar, BigButton, Chip, CourseStepList, SoftCard } from '../../components/ui';
import { useI18n } from '../../lib/i18n';
import { localizeCardContent } from '../../lib/card-i18n';
import { resolveDisplaySteps, type CourseStep } from '../../lib/course';

type MutualCard = {
  id: string;
  title: string;
  summary: string;
  estimatedTime: string;
  estimatedBudget: string;
  tags: string[];
  steps?: CourseStep[];
  myReaction: string;
  partnerReaction: string;
  note: string;
  section: 'mutual' | 'conditional' | 'deferred';
};

const REACTION_SECTION_MAP: Record<string, MutualCard['section']> = {
  love:      'mutual',
  like:      'conditional',
  burden:    'deferred',
  next_time: 'deferred',
};

export default function MutualScreen() {
  const router = useRouter();
  const { t, language } = useI18n();
  const SECTION_STYLES = {
    mutual:      { fg: C.pinkDeep,    bg: C.pinkLight,   label: t('share.mutual.sectionLabels.mutual') },
    conditional: { fg: C.lavenderFg,  bg: C.lavender,    label: t('share.mutual.sectionLabels.conditional') },
    deferred:    { fg: C.creamFg,     bg: C.cream,       label: t('share.mutual.sectionLabels.deferred') },
  };
  const REACTION_LABEL_MAP: Record<string, string> = {
    love: t('candidates.rxLabel.love'),
    like: t('candidates.rxLabel.like'),
    burden: t('candidates.rxLabel.burden'),
    next_time: t('candidates.rxLabel.next_time'),
  };
  const [sections, setSections] = useState<Record<string, MutualCard[]>>({
    mutual: [], conditional: [], deferred: [],
  });
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setLoading(true);
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          const { data: profile } = await supabase
            .from('date_planner_profiles')
            .select('couple_id')
            .eq('user_id', user.id)
            .maybeSingle();

          if (!profile?.couple_id) return;

          const { data: reactions } = await supabase
            .from('reactions')
            .select('card_id, user_id, reaction_type')
            .in(
              'card_id',
              (await supabase
                .from('date_cards')
                .select('id')
                .eq('couple_id', profile.couple_id)
              ).data?.map(c => c.id) ?? [],
            );

          if (!reactions?.length) return;

          const cardIds = [...new Set(reactions.map(r => r.card_id))];
          const { data: cards } = await supabase
            .from('date_cards')
            .select('id, title, summary, estimated_time, estimated_budget, tags, content_i18n, steps')
            .in('id', cardIds);

          const cardMap: Record<string, { title: string; summary: string; estimated_time: string; estimated_budget: string; tags: string[]; steps?: CourseStep[] }> = {};
          (cards ?? []).forEach(raw => {
            const c = localizeCardContent(raw, language);
            cardMap[c.id] = { title: c.title, summary: c.summary, estimated_time: c.estimated_time, estimated_budget: c.estimated_budget, tags: c.tags ?? [], steps: c.steps };
          });

          const grouped: Record<string, typeof reactions> = {};
          reactions.forEach(r => {
            if (!grouped[r.card_id]) grouped[r.card_id] = [];
            grouped[r.card_id].push(r);
          });

          const result: Record<string, MutualCard[]> = { mutual: [], conditional: [], deferred: [] };
          for (const [cardId, rxList] of Object.entries(grouped)) {
            if (rxList.length < 2) continue;
            const mine = rxList.find(r => r.user_id === user.id);
            const partner = rxList.find(r => r.user_id !== user.id);
            if (!mine || !partner) continue;

            const mySection = REACTION_SECTION_MAP[mine.reaction_type] ?? 'deferred';
            const partnerSection = REACTION_SECTION_MAP[partner.reaction_type] ?? 'deferred';
            const section: MutualCard['section'] =
              mySection === 'mutual' && partnerSection === 'mutual' ? 'mutual'
              : mySection === 'deferred' || partnerSection === 'deferred' ? 'deferred'
              : 'conditional';

            const cardInfo = cardMap[cardId];
            result[section].push({
              id: cardId,
              section,
              title: cardInfo?.title ?? t('share.mutual.cardTitleFallback'),
              summary: cardInfo?.summary ?? '',
              estimatedTime: cardInfo?.estimated_time ?? '',
              estimatedBudget: cardInfo?.estimated_budget ?? '',
              tags: cardInfo?.tags ?? [],
              steps: cardInfo?.steps,
              myReaction: REACTION_LABEL_MAP[mine.reaction_type] ?? mine.reaction_type,
              partnerReaction: REACTION_LABEL_MAP[partner.reaction_type] ?? partner.reaction_type,
              note: section === 'mutual'
                ? t('share.mutual.notes.mutual')
                : section === 'conditional'
                ? t('share.mutual.notes.conditional')
                : t('share.mutual.notes.deferred'),
            });
          }
          setSections(result);
        } finally {
          setLoading(false);
        }
      })();
    }, [t]),
  );

  const totalCount = Object.values(sections).flat().length;
  const firstMutualId = sections.mutual[0]?.id ?? null;

  return (
    <SafeAreaView style={G.screen}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <BackBar />
        <View style={s.introWrap}>
          <Text style={T.h1}>{t('share.mutual.heading')}</Text>
          <Text style={[T.sub, s.subTextSpacing]}>{t('share.mutual.subText')}</Text>
        </View>

        {loading ? (
          <View style={s.loadingWrap}>
            <ActivityIndicator size="large" color={C.pink} />
          </View>
        ) : totalCount === 0 ? (
          <View style={s.emptyWrap}>
            <Sparkles size={44} strokeWidth={1.5} color={C.textMuted} />
            <Text style={s.emptyText}>{t('share.mutual.emptyText')}</Text>
          </View>
        ) : (
          (['mutual', 'conditional', 'deferred'] as const).map(key => {
            const items = sections[key];
            if (!items.length) return null;
            const style = SECTION_STYLES[key];
            return (
              <View key={key} style={s.sectionWrap}>
                <View style={s.sectionHeader}>
                  <View style={[s.sectionDot, { backgroundColor: style.fg }]} />
                  <Text style={s.sectionLabel}>{style.label}</Text>
                </View>
                {items.map(card => (
                  <SoftCard
                    key={card.id}
                    style={[s.cardGap, { backgroundColor: style.bg }]}
                    onPress={() => router.push(`/card/${card.id}` as any)}
                  >
                    <Text style={s.cardTitle}>{card.title}</Text>
                    {!!card.summary && (
                      <Text style={s.cardSummary} numberOfLines={2}>{card.summary}</Text>
                    )}

                    {!!card.steps?.length && (
                      <View style={s.stepsWrap}>
                        <CourseStepList steps={resolveDisplaySteps(card)} summary={card.summary} />
                      </View>
                    )}

                    {(!!card.estimatedTime || !!card.estimatedBudget) && (
                      <View style={s.metaRow}>
                        {!!card.estimatedTime && (
                          <View style={s.metaItem}>
                            <Clock size={11} color={style.fg} />
                            <Text style={[s.metaText, { color: style.fg }]}>{card.estimatedTime}</Text>
                          </View>
                        )}
                        {!!card.estimatedBudget && (
                          <View style={s.metaItem}>
                            <Wallet size={11} color={style.fg} />
                            <Text style={[s.metaText, { color: style.fg }]}>{card.estimatedBudget}</Text>
                          </View>
                        )}
                      </View>
                    )}

                    {card.tags.length > 0 && (
                      <View style={s.tagsRow}>
                        {card.tags.slice(0, 3).map(tag => (
                          <Chip key={tag} tone="gray">{tag}</Chip>
                        ))}
                      </View>
                    )}

                    <View style={s.reactionRow}>
                      <View style={s.reactionBox}>
                        <Text style={s.reactionBoxLabel}>{t('share.mutual.myReactionLabel')}</Text>
                        <Text style={s.reactionBoxValue}>{card.myReaction}</Text>
                      </View>
                      <View style={s.reactionBox}>
                        <Text style={s.reactionBoxLabel}>{t('share.mutual.partnerReactionLabel')}</Text>
                        <Text style={s.reactionBoxValue}>{card.partnerReaction}</Text>
                      </View>
                    </View>
                    <View style={s.noteBox}>
                      <Sparkles size={13} color={style.fg} style={s.noteIcon} />
                      <Text style={s.noteText}>{card.note}</Text>
                    </View>
                  </SoftCard>
                ))}
              </View>
            );
          })
        )}

        <View style={s.bottomSpacer} />
      </ScrollView>

      <View style={s.footer}>
        <BigButton
          onPress={() => {
            if (firstMutualId) {
              router.push(`/card/confirm?id=${firstMutualId}` as any);
            } else {
              router.replace('/(tabs)/candidates' as any);
            }
          }}
        >
          {t('share.mutual.confirmCta')}
        </BigButton>
        <TouchableOpacity style={s.textBtn} onPress={() => router.replace('/(tabs)/' as any)}>
          <Text style={s.textBtnText}>{t('share.mutual.seeMoreCta')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: SP.xl, paddingTop: SP.lg, paddingBottom: SP.xxxl + SP.lg },
  introWrap: { marginTop: SP.lg },
  subTextSpacing: { marginTop: SP.sm },
  loadingWrap: { alignItems: 'center', marginTop: 60 },
  sectionWrap: { marginTop: SP.xl + SP.xs },
  cardGap: { marginTop: SP.sm + 2 },
  bottomSpacer: { height: 120 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: SP.sm },
  sectionDot: { width: 4, height: 16, borderRadius: 2 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: C.text },
  cardTitle: { fontSize: 14, fontWeight: '700', color: C.text },
  cardSummary: { fontSize: 12, color: C.textSub, lineHeight: 18, marginTop: SP.xs },
  stepsWrap: { marginTop: SP.md },
  metaRow: { flexDirection: 'row', gap: SP.md, marginTop: SP.sm },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: SP.xs },
  metaText: { fontSize: 11, fontWeight: '600' },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.xs, marginTop: SP.sm },
  reactionRow: { flexDirection: 'row', gap: SP.sm, marginTop: SP.md },
  reactionBox: {
    flex: 1, borderRadius: R.md, padding: SP.sm + 2,
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  reactionBoxLabel: { fontSize: 10, color: C.textMuted },
  reactionBoxValue: { fontSize: 12, fontWeight: '600', color: C.text, marginTop: 2 },
  noteBox: {
    flexDirection: 'row', gap: SP.sm, marginTop: SP.md,
    borderRadius: R.md, padding: SP.md,
    backgroundColor: C.white,
    alignItems: 'flex-start',
  },
  noteIcon: { marginTop: 1 },
  noteText: { fontSize: 12, color: C.grayFg, lineHeight: 18, flex: 1 },
  emptyWrap: { alignItems: 'center', marginTop: 80, gap: SP.lg },
  emptyText: { fontSize: 14, color: C.textSub },
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
