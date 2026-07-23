import React from 'react';
import { TouchableOpacity, Text } from 'react-native';

// 반응을 누르면 서버 저장을 기다리지 않고 즉시 선택 표시가 바뀌어야 한다.
// (기존에는 upsert가 끝난 뒤에야 setState라 네트워크 왕복만큼 늦게 칠해졌다.)
const mockWrite = {
  release: null as (() => void) | null,
  mode: 'pending' as 'pending' | 'failing',
  run() {
    if (this.mode === 'failing') return Promise.resolve({ error: new Error('nope') });
    return new Promise<{ error: null }>((resolve) => { this.release = () => resolve({ error: null }); });
  },
};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'card-1' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useFocusEffect: (cb: () => void) => require('react').useEffect(() => { cb(); }, []),
}));

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

jest.mock('../lib/card-i18n', () => ({ localizeCardContent: (card: unknown) => card }));
jest.mock('../lib/recommendationIdentity', () => ({ readRecommendationIdentity: () => ({}) }));
jest.mock('../lib/course', () => ({ resolveDisplaySteps: () => [] }));

jest.mock('../lib/i18n', () => ({
  useI18n: () => ({
    language: 'ko',
    t: (key: string) => key,
    strings: {
      common: { error: '오류', share: '공유', cancel: '취소', delete: '삭제' },
      card: {
        missing: '없음',
        saveError: '저장 실패',
        confirmButton: '이번 데이트로 정할까요?',
        partnerWaiting: '대기 중',
        reactionTitle: '내 반응',
        reactionSubtitle: '골라주세요',
        memoryButton: '완료',
        memoryDone: '완료됨',
        modeLabels: { make_course: '코스' },
        reactionLabels: {
          love: { emoji: '🔥', label: '완전 끌려' },
          like: { emoji: '😊', label: '느낌은 좋아' },
          burden: { emoji: '😅', label: '오늘은 부담돼' },
          next_time: { emoji: '⏰', label: '다음에' },
        },
      },
    },
  }),
}));

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: (table: string) => {
      if (table === 'date_cards') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({
            data: { id: 'card-1', title: '성수 데이트', summary: '요약', mode: 'feeling', tags: [], why_recommended: '좋아서' },
          }) }) }),
        };
      }
      if (table === 'date_memories') {
        return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) };
      }
      if (table === 'reactions') {
        return {
          select: () => ({ eq: async () => ({ data: [] }) }),
          upsert: () => mockWrite.run(),
        };
      }
      return {};
    },
  },
}));

const TR = require('react-test-renderer') as {
  act: (cb: () => void | Promise<void>) => Promise<void>;
  create: (el: React.ReactElement) => { root: { findAllByProps: (p: object) => { props: any }[] } };
};

const CardDetailScreen = require('../app/card/[id]').default;

async function render() {
  let tree!: ReturnType<typeof TR.create>;
  await TR.act(async () => { tree = TR.create(<CardDetailScreen />); });
  await TR.act(async () => {});
  return tree;
}

// 제목 줄 하트 토글. 그리드의 love 버튼과 같은 상태를 공유하므로 이걸로 선택 여부를 읽는다.
function loveToggle(tree: ReturnType<typeof TR.create>) {
  return tree.root.findAllByProps({ accessibilityLabel: '완전 끌려' })
    .find(n => typeof n.props.onPress === 'function' && n.props.accessibilityState)!;
}

function loveIsFilled(tree: ReturnType<typeof TR.create>) {
  return loveToggle(tree).props.accessibilityState.selected === true;
}

beforeEach(() => {
  mockWrite.release = null;
  mockWrite.mode = 'pending';
});

describe('반응 탭 즉시 반영', () => {
  it('서버 응답을 기다리지 않고 곧바로 선택 상태가 된다', async () => {
    const tree = await render();
    expect(loveIsFilled(tree)).toBe(false);

    const btn = loveToggle(tree);
    await TR.act(async () => { btn.props.onPress(); });

    // upsert는 아직 진행 중(resolve 안 함)인데 이미 칠해져 있어야 한다.
    expect(mockWrite.release).not.toBeNull();
    expect(loveIsFilled(tree)).toBe(true);

    await TR.act(async () => { mockWrite.release!(); });
    expect(loveIsFilled(tree)).toBe(true);
  });

  it('저장이 실패하면 낙관적 표시를 원래대로 되돌린다', async () => {
    mockWrite.mode = 'failing';
    const tree = await render();

    const btn = loveToggle(tree);
    await TR.act(async () => { btn.props.onPress(); });
    await TR.act(async () => {});

    expect(loveIsFilled(tree)).toBe(false);
  });

  it('저장 중에도 버튼을 다시 누를 수 있다 (연타로 마음을 바꿔도 막히지 않음)', async () => {
    const tree = await render();
    const btn = loveToggle(tree);
    await TR.act(async () => { btn.props.onPress(); });

    expect(btn.props.disabled).toBeFalsy();
  });
});
