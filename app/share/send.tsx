import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { generateInviteMessage } from '../../lib/ai';
import { Heart, Sparkles } from 'lucide-react-native';
import { C } from '../../constants/colors';
import { G } from '../../constants/theme';
import { BackBar, BigButton, Chip, SuccessModal } from '../../components/ui';
import { useI18n } from '../../lib/i18n';
import { localizeCardContent } from '../../lib/card-i18n';

type CardInfo = { id: string; title: string; summary: string; tags: string[] };

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
          .select('id, title, summary, tags, content_i18n')
          .eq('id', cardId)
          .maybeSingle();
        if (data) setCard(localizeCardContent(data, language));
      } finally {
        setLoading(false);
      }
    })();
  }, [cardId]);

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
          <Text style={s.heading}>{t('share.send.heading')}</Text>
          <Text style={s.subText}>{t('share.send.subText')}</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={C.pink} style={s.loadingSpinner} />
        ) : (
          <View style={s.cardBox}>
            <View style={s.cardBanner}>
              <View style={s.cardIconWrap}>
                <Heart size={26} strokeWidth={1.5} color={C.pinkDeep} />
              </View>
            </View>
            <View style={s.cardBody}>
              <Text style={s.cardTitle}>{card?.title ?? t('share.cardTitleFallback')}</Text>
              <Text style={s.cardDesc}>{card?.summary ?? t('share.cardDescFallback')}</Text>
              <View style={s.tagsRow}>
                {(card?.tags ?? t('share.send.tagsFallback', { returnObjects: true }) as string[]).slice(0, 3).map((tag) => (
                  <Chip key={tag} tone="gray">{tag}</Chip>
                ))}
              </View>
            </View>
          </View>
        )}

        <View style={s.sectionBlock}>
          <Text style={s.sectionLabel}>{t('share.send.sectionLabel')}</Text>
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
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  introWrap: { marginTop: 16 },
  loadingSpinner: { marginTop: 40 },
  cardBody: { padding: 16 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  sectionBlock: { marginTop: 20 },
  bottomSpacer: { height: 120 },
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
    backgroundColor: C.bg,
    gap: 4,
  },
  textBtn: { alignItems: 'center', paddingVertical: 10 },
  textBtnText: { fontSize: 13, color: C.textSub, fontWeight: '500' },
});
