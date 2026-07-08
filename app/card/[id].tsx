import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { C } from '../../constants/colors';
import { supabase } from '../../lib/supabase';
import { useI18n } from '../../lib/i18n';
import { generateDateCards, getUserPreferences } from '../../lib/ai';
import type { FeelingInput } from '../../lib/ai';
import { PlaceRow } from '../../components/ui';

type CardDetail = {
  id: string;
  title: string;
  summary: string;
  estimated_time: string;
  estimated_budget: string;
  tags: string[];
  why_recommended: string;
  place_name?: string | null;
  place_address?: string | null;
  map_url?: string | null;
  mode: string;
  created_at: string;
  // 원본 추천 입력. 조건 재생성 시 location/coords를 보존하려면 필요 (V2 §15).
  input_json?: Partial<FeelingInput> | null;
};

type ReactionType = 'love' | 'like' | 'burden' | 'next_time';
type ConditionTag = 'change_place' | 'closer' | 'indoor';

const REACTIONS: { type: ReactionType; color: string; bg: string }[] = [
  { type: 'love', color: '#FF4F6D', bg: '#FFF0F3' },
  { type: 'like', color: '#FF8C42', bg: '#FFF5EE' },
  { type: 'burden', color: '#6B7280', bg: '#F3F4F6' },
  { type: 'next_time', color: '#8B5CF6', bg: '#F5F3FF' },
];

