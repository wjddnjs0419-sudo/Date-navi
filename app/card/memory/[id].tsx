import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, Image,
  TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { Heart, RotateCcw } from 'lucide-react-native';
import { C } from '../../../constants/colors';
import { G } from '../../../constants/theme';
import { BackBar, Badge } from '../../../components/ui';
import { useI18n } from '../../../lib/i18n';

type CardInfo = { title: string; summary: string };
type Memory = {
  id: string; review: string | null; want_again: boolean; title: string | null;
  created_at: string; photo_url: string | null; user_id: string; card_id: string | null;
};
type Comment = { id: string; user_id: string; content: string; created_at: string };
type Profile = { display_name: string; profile_photo_url: string | null };

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function CommentRow({ userId, content, createdAt, wantAgain, profiles }: {
  userId: string; content: string; createdAt: string; wantAgain?: boolean;
  profiles: Record<string, Profile>;
}) {
  const { t } = useI18n();
  const p = profiles[userId];
  const initial = p?.display_name?.slice(0, 1) ?? t('card.memory.meFallback');
  return (
    <View style={s.commentRow}>
      {p?.profile_photo_url ? (
        <Image source={{ uri: p.profile_photo_url }} style={s.avatar} />
      ) : (
        <View style={[s.avatar, s.avatarFallback]}>
          <Text style={s.avatarInitial}>{initial}</Text>
        </View>
      )}
      <View style={s.flex1}>
        <View style={s.commentHeader}>
          <Text style={s.commentName}>{p?.display_name ?? t('card.memory.meFallback')}</Text>
          <Text style={s.commentDate}>{formatDate(createdAt)}</Text>
          {wantAgain && (
            <View style={s.againTag}>
              <RotateCcw size={10} color={C.pinkDeep} />
              <Text style={s.againText}>{t('card.memory.wantAgainTag')}</Text>
            </View>
          )}
        </View>
        <Text style={s.commentText}>{content}</Text>
      </View>
    </View>
  );
}

