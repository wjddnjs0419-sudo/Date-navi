import React from 'react';
import type { RecommendationSessionSnapshot } from '../lib/recommendation-session-repository';

const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();
const mockMutateRecommendationSession = jest.fn();
const mockLoadRecommendationSession = jest.fn();
const mockReloadRecommendationSession = jest.fn();
const mockSupabaseFunctionsInvoke = jest.fn();
let mockCapturedFocusEffect: (() => void) | null = null;
let mockLanguage: 'ko' | 'en' = 'ko';
const mockTranslations = {
  ko: require('../locales/ko/modeFlow.json').modeFlow.courseResult,
  en: require('../locales/en/modeFlow.json').modeFlow.courseResult,
};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ requestId: 'request-1', sessionId: 'session-1' }),
  useRouter: () => ({ back: jest.fn(), push: mockRouterPush, replace: mockRouterReplace }),
  useFocusEffect: (cb: () => void) => { mockCapturedFocusEffect = cb; },
}));

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(async () => ({})) }));

jest.mock('../lib/i18n', () => ({
  useI18n: () => ({
    language: mockLanguage,
    t: (key: string) => {
      if (key === 'modeFlow.courseResult.replacementNotice') return mockTranslations[mockLanguage].replacementNotice;
      if (key === 'modeFlow.courseResult.topPick') return mockTranslations[mockLanguage].topPick;
      return key;
    },
  }),
}));

jest.mock('../lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => mockSupabaseFunctionsInvoke(...args) },
    rpc: jest.fn(async () => ({ error: null })),
  },
}));

const mockRequestRecommendationResponse = jest.fn(async (_request: unknown) => ({ requestId: 'ai-req', course: { steps: [] }, cards: [] }));

jest.mock('../lib/recommend-date', () => ({
  requestRecommendationResponse: (request: unknown) => mockRequestRecommendationResponse(request),
}));

jest.mock('../lib/recommendationIdentity', () => ({
  createRecommendationRequestId: () => 'new-request-id',
}));

