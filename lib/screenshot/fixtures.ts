/**
 * 스크린샷 목업 모드용 fixture 데이터.
 * 실제 필드 shape 은 각 화면의 select/타입 정의에서 추출했다.
 * 목업 클라이언트는 필터(.eq 등)를 무시하고 테이블별 배열을 그대로 돌려주므로,
 * "내 것 vs 파트너" 구분이 필요한 화면을 위해 user_id 를 명시해 둔다.
 */

export const SCREENSHOT_USER_ID = '00000000-0000-4000-8000-000000000001';
export const SCREENSHOT_PARTNER_ID = '00000000-0000-4000-8000-000000000002';
export const SCREENSHOT_COUPLE_ID = 'screenshot-couple-1';

const now = '2026-07-15T09:00:00.000Z';

const cardI18n = (
  ko: { title: string; summary: string; why: string },
  en: { title: string; summary: string; why: string },
) => ({
  ko: { title: ko.title, summary: ko.summary, why_recommended: ko.why },
  en: { title: en.title, summary: en.summary, why_recommended: en.why },
});

const steps = [
  { order: 1, title: '서울숲', category: '공원', kakaoPlaceId: '111', address: '서울 성동구 뚝섬로', locked: false },
  { order: 2, title: '어니언 성수', category: '카페', kakaoPlaceId: '222', address: '서울 성동구 아차산로', locked: false },
  { order: 3, title: '성수동 이탈리안', category: '음식점', kakaoPlaceId: '333', address: '서울 성동구 연무장길', locked: false },
];

