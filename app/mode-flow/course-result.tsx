import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Modal, Pressable, TextInput,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Send, Bookmark, ChevronUp, ChevronDown, X, Lock } from 'lucide-react-native';
import { C } from '../../constants/colors';
import { SP, R } from '../../constants/theme';
import { getCourseCategoryIcon } from '../../lib/course-draft';
import { BackBar, BigButton, Badge, MetaChipRow, SuccessModal } from '../../components/ui';
import { PickerSheet } from '../../components/pickers';
import { resolveConfirmTitle } from '../../lib/confirm-title';
import { localizeCardContent, overrideCardTitle } from '../../lib/card-i18n';

// 카테고리별 핀 색(STYLESEED lock의 +categorical 매핑). 없으면 pink.
const CATEGORY_COLOR: Record<string, string> = {
  meal: C.catMeal, restaurant: C.catMeal,
  cafe: C.catCafe,
  walk: C.catWalk, activity: C.catWalk, attraction: C.catWalk, culture: C.catWalk,
};
const categoryColor = (category: string) => CATEGORY_COLOR[category] ?? C.pink;
import { useI18n } from '../../lib/i18n';
import { createRecommendationRequestId } from '../../lib/recommendationIdentity';
import { requestRecommendationResponse } from '../../lib/recommend-date';
import { supabase } from '../../lib/supabase';
import { buildKakaoMapUrl, buildNaverMapUrl, type ReplacementCandidate } from '../../lib/replacement-candidates';
import { buildStructuredCourseResultParams, parseStructuredCourseResultParams } from '../../lib/recommendation-route';
import { omitOneShotRequestFields } from '../../lib/recommendation-request';
import { useRecommendationSessionStore } from '../../components/recommendation/recommendation-session-provider';
import { StepActionSheet } from '../../components/recommendation/step-action-sheet';
import { subscribePickedPlace } from '../../lib/place-pick-bridge';
import type { RecommendationSessionSnapshot } from '../../lib/recommendation-session-repository';

// 대상 스텝 카테고리 → 카카오 place-search 카테고리 코드.
// 매핑에 없는 카테고리(drinks/ai_decide 등)는 undefined → 전체 검색으로 동작.
const KAKAO_CATEGORY_CODE: Record<string, string> = {
  meal: 'FD6',
  restaurant: 'FD6',
  cafe: 'CE7',
  culture: 'CT1',
  walk: 'AT4',
  activity: 'AT4',
  attraction: 'AT4',
};

