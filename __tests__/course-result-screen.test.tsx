import React from 'react';
import type { RecommendationSessionSnapshot } from '../lib/recommendation-session-repository';

const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();
const mockMutateRecommendationSession = jest.fn();
const mockLoadRecommendationSession = jest.fn();
const mockSupabaseFunctionsInvoke = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ requestId: 'request-1', sessionId: 'session-1' }),
  useRouter: () => ({ back: jest.fn(), push: mockRouterPush, replace: mockRouterReplace }),
}));

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(async () => ({})) }));

jest.mock('../lib/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
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
    mutateRecommendationSession: mockMutateRecommendationSession,
  }),
}));

type TestNode = { props: Record<string, any>; type: unknown };
type TestRendererInstance = {
  root: {
    findByProps: (props: Record<string, unknown>) => TestNode;
    findAllByProps: (props: Record<string, unknown>) => TestNode[];
    findAllByType: (type: unknown) => TestNode[];
  };
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

describe('course result screen', () => {
  beforeEach(() => {
    mockRouterPush.mockClear();
    mockRouterReplace.mockClear();
    mockMutateRecommendationSession.mockClear();
    mockLoadRecommendationSession.mockClear();
    mockSupabaseFunctionsInvoke.mockClear();
    mockRequestRecommendationResponse.mockClear();
  });

  it('renders the course steps only once, with no duplicate full-screen candidate pager', () => {
    (globalThis as any).__mockSnapshot = buildSnapshot();
    let instance!: TestRendererInstance;
    act(() => { instance = create(<CourseResultScreen />); });

    // react-native's <Text> renders through a composite + host layer that both carry
    // the same `children` prop, so one logical text occurrence yields 2 matches here.
    const nameOccurrences = instance.root.findAllByProps({ children: '한강 카페' });
    expect(nameOccurrences.length).toBe(2);
  });

  it('renders a category icon per step', () => {
    (globalThis as any).__mockSnapshot = buildSnapshot();
    let instance!: TestRendererInstance;
    act(() => { instance = create(<CourseResultScreen />); });

    const { Coffee, Utensils, Footprints } = require('lucide-react-native');
    expect(instance.root.findAllByType(Utensils).length).toBeGreaterThan(0);
    expect(instance.root.findAllByType(Coffee).length).toBeGreaterThan(0);
    expect(instance.root.findAllByType(Footprints).length).toBeGreaterThan(0);
  });

  it('opens the step action sheet when a step card is tapped, and lock toggle calls applyMutation via mutateRecommendationSession', async () => {
    (globalThis as any).__mockSnapshot = buildSnapshot();
    mockMutateRecommendationSession.mockResolvedValue(buildSnapshot());
    let instance!: TestRendererInstance;
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
    let instance!: TestRendererInstance;
    act(() => { instance = create(<CourseResultScreen />); });

    const card = instance.root.findByProps({ testID: 'course-step-card-step-meal' });
    act(() => { card.props.onPress(); });

    const sheet = findSheet(instance);
    expect(sheet.props.canDelete).toBe(false);
  });

  it('shows send/save actions instead of after-date feedback once the course is confirmed', () => {
    (globalThis as any).__mockSnapshot = buildSnapshot({ status: 'confirmed', confirmedCardId: 'card-1' });
    let instance!: TestRendererInstance;
    act(() => { instance = create(<CourseResultScreen />); });

    expect(() => instance.root.findByProps({ testID: 'confirmed-send' })).not.toThrow();
    expect(() => instance.root.findByProps({ testID: 'confirmed-save' })).not.toThrow();
    expect(instance.root.findAllByProps({ children: 'modeFlow.courseResult.feedbackTitle' })).toHaveLength(0);
  });

  it('stacks step cards vertically at full width instead of a fixed-width horizontal strip', () => {
    (globalThis as any).__mockSnapshot = buildSnapshot();
    let instance!: TestRendererInstance;
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
    let instance!: TestRendererInstance;
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
        top: [{
          candidateId: 'c-new', kakaoPlaceId: 'k-new', name: '새로운 식당', address: 'addr', roadAddress: 'road',
          mapUrl: 'https://place.map.kakao.com/k-new', latitude: 37.55, longitude: 127.05, score: 10, contextScore: 10,
        }],
        additional: [],
      },
      error: null,
    });
    let instance!: TestRendererInstance;
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

    let instance!: TestRendererInstance;
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

  it('솔로(coupleId 없음)가 확정을 누르면 서버 mutate 대신 커플 연결 안내를 띄운다', async () => {
    const { Alert } = require('react-native');
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockMutateRecommendationSession.mockResolvedValue(buildSnapshot({ coupleId: null, status: 'confirmed' }));
    (globalThis as any).__mockSnapshot = buildSnapshot({ coupleId: null });
    let instance!: TestRendererInstance;
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
