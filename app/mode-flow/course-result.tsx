import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Modal, Pressable, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Send, Bookmark, ChevronUp, ChevronDown, X, Lock } from '../../components/iconography';
import { C, DS, SP, R } from '../../constants/theme';
import { getCourseCategoryIcon } from '../../lib/course-draft';
import { BigButton, Badge, Header, MetaChipRow, ScreenHeading, SuccessModal } from '../../components/ui';
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
import { type ReplacementCandidate } from '../../lib/replacement-candidates';
import { openPlaceInBrowser } from '../../lib/placeBrowser';
import { buildStructuredCourseResultParams, parseStructuredCourseResultParams } from '../../lib/recommendation-route';
import { omitOneShotRequestFields } from '../../lib/recommendation-request';
import { useRecommendationSessionStore } from '../../components/recommendation/recommendation-session-provider';
import { StepActionSheet } from '../../components/recommendation/step-action-sheet';
import { subscribePickedPlace } from '../../lib/place-pick-bridge';
import type { RecommendationSessionSnapshot } from '../../lib/recommendation-session-repository';
import { logEvent } from '../../lib/analytics';
import { buildCourseEditActionParams, buildCourseRegenerateRequestedParams } from '../../lib/analytics-course-actions';
import { buildCourseSavedParams } from '../../lib/analytics-course-save';
import { canonicalizeStepIntentTag, localizeStepIntentTag } from '../../shared/recommendation/step-intent-tag-catalog';

type ReplacementCandidateGroups = {
  top: Array<ReplacementCandidate | ProviderReplacementCandidate>;
  additional: Array<ReplacementCandidate | ProviderReplacementCandidate>;
};

type ProviderReplacementCandidate = {
  candidateId: string;
  providerPlaceId: string;
  name: string;
  address: string;
  roadAddress: string;
  latitude: number;
  longitude: number;
};

const EMPTY_REPLACEMENT_CANDIDATE_GROUPS: ReplacementCandidateGroups = { top: [], additional: [] };

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

type DisplayStepIntents = {
  resolved: NonNullable<RecommendationSessionSnapshot['response']['metadata']['stepIntent']>['resolved'];
  unsupported: NonNullable<RecommendationSessionSnapshot['response']['metadata']['stepIntent']>['unsupported'];
};

function getCurrentPlaceIdentity(step: RecommendationSessionSnapshot['steps'][number]) {
  return step.currentPlaceIdentity
    ?? (step.currentKakaoPlaceId
      ? { provider: 'kakao' as const, providerPlaceId: step.currentKakaoPlaceId }
      : undefined);
}

function openMap(place: Parameters<typeof openPlaceInBrowser>[0]) {
  void logEvent('course_edit_action', buildCourseEditActionParams('open_map'));
  void openPlaceInBrowser(place);
}

function getDisplayStepIntents(
  snapshot: RecommendationSessionSnapshot,
): DisplayStepIntents | undefined {
  const serverStepIntent = snapshot.response.metadata.stepIntent;
  if (serverStepIntent) {
    return { resolved: serverStepIntent.resolved, unsupported: serverStepIntent.unsupported };
  }

  // Provider-neutral responses currently omit stepIntent metadata. The request still
  // carries the user's structured tags, so use them only as a display fallback.
  const resolved = snapshot.request.courseSteps.flatMap((step) => (
    (step.intentTags ?? []).map((tag) => {
      const canonicalTerm = canonicalizeStepIntentTag(tag);
      return {
        canonicalTerm,
        displayLabel: {
          ko: localizeStepIntentTag(canonicalTerm, 'ko'),
          en: localizeStepIntentTag(canonicalTerm, 'en'),
        },
        strength: 'required' as const,
        negated: false,
        stepId: step.id,
      };
    })
  ));
  return resolved.length > 0 ? { resolved, unsupported: [] } : undefined;
}