export const SCREENSHOT_FIXTURES: Record<string, any[]> = {
  date_planner_profiles: [
    {
      user_id: SCREENSHOT_USER_ID,
      display_name: '지원',
      couple_id: SCREENSHOT_COUPLE_ID,
      profile_photo_url: null,
      anniversary_date: '2024-03-01',
    },
  ],
  date_planner_couples: [
    {
      id: SCREENSHOT_COUPLE_ID,
      status: 'linked',
      owner_user_id: SCREENSHOT_USER_ID,
      partner_user_id: SCREENSHOT_PARTNER_ID,
      created_at: '2024-03-01T00:00:00.000Z',
      invite_code: 'LOVE24',
      anniversary_date: '2024-03-01',
    },
  ],
  user_preferences: [
    {
      user_id: SCREENSHOT_USER_ID,
      onboarding_completed: true,
      preferred_moods: ['cozy', 'active'],
      avoid_conditions: ['too_far'],
      is_long_distance: false,
      planning_style: 'spontaneous',
    },
  ],
  date_cards: [
    {
      id: 'card-1',
      couple_id: SCREENSHOT_COUPLE_ID,
      title: '성수동 감성 데이트 코스',
      summary: '서울숲 산책부터 감성 카페, 이탈리안 디너까지 이어지는 3단계 코스예요.',
      estimated_time: '4시간',
      estimated_budget: '8만원',
      tags: ['산책', '카페', '디너'],
      mode: 'make_course',
      source: 'ai',
      status: 'active',
      why_recommended: '두 분이 좋아하는 아늑한 분위기와 활동을 모두 담았어요.',
      steps,
      content_i18n: cardI18n(
        { title: '성수동 감성 데이트 코스', summary: '서울숲 산책부터 감성 카페, 이탈리안 디너까지.', why: '아늑함과 활동을 모두 담았어요.' },
        { title: 'Seongsu-dong Date Course', summary: 'A walk in Seoul Forest, a cozy cafe, then Italian dinner.', why: 'Blends the calm mood and activity you both enjoy.' },
      ),
      created_at: now,
    },
    {
      id: 'card-2',
      couple_id: SCREENSHOT_COUPLE_ID,
      title: '한강 노을 피크닉',
      summary: '해질녘 한강에서 즐기는 여유로운 피크닉 코스.',
      estimated_time: '3시간',
      estimated_budget: '4만원',
      tags: ['한강', '피크닉', '노을'],
      mode: 'make_course',
      source: 'ai',
      status: 'active',
      why_recommended: '가깝고 부담 없는 야외 데이트를 원하셔서 골랐어요.',
      steps: steps.slice(0, 2),
      content_i18n: cardI18n(
        { title: '한강 노을 피크닉', summary: '해질녘 한강 피크닉 코스.', why: '가깝고 부담 없는 야외 데이트.' },
        { title: 'Han River Sunset Picnic', summary: 'A relaxed riverside picnic at golden hour.', why: 'A close, low-key outdoor date.' },
      ),
      created_at: '2026-07-14T09:00:00.000Z',
    },
  ],
  reactions: [
    { card_id: 'card-1', user_id: SCREENSHOT_USER_ID, reaction_type: 'love', created_at: now },
    { card_id: 'card-1', user_id: SCREENSHOT_PARTNER_ID, reaction_type: 'love', created_at: now },
    { card_id: 'card-2', user_id: SCREENSHOT_USER_ID, reaction_type: 'like', created_at: now },
    { card_id: 'card-2', user_id: SCREENSHOT_PARTNER_ID, reaction_type: 'burden', created_at: now },
  ],
  date_memories: [
    {
      id: 'memory-1',
      card_id: 'card-1',
      couple_id: SCREENSHOT_COUPLE_ID,
      title: '성수동 데이트',
      review: '날씨도 좋았고 카페가 특히 좋았어요. 다음에 또 가고 싶어요!',
      want_again: true,
      photo_url: null,
      created_at: now,
    },
    {
      id: 'memory-2',
      card_id: 'card-2',
      couple_id: SCREENSHOT_COUPLE_ID,
      title: '한강 피크닉',
      review: '노을이 정말 예뻤던 하루.',
      want_again: false,
      photo_url: null,
      created_at: '2026-06-20T09:00:00.000Z',
    },
  ],
  memories: [],
  date_memory_comments: [
    { id: 'comment-1', user_id: SCREENSHOT_PARTNER_ID, content: '나도 좋았어 :)', created_at: now },
  ],
  notifications: [
    {
      id: 'notif-1',
      type: 'reaction',
      payload: { card_id: 'card-1', card_title: '성수동 감성 데이트 코스', reaction_type: 'love' },
      read: false,
      created_at: now,
    },
    {
      id: 'notif-2',
      type: 'new_card',
      payload: { card_id: 'card-2', card_title: '한강 노을 피크닉', message: '이 코스 어때?' },
      read: false,
      created_at: '2026-07-14T10:00:00.000Z',
    },
  ],
  soft_messages: [
    { id: 'sm-1', card_id: 'card-2', couple_id: SCREENSHOT_COUPLE_ID, message: '이 코스 같이 가보고 싶어!', created_at: now },
  ],
  bucket_list: [
    { id: 'bucket-1', couple_id: SCREENSHOT_COUPLE_ID, idea: '제주도 3박 4일 여행', created_by: SCREENSHOT_USER_ID, created_at: now },
    { id: 'bucket-2', couple_id: SCREENSHOT_COUPLE_ID, idea: '함께 쿠킹 클래스 듣기', created_by: SCREENSHOT_PARTNER_ID, created_at: now },
  ],
  bucket_reactions: [
    { bucket_id: 'bucket-1', user_id: SCREENSHOT_PARTNER_ID, reaction_type: 'love', created_at: now },
  ],
  push_tokens: [],
  analytics_events: [],
  avatars: [],
};

