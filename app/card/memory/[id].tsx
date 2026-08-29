import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, Image,
  TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { Heart, RotateCcw } from '../../../components/iconography';
import { C, DS, SP, G } from '../../../constants/theme';
import { Badge, Header, MoreMenu, ScreenHeading } from '../../../components/ui';
import { StarRating } from '../../../components/StarRating';
import { useI18n } from '../../../lib/i18n';
import { useOptionalSafeAreaInsets } from '../../../lib/use-optional-safe-area-insets';
import { removeStorageObjectByUrl } from '../../../lib/storageCleanup';

type CardInfo = { title: string; summary: string };
type Memory = {
  id: string; review: string | null; want_again: boolean; title: string | null;
  created_at: string; photo_url: string | null; user_id: string; card_id: string | null;
  rating: number | null;
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
  const router = useRouter();
  const { t } = useI18n();
  const insets = useOptionalSafeAreaInsets();
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
          .select('id, review, want_again, title, created_at, photo_url, user_id, card_id, rating')
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

  function confirmDeleteMemory() {
    Alert.alert(t('memories.deleteAlertTitle'), t('memories.deleteAlertMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'), style: 'destructive',
        onPress: async () => {
          const { data, error } = await supabase.from('date_memories').delete().eq('id', id).select('id, photo_url');
          if (error) { Alert.alert(t('common.error'), t('memories.deleteAlertError')); return; }
          if (!data?.length) { Alert.alert(t('common.notice'), t('memories.deleteAlertForbidden')); return; }
          void removeStorageObjectByUrl(data[0].photo_url);
          router.back();
        },
      },
    ]);
  }

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
      <SafeAreaView style={G.screen} edges={['top']}>
        <Header onBack={() => router.back()} />
        <ScreenHeading title={t('card.memory.badge')} />
        <ScrollView contentContainerStyle={s.content}>
          <Text style={s.empty}>{t('card.memory.detailNotFound')}</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={G.screen} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.flex1}>
        <Header
          onBack={() => router.back()}
          right={(
            <MoreMenu
              testID="memory-more-menu"
              onEdit={() => router.push({ pathname: '/card/memory/edit/[id]', params: { id } } as any)}
              onDelete={confirmDeleteMemory}
            />
          )}
        />
        <ScreenHeading title={t('card.memory.badge')} />
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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
          {memory.rating ? (
            <View style={s.ratingRow}>
              <StarRating rating={memory.rating} size={18} testID="memory-detail-stars" />
            </View>
          ) : null}
          {!!card?.summary && <Text style={s.summary}>{card.summary}</Text>}

          {/* 한줄평은 별도 섹션 없이 댓글 목록 맨 위에 일반 댓글처럼 노출한다. */}
          <Text style={s.sectionLabel}>{t('card.memory.commentsSectionLabel')}</Text>
          {!!memory.review?.trim() && (
            <CommentRow
              userId={memory.user_id}
              content={memory.review.trim()}
              createdAt={memory.created_at}
              wantAgain={memory.want_again}
              profiles={profiles}
            />
          )}
          {comments.length === 0 && !memory.review?.trim() ? (
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

        <View style={[s.inputBar, { paddingBottom: SP.screen + insets.bottom }]}>
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
            activeOpacity={0.88}
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
  bottomSpacer: { height: SP.xxl },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  content: { paddingHorizontal: SP.screen, paddingTop: SP.xxl, paddingBottom: SP.xxl },
  banner: {
    width: '100%', aspectRatio: 4 / 3, borderRadius: DS.radius.card, marginBottom: SP.lg, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center', backgroundColor: C.pinkMid,
  },
  bannerWrap: {
    width: '100%', borderRadius: DS.radius.card, marginBottom: SP.lg, overflow: 'hidden',
  },
  bannerPhoto: { width: '100%', height: '100%' },
  iconWrap: {
    width: 56, height: 56, borderRadius: DS.radius.input,
    backgroundColor: C.white, alignItems: 'center', justifyContent: 'center',
  },
  title: { ...DS.typography.headingLegacy, color: C.text, marginTop: SP.sm },
  ratingRow: { marginTop: SP.sm },
  summary: { ...DS.typography.bodyCompact, color: C.textSub, marginTop: SP.sm },
  sectionLabel: { ...DS.typography.body, fontWeight: '700', color: C.text, marginTop: SP.xxl, marginBottom: SP.xs },
  empty: { ...DS.typography.bodyCompact, color: C.textSub },

  commentRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SP.sm,
    paddingVertical: SP.md, borderBottomWidth: 1, borderBottomColor: C.borderLight,
  },
  avatar: { width: 32, height: 32, borderRadius: DS.radius.full },
  avatarFallback: { backgroundColor: C.pinkLight, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { ...DS.typography.bodyCompact, fontWeight: '700', color: C.pinkDeep },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: SP.xs, flexWrap: 'wrap' },
  commentName: { ...DS.typography.bodySmall, fontWeight: '700', color: C.text },
  commentDate: { ...DS.typography.caption, color: C.textMuted },
  againTag: {
    flexDirection: 'row', alignItems: 'center', gap: SP.micro,
    backgroundColor: C.pinkLight, borderRadius: DS.radius.small, paddingHorizontal: SP.sm, paddingVertical: SP.micro,
  },
  againText: { ...DS.typography.micro, fontWeight: '600', color: C.pinkDeep },
  commentText: { ...DS.typography.bodyCompact, color: C.text, marginTop: SP.xs },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: SP.sm,
    paddingHorizontal: SP.lg, paddingTop: SP.md, paddingBottom: SP.screen,
    borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.white,
  },
  input: {
    flex: 1, minHeight: DS.spacing.touch, maxHeight: 90, ...DS.typography.bodyCompact, color: C.text,
    backgroundColor: C.bg, borderRadius: DS.radius.compact, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: SP.md, paddingVertical: SP.sm,
  },
  sendBtn: { minHeight: DS.spacing.touch, backgroundColor: C.pink, borderRadius: DS.radius.compact, paddingHorizontal: SP.lg, paddingVertical: SP.sm, justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: C.disabledBg },
  sendBtnText: { ...DS.typography.buttonCompact, color: C.white },
});
