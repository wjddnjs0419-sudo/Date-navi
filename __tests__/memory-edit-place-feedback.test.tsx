import React from 'react';
import { TouchableOpacity, Text } from 'react-native';

// 추억 수정 화면도 리뷰 화면과 같은 장소별 등급을 편집할 수 있어야 한다.
// 이미 남긴 답(place_feedback)은 불러와 선택 상태로 보여준다.

const mockMaybeSingle = jest.fn(async () => ({
  data: { card_id: 'card-1', title: '데이트', review: '좋았어요', want_again: true, photo_url: null, rating: 5 },
}));
const mockUpdate = jest.fn(() => ({
  eq: () => ({ select: async () => ({ data: [{ id: 'm1' }], error: null }) }),
}));
const mockBack = jest.fn();
const mockRpc = jest.fn();
const mockFeedbackSelect = jest.fn(async () => ({
  data: [{ session_id: 'sess1', step_id: 's2', price_level: 3, satisfaction: false }],
  error: null,
}));

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'm1' }),
  useRouter: () => ({ back: mockBack }),
  useFocusEffect: (cb: () => void | (() => void)) => require('react').useEffect(() => cb(), []),
}));

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: async () => ({ granted: false }),
  launchImageLibraryAsync: async () => ({ canceled: true }),
}));

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

jest.mock('../components/illustration', () => {
  const { View } = require('react-native');
  return { Illustration: View, MINI_ILLUSTRATION_WIDTH: 130 };
});

jest.mock('../lib/i18n', () => {
  const review = require('../locales/ko/review.json').review;
  const card = require('../locales/ko/card.json').card;
  const common = { cancel: '취소', error: '오류', notice: '안내', save: '저장' };
  return { useI18n: () => ({ strings: { review, card, common } }) };
});

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (table: string) => {
      if (table === 'date_memories') {
        return { select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }), update: mockUpdate };
      }
      if (table === 'place_feedback') {
        return { select: () => ({ in: mockFeedbackSelect }) };
      }
      return {};
    },
    storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
  },
}));

const TR = require('react-test-renderer') as {
  act: (cb: () => void | Promise<void>) => Promise<void>;
  create: (el: React.ReactElement) => { root: { findAllByType: (t: unknown) => { props: any }[] } };
};

const EditMemoryScreen = require('../app/card/memory/edit/[id]').default;

const placeRows = [
  { session_id: 'sess1', step_id: 's1', step_order: 1, place_name: '인산인해', kakao_place_id: 'k1' },
  { session_id: 'sess1', step_id: 's2', step_order: 2, place_name: '카페이스트', kakao_place_id: 'k2' },
];

async function render() {
  let tree!: ReturnType<typeof TR.create>;
  await TR.act(async () => { tree = TR.create(<EditMemoryScreen />); });
  await TR.act(async () => {});
  return tree;
}

function byTestId(tree: ReturnType<typeof TR.create>, testID: string) {
  return tree.root.findAllByType(TouchableOpacity).find((n) => n.props.testID === testID);
}

function allText(tree: ReturnType<typeof TR.create>) {
  return tree.root.findAllByType(Text).map((n) => n.props.children).flat(Infinity).join(' ');
}

beforeEach(() => {
  mockUpdate.mockClear();
  mockBack.mockClear();
  mockRpc.mockReset();
  mockRpc.mockImplementation(async (name: string) => (
    name === 'get_course_places_for_review' ? { data: placeRows, error: null } : { data: null, error: null }
  ));
});

describe('추억 수정 화면 — 장소별 등급', () => {
  it('코스 추억이면 장소 목록과 두 줄 라벨을 렌더한다', async () => {
    const tree = await render();
    const txt = allText(tree);
    expect(txt).toContain('인산인해');
    expect(txt).toContain('만족스러웠나요?');
    expect(txt).toContain('가격대는 어땠나요?');
  });

  it('이미 남긴 답을 불러와 선택 상태로 보여준다', async () => {
    const tree = await render();
    expect(byTestId(tree, 'place-bad-s2')!.props.accessibilityState?.selected).toBe(true);
    expect(byTestId(tree, 'place-price-s2-3')!.props.accessibilityState?.selected).toBe(true);
    expect(byTestId(tree, 'place-good-s1')!.props.accessibilityState?.selected).toBeFalsy();
  });

  it('수정 후 저장하면 바뀐 장소에 대해 피드백 rpc를 다시 보낸다', async () => {
    const tree = await render();
    await TR.act(async () => { byTestId(tree, 'place-good-s1')!.props.onPress(); });

    const saveBtn = tree.root.findAllByType(require('../components/ui').BigButton)[0];
    await TR.act(async () => { saveBtn.props.onPress(); });

    const calls = mockRpc.mock.calls.filter(([name]) => name === 'record_recommendation_place_feedback');
    expect(calls.map(([, args]) => args.p_step_id).sort()).toEqual(['s1', 's2']);
    expect(calls.find(([, args]) => args.p_step_id === 's1')![1]).toEqual(
      expect.objectContaining({ p_satisfaction: true, p_tags: ['revisit'] }),
    );
    expect(mockUpdate).toHaveBeenCalled();
  });
});