function buildSnapshot(overrides: Partial<RecommendationSessionSnapshot> = {}): RecommendationSessionSnapshot {
  const steps = overrides.steps ?? [
    {
      sessionId: 'session-1', stepId: 'step-meal', order: 1, category: 'meal', label: 'Meal',
      originalCandidateId: 'c-meal', originalKakaoPlaceId: 'k-meal',
      currentCandidateId: 'c-meal', currentKakaoPlaceId: 'k-meal',
      placeName: '한강 식당', address: '서울 성동구', roadAddress: '서울 성동구 왕십리로',
      mapUrl: 'https://place.map.kakao.com/k-meal', latitude: 37.545, longitude: 127.038,
      reason: 'ok', locked: false, createdAt: '2026-07-16T00:00:00.000Z', updatedAt: '2026-07-16T00:00:00.000Z',
    },
    {
      sessionId: 'session-1', stepId: 'step-cafe', order: 2, category: 'cafe', label: 'Cafe',
      originalCandidateId: 'c-cafe', originalKakaoPlaceId: 'k-cafe',
      currentCandidateId: 'c-cafe', currentKakaoPlaceId: 'k-cafe',
      placeName: '한강 카페', address: '서울 성동구', roadAddress: '서울 성동구 왕십리로',
      mapUrl: 'https://place.map.kakao.com/k-cafe', latitude: 37.546, longitude: 127.039,
      reason: 'ok', locked: false, createdAt: '2026-07-16T00:00:00.000Z', updatedAt: '2026-07-16T00:00:00.000Z',
    },
    {
      sessionId: 'session-1', stepId: 'step-walk', order: 3, category: 'walk', label: 'Walk',
      originalCandidateId: 'c-walk', originalKakaoPlaceId: 'k-walk',
      currentCandidateId: 'c-walk', currentKakaoPlaceId: 'k-walk',
      placeName: '한강 산책로', address: '서울 성동구', roadAddress: '서울 성동구 왕십리로',
      mapUrl: 'https://place.map.kakao.com/k-walk', latitude: 37.547, longitude: 127.04,
      reason: 'ok', locked: false, createdAt: '2026-07-16T00:00:00.000Z', updatedAt: '2026-07-16T00:00:00.000Z',
    },
  ];
  return {
    sessionId: 'session-1',
    requestId: 'request-1',
    originalRequestId: 'request-1',
    ownerUserId: 'user-1',
    coupleId: 'couple-1',
    request: {
      requestId: 'request-1',
      mode: 'course',
      language: 'ko',
      location: { source: 'kakao', label: '서울숲', latitude: 37.5444, longitude: 127.0374, kind: 'landmark' },
      courseSteps: steps.map((step) => ({ id: step.stepId, category: step.category, label: step.label })),
    },
    originalRequest: {
      requestId: 'request-1',
      mode: 'course',
      language: 'ko',
      location: { source: 'kakao', label: '서울숲', latitude: 37.5444, longitude: 127.0374, kind: 'landmark' },
      courseSteps: steps.map((step) => ({ id: step.stepId, category: step.category, label: step.label })),
    },
    confirmedCardId: undefined,
    response: {
      requestId: 'request-1',
      course: {
        requestId: 'request-1', sessionId: 'session-1',
        steps: steps.map((step) => ({
          stepId: step.stepId, order: step.order, category: step.category, label: step.label,
          candidateId: step.currentCandidateId, kakaoPlaceId: step.currentKakaoPlaceId,
          name: step.placeName, address: step.address, roadAddress: step.roadAddress,
          mapUrl: step.mapUrl, latitude: step.latitude, longitude: step.longitude,
          reason: step.reason, locked: step.locked,
        })),
        relaxedConstraints: [], generatedAt: '2026-07-16T00:00:00.000Z',
      },
      cards: [],
      metadata: {
        fallbackUsed: false, selectionSource: 'ai', selectionReason: 'none',
        search: { requestCount: 1, successfulCount: 1, failedCount: 0, rateLimitedCount: 0, timeoutCount: 0, candidateCount: 3 },
        route: {},
      },
    },
    steps,
    status: 'draft',
    createdAt: '2026-07-16T00:00:00.000Z',
    updatedAt: '2026-07-16T00:00:00.000Z',
    ...overrides,
  } as RecommendationSessionSnapshot;
}

jest.mock('../components/recommendation/recommendation-session-provider', () => ({
  useRecommendationSessionStore: () => ({
    getRecommendationSession: () => (globalThis as any).__mockSnapshot,
    loadRecommendationSession: mockLoadRecommendationSession,
    reloadRecommendationSession: mockReloadRecommendationSession,
    mutateRecommendationSession: mockMutateRecommendationSession,
  }),
}));

type TestNode = { props: Record<string, any>; type: unknown };
type TestRendererInstance = {
  root: {
    findByProps: (props: Record<string, unknown>) => TestNode;
    findAllByProps: (props: Record<string, unknown>) => TestNode[];
    findAllByType: (type: unknown) => TestNode[];
    findAll: (predicate: (node: TestNode) => boolean) => TestNode[];
  };
  unmount: () => void;
};
const TestRenderer = require('react-test-renderer') as {
  act: (callback: () => void | Promise<void>) => void | Promise<void>;
  create: (element: React.ReactElement) => TestRendererInstance;
};
const { act, create } = TestRenderer;

const CourseResultScreen = require('../app/mode-flow/course-result').default as
  typeof import('../app/mode-flow/course-result').default;
const { StepActionSheet } = require('../components/recommendation/step-action-sheet') as
  typeof import('../components/recommendation/step-action-sheet');

function findSheet(instance: TestRendererInstance): TestNode {
  return (instance.root as any).findByType(StepActionSheet);
}

