import React from 'react';
import { TouchableOpacity, Text } from 'react-native';

const mockMaybeSingle = jest.fn(async () => ({
  data: { card_id: null, title: '한강 피크닉', review: '좋았어요', want_again: true, photo_url: null, rating: 5 },
}));
const mockUpdate = jest.fn(() => ({
  eq: () => ({ select: async () => ({ data: [{ id: 'm1' }], error: null }) }),
}));
const mockBack = jest.fn();

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
  return {
    useI18n: () => ({
      strings: { review, card, common },
    }),
  };
});

jest.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'date_memories') {
        return { select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }), update: mockUpdate };
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

async function render() {
  let tree!: ReturnType<typeof TR.create>;
  await TR.act(async () => { tree = TR.create(<EditMemoryScreen />); });
  await TR.act(async () => {});
  return tree;
}

beforeEach(() => {
  mockUpdate.mockClear();
  mockBack.mockClear();
});

describe('추억 수정 화면 — 별점 편집', () => {
  it('기존 rating(5점)을 불러와 별 5개가 채워진 상태로 렌더한다', async () => {
    const tree = await render();
    const txt = tree.root.findAllByType(Text).map((n) => n.props.children).flat(Infinity).join(' ');
    expect(txt).toContain('전체 별점');
    // rating=5(loaded)일 때만 뜨는 파생 피드백 문구 — 로드 경로가 조용히 rating을 0으로 되돌리는 회귀를 잡아낸다.
    expect(txt).toContain('최고였어요');
    const stars = tree.root.findAllByType(TouchableOpacity).filter((n) => String(n.props.testID ?? '').startsWith('edit-memory-star-'));
    expect(stars.length).toBe(5);
  });

  it('별 2번째를 누르고 저장하면 rating=2, want_again=false로 업데이트한다', async () => {
    const tree = await render();
    const stars = tree.root.findAllByType(TouchableOpacity).filter((n) => String(n.props.testID ?? '').startsWith('edit-memory-star-'));
    await TR.act(async () => { stars[1].props.onPress(); }); // 0-indexed → 2점

    const saveBtn = tree.root.findAllByType(require('../components/ui').BigButton)[0];
    await TR.act(async () => { saveBtn.props.onPress(); });

    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ rating: 2, want_again: false }));
  });
});