// 추천 세션 스냅샷 payload — get_recommendation_session / persist_recommendation_session RPC 가
// 반환하는 shape. mapRecommendationSessionPayload 의 엄격한 교차검증을 통과하도록
// __tests__/recommendation-session-fixture.ts 와 동일 구조로 구성했다.
const RECO_REQUEST_ID = 'req-phase8-001';
const recoRequest = {
  requestId: RECO_REQUEST_ID,
  mode: 'course',
  language: 'ko',
  location: {
    source: 'kakao',
    kakaoPlaceId: 'origin-001',
    label: '서울숲',
    address: '서울 성동구',
    latitude: 37.544,
    longitude: 127.037,
    kind: 'landmark',
  },
  courseSteps: [
    { id: 'step-meal', category: 'meal', label: '식사' },
    { id: 'step-cafe', category: 'cafe', label: '카페' },
  ],
  maxWalkingMinutes: 10,
  totalBudgetKRW: 70_000,
  moods: ['quiet'],
  duration: 'half_day',
};
const recoCourseSteps = [
  {
    stepId: 'step-meal', order: 1, category: 'meal', label: '식사',
    candidateId: 'candidate-meal', kakaoPlaceId: 'place-meal', name: '성수 손칼국수',
    address: '서울 성동구', roadAddress: '서울 성동구 왕십리로 1',
    mapUrl: 'https://place.map.kakao.com/place-meal', latitude: 37.544, longitude: 127.037,
    reason: '아늑하고 붐비지 않는 식사 자리예요.', locked: false,
  },
  {
    stepId: 'step-cafe', order: 2, category: 'cafe', label: '카페',
    candidateId: 'candidate-cafe', kakaoPlaceId: 'place-cafe', name: '어니언 성수',
    address: '서울 성동구', roadAddress: '서울 성동구 왕십리로 2',
    mapUrl: 'https://place.map.kakao.com/place-cafe', latitude: 37.544, longitude: 127.037,
    reason: '식사 후 걸어서 갈 수 있는 감성 카페예요.', locked: false,
  },
];
const recoCourse = {
  requestId: RECO_REQUEST_ID,
  sessionId: RECO_REQUEST_ID,
  steps: recoCourseSteps,
  relaxedConstraints: [],
  generatedAt: '2026-07-14T10:00:00.000Z',
};
const recoResponse = {
  requestId: RECO_REQUEST_ID,
  course: recoCourse,
  cards: [{
    requestId: RECO_REQUEST_ID,
    sessionId: RECO_REQUEST_ID,
    title: '서울숲 감성 데이트',
    summary: '식사와 카페를 이어 즐기는 반나절 코스.',
    estimated_time: '반나절',
    estimated_budget: '70,000원 이내',
    tags: ['course'],
    why_recommended: '선택한 코스 순서에 맞아요.',
    steps: recoCourseSteps.map((s) => ({
      label: s.label, candidateId: s.candidateId, kakaoPlaceId: s.kakaoPlaceId,
      place_name: s.name, place_address: s.roadAddress, map_url: s.mapUrl,
    })),
  }],
  metadata: {
    fallbackUsed: false,
    selectionSource: 'ai',
    selectionReason: 'none',
    search: { requestCount: 2, successfulCount: 2, failedCount: 0, rateLimitedCount: 0, timeoutCount: 0, candidateCount: 2 },
    route: {
      distanceMethod: 'haversine_straight_line', adjacentDistanceMeters: [0], totalDistanceMeters: 0,
      walkingHeuristicMetersPerMinute: 80, walkingLimitAssessment: 'provisional_within', hardConstraintValidated: false,
    },
  },
};
const recoSessionPayload = {
  session: {
    id: RECO_REQUEST_ID,
    request_id: RECO_REQUEST_ID,
    original_request_id: RECO_REQUEST_ID,
    owner_user_id: SCREENSHOT_USER_ID,
    couple_id: SCREENSHOT_COUPLE_ID,
    original_request: recoRequest,
    latest_request: recoRequest,
    current_course: recoCourse,
    cards: recoResponse.cards,
    metadata: recoResponse.metadata,
    status: 'draft',
    created_at: '2026-07-14T10:00:01.000Z',
    updated_at: '2026-07-14T10:00:01.000Z',
  },
  steps: recoCourseSteps.map((step) => ({
    session_id: RECO_REQUEST_ID,
    step_id: step.stepId,
    step_order: step.order,
    category: step.category,
    label: step.label,
    original_candidate_id: step.candidateId,
    original_kakao_place_id: step.kakaoPlaceId,
    current_candidate_id: step.candidateId,
    current_kakao_place_id: step.kakaoPlaceId,
    place_name: step.name,
    address: step.address,
    road_address: step.roadAddress,
    map_url: step.mapUrl,
    latitude: step.latitude,
    longitude: step.longitude,
    reason: step.reason,
    locked: step.locked,
    created_at: '2026-07-14T10:00:01.000Z',
    updated_at: '2026-07-14T10:00:01.000Z',
  })),
};

/** 추천 세션 스냅샷 id(캡처 라우트 파라미터로 사용). */
export const SCREENSHOT_SESSION_ID = RECO_REQUEST_ID;

/** rpc 반환값. */
export const SCREENSHOT_RPC_RESULTS: Record<string, any> = {
  get_recommendation_session: recoSessionPayload,
  persist_recommendation_session: recoSessionPayload,
};

/** edge function invoke 반환값. */
export const SCREENSHOT_FUNCTION_RESULTS: Record<string, any> = {};
