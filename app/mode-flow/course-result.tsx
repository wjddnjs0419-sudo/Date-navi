import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, useWindowDimensions, Alert,
  type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { type DateCard } from '../../lib/ai';
import { resolveDisplaySteps } from '../../lib/course';
import { Clock, Wallet, Send, Bookmark, Lock, Unlock, ChevronUp, ChevronDown, Check } from 'lucide-react-native';
import { C } from '../../constants/colors';
import { BackBar, BigButton, Badge, PlaceRow, CourseStepList } from '../../components/ui';
import { useI18n } from '../../lib/i18n';
import { createRecommendationRequestId } from '../../lib/recommendationIdentity';
import { requestRecommendationResponse } from '../../lib/recommend-date';
import { supabase } from '../../lib/supabase';
import { buildKakaoMapUrl, buildNaverSearchUrl, type ReplacementCandidate } from '../../lib/replacement-candidates';
import { buildStructuredCourseResultParams, parseStructuredCourseResultParams } from '../../lib/recommendation-route';
import { useRecommendationSessionStore } from '../../components/recommendation/recommendation-session-provider';
import type { RecommendationSessionSnapshot } from '../../lib/recommendation-session-repository';

export default function CourseResultScreen() {
  const rawParams = useLocalSearchParams();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { t } = useI18n();
  const {
    getRecommendationSession,
    loadRecommendationSession,
    mutateRecommendationSession,
  } = useRecommendationSessionStore();
  const routeParamKey = JSON.stringify(rawParams);
  const routeParams = useMemo(() => {
    try {
      return parseStructuredCourseResultParams(rawParams);
    } catch {
      return null;
    }
  }, [routeParamKey]);
  const [snapshot, setSnapshot] = useState<RecommendationSessionSnapshot | null>(() => {
    if (!routeParams) return null;
    try {
      return getRecommendationSession(routeParams.sessionId, routeParams.requestId) ?? null;
    } catch {
      return null;
    }
  });
  const [loadError, setLoadError] = useState(routeParams ? '' : t('modeFlow.courseResult.loadError'));
  const [loading, setLoading] = useState(!snapshot && Boolean(routeParams));

  const cards = useMemo<DateCard[]>(() => {
    return (snapshot?.response.cards ?? []).map((card) => ({
      ...card,
      estimated_time: card.estimated_time ?? '',
      estimated_budget: card.estimated_budget ?? '',
    }));
  }, [snapshot]);

  const hydrate = useCallback(async () => {
    if (!routeParams) {
      setLoadError(t('modeFlow.courseResult.loadError'));
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const loaded = await loadRecommendationSession(routeParams.sessionId, routeParams.requestId);
      setSnapshot(loaded);
    } catch {
      setLoadError(t('modeFlow.courseResult.loadError'));
    } finally {
      setLoading(false);
    }
  }, [loadRecommendationSession, routeParams, t]);

  useEffect(() => {
    if (!snapshot) void hydrate();
  }, [hydrate, snapshot]);

  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState(false);
  const [conditionsExpanded, setConditionsExpanded] = useState(false);
  const [editError, setEditError] = useState('');
  const [replacementTargetId, setReplacementTargetId] = useState<string | null>(null);
  const [replacementCandidates, setReplacementCandidates] = useState<ReplacementCandidate[]>([]);
  const [feedbackStepId, setFeedbackStepId] = useState<string | null>(null);
  const [feedbackTags, setFeedbackTags] = useState<string[]>([]);

  async function applyMutation(
    action: 'lock' | 'unlock' | 'reorder' | 'delete' | 'confirm',
    payload: Record<string, unknown>,
  ) {
    if (!snapshot) return;
    setEditing(true);
    setEditError('');
    try {
      const next = await mutateRecommendationSession(snapshot.sessionId, action, payload);
      setSnapshot(next);
      if (next.requestId !== routeParams?.requestId) {
        router.replace({ pathname: '/mode-flow/course-result', params: buildStructuredCourseResultParams(next.requestId, next.sessionId) } as any);
      }
    } catch {
      setEditError(t('modeFlow.courseResult.editError'));
    } finally {
      setEditing(false);
    }
  }

  function moveStep(stepId: string, direction: 'up' | 'down') {
    if (!snapshot) return;
    const ids = snapshot.steps.map((step) => step.stepId);
    const index = ids.indexOf(stepId);
    const destination = direction === 'up' ? index - 1 : index + 1;
    if (destination < 0 || destination >= ids.length) return;
    [ids[index], ids[destination]] = [ids[destination], ids[index]];
    void applyMutation('reorder', { stepIds: ids });
  }

  async function regenerateUnlocked(targetStepId?: string) {
    if (!snapshot || snapshot.status === 'confirmed') return;
    setEditing(true);
    setEditError('');
    try {
      const lockedSteps = snapshot.steps.filter((step) => (
        targetStepId ? step.stepId !== targetStepId : step.locked
      )).map((step) => ({
        stepId: step.stepId,
        candidateId: step.currentCandidateId,
        kakaoPlaceId: step.currentKakaoPlaceId,
      }));
      const request = {
        ...snapshot.request,
        requestId: createRecommendationRequestId(),
        sessionId: snapshot.sessionId,
        baseRequestId: snapshot.requestId,
        lockedSteps: lockedSteps.length > 0 ? lockedSteps : undefined,
        excludedPlaceIds: [...new Set([
          ...(snapshot.request.excludedPlaceIds ?? []),
          ...snapshot.steps.filter((step) => targetStepId ? step.stepId === targetStepId : !step.locked).map((step) => step.currentKakaoPlaceId),
        ])],
      };
      await requestRecommendationResponse(request);
      const next = await mutateRecommendationSession(snapshot.sessionId, 'regenerate', {
        attestationRequestId: request.requestId,
      });
      setSnapshot(next);
      router.replace({ pathname: '/mode-flow/course-result', params: buildStructuredCourseResultParams(next.requestId, next.sessionId) } as any);
    } catch {
      setEditError(t('modeFlow.courseResult.editError'));
    } finally {
      setEditing(false);
    }
  }

  async function loadReplacementCandidates(targetStepId: string) {
    if (!snapshot || snapshot.status === 'confirmed') return;
    setEditing(true);
    setEditError('');
    try {
      const { data, error } = await supabase.functions.invoke('replacement-candidates', {
        body: { sessionId: snapshot.sessionId, targetStepId },
      });
      if (error || !data || data.targetStepId !== targetStepId || !Array.isArray(data.top) || !Array.isArray(data.additional)) throw error ?? new Error('Invalid candidates');
      setReplacementTargetId(targetStepId);
      setReplacementCandidates([...data.top, ...data.additional].slice(0, 15) as ReplacementCandidate[]);
    } catch {
      setEditError(t('modeFlow.courseResult.editError'));
    } finally {
      setEditing(false);
    }
  }

  async function replaceWithCandidate(targetStepId: string, candidateId: string, kakaoPlaceId: string) {
    if (!snapshot) return;
    setEditing(true);
    setEditError('');
    try {
      const request = {
        ...snapshot.request,
        requestId: createRecommendationRequestId(),
        sessionId: snapshot.sessionId,
        baseRequestId: snapshot.requestId,
        replacement: { stepId: targetStepId, kakaoPlaceId },
        lockedSteps: snapshot.steps.filter((step) => step.stepId !== targetStepId).map((step) => ({
          stepId: step.stepId,
          candidateId: step.currentCandidateId,
          kakaoPlaceId: step.currentKakaoPlaceId,
        })),
        excludedPlaceIds: [...new Set([...(snapshot.request.excludedPlaceIds ?? []), ...snapshot.steps.map((step) => step.currentKakaoPlaceId)])],
      };
      await requestRecommendationResponse(request);
      const next = await mutateRecommendationSession(snapshot.sessionId, 'replace', { attestationRequestId: request.requestId, stepId: targetStepId, candidateId, kakaoPlaceId });
      setSnapshot(next);
      setReplacementTargetId(null);
      setReplacementCandidates([]);
      router.replace({ pathname: '/mode-flow/course-result', params: buildStructuredCourseResultParams(next.requestId, next.sessionId) } as any);
    } catch {
      setEditError(t('modeFlow.courseResult.editError'));
    } finally {
      setEditing(false);
    }
  }

  async function addVerifiedStep() {
    if (!snapshot || snapshot.status === 'confirmed' || snapshot.steps.length >= 4) return;
    setEditing(true);
    setEditError('');
    try {
      const requestId = createRecommendationRequestId();
      const request = {
        ...snapshot.request,
        requestId,
        sessionId: snapshot.sessionId,
        baseRequestId: snapshot.requestId,
        courseSteps: [...snapshot.request.courseSteps, {
          id: `step-${requestId}`,
          category: 'ai_decide',
          label: t('modeFlow.courseResult.additionalStep'),
        }],
        lockedSteps: snapshot.steps.filter((step) => step.locked).map((step) => ({
          stepId: step.stepId,
          candidateId: step.currentCandidateId,
          kakaoPlaceId: step.currentKakaoPlaceId,
        })),
      };
      const response = await requestRecommendationResponse(request);
      const added = response.course.steps.find((step) => !snapshot.steps.some((existing) => (
        existing.stepId === step.stepId
          || existing.currentCandidateId === step.candidateId
          || existing.currentKakaoPlaceId === step.kakaoPlaceId
      )));
      if (!added) throw new Error('No verified additional step was returned.');
      const next = await mutateRecommendationSession(snapshot.sessionId, 'add', {
        attestationRequestId: request.requestId,
        candidateId: added.candidateId,
        kakaoPlaceId: added.kakaoPlaceId,
      });
      setSnapshot(next);
      router.replace({ pathname: '/mode-flow/course-result', params: buildStructuredCourseResultParams(next.requestId, next.sessionId) } as any);
    } catch {
      setEditError(t('modeFlow.courseResult.editError'));
    } finally {
      setEditing(false);
    }
  }

  async function handleSendToPartner() {
    setSending(true);
    try {
      if (!snapshot?.confirmedCardId) {
        Alert.alert(t('modeFlow.courseResult.errorTitle'), t('modeFlow.courseResult.confirmFirst'));
        return;
      }
      router.push({ pathname: '/share/send', params: { cardId: snapshot.confirmedCardId } } as any);
    } catch {
      Alert.alert(t('modeFlow.courseResult.sendErrorTitle'), t('modeFlow.courseResult.sendError'));
    } finally {
      setSending(false);
    }
  }

  async function submitFeedback(stepId: string, visited: boolean) {
    if (!snapshot) return;
    setEditing(true);
    try {
      const { error } = await supabase.rpc('record_recommendation_place_feedback', {
        p_session_id: snapshot.sessionId, p_step_id: stepId, p_visited: visited, p_tags: feedbackTags,
      });
      if (error) throw error;
      setFeedbackStepId(null);
      setFeedbackTags([]);
    } catch {
      setEditError(t('modeFlow.courseResult.editError'));
    } finally { setEditing(false); }
  }

  const [page, setPage] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSave() {
    setSaving(true);
    try {
      await applyMutation('confirm', {});
      setSaved(true);
    } catch {
      setErrorMsg(t('modeFlow.courseResult.saveError'));
    } finally {
      setSaving(false);
    }
  }

  function onScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    setPage(Math.round(e.nativeEvent.contentOffset.x / width));
  }

  if (loading) {
    return (
      <SafeAreaView style={s.center}>
        <ActivityIndicator size="large" color={C.pink} />
        <Text style={s.loadingText}>{t('modeFlow.courseResult.loading')}</Text>
      </SafeAreaView>
    );
  }

  if (loadError !== '' || !snapshot || cards.length === 0) {
    return (
      <SafeAreaView style={s.center}>
        <Text style={s.errTitle}>{t('modeFlow.courseResult.errorTitle')}</Text>
        <Text style={s.loadingText}>{loadError || t('modeFlow.courseResult.loadError')}</Text>
        {routeParams && (
          <BigButton onPress={() => { void hydrate(); }} style={s.errRetryBtn}>
            {t('modeFlow.courseResult.retry')}
          </BigButton>
        )}
        <TouchableOpacity onPress={() => router.back()} style={s.backButton}>
          <Text style={s.backButtonText}>{t('modeFlow.courseResult.back')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <BackBar />
      <View style={s.headerArea}>
        <Badge tone="pink">{t('modeFlow.courseResult.badge')}</Badge>
        <Text style={s.heading}>{t('modeFlow.courseResult.heading')}</Text>
        <Text style={s.sub}>{t('modeFlow.courseResult.sub')}</Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ expanded: conditionsExpanded }}
          onPress={() => setConditionsExpanded((value) => !value)}
          style={s.conditionsToggle}
        >
          <Text style={s.conditionsToggleText}>{t('modeFlow.courseResult.conditions')}</Text>
        </TouchableOpacity>
        {conditionsExpanded && (
          <View style={s.conditionsPanel}>
            <Text style={s.conditionText}>{snapshot.request.location.label}</Text>
            <Text style={s.conditionText}>{snapshot.request.courseSteps.map((step) => step.label).join(' → ')}</Text>
            {snapshot.request.maxWalkingMinutes && <Text style={s.conditionText}>{snapshot.request.maxWalkingMinutes} min</Text>}
            {snapshot.request.totalBudgetKRW && <Text style={s.conditionText}>{snapshot.request.totalBudgetKRW.toLocaleString()} KRW</Text>}
            {snapshot.response.course.relaxedConstraints.map((item) => <Text key={item.constraint} style={s.relaxedText}>{item.reason}</Text>)}
          </View>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.timeline}>
        {snapshot.steps.map((step, index) => (
          <View key={step.stepId} style={s.timelineCard}>
            <Text style={s.timelineOrder}>{step.order}</Text>
            <Text numberOfLines={1} style={s.timelineName}>{step.placeName}</Text>
            <Text numberOfLines={1} style={s.timelineAddress}>{step.roadAddress || step.address}</Text>
            <TouchableOpacity accessibilityRole="button" onPress={() => router.push({ pathname: '/mode-flow/place-detail', params: { name: step.placeName, address: step.roadAddress || step.address, mapUrl: step.mapUrl, kakaoPlaceId: step.currentKakaoPlaceId } } as any)} style={s.detailButton}>
              <Text style={s.detailButtonText}>{t('modeFlow.courseResult.viewDetails')}</Text>
            </TouchableOpacity>
            <View style={s.stepActions}>
              <TouchableOpacity accessibilityRole="button" disabled={editing || snapshot.status === 'confirmed'} onPress={() => void applyMutation(step.locked ? 'unlock' : 'lock', { stepId: step.stepId })} style={s.stepAction}>
                {step.locked ? <Unlock size={16} color={C.textSub} /> : <Lock size={16} color={C.textSub} />}
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" disabled={editing || snapshot.status === 'confirmed' || index === 0} onPress={() => moveStep(step.stepId, 'up')} style={s.stepAction}>
                <ChevronUp size={16} color={C.textSub} />
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" disabled={editing || snapshot.status === 'confirmed' || index === snapshot.steps.length - 1} onPress={() => moveStep(step.stepId, 'down')} style={s.stepAction}>
                <ChevronDown size={16} color={C.textSub} />
              </TouchableOpacity>
            </View>
            <View style={s.inlineEditActions}>
              <TouchableOpacity accessibilityRole="button" testID="course-replace-step" disabled={editing || snapshot.status === 'confirmed' || step.locked} onPress={() => void loadReplacementCandidates(step.stepId)} style={s.inlineEditAction}>
                <Text style={s.inlineEditText}>{t('modeFlow.courseResult.replace')}</Text>
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" testID="course-delete-step" disabled={editing || snapshot.status === 'confirmed' || step.locked || snapshot.steps.length <= 2} onPress={() => void applyMutation('delete', { stepId: step.stepId })} style={s.inlineEditAction}>
                <Text style={s.inlineEditText}>{snapshot.steps.length <= 2 ? t('modeFlow.courseResult.deleteMin') : t('modeFlow.courseResult.delete')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>
      {editError !== '' && <Text style={s.editError}>{editError}</Text>}
      {replacementTargetId && (
        <View style={s.replacementPanel}>
          <Text style={s.replacementTitle}>{t('modeFlow.courseResult.replacementTitle')}</Text>
          <Text style={s.replacementNotice}>{t('modeFlow.courseResult.replacementNotice')}</Text>
          {replacementCandidates.map((candidate, index) => (
            <View key={candidate.kakaoPlaceId} style={s.replacementRow}>
              <View style={s.replacementCopy}>
                {index < 3 && <Text style={s.topLabel}>{t('modeFlow.courseResult.topPick')}</Text>}
                <Text style={s.replacementName}>{candidate.name}</Text>
                <Text numberOfLines={1} style={s.replacementAddress}>{candidate.roadAddress || candidate.address}</Text>
                <View style={s.externalActions}>
                  <TouchableOpacity accessibilityRole="link" onPress={() => void WebBrowser.openBrowserAsync(buildNaverSearchUrl(candidate.name))}><Text style={s.externalLink}>{t('modeFlow.courseResult.naverReviews')}</Text></TouchableOpacity>
                  <TouchableOpacity accessibilityRole="link" onPress={() => void WebBrowser.openBrowserAsync(buildKakaoMapUrl(candidate))}><Text style={s.externalLink}>{t('modeFlow.courseResult.kakaoMap')}</Text></TouchableOpacity>
                </View>
              </View>
              <TouchableOpacity accessibilityRole="button" disabled={editing} onPress={() => void replaceWithCandidate(replacementTargetId, candidate.candidateId, candidate.kakaoPlaceId)} style={s.pickButton}><Text style={s.pickButtonText}>{t('modeFlow.courseResult.pick')}</Text></TouchableOpacity>
            </View>
          ))}
        </View>
      )}
      {snapshot.status === 'confirmed' && (
        <View style={s.feedbackPanel}>
          <Text style={s.replacementTitle}>{t('modeFlow.courseResult.feedbackTitle')}</Text>
          <Text style={s.replacementNotice}>{t('modeFlow.courseResult.feedbackNotice')}</Text>
          {snapshot.steps.map((step) => (
            <View key={step.stepId} style={s.feedbackRow}>
              <Text style={s.replacementName}>{step.placeName}</Text>
              {feedbackStepId === step.stepId ? <>
                <View style={s.tagRow}>{['conversation', 'quiet', 'noisy', 'value', 'photos', 'revisit'].map((tag) => <TouchableOpacity key={tag} onPress={() => setFeedbackTags((tags) => tags.includes(tag) ? tags.filter((item) => item !== tag) : [...tags, tag])} style={s.tagButton}><Text style={s.externalLink}>{t(`modeFlow.courseResult.feedbackTags.${tag}`)}</Text></TouchableOpacity>)}</View>
                <View style={s.externalActions}><TouchableOpacity onPress={() => void submitFeedback(step.stepId, true)}><Text style={s.externalLink}>{t('modeFlow.courseResult.visited')}</Text></TouchableOpacity><TouchableOpacity onPress={() => void submitFeedback(step.stepId, false)}><Text style={s.externalLink}>{t('modeFlow.courseResult.notVisited')}</Text></TouchableOpacity></View>
              </> : <TouchableOpacity onPress={() => setFeedbackStepId(step.stepId)}><Text style={s.externalLink}>{t('modeFlow.courseResult.leaveFeedback')}</Text></TouchableOpacity>}
            </View>
          ))}
        </View>
      )}

      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
      >
        {cards.map((card, i) => {
          const steps = resolveDisplaySteps(card);
          return (
            <ScrollView key={i} style={{ width }} contentContainerStyle={s.page}>
              <Text style={s.cardTitle}>{card.title}</Text>
              <View style={s.metaRow}>
                {!!card.estimated_time && <View style={s.metaItem}><Clock size={13} color={C.textMuted} /><Text style={s.metaText}>{card.estimated_time}</Text></View>}
                {!!card.estimated_budget && <View style={s.metaItem}><Wallet size={13} color={C.textMuted} /><Text style={s.metaText}>{card.estimated_budget}</Text></View>}
              </View>

              <CourseStepList steps={steps} summary={card.summary} />

              {!!card.place_name && (
                <PlaceRow name={card.place_name} address={card.place_address} url={card.map_url} style={s.placeRowGap} />
              )}

              <View style={s.btnRow}>
                <TouchableOpacity style={s.sendBtn} onPress={handleSendToPartner} disabled={sending}>
                  {sending ? <ActivityIndicator size="small" color={C.white} /> : <Send size={14} color={C.white} />}<Text style={s.sendText}>{t('modeFlow.courseResult.send')}</Text>
                </TouchableOpacity>
                {!saved && (
                  <TouchableOpacity style={s.saveBtn} onPress={handleSave} disabled={saving}>
                    {saving ? <ActivityIndicator size="small" color={C.pinkDeep} />
                      : <><Bookmark size={14} color={C.pinkDeep} /><Text style={s.saveText}>{t('modeFlow.courseResult.save')}</Text></>}
                  </TouchableOpacity>
                )}
              </View>
              {errorMsg !== '' && <Text style={s.inlineError}>{errorMsg}</Text>}
            </ScrollView>
          );
        })}
      </ScrollView>

      <View style={s.dots}>
        {cards.map((_, i) => (
          <View key={i} style={[s.dot, i === page && s.dotOn]} />
        ))}
      </View>
      {snapshot.status !== 'confirmed' && (
        <View style={s.footerActions}>
          <TouchableOpacity accessibilityRole="button" disabled={editing} onPress={() => void regenerateUnlocked()} style={s.regenerateButton}>
            <Text style={s.regenerateText}>{t('modeFlow.courseResult.regenerate')}</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" testID="course-add-step" disabled={editing || snapshot.steps.length >= 4} onPress={() => void addVerifiedStep()} style={s.regenerateButton}>
            <Text style={s.regenerateText}>{t('modeFlow.courseResult.add')}</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" disabled={editing} onPress={() => void applyMutation('confirm', {})} style={s.confirmButton}>
            {editing ? <ActivityIndicator size="small" color={C.white} /> : <><Check size={17} color={C.white} /><Text style={s.confirmText}>{t('modeFlow.courseResult.confirm')}</Text></>}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 32 },
  loadingText: { fontSize: 14, color: C.textSub, marginTop: 16, textAlign: 'center' },
  errTitle: { fontSize: 20, fontWeight: '700', color: C.text, textAlign: 'center' },
  errRetryBtn: { marginTop: 24 },
  backButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 20, marginTop: 8 },
  backButtonText: { color: C.textSub, fontSize: 14, fontWeight: '600' },
  inlineError: { color: C.pinkDeep, fontSize: 12, marginTop: 10 },
  placeRowGap: { marginTop: 12 },
  headerArea: { paddingHorizontal: 20, gap: 6, marginBottom: 8 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, marginTop: 6 },
  sub: { fontSize: 13, color: C.textSub },
  conditionsToggle: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  conditionsToggleText: { color: C.pinkDeep, fontSize: 13, fontWeight: '700' },
  conditionsPanel: { backgroundColor: C.white, borderRadius: 12, padding: 12, gap: 3 },
  conditionText: { fontSize: 12, color: C.textSub },
  relaxedText: { fontSize: 12, color: C.pinkDeep },
  timeline: { paddingHorizontal: 20, gap: 8, paddingBottom: 8 },
  timelineCard: { width: 164, minHeight: 132, backgroundColor: C.white, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: C.border },
  timelineOrder: { color: C.pinkDeep, fontSize: 12, fontWeight: '800' },
  timelineName: { color: C.text, fontSize: 14, fontWeight: '700', marginTop: 5 },
  timelineAddress: { color: C.textMuted, fontSize: 11, marginTop: 3 },
  detailButton: { minHeight: 32, justifyContent: 'center', alignSelf: 'flex-start' },
  detailButtonText: { color: C.pinkDeep, fontSize: 11, fontWeight: '700' },
  stepActions: { flexDirection: 'row', marginTop: 'auto', gap: 4 },
  stepAction: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  inlineEditActions: { flexDirection: 'row', gap: 6 },
  inlineEditAction: { minHeight: 44, justifyContent: 'center' },
  inlineEditText: { color: C.pinkDeep, fontSize: 11, fontWeight: '700' },
  editError: { color: C.pinkDeep, fontSize: 12, textAlign: 'center', marginBottom: 4 },
  replacementPanel: { marginHorizontal: 20, marginBottom: 8, borderRadius: 14, backgroundColor: C.white, padding: 12, gap: 8, borderWidth: 1, borderColor: C.border },
  replacementTitle: { color: C.text, fontSize: 15, fontWeight: '800' },
  replacementNotice: { color: C.textMuted, fontSize: 11 },
  replacementRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 8 },
  replacementCopy: { flex: 1, gap: 2 },
  topLabel: { color: C.pinkDeep, fontSize: 10, fontWeight: '800' },
  replacementName: { color: C.text, fontSize: 13, fontWeight: '700' },
  replacementAddress: { color: C.textMuted, fontSize: 11 },
  externalActions: { flexDirection: 'row', gap: 10, marginTop: 3 },
  externalLink: { color: C.pinkDeep, fontSize: 11, fontWeight: '700', minHeight: 28, textAlignVertical: 'center' },
  pickButton: { minHeight: 44, borderRadius: 12, backgroundColor: C.pink, paddingHorizontal: 12, justifyContent: 'center' },
  pickButtonText: { color: C.white, fontSize: 12, fontWeight: '800' },
  feedbackPanel: { marginHorizontal: 20, marginBottom: 8, borderRadius: 14, backgroundColor: C.white, padding: 12, gap: 8 }, feedbackRow: { gap: 5, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 8 }, tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 }, tagButton: { minHeight: 28, paddingHorizontal: 6, justifyContent: 'center', borderRadius: 9, backgroundColor: C.bg },
  page: { paddingHorizontal: 20, paddingBottom: 40 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: C.text, marginTop: 8 },
  metaRow: { flexDirection: 'row', gap: 14, marginTop: 8, marginBottom: 8 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: C.textMuted },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  sendBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14, paddingVertical: 12, backgroundColor: C.pink },
  sendText: { fontSize: 13, fontWeight: '600', color: C.white },
  saveBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: C.white, borderWidth: 1.5, borderColor: C.pinkBorder },
  saveText: { fontSize: 13, fontWeight: '600', color: C.pinkDeep },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 16 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.border },
  dotOn: { backgroundColor: C.pink, width: 18 },
  footerActions: { flexDirection: 'row', gap: 8, marginHorizontal: 20, marginBottom: 14 },
  regenerateButton: { minHeight: 52, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: C.pinkBorder, justifyContent: 'center' },
  regenerateText: { color: C.pinkDeep, fontSize: 13, fontWeight: '700' },
  confirmButton: { minHeight: 52, flex: 1, borderRadius: 14, backgroundColor: C.pink, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  confirmText: { color: C.white, fontSize: 15, fontWeight: '800' },
});
