import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Heart } from 'lucide-react-native';
import { C } from '../../constants/colors';
import { G } from '../../constants/theme';
import { BackBar, BigButton } from '../../components/ui';

const REACTIONS = [
  '완전 끌려', '좋아', '느낌은 좋아', '가까우면 좋아',
  '오늘은 조금 부담돼', '다음에 하고 싶어', '돈 들어오면 하자', '오래 걷지 않으면 좋아',
];

const REACTION_TYPE_MAP: Record<string, string> = {
  '완전 끌려': 'love',
  '좋아': 'love',
  '느낌은 좋아': 'like',
  '가까우면 좋아': 'like',
  '오늘은 조금 부담돼': 'burden',
  '다음에 하고 싶어': 'next_time',
  '돈 들어오면 하자': 'next_time',
  '오래 걷지 않으면 좋아': 'like',
};

export default function ReactionScreen() {
  const { cardId } = useLocalSearchParams<{ cardId: string }>();
  const router = useRouter();

  const [selectedIdx, setSelectedIdx] = useState(3);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [partnerName, setPartnerName] = useState('상대방');
  const [card, setCard] = useState<{ title: string; summary: string } | null>(null);
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
          .select('title, summary')
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

      const reactionType = REACTION_TYPE_MAP[REACTIONS[selectedIdx]] ?? 'like';
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
            <Text style={s.senderName}>{partnerName}이 보냈어요</Text>
            <Text style={s.senderTime}>방금 전</Text>
          </View>
        </View>

        <Text style={[s.heading, s.headingSpacing]}>이 데이트 어때요?</Text>

        <View style={s.cardBox}>
          <View style={s.cardBanner}>
            <View style={s.cardIconWrap}>
              <Heart size={22} strokeWidth={1.5} color={C.pinkDeep} />
            </View>
          </View>
          <View style={s.cardBody}>
            <Text style={s.cardTitle}>{card?.title ?? '선택한 데이트 후보'}</Text>
            <Text style={s.cardDesc}>{card?.summary ?? '멀리 가지 않고 편하게 쉬는 데이트'}</Text>
            {!!sentMessage && (
              <View style={s.noteBox}>
                <Text style={s.noteText}>"{sentMessage}"</Text>
              </View>
            )}
          </View>
        </View>

        <View style={s.sectionBlock}>
          <Text style={s.sectionLabel}>마음에 드는 반응을 골라주세요</Text>
          <View style={s.reactionGrid}>
            {REACTIONS.map((t, i) => {
              const sel = i === selectedIdx;
              return (
                <TouchableOpacity
                  key={t}
                  style={[s.reactionBtn, sel && s.reactionBtnOn]}
                  onPress={() => setSelectedIdx(i)}
                  activeOpacity={0.7}
                >
                  <Text style={[s.reactionBtnText, sel && s.reactionBtnTextOn]}>{t}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={s.sectionBlock}>
          <Text style={s.sectionLabel}>한마디 (선택)</Text>
          <View style={s.noteInputBox}>
            <TextInput
              style={s.noteInput}
              value={note}
              onChangeText={setNote}
              placeholder="예: 이거 좋은데 이번 주말보단 다음 주가 좋을 것 같아."
              placeholderTextColor={C.textFaint}
              multiline
            />
          </View>
        </View>

        <View style={s.bottomSpacer} />
      </ScrollView>

      <View style={s.footer}>
        <BigButton onPress={handleSubmit} variant={saving ? 'disabled' : 'primary'}>
          {saving ? <ActivityIndicator color={C.white} size="small" /> : '반응 남기기'}
        </BigButton>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  senderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  senderAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: C.pinkLight,
    alignItems: 'center', justifyContent: 'center',
  },
  senderAvatarText: { fontSize: 13, fontWeight: '700', color: C.pinkDeep },
  senderName: { fontSize: 13, fontWeight: '600', color: C.text },
  senderTime: { fontSize: 11, color: C.textLight, marginTop: 1 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 29 },
  headingSpacing: { marginTop: 16 },
  cardBody: { padding: 16 },
  sectionBlock: { marginTop: 20 },
  bottomSpacer: { height: 120 },
  cardBox: {
    marginTop: 16,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
  },
  cardBanner: {
    height: 90,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.pinkMid,
  },
  cardIconWrap: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: C.white,
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: C.text },
  cardDesc: { fontSize: 12, color: C.textSub, marginTop: 4 },
  noteBox: { marginTop: 12, borderRadius: 12, padding: 12, backgroundColor: C.cream },
  noteText: { fontSize: 12, color: C.grayFg, lineHeight: 18 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 12 },
  reactionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reactionBtn: {
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: C.white,
    borderWidth: 1.5,
    borderColor: C.border,
  },
  reactionBtnOn: { backgroundColor: C.pinkLight, borderColor: C.pinkBorder },
  reactionBtnText: { fontSize: 12, color: C.inkSoft, fontWeight: '500' },
  reactionBtnTextOn: { color: C.pinkDeep, fontWeight: '600' },
  noteInputBox: {
    backgroundColor: C.white,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
    minHeight: 70,
  },
  noteInput: { fontSize: 13, color: C.text, lineHeight: 20 },
  footer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 12,
    backgroundColor: C.bg,
  },
});
