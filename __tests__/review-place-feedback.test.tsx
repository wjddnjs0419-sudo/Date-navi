import React from 'react';
import { TouchableOpacity, Text } from 'react-native';

// 리뷰 화면 장소별 등급(만족도·가격) 수집 — Task 11.
// 렌더 방식은 기존 화면 테스트(__tests__/card-review-screen-contract.test.tsx)의
// react-test-renderer 패턴을 그대로 따른다(@testing-library/react-native 미도입 프로젝트).

const mockInsert = jest.fn(async () => ({ error: null }));
const mockUpdate = jest.fn(() => ({ eq: async () => ({ error: null }) }));
const mockReplace = jest.fn();
const mockRpc = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'card-1' }),
  useRouter: () => ({ replace: mockReplace }),
  useFocusEffect: (cb: () => void) => require('react').useEffect(() => { cb(); }, []),
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

jest.mock('../lib/i18n', () => {
  const ko = require('../locales/ko/review.json').review;
  const common = { cancel: '취소', error: '오류', saving: '저장 중', coupleRequired: '커플 필요' };
  return {
    useI18n: () => ({
      strings: { review: ko, common, card: { memory: {} } },
    }),
  };
});

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (table: string) => {
      if (table === 'date_planner_profiles') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { couple_id: 'c1' } }) }) }) };
      }
      if (table === 'date_memories') {
        return {
          insert: mockInsert,
          select: () => ({ eq: async () => ({ data: [{ user_id: 'u1' }] }) }),
        };
      }
      if (table === 'date_cards') {
        return { update: mockUpdate };
      }
      return {};
    },
  },
}));

const TR = require('react-test-renderer') as {
  act: (cb: () => void | Promise<void>) => Promise<void>;
  create: (el: React.ReactElement) => { root: { findAllByType: (t: unknown) => { props: any }[] } };
};

const ReviewScreen = require('../app/card/review').default;

const placeRows = [
  { session_id: 'sess1', step_id: 's1', step_order: 1, place_name: '가마솥김치전골', kakao_place_id: 'k1' },
  { session_id: 'sess1', step_id: 's2', step_order: 2, place_name: '메가MGC커피', kakao_place_id: 'k2' },
];

function setRpc(places: unknown[] = placeRows, feedbackError: unknown = null) {
  mockRpc.mockImplementation(async (name: string) => (
    name === 'get_course_places_for_review'
      ? { data: places, error: null }
      : { data: null, error: feedbackError }
  ));
}

async function render() {
  let tree!: ReturnType<typeof TR.create>;
  await TR.act(async () => { tree = TR.create(<ReviewScreen />); });
  await TR.act(async () => {});
  return tree;
}

function byTestId(tree: ReturnType<typeof TR.create>, testID: string) {
  return tree.root.findAllByType(TouchableOpacity).find((n) => n.props.testID === testID);
}

function allText(tree: ReturnType<typeof TR.create>) {
  return tree.root.findAllByType(Text).map((n) => n.props.children).flat(Infinity).join(' ');
}

async function pressStar(tree: ReturnType<typeof TR.create>, n: number) {
  const star = byTestId(tree, `review-star-${n}`)!;
  await TR.act(async () => { star.props.onPress(); });
}

beforeEach(() => {
  mockInsert.mockClear();
  mockUpdate.mockClear();
  mockReplace.mockClear();
  mockRpc.mockReset();
  setRpc();
});

describe('리뷰 화면 — 장소별 등급', () => {
  it('코스 카드면 get_course_places_for_review 결과로 장소 목록을 렌더한다', async () => {
    const tree = await render();
    expect(mockRpc).toHaveBeenCalledWith('get_course_places_for_review', { p_card_id: 'card-1' });
    const txt = allText(tree);
    expect(txt).toContain('가마솥김치전골');
    expect(txt).toContain('메가MGC커피');
  });

  it('별점 4를 주면 전 장소가 좋아요로 미리 선택되고, 3 이하면 선택되지 않는다', async () => {
    const tree = await render();
    await pressStar(tree, 4);
    expect(byTestId(tree, 'place-good-s1')!.props.accessibilityState?.selected).toBe(true);
    expect(byTestId(tree, 'place-good-s2')!.props.accessibilityState?.selected).toBe(true);
    await pressStar(tree, 3);
    expect(byTestId(tree, 'place-good-s1')!.props.accessibilityState?.selected).toBeFalsy();
  });

  it('사용자가 직접 만족도를 바꾼 장소는 별점을 다시 눌러도 유지된다', async () => {
    const tree = await render();
    await pressStar(tree, 5);
    await TR.act(async () => { byTestId(tree, 'place-bad-s1')!.props.onPress(); });
    await pressStar(tree, 4);
    expect(byTestId(tree, 'place-bad-s1')!.props.accessibilityState?.selected).toBe(true);
    expect(byTestId(tree, 'place-good-s2')!.props.accessibilityState?.selected).toBe(true);
  });

  it('저장 시 등급 있는 장소마다 피드백 rpc가 호출되고, rpc 실패해도 별점 저장은 성공 흐름을 탄다', async () => {
    setRpc(placeRows, { message: 'boom' });
    const tree = await render();
    await pressStar(tree, 5);

    const saveBtn = tree.root.findAllByType(require('../components/ui').BigButton)[0];
    await TR.act(async () => { saveBtn.props.onPress(); });

    const feedbackCalls = mockRpc.mock.calls.filter(([name]) => name === 'record_recommendation_place_feedback');
    expect(feedbackCalls).toHaveLength(2);
    expect(feedbackCalls[0][1]).toEqual(expect.objectContaining({
      p_session_id: 'sess1', p_step_id: 's1', p_visited: true, p_satisfaction: true, p_price_level: null,
    }));
    expect(mockInsert).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/memories');
  });

  it('가격만 고른 장소도 피드백 rpc로 보낸다', async () => {
    const tree = await render();
    await TR.act(async () => { byTestId(tree, 'place-price-s2-3')!.props.onPress(); });
    await pressStar(tree, 2);

    const saveBtn = tree.root.findAllByType(require('../components/ui').BigButton)[0];
    await TR.act(async () => { saveBtn.props.onPress(); });

    const feedbackCalls = mockRpc.mock.calls.filter(([name]) => name === 'record_recommendation_place_feedback');
    expect(feedbackCalls).toHaveLength(1);
    expect(feedbackCalls[0][1]).toEqual(expect.objectContaining({
      p_step_id: 's2', p_price_level: 3, p_satisfaction: null, p_tags: [],
    }));
  });

  it('장소 목록이 비면(수동 카드) 장소 섹션이 렌더되지 않는다', async () => {
    setRpc([]);
    const tree = await render();
    expect(byTestId(tree, 'place-good-s1')).toBeUndefined();
    expect(allText(tree)).not.toContain('이번 코스 장소들은 어땠나요?');
  });
});