function findHostNodes(instance: TestRendererInstance, testID: string): TestNode[] {
  return instance.root.findAll((node) => typeof node.type === 'string' && node.props.testID === testID);
}

function findHostNodesWithin(node: TestNode, testID: string): TestNode[] {
  return (node as any).findAll((child: TestNode) => typeof child.type === 'string' && child.props.testID === testID);
}

describe('course result screen', () => {
  // TestRendererInstance created by each test; unmounted below so a test that leaves the
  // replacement panel open (e.g. after a mocked failure) doesn't leak its subscribePickedPlace
  // listener into later tests sharing that module-level bridge.
  let instance!: TestRendererInstance;

  beforeEach(() => {
    mockRouterPush.mockClear();
    mockRouterReplace.mockClear();
    mockMutateRecommendationSession.mockClear();
    mockLoadRecommendationSession.mockClear();
    mockReloadRecommendationSession.mockClear();
    mockSupabaseFunctionsInvoke.mockClear();
    mockRequestRecommendationResponse.mockClear();
    mockCapturedFocusEffect = null;
    mockLanguage = 'ko';
  });

  afterEach(() => {
    act(() => { instance.unmount(); });
  });

  it('renders the course steps only once, with no duplicate full-screen candidate pager', () => {
    (globalThis as any).__mockSnapshot = buildSnapshot();
    act(() => { instance = create(<CourseResultScreen />); });

    // react-native's <Text> renders through a composite + host layer that both carry
    // the same `children` prop, so one logical text occurrence yields 2 matches here.
    const nameOccurrences = instance.root.findAllByProps({ children: '한강 카페' });
    expect(nameOccurrences.length).toBe(2);
  });

  it('shows a location meta chip and each step reason (mockup P0/04/05)', () => {
    (globalThis as any).__mockSnapshot = buildSnapshot();
    act(() => { instance = create(<CourseResultScreen />); });

    // location label surfaces in the always-visible meta chip row (conditions panel is collapsed)
    expect(instance.root.findAllByProps({ children: '서울숲' }).length).toBeGreaterThan(0);
    // each step's recommendation reason is shown on its card
    expect(instance.root.findAllByProps({ children: 'ok' }).length).toBeGreaterThan(0);
  });

  it('shows selected step intent tags when the response metadata omits stepIntent', () => {
    const base = buildSnapshot();
    (globalThis as any).__mockSnapshot = buildSnapshot({
      request: {
        ...base.request,
        courseSteps: base.request.courseSteps.map((step, index) => (
          index === 0 ? { ...step, intentTags: ['일식'] } : step
        )),
      },
    });
    act(() => { instance = create(<CourseResultScreen />); });

    expect(instance.root.findAllByProps({ children: '일식' }).length).toBeGreaterThan(0);
  });

  it('renders a category icon per step', () => {
    (globalThis as any).__mockSnapshot = buildSnapshot();
    act(() => { instance = create(<CourseResultScreen />); });

    const { Coffee, Utensils, Footprints } = require('../components/iconography');
    expect(instance.root.findAllByType(Utensils).length).toBeGreaterThan(0);
    expect(instance.root.findAllByType(Coffee).length).toBeGreaterThan(0);
    expect(instance.root.findAllByType(Footprints).length).toBeGreaterThan(0);
  });

  it('opens the step action sheet when a step card is tapped, and lock toggle calls applyMutation via mutateRecommendationSession', async () => {
    (globalThis as any).__mockSnapshot = buildSnapshot();
    mockMutateRecommendationSession.mockResolvedValue(buildSnapshot());
    act(() => { instance = create(<CourseResultScreen />); });

    const card = instance.root.findByProps({ testID: 'course-step-card-step-cafe' });
    act(() => { card.props.onPress(); });

    const sheet = findSheet(instance);
    expect(sheet.props.visible).toBe(true);
    expect(sheet.props.placeName).toBe('한강 카페');

    await act(async () => { sheet.props.onLockToggle(); });
    expect(mockMutateRecommendationSession).toHaveBeenCalledWith('session-1', 'lock', { stepId: 'step-cafe' });
  });

  it('disables delete in the action sheet once only two steps remain', () => {
    (globalThis as any).__mockSnapshot = buildSnapshot({
      steps: buildSnapshot().steps.slice(0, 2),
    });
    act(() => { instance = create(<CourseResultScreen />); });

    const card = instance.root.findByProps({ testID: 'course-step-card-step-meal' });
    act(() => { card.props.onPress(); });

    const sheet = findSheet(instance);
    expect(sheet.props.canDelete).toBe(false);
  });

  it('shows send/save actions instead of after-date feedback once the course is confirmed', () => {
    (globalThis as any).__mockSnapshot = buildSnapshot({ status: 'confirmed', confirmedCardId: 'card-1' });
    act(() => { instance = create(<CourseResultScreen />); });

    expect(() => instance.root.findByProps({ testID: 'confirmed-send' })).not.toThrow();
    expect(() => instance.root.findByProps({ testID: 'confirmed-save' })).not.toThrow();
    expect(instance.root.findAllByProps({ children: 'modeFlow.courseResult.feedbackTitle' })).toHaveLength(0);
  });

  it('stacks step cards vertically at full width instead of a fixed-width horizontal strip', () => {
    (globalThis as any).__mockSnapshot = buildSnapshot();
    act(() => { instance = create(<CourseResultScreen />); });

    const card = instance.root.findByProps({ testID: 'course-step-card-step-meal' });
    const flatStyle = Object.assign({}, ...[card.props.style].flat(Infinity).filter(Boolean));
    expect(flatStyle.width).not.toBe(164);

    const { ScrollView } = require('react-native');
    const horizontalScrollViews = instance.root.findAllByType(ScrollView)
      .filter((node: TestNode) => node.props.horizontal);
    expect(horizontalScrollViews).toHaveLength(0);
  });

  it('wraps the scrollable header/step/replacement content separately from the pinned footer actions', () => {
    (globalThis as any).__mockSnapshot = buildSnapshot();
    act(() => { instance = create(<CourseResultScreen />); });

    const { ScrollView } = require('react-native');
    const scrollViews = instance.root.findAllByType(ScrollView);
    expect(scrollViews.length).toBeGreaterThan(0);

    const confirmButton = instance.root.findByProps({ testID: 'course-confirm' });
    const isInsideAnyScrollView = scrollViews.some((scroll: TestNode) => (
      (scroll as any).findAll((node: TestNode) => node === confirmButton).length > 0
    ));
    expect(isInsideAnyScrollView).toBe(false);
  });

  it("carries each pinned step's true locked flag, not a blanket true, when replacing a step", async () => {
    const snapshot = buildSnapshot();
    snapshot.steps[1] = { ...snapshot.steps[1], locked: true };
    (globalThis as any).__mockSnapshot = snapshot;
    mockSupabaseFunctionsInvoke.mockResolvedValueOnce({
      data: {
        targetStepId: 'step-meal',
        candidateListAttestationId: 'replacement-list-001',
        top: [{
          candidateId: 'c-new', kakaoPlaceId: 'k-new', name: '새로운 식당', address: 'addr', roadAddress: 'road',
          mapUrl: 'https://place.map.kakao.com/k-new', latitude: 37.55, longitude: 127.05, score: 10, contextScore: 10,
        }],
        additional: [],
      },
      error: null,
    });
    act(() => { instance = create(<CourseResultScreen />); });

    const card = instance.root.findByProps({ testID: 'course-step-card-step-meal' });
    act(() => { card.props.onPress(); });
    const sheet = findSheet(instance);
    await act(async () => { sheet.props.onReplace(); });

    const pickButton = instance.root.findByProps({ testID: 'course-replacement-pick-k-new' });
    await act(async () => { pickButton.props.onPress(); });

    expect(mockRequestRecommendationResponse).toHaveBeenCalledTimes(1);
    const sentRequest = mockRequestRecommendationResponse.mock.calls[0][0] as { lockedSteps: Array<{ stepId: string; locked: boolean }> };
    const lockedByStepId = Object.fromEntries(sentRequest.lockedSteps.map((step) => [step.stepId, step.locked]));
    expect(lockedByStepId).toEqual({ 'step-cafe': true, 'step-walk': false });
  });

  it('mutates replace with the candidateId from the recommend-date response, not the stale candidate-list id', async () => {
    const snapshot = buildSnapshot();
    (globalThis as any).__mockSnapshot = snapshot;
    mockSupabaseFunctionsInvoke.mockResolvedValueOnce({
      data: {
        targetStepId: 'step-meal',
        candidateListAttestationId: 'replacement-list-001',
        top: [{
          candidateId: 'c-list-001', kakaoPlaceId: 'k-new', name: '새로운 식당', address: 'addr', roadAddress: 'road',
          mapUrl: 'https://place.map.kakao.com/k-new', latitude: 37.55, longitude: 127.05, score: 10, contextScore: 10,
        }],
        additional: [],
      },
      error: null,
    });
    // recommend-date runs its OWN search and assigns a different ephemeral candidateId
    // for the same kakao place. The attested response carries THIS id, so the mutate
    // call must use it — not the one the replacement-candidates list returned.
    mockRequestRecommendationResponse.mockResolvedValueOnce({
      requestId: 'new-request-id',
      course: {
        requestId: 'new-request-id', sessionId: 'session-1',
        steps: [
          { stepId: 'step-meal', order: 1, category: 'meal', label: 'Meal', candidateId: 'candidate_007', kakaoPlaceId: 'k-new' },
          { stepId: 'step-cafe', order: 2, category: 'cafe', label: 'Cafe', candidateId: 'c-cafe', kakaoPlaceId: 'k-cafe' },
          { stepId: 'step-walk', order: 3, category: 'walk', label: 'Walk', candidateId: 'c-walk', kakaoPlaceId: 'k-walk' },
        ],
      },
      cards: [],
    } as unknown as Awaited<ReturnType<typeof mockRequestRecommendationResponse>>);
    mockMutateRecommendationSession.mockResolvedValueOnce(snapshot);

    act(() => { instance = create(<CourseResultScreen />); });

    const card = instance.root.findByProps({ testID: 'course-step-card-step-meal' });
    act(() => { card.props.onPress(); });
    const sheet = findSheet(instance);
    await act(async () => { sheet.props.onReplace(); });
    const pickButton = instance.root.findByProps({ testID: 'course-replacement-pick-k-new' });
    await act(async () => { pickButton.props.onPress(); });

    expect(mockMutateRecommendationSession).toHaveBeenCalledTimes(1);
    const [, action, payload] = mockMutateRecommendationSession.mock.calls[0];
    expect(action).toBe('replace');
    expect(payload).toMatchObject({ stepId: 'step-meal', candidateId: 'candidate_007', kakaoPlaceId: 'k-new' });
  });

  it('uses the provider-neutral endpoint for a Naver step instead of requiring a Kakao ID', async () => {
    const snapshot = buildSnapshot();
    snapshot.steps[0] = {
      ...snapshot.steps[0], currentKakaoPlaceId: undefined,
      currentPlaceIdentity: { provider: 'naver', providerPlaceId: 'naver-meal-1' },
    };
    snapshot.response.course.steps[0] = {
      ...snapshot.response.course.steps[0], kakaoPlaceId: undefined,
      placeIdentity: { provider: 'naver', providerPlaceId: 'naver-meal-1' },
    };
    (globalThis as any).__mockSnapshot = snapshot;
    mockSupabaseFunctionsInvoke
      .mockResolvedValueOnce({ data: { targetStepId: 'step-meal', attestationId: '00000000-0000-4000-8000-000000000001', candidates: [{ candidateId: 'naver_replacement_001', providerPlaceId: 'naver-meal-2', name: '새 네이버 식당', address: 'addr', roadAddress: 'road', latitude: 37.55, longitude: 127.05 }] }, error: null })
      .mockResolvedValueOnce({ data: { ok: true }, error: null });
    const replacedSnapshot = buildSnapshot();
    replacedSnapshot.steps[0] = {
      ...replacedSnapshot.steps[0],
      currentKakaoPlaceId: undefined,
      currentPlaceIdentity: { provider: 'naver', providerPlaceId: 'naver-meal-2' },
      currentCandidateId: 'naver_replacement_001',
      placeName: '새 네이버 식당',
    };
    mockReloadRecommendationSession.mockResolvedValueOnce(replacedSnapshot);
    act(() => { instance = create(<CourseResultScreen />); });

    const card = instance.root.findByProps({ testID: 'course-step-card-step-meal' });
    act(() => { card.props.onPress(); });
    await act(async () => { findSheet(instance).props.onReplace(); });
    expect(mockSupabaseFunctionsInvoke).toHaveBeenCalledWith('provider-neutral-replacements', {
      body: { action: 'list', sessionId: 'session-1', targetStepId: 'step-meal' },
    });
    await act(async () => { instance.root.findByProps({ testID: 'course-replacement-pick-naver-meal-2' }).props.onPress(); });
    expect(mockSupabaseFunctionsInvoke).toHaveBeenLastCalledWith('provider-neutral-replacements', {
      body: { action: 'apply', sessionId: 'session-1', targetStepId: 'step-meal', attestationId: '00000000-0000-4000-8000-000000000001', providerPlaceId: 'naver-meal-2' },
    });
    expect(mockReloadRecommendationSession).toHaveBeenCalledWith('session-1');
    expect(instance.root.findAllByProps({ children: '새 네이버 식당' }).length).toBeGreaterThan(0);
    expect(mockRequestRecommendationResponse).not.toHaveBeenCalled();
  });

  it('shows the Naver map action when Kakao link resolution is unavailable', () => {
    const snapshot = buildSnapshot();
    snapshot.steps[0] = {
      ...snapshot.steps[0],
      currentKakaoPlaceId: undefined,
      currentPlaceIdentity: { provider: 'naver', providerPlaceId: 'naver-meal-1' },
      mapUrl: 'https://map.naver.com/p/search/%EC%84%B1%EC%88%98%20%EC%8B%9D%EB%8B%B9',
    };
    (globalThis as any).__mockSnapshot = snapshot;
    act(() => { instance = create(<CourseResultScreen />); });

    expect(instance.root.findByProps({ testID: 'course-step-map-step-meal' })).toBeDefined();
  });

  it('hides the replacement sheet (without clearing the target step) instead of leaving a stale overlay when the user taps "Search a place"', async () => {
    (globalThis as any).__mockSnapshot = buildSnapshot();
    mockSupabaseFunctionsInvoke.mockResolvedValueOnce({
      data: { targetStepId: 'step-meal', candidateListAttestationId: 'replacement-list-001', top: [], additional: [] },
      error: null,
    });
    act(() => { instance = create(<CourseResultScreen />); });

    const card = instance.root.findByProps({ testID: 'course-step-card-step-meal' });
    act(() => { card.props.onPress(); });
    const sheet = findSheet(instance);
    await act(async () => { sheet.props.onReplace(); });

    act(() => { instance.root.findByProps({ testID: 'course-replacement-tab-search' }).props.onPress(); });
    act(() => { instance.root.findByProps({ testID: 'course-replacement-search-cta' }).props.onPress(); });

    expect(mockRouterPush).toHaveBeenCalledTimes(1);
    const modal = instance.root.findByProps({ testID: 'course-replacement-modal' });
    expect(modal.props.visible).toBe(false);
  });

  it('re-shows the replacement sheet when the screen regains focus after an unfinished search trip, and still completes the replace once a place is picked', async () => {
    (globalThis as any).__mockSnapshot = buildSnapshot();
    mockSupabaseFunctionsInvoke.mockResolvedValueOnce({
      data: { targetStepId: 'step-meal', candidateListAttestationId: 'replacement-list-001', top: [], additional: [] },
      error: null,
    });
    act(() => { instance = create(<CourseResultScreen />); });

    const card = instance.root.findByProps({ testID: 'course-step-card-step-meal' });
    act(() => { card.props.onPress(); });
    const sheet = findSheet(instance);
    await act(async () => { sheet.props.onReplace(); });

    act(() => { instance.root.findByProps({ testID: 'course-replacement-tab-search' }).props.onPress(); });
    act(() => { instance.root.findByProps({ testID: 'course-replacement-search-cta' }).props.onPress(); });

    // simulate returning to this screen (via focus) after the search screen was left on top
    act(() => { mockCapturedFocusEffect?.(); });

    expect(instance.root.findByProps({ testID: 'course-replacement-modal' }).props.visible).toBe(true);

    const { publishPickedPlace } = require('../lib/place-pick-bridge') as typeof import('../lib/place-pick-bridge');
    await act(async () => { publishPickedPlace({ kakaoPlaceId: 'k-searched', name: '검색으로 고른 식당', address: 'addr', longitude: 127.05, latitude: 37.55 }); });

    expect(mockRequestRecommendationResponse).toHaveBeenCalledTimes(1);
    const sentRequest = mockRequestRecommendationResponse.mock.calls[0][0] as { replacement: { stepId: string; kakaoPlaceId: string } };
    expect(sentRequest.replacement).toMatchObject({ stepId: 'step-meal', kakaoPlaceId: 'k-searched' });
  });

  it('renders server-provided top and additional replacement groups explicitly instead of inferring Top 3 from a flattened index', async () => {
    (globalThis as any).__mockSnapshot = buildSnapshot();
    mockSupabaseFunctionsInvoke.mockResolvedValueOnce({
      data: {
        targetStepId: 'step-meal',
        candidateListAttestationId: 'replacement-list-001',
        top: [
          { kakaoPlaceId: 'k-top-1', name: '동선 1', address: 'addr', roadAddress: 'road', mapUrl: '', latitude: 37.55, longitude: 127.05, displayRank: 1 },
          { kakaoPlaceId: 'k-top-2', name: '동선 2', address: 'addr', roadAddress: 'road', mapUrl: '', latitude: 37.55, longitude: 127.05, displayRank: 2 },
        ],
        additional: [
          { kakaoPlaceId: 'k-additional', name: '추가 후보', address: 'addr', roadAddress: 'road', mapUrl: '', latitude: 37.55, longitude: 127.05, displayRank: 3 },
        ],
      },
      error: null,
    });
    act(() => { instance = create(<CourseResultScreen />); });

    act(() => { instance.root.findByProps({ testID: 'course-step-card-step-meal' }).props.onPress(); });
    await act(async () => { findSheet(instance).props.onReplace(); });

    const topGroup = findHostNodes(instance, 'course-replacement-top-group');
    const additionalGroup = findHostNodes(instance, 'course-replacement-additional-group');
    expect(topGroup).toHaveLength(1);
    expect(additionalGroup).toHaveLength(1);
    expect(findHostNodesWithin(topGroup[0], 'course-replacement-pick-k-top-1')).toHaveLength(1);
    expect(findHostNodesWithin(additionalGroup[0], 'course-replacement-pick-k-additional')).toHaveLength(1);
  });

  it.each([
    ['ko', '현재 코스 동선과 최근 추천 이력을 반영한 상위 3개예요. 외부 후기·지도는 직접 확인해주세요.', '동선 추천'],
    ['en', 'These top three consider the current route and your recent recommendations. Check external reviews and maps directly.', 'Route fit'],
  ] as const)('renders the approved %s route-fit copy without rating or review-quality claims', async (language, notice, label) => {
    mockLanguage = language;
    const snapshot = buildSnapshot();
    snapshot.request = { ...snapshot.request, language };
    (globalThis as any).__mockSnapshot = snapshot;
    mockSupabaseFunctionsInvoke.mockResolvedValueOnce({
      data: {
        targetStepId: 'step-meal',
        candidateListAttestationId: 'replacement-list-001',
        top: [{ kakaoPlaceId: 'k-top', name: 'Top', address: 'addr', roadAddress: 'road', mapUrl: '', latitude: 37.55, longitude: 127.05, displayRank: 1 }],
        additional: [],
      },
      error: null,
    });
    act(() => { instance = create(<CourseResultScreen />); });

    act(() => { instance.root.findByProps({ testID: 'course-step-card-step-meal' }).props.onPress(); });
    await act(async () => { findSheet(instance).props.onReplace(); });

    expect(instance.root.findAllByProps({ children: notice }).length).toBeGreaterThan(0);
    expect(instance.root.findAllByProps({ children: label }).length).toBeGreaterThan(0);
    expect(notice).not.toMatch(/rating|review quality|평점|후기 품질/i);
  });

  it('shows a recent-place cooldown explanation in the existing expanded conditions panel', () => {
    const snapshot = buildSnapshot();
    snapshot.response = {
      ...snapshot.response,
      course: {
        ...snapshot.response.course,
        relaxedConstraints: [{
          constraint: 'recentPlaceCooldown',
          reason: '새 장소 후보가 부족해 최근 추천 장소를 일부 다시 포함했어요.',
        }],
      },
    };
    (globalThis as any).__mockSnapshot = snapshot;
    act(() => { instance = create(<CourseResultScreen />); });

    const toggle = instance.root.findAll((node) => (
      node.props.accessibilityState?.expanded === false && typeof node.props.onPress === 'function'
    ))[0];
    act(() => { toggle.props.onPress(); });

    expect(instance.root.findAllByProps({ children: '새 장소 후보가 부족해 최근 추천 장소를 일부 다시 포함했어요.' }).length).toBeGreaterThan(0);
  });

  it('솔로(coupleId 없음)가 확정을 누르면 서버 mutate 대신 커플 연결 안내를 띄운다', async () => {
    const { Alert } = require('react-native');
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockMutateRecommendationSession.mockResolvedValue(buildSnapshot({ coupleId: null, status: 'confirmed' }));
    (globalThis as any).__mockSnapshot = buildSnapshot({ coupleId: null });
    act(() => { instance = create(<CourseResultScreen />); });

    const confirmBtn = instance.root.findByProps({ testID: 'course-confirm' });
    await act(async () => { confirmBtn.props.onPress(); });

    expect(mockMutateRecommendationSession).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith('common.coupleRequired');
    alertSpy.mockRestore();
  });

  it('keeps the footer action labels short enough to fit on one line', () => {
    const ko = JSON.parse(require('node:fs').readFileSync(
      require('node:path').join(__dirname, '../locales/ko/modeFlow.json'), 'utf8',
    )).modeFlow.courseResult;
    const en = JSON.parse(require('node:fs').readFileSync(
      require('node:path').join(__dirname, '../locales/en/modeFlow.json'), 'utf8',
    )).modeFlow.courseResult;

    expect(ko.regenerate.length).toBeLessThanOrEqual(8);
    expect(ko.confirm.length).toBeLessThanOrEqual(6);
    expect(en.regenerate.length).toBeLessThanOrEqual(12);
    expect(en.confirm.length).toBeLessThanOrEqual(16);
  });
});