export default function MemoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [card, setCard] = useState<CardInfo | null>(null);
  const [memory, setMemory] = useState<Memory | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [coupleId, setCoupleId] = useState<string | null>(null);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [photoAspect, setPhotoAspect] = useState(4 / 3);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!active) return;
        if (!user) { setLoading(false); return; }
        setMyUserId(user.id);

        const { data: myProfile } = await supabase
          .from('date_planner_profiles')
          .select('couple_id, display_name, profile_photo_url')
          .eq('user_id', user.id)
          .maybeSingle();
        if (!active) return;
        if (myProfile?.couple_id) setCoupleId(myProfile.couple_id);

        const { data: memRow } = await supabase
          .from('date_memories')
          .select('id, review, want_again, title, created_at, photo_url, user_id, card_id')
          .eq('id', id)
          .maybeSingle();
        if (!active) return;
        if (!memRow) { setMemory(null); setLoading(false); return; }
        setMemory(memRow);

        const [{ data: cardRow }, { data: commentRows }] = await Promise.all([
          memRow.card_id
            ? supabase.from('date_cards').select('title, summary').eq('id', memRow.card_id).maybeSingle()
            : Promise.resolve({ data: null }),
          supabase.from('date_memory_comments').select('id, user_id, content, created_at')
            .eq('memory_id', id).order('created_at', { ascending: true }),
        ]);
        if (!active) return;
        if (cardRow) setCard(cardRow);
        setComments(commentRows ?? []);

        const userIds = Array.from(new Set([memRow.user_id, ...(commentRows ?? []).map(c => c.user_id)]));
        const { data: profileRows } = await supabase
          .from('date_planner_profiles')
          .select('user_id, display_name, profile_photo_url')
          .in('user_id', userIds);
        if (!active) return;
        const map: Record<string, Profile> = {};
        (profileRows ?? []).forEach(p => { map[p.user_id] = { display_name: p.display_name, profile_photo_url: p.profile_photo_url }; });
        if (myProfile?.display_name && !map[user.id]) {
          map[user.id] = { display_name: myProfile.display_name, profile_photo_url: myProfile.profile_photo_url };
        }
        setProfiles(map);
        setLoading(false);
      })();
      return () => { active = false; };
    }, [id]),
  );

  async function handleAddComment() {
    const content = newComment.trim();
    if (!content || !myUserId || !coupleId || posting) return;
    setPosting(true);
    try {
      const { data, error } = await supabase
        .from('date_memory_comments')
        .insert({ memory_id: id, couple_id: coupleId, user_id: myUserId, content })
        .select('id, user_id, content, created_at')
        .single();
      if (error) throw error;
      setComments(prev => [...prev, data]);
      setNewComment('');
    } catch {
      Alert.alert(t('common.error'), t('card.memory.commentError'));
    } finally {
      setPosting(false);
    }
  }

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={C.pink} />
      </View>
    );
  }

  if (!memory) {
    return (
      <SafeAreaView style={G.screen}>
        <ScrollView contentContainerStyle={s.content}>
          <BackBar />
          <Text style={s.empty}>{t('card.memory.detailNotFound')}</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={G.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.flex1}>
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <BackBar />

          {memory.photo_url ? (
            <View style={[s.bannerWrap, { aspectRatio: photoAspect }]}>
              <Image
                source={{ uri: memory.photo_url }}
                style={s.bannerPhoto}
                resizeMode="cover"
                onLoad={(e) => {
                  const { width, height } = e.nativeEvent.source;
                  if (width && height) setPhotoAspect(width / height);
                }}
              />
            </View>
          ) : (
            <View style={s.banner}>
              <View style={s.iconWrap}>
                <Heart size={26} strokeWidth={1.5} color={C.pinkDeep} />
              </View>
            </View>
          )}

          <Badge tone="pink">{t('card.memory.badge')}</Badge>
          <Text style={s.title}>{card?.title ?? memory.title ?? t('memories.untitled')}</Text>
          {!!card?.summary && <Text style={s.summary}>{card.summary}</Text>}

          <Text style={s.sectionLabel}>{t('card.memory.reviewSectionLabel')}</Text>
          <CommentRow
            userId={memory.user_id}
            content={memory.review?.trim() || t('card.memory.noReviewText')}
            createdAt={memory.created_at}
            wantAgain={memory.want_again}
            profiles={profiles}
          />

          <Text style={s.sectionLabel}>{t('card.memory.commentsSectionLabel')}</Text>
          {comments.length === 0 ? (
            <Text style={s.empty}>{t('card.memory.noCommentsText')}</Text>
          ) : (
            comments.map(c => (
              <CommentRow
                key={c.id}
                userId={c.user_id}
                content={c.content}
                createdAt={c.created_at}
                profiles={profiles}
              />
            ))
          )}

          <View style={s.bottomSpacer} />
        </ScrollView>

        <View style={s.inputBar}>
          <TextInput
            style={s.input}
            value={newComment}
            onChangeText={setNewComment}
            placeholder={t('card.memory.commentPlaceholder')}
            placeholderTextColor={C.textFaint}
            multiline
          />
          <TouchableOpacity
            style={[s.sendBtn, (!newComment.trim() || posting) && s.sendBtnDisabled]}
            onPress={handleAddComment}
            disabled={!newComment.trim() || posting}
            activeOpacity={0.85}
          >
            <Text style={s.sendBtnText}>{posting ? t('card.memory.commentPosting') : t('card.memory.commentSubmit')}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  flex1: { flex: 1 },
  bottomSpacer: { height: 24 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },
  banner: {
    width: '100%', aspectRatio: 4 / 3, borderRadius: 22, marginBottom: 16, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center', backgroundColor: C.pinkMid,
  },
  bannerWrap: {
    width: '100%', borderRadius: 22, marginBottom: 16, overflow: 'hidden',
  },
  bannerPhoto: { width: '100%', height: '100%' },
  iconWrap: {
    width: 56, height: 56, borderRadius: 16,
    backgroundColor: C.white, alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 22, fontWeight: '700', color: C.text, marginTop: 10, lineHeight: 29 },
  summary: { fontSize: 13, color: C.textSub, lineHeight: 20, marginTop: 6 },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: C.text, marginTop: 24, marginBottom: 4 },
  empty: { fontSize: 13, color: C.textSub },

  commentRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.borderLight,
  },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  avatarFallback: { backgroundColor: C.pinkLight, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 13, fontWeight: '700', color: C.pinkDeep },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  commentName: { fontSize: 12, fontWeight: '700', color: C.text },
  commentDate: { fontSize: 11, color: C.textMuted },
  againTag: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: C.pinkLight, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2,
  },
  againText: { fontSize: 10, fontWeight: '600', color: C.pinkDeep },
  commentText: { fontSize: 13, color: C.text, lineHeight: 19, marginTop: 3 },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.white,
  },
  input: {
    flex: 1, maxHeight: 90, fontSize: 13, color: C.text,
    backgroundColor: C.bg, borderRadius: 14, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  sendBtn: { backgroundColor: C.pink, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 11 },
  sendBtnDisabled: { backgroundColor: C.disabledBg },
  sendBtnText: { color: C.white, fontSize: 13, fontWeight: '700' },
});