export default function CourseResultScreen() {
  const rawParams = useLocalSearchParams();
  const router = useRouter();
  const { t, language } = useI18n();
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
  const [replacementTab, setReplacementTab] = useState<'recommend' | 'search'>('recommend');
  const [actionSheetStepId, setActionSheetStepId] = useState<string | null>(null);
  // "Search a place"로 이동하는 동안 대상 스텝(replacementTargetId)은 유지한 채
  // 시트만 숨긴다. 그렇지 않으면 네이티브 Modal이 검색 화면 위에 계속 떠 있고,
  // 사용자가 백드롭을 눌러 닫으면 replacementTargetId까지 초기화되어 검색으로
  // 고른 장소가 반영되지 않는다.
  const [searchScreenActive, setSearchScreenActive] = useState(false);
  useFocusEffect(useCallback(() => { setSearchScreenActive(false); }, []));

  async function applyMutation(
    action: 'lock' | 'unlock' | 'reorder' | 'delete' | 'confirm',
    payload: Record<string, unknown>,
  ) {
    if (!snapshot) return;
    // 커플 미연결(솔로) 상태에서는 코스를 카드로 확정/저장할 수 없다.
    // 서버 RPC가 couple_id null을 constraint_violation으로 막으므로,
    // 불친절한 저장 실패 대신 커플 연결을 안내한다.
    if (action === 'confirm' && !snapshot.coupleId) {
      Alert.alert(t('common.coupleRequired'));
      return;
    }
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

  function toLockedStep(step: RecommendationSessionSnapshot['steps'][number]) {
    return {
      stepId: step.stepId,
      candidateId: step.currentCandidateId,
      kakaoPlaceId: step.currentKakaoPlaceId,
      name: step.placeName,
      address: step.address,
      roadAddress: step.roadAddress,
      mapUrl: step.mapUrl,
      latitude: step.latitude,
      longitude: step.longitude,
      locked: step.locked,
    };
  }

  async function regenerateUnlocked(targetStepId?: string) {
    if (!snapshot || snapshot.status === 'confirmed') return;
    setEditing(true);
    setEditError('');
    try {
      const lockedSteps = snapshot.steps.filter((step) => (
        targetStepId ? step.stepId !== targetStepId : step.locked
      )).map(toLockedStep);
      const request = {
        ...omitOneShotRequestFields(snapshot.request),
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
      setReplacementTab('recommend');
      setReplacementTargetId(targetStepId);
      setReplacementCandidates([...data.top, ...data.additional].slice(0, 15) as ReplacementCandidate[]);
    } catch {
      setEditError(t('modeFlow.courseResult.editError'));
    } finally {
      setEditing(false);
    }
  }

  async function replaceWithCandidate(targetStepId: string, kakaoPlaceId: string, pickedName?: string) {
    if (!snapshot) return;
    setEditing(true);
    setEditError('');
    try {
      const request = {
        ...omitOneShotRequestFields(snapshot.request),
        requestId: createRecommendationRequestId(),
        sessionId: snapshot.sessionId,
        baseRequestId: snapshot.requestId,
        replacement: { stepId: targetStepId, kakaoPlaceId, ...(pickedName ? { pickedName } : {}) },
        lockedSteps: snapshot.steps.filter((step) => step.stepId !== targetStepId).map(toLockedStep),
        excludedPlaceIds: [...new Set([...(snapshot.request.excludedPlaceIds ?? []), ...snapshot.steps.map((step) => step.currentKakaoPlaceId)])],
      };
      const response = await requestRecommendationResponse(request);
      const replaced = response.course.steps.find((step) => step.stepId === targetStepId && step.kakaoPlaceId === kakaoPlaceId);
      if (!replaced) throw new Error('The replacement step was not present in the verified response.');
      const next = await mutateRecommendationSession(snapshot.sessionId, 'replace', { attestationRequestId: request.requestId, stepId: targetStepId, candidateId: replaced.candidateId, kakaoPlaceId });
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
        ...omitOneShotRequestFields(snapshot.request),
        requestId,
        sessionId: snapshot.sessionId,
        baseRequestId: snapshot.requestId,
        courseSteps: [...snapshot.request.courseSteps, {
          id: `step-${requestId}`,
          category: 'ai_decide',
          label: t('modeFlow.courseResult.additionalStep'),
        }],
        // Pin EVERY current step (with its real locked flag) so the server keeps the
        // existing course exactly as-is and only selects the new ai_decide step.
        // Pinning only locked steps let the re-search drift unlocked steps, which the
        // mutation RPC rejects as constraint_violation.
        lockedSteps: snapshot.steps.map(toLockedStep),
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

  // 저장·보내기 직전에 제목 편집 시트를 먼저 띄운다. 기본값은 확정 시 서버가 만든
  // 카드 제목(위치 기반 "…데이트 코스")이며, 비워두면 그 기본값으로 폴백한다.
  async function openTitleSheet(action: 'save' | 'send') {
    if (!snapshot) return;
    if (!snapshot.coupleId) { Alert.alert(t('common.coupleRequired')); return; }
    let current = snapshot.request.location.label;
    if (snapshot.confirmedCardId) {
      const { data } = await supabase
        .from('date_cards').select('title, content_i18n').eq('id', snapshot.confirmedCardId).maybeSingle();
      // 기본값은 화면에 실제 보이는 제목(언어 오버레이 적용)과 일치시킨다.
      const localized = data ? localizeCardContent(data, language).title : null;
      if (localized) current = localized;
    }
    setDefaultTitle(current);
    setDraftTitle(current);
    setPendingAction(action);
    setTitleSheetOpen(true);
  }

  // 시트 확정: 세션을 확정(멱등)해 카드 id를 확보/보존한 뒤, 사용자가 정한 제목으로
  // date_cards.title을 갱신하고(확정이 제목을 재생성해도 이 갱신이 최후 반영) 원래 동작을 잇는다.
  async function commitTitle() {
    if (!snapshot) { setTitleSheetOpen(false); return; }
    setTitleSheetOpen(false);
    const action = pendingAction;
    setSaving(true);
    setErrorMsg('');
    try {
      const next = await mutateRecommendationSession(snapshot.sessionId, 'confirm', {});
      setSnapshot(next);
      // 읽기(openTitleSheet)는 snapshot.confirmedCardId 로 제목을 가져왔으므로 쓰기도 같은 id 를 쓴다.
      // 재확정 시 next.confirmedCardId 가 비어 update 가 조용히 스킵되던 버그를 막는다.
      const cardId = snapshot.confirmedCardId ?? next.confirmedCardId;
      const finalTitle = resolveConfirmTitle(draftTitle, defaultTitle);
      if (cardId && finalTitle !== defaultTitle) {
        // 화면은 content_i18n[언어].title 을 title 위에 덮어쓰므로(localizeCardContent),
        // 커스텀 제목은 두 곳 모두에 반영해야 실제로 보인다.
        const { data: row } = await supabase
          .from('date_cards').select('content_i18n').eq('id', cardId).maybeSingle();
        const { data: updated, error } = await supabase
          .from('date_cards')
          .update({ title: finalTitle, content_i18n: overrideCardTitle(row?.content_i18n, finalTitle) })
          .eq('id', cardId)
          .select('id');
        if (error) throw error;
        if (!updated?.length) throw new Error('title update affected no rows');
      }
      if (action === 'send') {
        if (cardId) router.push({ pathname: '/share/send', params: { cardId } } as any);
      } else {
        setSaved(true);
        setSavedModalVisible(true);
      }
    } catch {
      setErrorMsg(t('modeFlow.courseResult.saveError'));
    } finally {
      setSaving(false);
    }
  }

  async function handleSendToPartner() {
    if (!snapshot?.confirmedCardId) {
      Alert.alert(t('modeFlow.courseResult.errorTitle'), t('modeFlow.courseResult.confirmFirst'));
      return;
    }
    setSending(true);
    try {
      await openTitleSheet('send');
    } finally {
      setSending(false);
    }
  }

  function closeReplacementPanel() {
    setReplacementTargetId(null);
    setReplacementCandidates([]);
  }

  // 직접 검색 탭에서 고른 장소는 브리지로 돌아온다. 열려 있는 교체 대상 스텝에
  // pickedName과 함께 교체 요청을 보낸다(서버가 후보 풀에 병합).
  useEffect(() => {
    const unsub = subscribePickedPlace((place) => {
      if (replacementTargetId) void replaceWithCandidate(replacementTargetId, place.kakaoPlaceId, place.name);
    });
    return unsub;
  }, [replacementTargetId]);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedModalVisible, setSavedModalVisible] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [titleSheetOpen, setTitleSheetOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [defaultTitle, setDefaultTitle] = useState('');
  const [pendingAction, setPendingAction] = useState<'save' | 'send'>('save');

  async function handleSave() {
    await openTitleSheet('save');
  }

  if (loading) {
    return (
      <SafeAreaView style={s.center}>
        <ActivityIndicator size="large" color={C.pink} />
        <Text style={s.loadingText}>{t('modeFlow.courseResult.loading')}</Text>
      </SafeAreaView>
    );
  }

  if (loadError !== '' || !snapshot || snapshot.steps.length === 0) {
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
      <SuccessModal
        visible={savedModalVisible}
        message={t('modeFlow.courseResult.savedMessage')}
        onHide={() => { setSavedModalVisible(false); router.replace('/(tabs)/' as any); }}
      />
      <BackBar />
      <ScrollView contentContainerStyle={s.scrollContent}>
        <View style={s.headerArea}>
          <Badge tone="pink">{t('modeFlow.courseResult.badge')}</Badge>
          <Text style={s.heading}>{t('modeFlow.courseResult.heading')}</Text>
          <Text style={s.sub}>{t('modeFlow.courseResult.sub')}</Text>
          <MetaChipRow
            items={[
              { icon: 'map', label: snapshot.request.location.label },
              ...(snapshot.request.maxWalkingMinutes
                ? [{ icon: 'walk' as const, label: t('modeFlow.courseResult.walkChip', { minutes: snapshot.request.maxWalkingMinutes }) }]
                : []),
            ]}
          />
          {(() => {
            const stepIntent = snapshot.response.metadata.stepIntent;
            if (!stepIntent) return null;
            const hasChips = stepIntent.resolved.length > 0 || stepIntent.unsupported.length > 0;
            if (!hasChips) return null;
            const label = (display: { ko: string; en: string }) => (language === 'en' ? display.en : display.ko);
            return (
              <View style={s.intentSection}>
                <Text style={s.intentTitle}>{t('modeFlow.courseResult.stepIntents.title')}</Text>
                <View style={s.intentChips}>
                  {stepIntent.resolved.map((intent) => (
                    intent.negated
                      ? (
                        <Badge key={`${intent.stepId}-${intent.canonicalTerm}`} tone="gray">
                          {`${label(intent.displayLabel)} ${t('modeFlow.courseResult.stepIntents.excludedSuffix')}`}
                        </Badge>
                      )
                      : (
                        <Badge key={`${intent.stepId}-${intent.canonicalTerm}`} tone={intent.strength === 'required' ? 'pink' : 'lavender'}>
                          {label(intent.displayLabel)}
                        </Badge>
                      )
                  ))}
                </View>
                {stepIntent.unsupported.map((item) => (
                  <Text key={item.term} style={s.intentUnsupported}>
                    {t('modeFlow.courseResult.stepIntents.unsupported', { term: item.term })}
                  </Text>
                ))}
              </View>
            );
          })()}
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

        <View style={s.timeline}>
          {snapshot.steps.map((step, index) => {
            const CategoryIcon = getCourseCategoryIcon(step.category);
            return (
              <View key={step.stepId}>
                <TouchableOpacity
                  accessibilityRole="button"
                  disabled={editing || snapshot.status === 'confirmed'}
                  onPress={() => setActionSheetStepId(step.stepId)}
                  testID={`course-step-card-${step.stepId}`}
                  style={s.timelineCard}
                >
                  <View style={s.timelineTopRow}>
                    <View style={[s.timelineBadge, { backgroundColor: categoryColor(step.category) }]}>
                      <Text style={s.timelineBadgeNum}>{step.order}</Text>
                    </View>
                    <CategoryIcon size={16} color={categoryColor(step.category)} />
                    {step.locked && <Lock size={13} color={C.textMuted} style={s.timelineLockIcon} />}
                    <View style={s.stepActions}>
                      <TouchableOpacity accessibilityRole="button" disabled={editing || snapshot.status === 'confirmed' || index === 0} onPress={() => moveStep(step.stepId, 'up')} style={s.stepAction}>
                        <ChevronUp size={16} color={C.textSub} />
                      </TouchableOpacity>
                      <TouchableOpacity accessibilityRole="button" disabled={editing || snapshot.status === 'confirmed' || index === snapshot.steps.length - 1} onPress={() => moveStep(step.stepId, 'down')} style={s.stepAction}>
                        <ChevronDown size={16} color={C.textSub} />
                      </TouchableOpacity>
                    </View>
                  </View>
                  <Text numberOfLines={1} style={s.timelineName}>{step.placeName}</Text>
                  {step.reason ? <Text numberOfLines={2} style={s.timelineReason}>{step.reason}</Text> : null}
                  <Text numberOfLines={1} style={s.timelineAddress}>{step.roadAddress || step.address}</Text>
                  <View style={s.cardActions}>
                    <TouchableOpacity accessibilityRole="button" onPress={() => router.push({ pathname: '/mode-flow/place-detail', params: { name: step.placeName, address: step.roadAddress || step.address, mapUrl: step.mapUrl, kakaoPlaceId: step.currentKakaoPlaceId } } as any)} style={s.cardActionBtn}>
                      <Text style={s.cardActionText}>{t('modeFlow.courseResult.detailBtn')}</Text>
                    </TouchableOpacity>
                    {snapshot.status !== 'confirmed' && (
                      <TouchableOpacity accessibilityRole="button" disabled={editing || step.locked} onPress={() => void loadReplacementCandidates(step.stepId)} style={[s.cardActionBtn, step.locked && s.cardActionBtnDisabled]}>
                        <Text style={s.cardActionText}>{t('modeFlow.courseResult.otherPlaceBtn')}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </TouchableOpacity>
                {index < snapshot.steps.length - 1 && (
                  <View style={s.timelineConnector}>
                    <View style={s.timelineConnectorLine} />
                    <View style={s.timelineConnectorDot}>
                      <ChevronDown size={12} color={C.pinkDeep} strokeWidth={2.5} />
                    </View>
                    <View style={s.timelineConnectorLine} />
                  </View>
                )}
              </View>
            );
          })}
        </View>
        {editError !== '' && !replacementTargetId && <Text style={s.editError}>{editError}</Text>}
      </ScrollView>

      <Modal testID="course-replacement-modal" visible={!!replacementTargetId && !searchScreenActive} transparent animationType="slide" onRequestClose={closeReplacementPanel}>
        <View style={s.replacementModalWrap}>
          <Pressable style={s.replacementBackdrop} onPress={closeReplacementPanel} testID="course-replacement-backdrop" />
          <View style={s.replacementSheet}>
            <View style={s.replacementHandle} />
            <View style={s.replacementHeader}>
              <Text style={s.replacementTitle}>{t('modeFlow.courseResult.replacementTitle')}</Text>
              <TouchableOpacity accessibilityRole="button" onPress={closeReplacementPanel} style={s.replacementCloseButton}>
                <X size={16} color={C.textSub} />
              </TouchableOpacity>
            </View>
            {editError !== '' && <Text style={s.editError}>{editError}</Text>}
            <View style={s.tabRow}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ selected: replacementTab === 'recommend' }}
                testID="course-replacement-tab-recommend"
                onPress={() => setReplacementTab('recommend')}
                style={[s.tabBtn, replacementTab === 'recommend' && s.tabBtnOn]}
              >
                <Text style={[s.tabText, replacementTab === 'recommend' && s.tabTextOn]}>{t('modeFlow.courseResult.recommendTab')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ selected: replacementTab === 'search' }}
                testID="course-replacement-tab-search"
                onPress={() => setReplacementTab('search')}
                style={[s.tabBtn, replacementTab === 'search' && s.tabBtnOn]}
              >
                <Text style={[s.tabText, replacementTab === 'search' && s.tabTextOn]}>{t('modeFlow.courseResult.searchTab')}</Text>
              </TouchableOpacity>
            </View>
            {replacementTab === 'recommend' ? (
              <>
                <Text style={s.replacementNotice}>{t('modeFlow.courseResult.replacementNotice')}</Text>
                {replacementCandidates.length === 0 ? (
                  <Text style={s.replacementEmpty}>{t('modeFlow.courseResult.replacementEmpty')}</Text>
                ) : (
                  <ScrollView style={s.replacementList} showsVerticalScrollIndicator={false}>
                    {replacementCandidates.map((candidate, index) => (
                      <View key={candidate.kakaoPlaceId} style={s.replacementRow}>
                        <View style={s.replacementCopy}>
                          {index < 3 && <Text style={s.topLabel}>{t('modeFlow.courseResult.topPick')}</Text>}
                          <Text style={s.replacementName}>{candidate.name}</Text>
                          <Text numberOfLines={1} style={s.replacementAddress}>{candidate.roadAddress || candidate.address}</Text>
                          <View style={s.externalActions}>
                            <TouchableOpacity accessibilityRole="link" onPress={() => void WebBrowser.openBrowserAsync(buildNaverMapUrl(candidate.name))}><Text style={s.externalLink}>{t('modeFlow.courseResult.naverReviews')}</Text></TouchableOpacity>
                            <TouchableOpacity accessibilityRole="link" onPress={() => void WebBrowser.openBrowserAsync(buildKakaoMapUrl(candidate))}><Text style={s.externalLink}>{t('modeFlow.courseResult.kakaoMap')}</Text></TouchableOpacity>
                          </View>
                        </View>
                        <TouchableOpacity accessibilityRole="button" testID={`course-replacement-pick-${candidate.kakaoPlaceId}`} disabled={editing} onPress={() => { if (replacementTargetId) void replaceWithCandidate(replacementTargetId, candidate.kakaoPlaceId); }} style={s.pickButton}><Text style={s.pickButtonText}>{t('modeFlow.courseResult.pick')}</Text></TouchableOpacity>
                      </View>
                    ))}
                  </ScrollView>
                )}
              </>
            ) : (
              <>
                <Text style={s.searchHint}>{t('modeFlow.courseResult.searchHint')}</Text>
                <TouchableOpacity
                  accessibilityRole="button"
                  testID="course-replacement-search-cta"
                  disabled={editing}
                  onPress={() => {
                    if (!replacementTargetId) return;
                    const center = snapshot.request.location; // latitude/longitude 보유
                    const targetStep = snapshot.steps.find((step) => step.stepId === replacementTargetId);
                    const targetCategoryCode = targetStep ? KAKAO_CATEGORY_CODE[targetStep.category] : undefined;
                    setSearchScreenActive(true);
                    router.push({ pathname: '/mode-flow/place-search', params: {
                      x: String(center.longitude), y: String(center.latitude),
                      ...(targetCategoryCode ? { categoryCode: targetCategoryCode } : {}),
                    } } as any);
                  }}
                  style={s.searchCta}
                >
                  <Text style={s.searchCtaText}>{t('modeFlow.courseResult.searchCta')}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {snapshot.status === 'confirmed' && (
        <View style={s.confirmedActions}>
          <TouchableOpacity testID="confirmed-send" style={s.sendBtn} onPress={handleSendToPartner} disabled={sending}>
            {sending ? <ActivityIndicator size="small" color={C.white} /> : <Send size={14} color={C.white} />}<Text style={s.sendText}>{t('modeFlow.courseResult.send')}</Text>
          </TouchableOpacity>
          {!saved && (
            <TouchableOpacity testID="confirmed-save" style={s.saveBtn} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color={C.pinkDeep} />
                : <><Bookmark size={14} color={C.pinkDeep} /><Text style={s.saveText}>{t('modeFlow.courseResult.save')}</Text></>}
            </TouchableOpacity>
          )}
          {errorMsg !== '' && <Text style={s.inlineError}>{errorMsg}</Text>}
        </View>
      )}

      {snapshot.status !== 'confirmed' && (
        <View style={s.footerActions}>
          <TouchableOpacity accessibilityRole="button" disabled={editing} onPress={() => void regenerateUnlocked()} style={s.regenerateButton}>
            <Text style={s.regenerateText}>{t('modeFlow.courseResult.regenerate')}</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" testID="course-add-step" disabled={editing || snapshot.steps.length >= 4} onPress={() => void addVerifiedStep()} style={s.regenerateButton}>
            <Text style={s.regenerateText}>{t('modeFlow.courseResult.add')}</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" testID="course-confirm" disabled={editing} onPress={() => void applyMutation('confirm', {})} style={s.confirmButton}>
            {editing ? <ActivityIndicator size="small" color={C.white} /> : <Text style={s.confirmText}>{t('modeFlow.courseResult.confirm')}</Text>}
          </TouchableOpacity>
        </View>
      )}

      {(() => {
        const activeStep = snapshot.steps.find((step) => step.stepId === actionSheetStepId);
        return (
          <StepActionSheet
            visible={!!activeStep}
            placeName={activeStep?.placeName ?? ''}
            locked={!!activeStep?.locked}
            canDelete={snapshot.steps.length > 2}
            onClose={() => setActionSheetStepId(null)}
            onLockToggle={() => {
              if (activeStep) void applyMutation(activeStep.locked ? 'unlock' : 'lock', { stepId: activeStep.stepId });
              setActionSheetStepId(null);
            }}
            onReplace={() => {
              if (activeStep) void loadReplacementCandidates(activeStep.stepId);
              setActionSheetStepId(null);
            }}
            onDelete={() => {
              if (activeStep) void applyMutation('delete', { stepId: activeStep.stepId });
              setActionSheetStepId(null);
            }}
          />
        );
      })()}

      <PickerSheet
        visible={titleSheetOpen}
        title={t('modeFlow.courseResult.titleSheetTitle')}
        confirmLabel={t('modeFlow.courseResult.titleSaveButton')}
        avoidKeyboard
        onCancel={() => setTitleSheetOpen(false)}
        onConfirm={() => void commitTitle()}
      >
        <Text style={s.titleFieldLabel}>{t('modeFlow.courseResult.titleFieldLabel')}</Text>
        <View style={[s.titleInputWrap, draftTitle.trim().length > 0 && s.titleInputWrapActive]}>
          <TextInput
            style={s.titleInput}
            value={draftTitle}
            onChangeText={setDraftTitle}
            placeholder={t('modeFlow.courseResult.titlePlaceholder')}
            placeholderTextColor={C.textFaint}
            returnKeyType="done"
            onSubmitEditing={() => void commitTitle()}
            autoFocus
          />
        </View>
        <Text style={s.titleHelper}>{t('modeFlow.courseResult.titleHelper')}</Text>
      </PickerSheet>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  titleFieldLabel: { fontSize: 13, color: C.textMuted, fontWeight: '600', marginBottom: SP.sm },
  titleInputWrap: { borderWidth: 1.5, borderColor: C.pinkBorder, backgroundColor: C.white, borderRadius: R.md, paddingHorizontal: SP.lg, paddingVertical: SP.md + 1 },
  titleInputWrapActive: { borderColor: C.pink },
  titleInput: { fontSize: 15, color: C.text, fontWeight: '600', paddingVertical: 0 },
  titleHelper: { fontSize: 12, color: C.textSub, marginTop: SP.sm, lineHeight: 18 },
  safe: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 32 },
  loadingText: { fontSize: 14, color: C.textSub, marginTop: 16, textAlign: 'center' },
  errTitle: { fontSize: 20, fontWeight: '700', color: C.text, textAlign: 'center' },
  errRetryBtn: { marginTop: 24 },
  backButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 20, marginTop: 8 },
  backButtonText: { color: C.textSub, fontSize: 14, fontWeight: '600' },
  inlineError: { color: C.pinkDeep, fontSize: 12, marginTop: 10 },
  placeRowGap: { marginTop: 12 },
  headerArea: { paddingHorizontal: SP.xl, gap: SP.sm, marginBottom: SP.sm },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, marginTop: SP.xs },
  sub: { fontSize: 13, color: C.textSub },
  conditionsToggle: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  conditionsToggleText: { color: C.pinkDeep, fontSize: 13, fontWeight: '700' },
  conditionsPanel: { backgroundColor: C.white, borderRadius: 12, padding: 12, gap: 3 },
  conditionText: { fontSize: 12, color: C.textSub },
  relaxedText: { fontSize: 12, color: C.pinkDeep },
  intentSection: { gap: 8, marginTop: 4 },
  intentTitle: { fontSize: 12, fontWeight: '700', color: C.textSub },
  intentChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  intentUnsupported: { fontSize: 12, color: C.textMuted, lineHeight: 18 },
  scrollContent: { paddingBottom: 12 },
  timeline: { paddingHorizontal: SP.xl, gap: SP.xs },
  timelineCard: { backgroundColor: C.white, borderRadius: R.xl, padding: SP.lg, borderWidth: 1, borderColor: C.border },
  timelineTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timelineBadge: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  timelineBadgeNum: { fontSize: 12, fontWeight: '800', color: C.white, lineHeight: 14 },
  timelineLockIcon: { marginLeft: -2 },
  timelineName: { color: C.text, fontSize: 15, fontWeight: '700', marginTop: SP.sm },
  timelineReason: { color: C.pinkDeep, fontSize: 13, lineHeight: 19, marginTop: SP.xs },
  timelineAddress: { color: C.textMuted, fontSize: 12, marginTop: SP.xs },
  timelineConnector: { alignItems: 'center', height: 26, justifyContent: 'center' },
  timelineConnectorLine: { width: 1.5, height: 7, backgroundColor: C.border },
  timelineConnectorDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: C.pinkLight, alignItems: 'center', justifyContent: 'center' },
  cardActions: { flexDirection: 'row', gap: SP.sm, marginTop: SP.md },
  cardActionBtn: { flex: 1, minHeight: 40, borderRadius: R.md, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  cardActionBtnDisabled: { opacity: 0.4 },
  cardActionText: { color: C.pinkDeep, fontSize: 13, fontWeight: '700' },
  stepActions: { flexDirection: 'row', marginLeft: 'auto', gap: 4 },
  stepAction: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  editError: { color: C.pinkDeep, fontSize: 12, textAlign: 'center', marginBottom: 4 },
  replacementModalWrap: { flex: 1, justifyContent: 'flex-end' },
  replacementBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(31, 31, 36, 0.28)' },
  replacementSheet: {
    maxHeight: '75%',
    backgroundColor: C.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    gap: 8,
  },
  replacementHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 6 },
  replacementList: { flexGrow: 0 },
  replacementHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  replacementCloseButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  replacementTitle: { color: C.text, fontSize: 15, fontWeight: '800' },
  replacementNotice: { color: C.textMuted, fontSize: 11 },
  tabRow: { flexDirection: 'row', backgroundColor: C.gray, borderRadius: 12, padding: 3, gap: 3 },
  tabBtn: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  tabBtnOn: { backgroundColor: C.white },
  tabText: { fontSize: 12, fontWeight: '800', color: C.textSub },
  tabTextOn: { color: C.pinkDeep },
  searchCta: { minHeight: 48, borderRadius: 12, borderWidth: 1.5, borderColor: C.pinkBorder, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  searchCtaText: { color: C.pinkDeep, fontSize: 13, fontWeight: '800' },
  searchHint: { color: C.textMuted, fontSize: 12, textAlign: 'center', marginTop: 8 },
  replacementEmpty: { color: C.textMuted, fontSize: 12, textAlign: 'center', paddingVertical: 12 },
  replacementRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 8 },
  replacementCopy: { flex: 1, gap: 2 },
  topLabel: { color: C.pinkDeep, fontSize: 10, fontWeight: '800' },
  replacementName: { color: C.text, fontSize: 13, fontWeight: '700' },
  replacementAddress: { color: C.textMuted, fontSize: 11 },
  externalActions: { flexDirection: 'row', gap: 10, marginTop: 3 },
  externalLink: { color: C.pinkDeep, fontSize: 11, fontWeight: '700', minHeight: 28, textAlignVertical: 'center' },
  pickButton: { minHeight: 44, borderRadius: 12, backgroundColor: C.pink, paddingHorizontal: 12, justifyContent: 'center' },
  pickButtonText: { color: C.white, fontSize: 12, fontWeight: '800' },
  confirmedActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginHorizontal: 20, marginBottom: 14 },
  sendBtn: { flex: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14, paddingHorizontal: 8, backgroundColor: C.pink },
  sendText: { fontSize: 15, fontWeight: '800', color: C.white },
  saveBtn: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14, paddingHorizontal: 16, backgroundColor: C.white, borderWidth: 1.5, borderColor: C.pinkBorder },
  saveText: { fontSize: 15, fontWeight: '700', color: C.pinkDeep },
  footerActions: { flexDirection: 'row', gap: 8, marginHorizontal: 20, marginBottom: 14 },
  regenerateButton: { minHeight: 52, flex: 1, paddingHorizontal: 8, borderRadius: 14, borderWidth: 1, borderColor: C.pinkBorder, alignItems: 'center', justifyContent: 'center' },
  regenerateText: { color: C.pinkDeep, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  confirmButton: { minHeight: 52, flex: 1, paddingHorizontal: 8, borderRadius: 14, backgroundColor: C.pink, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  confirmText: { color: C.white, fontSize: 15, fontWeight: '800', textAlign: 'center', flexShrink: 1 },
});