export default function CardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { strings: s, t, language } = useI18n();
  const alertTitle = s.common.error;
  const CONDITION_TAGS: { tag: ConditionTag; label: string; emoji: string; freeText: string }[] = [
    { tag: 'change_place', label: t('card.conditionTags.change_place.label'), emoji: '📍', freeText: t('card.conditionTags.change_place.freeText') },
    { tag: 'closer', label: t('card.conditionTags.closer.label'), emoji: '🚶', freeText: t('card.conditionTags.closer.freeText') },
    { tag: 'indoor', label: t('card.conditionTags.indoor.label'), emoji: '🏠', freeText: t('card.conditionTags.indoor.freeText') },
  ];

  const [card, setCard] = useState<CardDetail | null>(null);
  const [myReaction, setMyReaction] = useState<ReactionType | null>(null);
  const [myConditionTag, setMyConditionTag] = useState<ConditionTag | null>(null);
  const [partnerReaction, setPartnerReaction] = useState<ReactionType | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [coupleId, setCoupleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generatingAlt, setGeneratingAlt] = useState(false);
  const [memoryDone, setMemoryDone] = useState(false);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setLoading(true);
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;
          setMyUserId(user.id);

          const { data: profile } = await supabase
            .from('date_planner_profiles')
            .select('couple_id')
            .eq('user_id', user.id)
            .maybeSingle();
          if (profile?.couple_id) setCoupleId(profile.couple_id);

          const { data: cardData } = await supabase
            .from('date_cards')
            .select('*')
            .eq('id', id)
            .maybeSingle();

          if (!cardData) return;
          setCard(cardData);

          const { data: memData } = await supabase
            .from('date_memories')
            .select('id')
            .eq('card_id', id)
            .eq('user_id', user.id)
            .maybeSingle();
          if (memData) setMemoryDone(true);

          const { data: rxData } = await supabase
            .from('reactions')
            .select('user_id, reaction_type, condition_tag')
            .eq('card_id', id);

          if (rxData) {
            const mine = rxData.find(r => r.user_id === user.id);
            const partner = rxData.find(r => r.user_id !== user.id);
            if (mine) {
              setMyReaction(mine.reaction_type as ReactionType);
              // 레거시 데이터(예: 제거된 'budget_adjust')는 CONDITION_TAGS에 없으므로 무시한다.
              if (mine.condition_tag && CONDITION_TAGS.some(c => c.tag === mine.condition_tag)) {
                setMyConditionTag(mine.condition_tag as ConditionTag);
              }
            }
            if (partner) setPartnerReaction(partner.reaction_type as ReactionType);
          }
        } finally {
          setLoading(false);
        }
      })();
    }, [id]),
  );

  async function handleReact(type: ReactionType, condTag?: ConditionTag) {
    if (saving) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('reactions')
        .upsert(
          { card_id: id, user_id: myUserId, reaction_type: type, condition_tag: condTag ?? null },
          { onConflict: 'card_id,user_id' },
        );
      if (error) throw error;
      setMyReaction(type);
      setMyConditionTag(condTag ?? null);
    } catch {
      Alert.alert(alertTitle, s.card.saveError);
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateAlt(condTag: ConditionTag) {
    if (!coupleId || !myUserId || !card) return;
    setGeneratingAlt(true);
    try {
      const condInfo = CONDITION_TAGS.find(c => c.tag === condTag);
      // 원본 input_json을 base로 쓰고 조건분만 override → location/coords 보존 (§15).
      // input_json이 없는 구 카드는 기존 하드코딩 base로 폴백(location 없음).
      const base: FeelingInput = card.input_json && typeof card.input_json === 'object'
        ? {
            energy: 'medium', distance: 'any', mood: 'comfortable', duration: '2-3h', avoid: [],
            ...card.input_json,
          }
        : { energy: 'medium', distance: 'any', mood: 'comfortable', duration: '2-3h', avoid: [] };
      const input: FeelingInput = {
        ...base,
        distance: condTag === 'closer' ? 'near' : base.distance,
        avoid: condTag === 'indoor' ? [...new Set([...(base.avoid ?? []), 'outdoor'])] : base.avoid,
        freeText: `${t('card.regeneratePromptPrefix', { title: card.title })}${condInfo?.freeText ?? t('card.regenerateFallbackText')}`,
      };
      const prefs = await getUserPreferences();
      const newCards = await generateDateCards(input, card.mode || 'feeling', prefs, language);
      for (const nc of newCards) {
        await supabase.from('date_cards').insert({
          couple_id: coupleId,
          created_by: myUserId,
          mode: card.mode || 'feeling',
          source: 'ai',
          status: 'active',
          title: nc.title,
          summary: nc.summary,
          estimated_time: nc.estimated_time,
          estimated_budget: nc.estimated_budget,
          tags: nc.tags,
          why_recommended: nc.why_recommended,
          place_name: nc.place_name ?? null,
          place_address: nc.place_address ?? null,
          map_url: nc.map_url ?? null,
          steps: nc.steps ?? null,
        });
      }
      Alert.alert(
        t('card.regenerateAlertTitle'),
        t('card.regenerateAlertMessage', { label: condInfo?.label }),
        [{ text: t('common.ok') }],
      );
    } catch {
      Alert.alert(alertTitle, s.card.saveError);
    } finally {
      setGeneratingAlt(false);
    }
  }

  const partnerInfo = partnerReaction
    ? REACTIONS.find(r => r.type === partnerReaction)
    : null;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
          <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backText}>{s.common.back}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{s.card.title}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#FF4F6D" />
        </View>
      ) : !card ? (
        <View style={styles.loadingWrap}>
          <Text style={styles.missingText}>{s.card.missing}</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <View style={styles.modeBadge}>
            <Text style={styles.modeText}>{s.card.modeLabels[card.mode] ?? card.mode}</Text>
          </View>

          <Text style={styles.title}>{card.title}</Text>
          <Text style={styles.summary}>{card.summary}</Text>

          {!!card.place_name && (
            <PlaceRow name={card.place_name} address={card.place_address ?? undefined} url={card.map_url ?? undefined} style={styles.placeRowSpacing} />
          )}

          {(!!card.estimated_time || !!card.estimated_budget) && (
            <View style={styles.metaRow}>
              {!!card.estimated_time && (
                <View style={styles.metaItem}>
                  <Text style={styles.metaIcon}>⏱</Text>
                  <Text style={styles.metaText}>{card.estimated_time}</Text>
                </View>
              )}
              {!!card.estimated_time && !!card.estimated_budget && <View style={styles.metaDivider} />}
              {!!card.estimated_budget && (
                <View style={styles.metaItem}>
                  <Text style={styles.metaIcon}>💰</Text>
                  <Text style={styles.metaText}>{card.estimated_budget}</Text>
                </View>
              )}
            </View>
          )}

          <View style={styles.tagRow}>
            {(card.tags ?? []).map((tag, i) => (
              <View key={i} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>

          <View style={styles.whyBox}>
            <Text style={styles.whyText}>💬 {card.why_recommended}</Text>
          </View>

          <View style={styles.divider} />

          <Text style={styles.reactionTitle}>{s.card.reactionTitle}</Text>
          <Text style={styles.reactionSub}>{s.card.reactionSubtitle}</Text>

          <View style={styles.reactionGrid}>
            {REACTIONS.map(r => {
              const selected = myReaction === r.type;
              return (
                <TouchableOpacity
                  key={r.type}
                  style={[
                    styles.reactionBtn,
                    { backgroundColor: selected ? r.bg : '#F7F7F7' },
                    selected && styles.reactionBtnSelected,
                    selected && { borderColor: r.color },
                  ]}
                  onPress={() => handleReact(r.type)}
                  disabled={saving}
                  activeOpacity={0.75}
                >
                  <Text style={styles.reactionEmoji}>{s.card.reactionLabels[r.type].emoji}</Text>
                  <Text style={[styles.reactionLabel, selected && styles.reactionLabelSelected, selected && { color: r.color }]}>
                    {s.card.reactionLabels[r.type].label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 조건부 반응 — burden 선택 시 노출 */}
          {myReaction === 'burden' && (
            <View style={styles.conditionBox}>
              <Text style={styles.conditionTitle}>{t('card.conditionSectionTitle')}</Text>
              <Text style={styles.conditionSub}>{t('card.conditionSectionSub')}</Text>
              <View style={styles.conditionGrid}>
                {CONDITION_TAGS.map(c => {
                  const selected = myConditionTag === c.tag;
                  return (
                    <TouchableOpacity
                      key={c.tag}
                      style={[styles.conditionBtn, selected && styles.conditionBtnSelected]}
                      onPress={() => handleReact('burden', selected ? undefined : c.tag)}
                      disabled={saving}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.conditionEmoji}>{c.emoji}</Text>
                      <Text style={[styles.conditionLabel, selected && styles.conditionLabelSelected]}>
                        {c.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {myConditionTag && (
                <TouchableOpacity
                  style={[styles.altBtn, generatingAlt && styles.altBtnBusy]}
                  onPress={() => handleGenerateAlt(myConditionTag)}
                  disabled={generatingAlt}
                  activeOpacity={0.85}
                >
                  {generatingAlt ? (
                    <ActivityIndicator size="small" color="#6B7280" />
                  ) : (
                    <Text style={styles.altBtnText}>
                      {CONDITION_TAGS.find(c => c.tag === myConditionTag)?.emoji}{' '}
                      {t('card.regenerateWithCondition', { label: CONDITION_TAGS.find(c => c.tag === myConditionTag)?.label })}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          )}

          {partnerInfo && (
            <View style={[styles.partnerBadge, { backgroundColor: partnerInfo.bg }]}>
              <Text style={styles.partnerText}>
                {s.card.partnerReaction(s.card.reactionLabels[partnerReaction!].label, s.card.reactionLabels[partnerReaction!].emoji)}
              </Text>
            </View>
          )}

          {!partnerReaction && (
            <View style={styles.partnerWaiting}>
              <Text style={styles.partnerWaitingText}>{s.card.partnerWaiting}</Text>
            </View>
          )}

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.confirmBtn}
            onPress={() => router.push({ pathname: '/card/confirm', params: { id } })}
            activeOpacity={0.85}
          >
            <Text style={styles.confirmBtnText}>{s.card.confirmButton}</Text>
          </TouchableOpacity>

          {memoryDone ? (
            <View style={styles.memoryDoneBadge}>
              <Text style={styles.memoryDoneText}>{s.card.memoryDone}</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.memoryBtn}
              onPress={() => router.push({ pathname: '/card/review', params: { id } })}
              activeOpacity={0.85}
            >
              <Text style={styles.memoryBtnText}>{s.card.memoryButton}</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.white },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  backText: { fontSize: 24, color: '#333' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: C.ink },
  headerSpacer: { width: 32 },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  missingText: { color: '#999' },

  scroll: { flex: 1 },
  content: { padding: 24, paddingBottom: 60 },

  modeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFF0F3',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
    marginBottom: 14,
  },
  modeText: { fontSize: 12, color: C.danger, fontWeight: '600' },

  title: { fontSize: 24, fontWeight: '700', color: C.ink, marginBottom: 8, lineHeight: 32 },
  summary: { fontSize: 15, color: '#555', lineHeight: 22, marginBottom: 16 },
  placeRowSpacing: { marginTop: 4, marginBottom: 20 },

  metaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaIcon: { fontSize: 14 },
  metaText: { fontSize: 14, color: '#555', fontWeight: '500' },
  metaDivider: { width: 1, height: 14, backgroundColor: '#DDD', marginHorizontal: 12 },

  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  tag: { backgroundColor: '#F0F0F0', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10 },
  tagText: { fontSize: 13, color: '#555', fontWeight: '500' },

  whyBox: { backgroundColor: '#FFF0F3', borderRadius: 12, padding: 14, marginBottom: 8 },
  whyText: { fontSize: 14, color: C.danger, lineHeight: 21 },

  divider: { height: 1, backgroundColor: '#F0F0F0', marginVertical: 24 },

  reactionTitle: { fontSize: 18, fontWeight: '700', color: C.ink, marginBottom: 4 },
  reactionSub: { fontSize: 13, color: '#999', marginBottom: 18 },

  reactionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  reactionBtn: {
    width: '47%',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    gap: 6,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  reactionBtnSelected: { borderWidth: 2 },
  reactionEmoji: { fontSize: 28 },
  reactionLabel: { fontSize: 14, color: '#555', fontWeight: '500' },
  reactionLabelSelected: { fontWeight: '700' },

  conditionBox: {
    backgroundColor: '#F8F8F8',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  conditionTitle: { fontSize: 15, fontWeight: '700', color: C.ink, marginBottom: 4 },
  conditionSub: { fontSize: 12, color: C.coolGrayLight, marginBottom: 14 },
  conditionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  conditionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20,
    backgroundColor: '#EFEFEF', borderWidth: 1.5, borderColor: 'transparent',
  },
  conditionBtnSelected: { backgroundColor: '#EEF2FF', borderColor: C.coolGray },
  conditionEmoji: { fontSize: 14 },
  conditionLabel: { fontSize: 13, fontWeight: '500', color: '#555' },
  conditionLabelSelected: { color: '#374151', fontWeight: '700' },
  altBtn: {
    backgroundColor: C.ink, borderRadius: 14,
    paddingVertical: 13, alignItems: 'center',
  },
  altBtnBusy: { opacity: 0.6 },
  altBtnText: { fontSize: 13, fontWeight: '700', color: C.white },
  partnerBadge: {
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginBottom: 8,
  },
  partnerText: { fontSize: 14, fontWeight: '600', color: '#333' },

  partnerWaiting: {
    backgroundColor: '#F7F7F7',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  partnerWaitingText: { fontSize: 14, color: '#999' },

  confirmBtn: {
    backgroundColor: '#FFF0F3',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: C.pinkBorder,
    marginBottom: 10,
  },
  confirmBtnText: { fontSize: 15, fontWeight: '600', color: C.pinkDeep },
  memoryBtn: {
    backgroundColor: C.ink,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  memoryBtnText: { fontSize: 15, fontWeight: '700', color: C.white },
  memoryDoneBadge: {
    backgroundColor: '#F0FDF4',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  memoryDoneText: { fontSize: 15, fontWeight: '600', color: '#16A34A' },

});