export default function CourseResultScreen() {
  const rawParams = useLocalSearchParams();
  const router = useRouter();
  const { t, language } = useI18n();
  const {
    getRecommendationSession,
    loadRecommendationSession,
    reloadRecommendationSession,
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
  const [replacementCandidates, setReplacementCandidates] = useState<ReplacementCandidateGroups>(EMPTY_REPLACEMENT_CANDIDATE_GROUPS);
  const [replacementCandidateListAttestationId, setReplacementCandidateListAttestationId] = useState<string | null>(null);
  const [providerReplacementAttestationId, setProviderReplacementAttestationId] = useState<string | null>(null);
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
      if (action !== 'confirm') {
        void logEvent('course_edit_action', buildCourseEditActionParams(action));
      }
      // 확정만으로는 후보 저장이 아니다. 저장/보내기 전까지 카드를 draft로 두어
      // candidates(status='active')에 뜨지 않게 한다. 저장/보내기 시 active로 승격된다.
      if (action === 'confirm' && next.confirmedCardId) {
        await supabase.from('date_cards').update({ status: 'draft' }).eq('id', next.confirmedCardId);
      }
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
    const placeIdentity = getCurrentPlaceIdentity(step);
    if (!placeIdentity) {
      throw new Error('A provider place identity is required.');
    }
    return {
      stepId: step.stepId,
      candidateId: step.currentCandidateId,
      ...(step.currentKakaoPlaceId ? { kakaoPlaceId: step.currentKakaoPlaceId } : {}),
      placeIdentity,
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
    if (!snapshot || snapshot.status === 'confirmed' || snapshot.steps.some((step) => !getCurrentPlaceIdentity(step))) return;
    void logEvent('course_regenerate_requested', buildCourseRegenerateRequestedParams(snapshot.steps));
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
          ...snapshot.steps.filter((step) => targetStepId ? step.stepId === targetStepId : !step.locked).flatMap((step) => {
            const identity = getCurrentPlaceIdentity(step);
            return identity ? [identity.providerPlaceId] : [];
          }),
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
      const target = snapshot.steps.find((step) => step.stepId === targetStepId);
      const targetIdentity = target ? getCurrentPlaceIdentity(target) : undefined;
      if (targetIdentity?.provider === 'naver') {
        const { data, error } = await supabase.functions.invoke('provider-neutral-replacements', {
          body: { action: 'list', sessionId: snapshot.sessionId, targetStepId },
        });
        if (error || !data || data.targetStepId !== targetStepId || typeof data.attestationId !== 'string' || !Array.isArray(data.candidates)) throw error ?? new Error('Invalid Naver candidates');
        setReplacementTab('recommend');
        setReplacementTargetId(targetStepId);
        setReplacementCandidates({ top: data.candidates.slice(0, 3) as ProviderReplacementCandidate[], additional: data.candidates.slice(3, 15) as ProviderReplacementCandidate[] });
        setProviderReplacementAttestationId(data.attestationId);
        setReplacementCandidateListAttestationId(null);
        return;
      }
      if (snapshot.steps.some((step) => !getCurrentPlaceIdentity(step))) return;
      const { data, error } = await supabase.functions.invoke('replacement-candidates', {
        body: { sessionId: snapshot.sessionId, targetStepId },
      });
      if (error || !data || data.targetStepId !== targetStepId || typeof data.candidateListAttestationId !== 'string'
        || !Array.isArray(data.top) || !Array.isArray(data.additional)) throw error ?? new Error('Invalid candidates');
      setReplacementTab('recommend');
      setReplacementTargetId(targetStepId);
      setReplacementCandidates({
        top: data.top.slice(0, 3) as ReplacementCandidate[],
        additional: data.additional.slice(0, 12) as ReplacementCandidate[],
      });
      setReplacementCandidateListAttestationId(data.candidateListAttestationId);
      setProviderReplacementAttestationId(null);
    } catch {
      setEditError(t('modeFlow.courseResult.editError'));
    } finally {
      setEditing(false);
    }
  }

  async function replaceWithProviderCandidate(targetStepId: string, candidate: ProviderReplacementCandidate) {
    if (!snapshot || !providerReplacementAttestationId) return;
    setEditing(true); setEditError('');
    try {
      const { error } = await supabase.functions.invoke('provider-neutral-replacements', {
        body: { action: 'apply', sessionId: snapshot.sessionId, targetStepId, attestationId: providerReplacementAttestationId, providerPlaceId: candidate.providerPlaceId },
      });
      if (error) throw error;
      const next = await reloadRecommendationSession(snapshot.sessionId);
      setSnapshot(next);
      void logEvent('course_edit_action', buildCourseEditActionParams('replace'));
      setReplacementTargetId(null); setReplacementCandidates(EMPTY_REPLACEMENT_CANDIDATE_GROUPS); setProviderReplacementAttestationId(null);
    } catch { setEditError(t('modeFlow.courseResult.editError')); } finally { setEditing(false); }
  }

  async function replaceWithCandidate(targetStepId: string, kakaoPlaceId: string, pickedName?: string) {
    if (!snapshot || snapshot.steps.some((step) => !getCurrentPlaceIdentity(step))) return;
    setEditing(true);
    setEditError('');
    try {
      const request = {
        ...omitOneShotRequestFields(snapshot.request),
        requestId: createRecommendationRequestId(),
        sessionId: snapshot.sessionId,
        baseRequestId: snapshot.requestId,
        replacement: {
          stepId: targetStepId,
          kakaoPlaceId,
          ...(pickedName ? { pickedName } : {}),
          ...(!pickedName && replacementCandidateListAttestationId
            ? { candidateListAttestationId: replacementCandidateListAttestationId }
            : {}),
        },
        lockedSteps: snapshot.steps.filter((step) => step.stepId !== targetStepId).map(toLockedStep),
        excludedPlaceIds: [...new Set([...(snapshot.request.excludedPlaceIds ?? []), ...snapshot.steps.flatMap((step) => {
          const identity = getCurrentPlaceIdentity(step);
          return identity ? [identity.providerPlaceId] : [];
        })])],
      };
      const response = await requestRecommendationResponse(request);
      const replaced = response.course.steps.find((step) => step.stepId === targetStepId && step.kakaoPlaceId === kakaoPlaceId);
      if (!replaced) throw new Error('The replacement step was not present in the verified response.');
      const next = await mutateRecommendationSession(snapshot.sessionId, 'replace', { attestationRequestId: request.requestId, stepId: targetStepId, candidateId: replaced.candidateId, kakaoPlaceId });
      setSnapshot(next);
      void logEvent('course_edit_action', buildCourseEditActionParams('replace'));
      setReplacementTargetId(null);
      setReplacementCandidates(EMPTY_REPLACEMENT_CANDIDATE_GROUPS);
      setReplacementCandidateListAttestationId(null);
      setProviderReplacementAttestationId(null);
      router.replace({ pathname: '/mode-flow/course-result', params: buildStructuredCourseResultParams(next.requestId, next.sessionId) } as any);
    } catch {
      setEditError(t('modeFlow.courseResult.editError'));
    } finally {
      setEditing(false);
    }
  }

  async function addVerifiedStep() {
    if (!snapshot || snapshot.status === 'confirmed' || snapshot.steps.length >= 4 || snapshot.steps.some((step) => !getCurrentPlaceIdentity(step))) return;
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
      void logEvent('course_edit_action', buildCourseEditActionParams('add'));
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
      // 저장/보내기 = 명시적 저장 의사. draft로 두었던 카드를 active로 승격해 후보로 노출한다.
      if (cardId) {
        await supabase.from('date_cards').update({ status: 'active' }).eq('id', cardId);
      }
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
        if (cardId) router.push({
          pathname: '/share/send',
          params: { cardId, sourceScreen: 'course_recommendation_result' },
        } as any);
      } else {
        void logEvent('course_saved', buildCourseSavedParams(snapshot.steps.length, finalTitle !== defaultTitle));
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
    setReplacementCandidates(EMPTY_REPLACEMENT_CANDIDATE_GROUPS);
    setReplacementCandidateListAttestationId(null);
    setProviderReplacementAttestationId(null);
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
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.88} style={s.backButton}>
          <Text style={s.backButtonText}>{t('modeFlow.courseResult.back')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <SuccessModal
        visible={savedModalVisible}
        message={t('modeFlow.courseResult.savedMessage')}
        onHide={() => { setSavedModalVisible(false); router.replace('/(tabs)/' as any); }}
      />
      <Header onBack={() => router.back()} />
      <ScreenHeading title={t('modeFlow.courseResult.heading')} />
      <ScrollView contentContainerStyle={s.scrollContent}>
        <View style={s.headerArea}>
          <Badge tone="pink">{t('modeFlow.courseResult.badge')}</Badge>
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
            const stepIntent = getDisplayStepIntents(snapshot);
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
            activeOpacity={0.88}
            style={s.conditionsToggle}
          >
            <Text style={s.conditionsToggleText}>{t('modeFlow.courseResult.conditions')}</Text>
          </TouchableOpacity>
          {conditionsExpanded && (
            <View style={s.conditionsPanel}>
              <Text style={s.conditionText}>{snapshot.request.location.label}</Text>
              <Text style={s.conditionText}>{snapshot.request.courseSteps.map((step) => step.label).join(' → ')}</Text>
              {snapshot.request.maxWalkingMinutes && <Text style={s.conditionText}>{snapshot.request.maxWalkingMinutes} min</Text>}
              {snapshot.request.totalBudgetKRW && (
                <Text style={s.conditionText}>
                  {t('modeFlow.courseResult.perPersonCourseBudget', {
                    amount: (snapshot.request.totalBudgetKRW / 2).toLocaleString(),
                  })}
                </Text>
              )}
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
                  activeOpacity={0.88}
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
                      <TouchableOpacity accessibilityRole="button" disabled={editing || snapshot.status === 'confirmed' || index === 0} onPress={() => moveStep(step.stepId, 'up')} activeOpacity={0.88} style={s.stepAction}>
                        <ChevronUp size={16} color={C.textSub} />
                      </TouchableOpacity>
                      <TouchableOpacity accessibilityRole="button" disabled={editing || snapshot.status === 'confirmed' || index === snapshot.steps.length - 1} onPress={() => moveStep(step.stepId, 'down')} activeOpacity={0.88} style={s.stepAction}>
                        <ChevronDown size={16} color={C.textSub} />
                      </TouchableOpacity>
                    </View>
                  </View>
                  <Text numberOfLines={1} style={s.timelineName}>{step.placeName}</Text>
                  {step.reason ? <Text numberOfLines={2} style={s.timelineReason}>{step.reason}</Text> : null}
                  <Text numberOfLines={1} style={s.timelineAddress}>{step.roadAddress || step.address}</Text>
                  <View style={s.cardActions}>
                    {(step.currentKakaoPlaceId ?? step.currentKakaoLinkPlaceId ?? step.mapUrl) && <TouchableOpacity testID={`course-step-map-${step.stepId}`} accessibilityRole="link" onPress={() => openMap({ kakaoPlaceId: step.currentKakaoPlaceId ?? step.currentKakaoLinkPlaceId, mapUrl: step.mapUrl, name: step.placeName, address: step.roadAddress || step.address })} activeOpacity={0.88} style={s.cardActionBtn}>
                      <Text style={s.cardActionText}>{t('modeFlow.courseResult.placeReviews')}</Text>
                    </TouchableOpacity>}
                    {snapshot.status !== 'confirmed' && (
                      <TouchableOpacity accessibilityRole="button" disabled={editing || step.locked || (!step.currentKakaoPlaceId && step.currentPlaceIdentity?.provider !== 'naver')} onPress={() => void loadReplacementCandidates(step.stepId)} activeOpacity={0.88} style={[s.cardActionBtn, (step.locked || (!step.currentKakaoPlaceId && step.currentPlaceIdentity?.provider !== 'naver')) && s.cardActionBtnDisabled]}>
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
              <TouchableOpacity accessibilityRole="button" onPress={closeReplacementPanel} activeOpacity={0.88} style={s.replacementCloseButton}>
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
                activeOpacity={0.88}
                style={[s.tabBtn, replacementTab === 'recommend' && s.tabBtnOn]}
              >
                <Text style={[s.tabText, replacementTab === 'recommend' && s.tabTextOn]}>{t('modeFlow.courseResult.recommendTab')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ selected: replacementTab === 'search' }}
                testID="course-replacement-tab-search"
                onPress={() => setReplacementTab('search')}
                activeOpacity={0.88}
                style={[s.tabBtn, replacementTab === 'search' && s.tabBtnOn]}
              >
                <Text style={[s.tabText, replacementTab === 'search' && s.tabTextOn]}>{t('modeFlow.courseResult.searchTab')}</Text>
              </TouchableOpacity>
            </View>
            {replacementTab === 'recommend' ? (
              <>
                <Text style={s.replacementNotice}>{t('modeFlow.courseResult.replacementNotice')}</Text>
                {replacementCandidates.top.length + replacementCandidates.additional.length === 0 ? (
                  <Text style={s.replacementEmpty}>{t('modeFlow.courseResult.replacementEmpty')}</Text>
                ) : (
                  <ScrollView style={s.replacementList} showsVerticalScrollIndicator={false}>
                    <View testID="course-replacement-top-group">
                      {replacementCandidates.top.map((candidate) => (
                        <View key={'providerPlaceId' in candidate ? candidate.providerPlaceId : candidate.kakaoPlaceId} style={s.replacementRow}>
                          <View style={s.replacementCopy}>
                            <Text style={s.topLabel}>{t('modeFlow.courseResult.topPick')}</Text>
                            <Text style={s.replacementName}>{candidate.name}</Text>
                            <Text numberOfLines={1} style={s.replacementAddress}>{candidate.roadAddress || candidate.address}</Text>
                          {'providerPlaceId' in candidate ? null : <View style={s.externalActions}><TouchableOpacity accessibilityRole="link" onPress={() => openMap(candidate)} activeOpacity={0.88}><Text style={s.externalLink}>{t('modeFlow.courseResult.placeReviews')}</Text></TouchableOpacity></View>}
                          </View>
                          <TouchableOpacity accessibilityRole="button" testID={`course-replacement-pick-${'providerPlaceId' in candidate ? candidate.providerPlaceId : candidate.kakaoPlaceId}`} disabled={editing} onPress={() => { if (replacementTargetId) { if ('providerPlaceId' in candidate) void replaceWithProviderCandidate(replacementTargetId, candidate); else void replaceWithCandidate(replacementTargetId, candidate.kakaoPlaceId); } }} activeOpacity={0.88} style={s.pickButton}><Text style={s.pickButtonText}>{t('modeFlow.courseResult.pick')}</Text></TouchableOpacity>
                        </View>
                      ))}
                    </View>
                    <View testID="course-replacement-additional-group">
                      {replacementCandidates.additional.map((candidate) => (
                        <View key={'providerPlaceId' in candidate ? candidate.providerPlaceId : candidate.kakaoPlaceId} style={s.replacementRow}>
                          <View style={s.replacementCopy}>
                            <Text style={s.replacementName}>{candidate.name}</Text>
                            <Text numberOfLines={1} style={s.replacementAddress}>{candidate.roadAddress || candidate.address}</Text>
                            {'providerPlaceId' in candidate ? null : <View style={s.externalActions}><TouchableOpacity accessibilityRole="link" onPress={() => openMap(candidate)} activeOpacity={0.88}><Text style={s.externalLink}>{t('modeFlow.courseResult.placeReviews')}</Text></TouchableOpacity></View>}
                          </View>
                          <TouchableOpacity accessibilityRole="button" testID={`course-replacement-pick-${'providerPlaceId' in candidate ? candidate.providerPlaceId : candidate.kakaoPlaceId}`} disabled={editing} onPress={() => { if (replacementTargetId) { if ('providerPlaceId' in candidate) void replaceWithProviderCandidate(replacementTargetId, candidate); else void replaceWithCandidate(replacementTargetId, candidate.kakaoPlaceId); } }} activeOpacity={0.88} style={s.pickButton}><Text style={s.pickButtonText}>{t('modeFlow.courseResult.pick')}</Text></TouchableOpacity>
                        </View>
                      ))}
                    </View>
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
                      selectionContext: 'course_replace',
                      ...(targetCategoryCode ? { categoryCode: targetCategoryCode } : {}),
                    } } as any);
                  }}
                  style={s.searchCta}
                  activeOpacity={0.88}
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
          <TouchableOpacity testID="confirmed-send" style={s.sendBtn} onPress={handleSendToPartner} disabled={sending} activeOpacity={0.88}>
            {sending ? <ActivityIndicator size="small" color={C.white} /> : <Send size={14} color={C.white} />}<Text style={s.sendText}>{t('modeFlow.courseResult.send')}</Text>
          </TouchableOpacity>
          {!saved && (
            <TouchableOpacity testID="confirmed-save" style={s.saveBtn} onPress={handleSave} disabled={saving} activeOpacity={0.88}>
              {saving ? <ActivityIndicator size="small" color={C.pinkDeep} />
                : <><Bookmark size={14} color={C.pinkDeep} /><Text style={s.saveText}>{t('modeFlow.courseResult.save')}</Text></>}
            </TouchableOpacity>
          )}
          {errorMsg !== '' && <Text style={s.inlineError}>{errorMsg}</Text>}
        </View>
      )}

      {snapshot.status !== 'confirmed' && (
        <View style={s.footerActions}>
          <TouchableOpacity accessibilityRole="button" disabled={editing} onPress={() => void regenerateUnlocked()} activeOpacity={0.88} style={s.regenerateButton}>
            <Text style={s.regenerateText}>{t('modeFlow.courseResult.regenerate')}</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" testID="course-add-step" disabled={editing || snapshot.steps.length >= 4} onPress={() => void addVerifiedStep()} activeOpacity={0.88} style={s.regenerateButton}>
            <Text style={s.regenerateText}>{t('modeFlow.courseResult.add')}</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" testID="course-confirm" disabled={editing} onPress={() => void applyMutation('confirm', {})} activeOpacity={0.88} style={s.confirmButton}>
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
  titleFieldLabel: { ...DS.typography.bodyCompact, color: C.textMuted, fontWeight: '600', marginBottom: SP.sm },
  titleInputWrap: { borderWidth: 1.5, borderColor: C.pinkBorder, backgroundColor: C.white, borderRadius: DS.radius.input, paddingHorizontal: SP.lg, paddingVertical: DS.component.titleInputPaddingVertical },
  titleInputWrapActive: { borderColor: C.pink },
  titleInput: { ...DS.typography.cardTitle, fontWeight: '600', color: C.text, paddingVertical: 0 },
  titleHelper: { ...DS.typography.bodySmall, color: C.textSub, marginTop: SP.sm },
  safe: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: SP.section },
  loadingText: { ...DS.typography.body, color: C.textSub, marginTop: SP.lg, textAlign: 'center' },
  errTitle: { ...DS.typography.metric, fontWeight: '700', color: C.text, textAlign: 'center' },
  errRetryBtn: { marginTop: SP.xxl },
  backButton: { minHeight: DS.spacing.touch, justifyContent: 'center', paddingHorizontal: SP.screen, marginTop: SP.sm },
  backButtonText: { ...DS.typography.body, fontWeight: '600', color: C.textSub },
  inlineError: { ...DS.typography.bodySmall, color: C.pinkDeep, marginTop: SP.sm },
  placeRowGap: { marginTop: SP.md },
  headerArea: { paddingHorizontal: SP.screen, gap: SP.sm, marginBottom: SP.sm },
  sub: { ...DS.typography.bodyCompact, color: C.textSub },
  conditionsToggle: { minHeight: DS.spacing.touch, justifyContent: 'center', alignSelf: 'flex-start' },
  conditionsToggleText: { ...DS.typography.bodyCompact, color: C.pinkDeep, fontWeight: '700' },
  conditionsPanel: { backgroundColor: C.white, borderRadius: DS.radius.input, padding: SP.md, gap: SP.micro },
  conditionText: { ...DS.typography.bodySmall, color: C.textSub },
  relaxedText: { ...DS.typography.bodySmall, color: C.pinkDeep },
  intentSection: { gap: SP.sm, marginTop: SP.xs },
  intentTitle: { ...DS.typography.bodySmall, fontWeight: '700', color: C.textSub },
  intentChips: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.sm },
  intentUnsupported: { ...DS.typography.bodySmall, color: C.textMuted },
  scrollContent: { paddingBottom: SP.md },
  timeline: { paddingHorizontal: SP.screen, gap: SP.xs },
  timelineCard: { backgroundColor: C.white, borderRadius: DS.radius.card, padding: SP.lg, borderWidth: 1, borderColor: C.border },
  timelineTopRow: { flexDirection: 'row', alignItems: 'center', gap: SP.sm },
  timelineBadge: { width: 24, height: 24, borderRadius: DS.radius.full, alignItems: 'center', justifyContent: 'center' },
  timelineBadgeNum: { ...DS.typography.bodySmall, fontWeight: '800', color: C.white },
  timelineLockIcon: { marginLeft: -DS.spacing.micro },
  timelineName: { ...DS.typography.cardTitle, color: C.text, marginTop: SP.sm },
  timelineReason: { ...DS.typography.bodyCompact, color: C.pinkDeep, marginTop: SP.xs },
  timelineAddress: { ...DS.typography.bodySmall, color: C.textMuted, marginTop: SP.xs },
  timelineConnector: { alignItems: 'center', height: 26, justifyContent: 'center' },
  timelineConnectorLine: { width: 1.5, height: 7, backgroundColor: C.border },
  timelineConnectorDot: { width: 20, height: 20, borderRadius: DS.radius.full, backgroundColor: C.pinkLight, alignItems: 'center', justifyContent: 'center' },
  cardActions: { flexDirection: 'row', gap: SP.sm, marginTop: SP.md },
  cardActionBtn: { flex: 1, minHeight: DS.spacing.touch, borderRadius: DS.radius.input, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  cardActionBtnDisabled: { opacity: 0.4 },
  cardActionText: { ...DS.typography.bodyCompact, color: C.pinkDeep, fontWeight: '700' },
  stepActions: { flexDirection: 'row', marginLeft: 'auto', gap: SP.xs },
  stepAction: { width: DS.spacing.touch, height: DS.spacing.touch, alignItems: 'center', justifyContent: 'center' },
  editError: { ...DS.typography.bodySmall, color: C.pinkDeep, textAlign: 'center', marginBottom: SP.xs },
  replacementModalWrap: { flex: 1, justifyContent: 'flex-end' },
  replacementBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: DS.color.overlayScrim },
  replacementSheet: {
    maxHeight: '75%',
    backgroundColor: C.white,
    borderTopLeftRadius: DS.radius.modal,
    borderTopRightRadius: DS.radius.modal,
    paddingHorizontal: SP.screen,
    paddingTop: SP.sm,
    paddingBottom: SP.xxl,
    gap: SP.sm,
  },
  replacementHandle: { width: DS.component.sheetHandleWidth, height: DS.component.sheetHandleHeight, borderRadius: DS.radius.full, backgroundColor: C.border, alignSelf: 'center', marginBottom: SP.sm },
  replacementList: { flexGrow: 0 },
  replacementHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  replacementCloseButton: { width: DS.spacing.touch, height: DS.spacing.touch, alignItems: 'center', justifyContent: 'center' },
  replacementTitle: { ...DS.typography.cardTitle, color: C.text, fontWeight: '800' },
  replacementNotice: { ...DS.typography.caption, color: C.textMuted },
  tabRow: { flexDirection: 'row', backgroundColor: C.gray, borderRadius: DS.radius.compact, padding: SP.xs, gap: SP.xs },
  tabBtn: { flex: 1, minHeight: DS.spacing.touch, alignItems: 'center', justifyContent: 'center', borderRadius: DS.radius.small },
  tabBtnOn: { backgroundColor: C.white },
  tabText: { ...DS.typography.bodySmall, fontWeight: '800', color: C.textSub },
  tabTextOn: { color: C.pinkDeep },
  searchCta: { minHeight: 48, borderRadius: DS.radius.compact, borderWidth: 1.5, borderColor: C.pinkBorder, alignItems: 'center', justifyContent: 'center', marginTop: SP.sm },
  searchCtaText: { ...DS.typography.bodyCompact, color: C.pinkDeep, fontWeight: '800' },
  searchHint: { ...DS.typography.bodySmall, color: C.textMuted, textAlign: 'center', marginTop: SP.sm },
  replacementEmpty: { ...DS.typography.bodySmall, color: C.textMuted, textAlign: 'center', paddingVertical: SP.md },
  replacementRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: SP.sm, borderTopWidth: 1, borderTopColor: C.border, paddingTop: SP.sm },
  replacementCopy: { flex: 1, gap: SP.micro },
  topLabel: { ...DS.typography.micro, color: C.pinkDeep, fontWeight: '800' },
  replacementName: { ...DS.typography.bodyCompact, color: C.text, fontWeight: '700' },
  replacementAddress: { ...DS.typography.caption, color: C.textMuted },
  externalActions: { flexDirection: 'row', gap: SP.sm, marginTop: SP.xs },
  externalLink: { ...DS.typography.caption, color: C.pinkDeep, fontWeight: '700', minHeight: DS.spacing.touch, textAlignVertical: 'center' },
  pickButton: { minHeight: 44, borderRadius: DS.radius.input, backgroundColor: C.pink, paddingHorizontal: SP.md, justifyContent: 'center' },
  pickButtonText: { ...DS.typography.bodySmall, color: C.white, fontWeight: '800' },
  confirmedActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SP.sm, marginHorizontal: SP.screen, marginBottom: SP.lg },
  sendBtn: { flex: 1, minHeight: SP.input, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SP.xs, borderRadius: DS.radius.button, paddingHorizontal: SP.sm, backgroundColor: C.pink },
  sendText: { ...DS.typography.button, fontWeight: '800', color: C.white },
  saveBtn: { minHeight: SP.input, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SP.xs, borderRadius: DS.radius.button, paddingHorizontal: SP.lg, backgroundColor: C.white, borderWidth: 1.5, borderColor: C.pinkBorder },
  saveText: { ...DS.typography.button, color: C.pinkDeep },
  footerActions: { flexDirection: 'row', gap: SP.sm, marginHorizontal: SP.screen, marginBottom: SP.lg },
  regenerateButton: { minHeight: 52, flex: 1, paddingHorizontal: SP.sm, borderRadius: DS.radius.button, borderWidth: 1, borderColor: C.pinkBorder, alignItems: 'center', justifyContent: 'center' },
  regenerateText: { ...DS.typography.bodyCompact, color: C.pinkDeep, fontWeight: '700', textAlign: 'center' },
  confirmButton: { minHeight: SP.input, flex: 1, paddingHorizontal: SP.sm, borderRadius: DS.radius.button, backgroundColor: C.pink, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SP.xs },
  confirmText: { ...DS.typography.button, fontWeight: '800', color: C.white, textAlign: 'center', flexShrink: 1 },
});
