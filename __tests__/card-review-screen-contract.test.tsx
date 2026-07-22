import React from 'react';
import { TouchableOpacity, Text } from 'react-native';

const mockInsert = jest.fn(async () => ({ error: null }));
const mockUpdate = jest.fn(() => ({ eq: async () => ({ error: null }) }));
const mockReplace = jest.fn();

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
  const common = { cancel: '취소', error: '오류', saving: '저장 중' };
  return {
    useI18n: () => ({
      strings: { review: ko, common, card: { memory: {} } },
    }),
  };
});

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: (table: string) => {
      if (table === 'date_planner_profiles') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { couple_id: 'c1' } }) }) }) };
      }
      if (table === 'date_memories') {
        return { insert: mockInsert };
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

async function render() {
  let tree!: ReturnType<typeof TR.create>;
  await TR.act(async () => { tree = TR.create(<ReviewScreen />); });
  await TR.act(async () => {});
  return tree;
}

beforeEach(() => {
  mockInsert.mockClear();
  mockUpdate.mockClear();
  mockReplace.mockClear();
});

describe('데이트 후기 화면 — 별점 바', () => {
  it('전체 별점 라벨과 별 5개를 렌더한다', async () => {
    const tree = await render();
    const txt = tree.root.findAllByType(Text).map((n) => n.props.children).flat(Infinity).join(' ');
    expect(txt).toContain('전체 별점');
    const stars = tree.root.findAllByType(TouchableOpacity).filter((n) => String(n.props.testID ?? '').startsWith('review-star-'));
    expect(stars.length).toBe(5);
  });

  it('별점을 선택하지 않으면 저장 시 별점 에러를 띄운다', async () => {
    const { Alert } = require('react-native');
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const tree = await render();

    const saveBtn = tree.root.findAllByType(require('../components/ui').BigButton)[0];
    await TR.act(async () => { saveBtn.props.onPress(); });

    expect(Alert.alert).toHaveBeenCalledWith('', '별점을 선택해주세요.');
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('별 3번째를 누르면 rating=3, want_again=false로 저장한다', async () => {
    const tree = await render();
    const stars = tree.root.findAllByType(TouchableOpacity).filter((n) => String(n.props.testID ?? '').startsWith('review-star-'));
    await TR.act(async () => { stars[2].props.onPress(); }); // 0-indexed → 3점

    const saveBtn = tree.root.findAllByType(require('../components/ui').BigButton)[0];
    await TR.act(async () => { saveBtn.props.onPress(); });

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ rating: 3, want_again: false }));
  });

  it('별 5번째를 누르면 want_again=true로 저장한다', async () => {
    const tree = await render();
    const stars = tree.root.findAllByType(TouchableOpacity).filter((n) => String(n.props.testID ?? '').startsWith('review-star-'));
    await TR.act(async () => { stars[4].props.onPress(); }); // 5점

    const saveBtn = tree.root.findAllByType(require('../components/ui').BigButton)[0];
    await TR.act(async () => { saveBtn.props.onPress(); });

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ rating: 5, want_again: true }));
  });
});
