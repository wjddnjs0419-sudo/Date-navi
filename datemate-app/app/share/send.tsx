import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, SafeAreaView, TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { generateSoftMessage } from '../../lib/ai';
import { Heart, Sparkles } from 'lucide-react-native';
import { C } from '../../constants/colors';
import { BackBar, BigButton, Chip } from '../../components/ui';

type CardInfo = { id: string; title: string; summary: string; tags: string[] };

export default function SendScreen() {
  const { cardId } = useLocalSearchParams<{ cardId: string }>();
  const router = useRouter();

  const [card, setCard] = useState<CardInfo | null>(null);
  const [message, setMessage] = useState('오늘은 이 정도면 부담 없을 것 같아!');
  const [loading, setLoading] = useState(!!cardId);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!cardId) return;
    (async () => {
      try {
        const { data } = await supabase
          .from('date_cards')
          .select('id, title, summary, tags')
          .eq('id', cardId)
          .maybeSingle();
        if (data) setCard(data);
      } finally {
        setLoading(false);
      }
    })();
  }, [cardId]);

  async function handleSuggestMessage() {
    setGenerating(true);
    try {
      const text = await generateSoftMessage(
        { reasons: ['그래도 같이 있고 싶어'], freeText: undefined },
        'ko',
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
        reason_tags: [],
        free_text: null,
        generated_text: message,
        used: true,
      });

      router.push('/share/reaction' as any);
    } finally {
      setSending(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFF8F3' }}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <BackBar />
        <View style={{ marginTop: 16 }}>
          <Text style={s.heading}>이 후보를 상대에게{'\n'}보내볼까요?</Text>
          <Text style={s.subText}>상대방이 부담 없이 반응할 수 있게 부드럽게 전달돼요.</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={C.pink} style={{ marginTop: 40 }} />
        ) : (
          <View style={s.cardBox}>
            <View style={s.cardBanner}>
              <View style={s.cardIconWrap}>
                <Heart size={26} strokeWidth={1.5} color={C.pinkDeep} />
              </View>
            </View>
            <View style={{ padding: 16 }}>
              <Text style={s.cardTitle}>{card?.title ?? '선택한 데이트 후보'}</Text>
              <Text style={s.cardDesc}>{card?.summary ?? '멀리 가지 않고 편하게 쉬는 데이트'}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                {(card?.tags ?? ['이동 적음', '돈 적게 듦', '피곤한 날']).slice(0, 3).map(t => (
                  <Chip key={t} tone="gray">{t}</Chip>
                ))}
              </View>
            </View>
          </View>
        )}

        <View style={{ marginTop: 20 }}>
          <Text style={s.sectionLabel}>함께 보낼 한마디</Text>
          <View style={s.messageBox}>
            <TextInput
              style={s.messageInput}
              value={message}
              onChangeText={setMessage}
              multiline
              placeholder="한마디를 입력하세요"
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
                  <Text style={s.suggestBtnText}>한마디 추천받기</Text>
                </>}
          </TouchableOpacity>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      <View style={s.footer}>
        <BigButton onPress={handleSend} variant={sending ? 'disabled' : 'primary'}>
          상대에게 보내기
        </BigButton>
        <TouchableOpacity style={s.textBtn} onPress={() => router.back()}>
          <Text style={s.textBtnText}>수정하기</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, lineHeight: 29 },
  subText: { fontSize: 13, color: C.textSub, lineHeight: 20, marginTop: 8 },
  cardBox: {
    marginTop: 20,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
  },
  cardBanner: {
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.pinkMid,
  },
  cardIconWrap: {
    width: 56, height: 56, borderRadius: 16,
    backgroundColor: C.white,
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: C.text },
  cardDesc: { fontSize: 12, color: C.textSub, marginTop: 4 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 8 },
  messageBox: {
    backgroundColor: C.white,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
    minHeight: 80,
  },
  messageInput: { fontSize: 13, color: C.text, lineHeight: 22 },
  suggestBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: C.lavender,
  },
  suggestBtnText: { fontSize: 12, fontWeight: '600', color: C.lavenderFg },
  footer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 12,
    backgroundColor: '#FFF8F3',
    gap: 4,
  },
  textBtn: { alignItems: 'center', paddingVertical: 10 },
  textBtnText: { fontSize: 13, color: C.textSub, fontWeight: '500' },
});
