import React from 'react';
import { Alert } from 'react-native';

jest.mock('expo-router', () => {
  const ReactLocal = require('react');
  return {
    useRouter: () => ({ push: jest.fn() }),
    useFocusEffect: (cb: () => void) => { ReactLocal.useEffect(() => { cb(); }, []); },
  };
});

jest.mock('../lib/i18n', () => ({
  useI18n: () => ({ t: (key: string, opts?: any) => (opts && 'count' in opts ? `${key}:${opts.count}` : key) }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});

let resolveSecondProfile: (v: unknown) => void = () => {};

jest.mock('../lib/supabase', () => {
  const makeBuilder = (result: unknown) => {
    const builder: any = {
      select: () => builder, eq: () => builder, in: () => builder,
      order: () => builder, delete: () => builder, maybeSingle: async () => result,
      then: (resolve: (v: unknown) => void) => resolve(result),
    };
    return builder;
  };

  let profileCallCount = 0;
  let dateMemoriesCallCount = 0;

  return {
    supabase: {
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
      from: (table: string) => {
        if (table === 'date_planner_profiles') {
          profileCallCount += 1;
          if (profileCallCount >= 2) {
            // 두 번째(재조회) 호출은 일부러 응답을 미룬다 — setRelationshipDays(null)이
            // 실행됐는지 여부를 그 직후 상태에서 확실히 관찰하기 위함.
            const builder: any = {
              select: () => builder, eq: () => builder, in: () => builder, order: () => builder,
              maybeSingle: () => new Promise((resolve) => { resolveSecondProfile = resolve; }),
              then: (resolve: (v: unknown) => void) => resolve({ data: { couple_id: 'c1', anniversary_date: '2024-01-01' } }),
            };
            return builder;
          }
          return makeBuilder({ data: { couple_id: 'c1', anniversary_date: '2024-01-01' } });
        }
        if (table === 'date_planner_couples') {
          return makeBuilder({ data: { created_at: '2024-01-01', owner_user_id: 'u1' } });
        }
        if (table === 'date_memories') {
          dateMemoriesCallCount += 1;
          if (dateMemoriesCallCount === 2) {
            // 삭제 호출: date_memories.delete().eq().select()
            return makeBuilder({ data: [{ id: 'm1' }], error: null });
          }
          return makeBuilder({
            data: [
              {
                id: 'm1', card_id: 'card1', title: '성수동 감성 데이트', review: '카페가 특히 좋았어요',
                want_again: true, created_at: '2026-07-15T00:00:00Z', photo_url: null,
              },
            ],
          });
        }
        if (table === 'date_cards') {
          return makeBuilder({
            data: [
              { id: 'card1', title: '성수동 감성 데이트', mode: 'make_course', estimated_time: '약 3시간', estimated_budget: '5만원', tags: ['산책'] },
            ],
          });
        }
        return makeBuilder({ data: [] });
      },
    },
  };
});

const TR = require('react-test-renderer') as {
  act: (cb: () => void | Promise<void>) => Promise<void>;
  create: (el: React.ReactElement) => { root: { findAllByType: (t: unknown) => { props: any }[] } };
};

const MemoriesScreen = require('../app/(tabs)/memories').default;
const { SwipeableCard } = require('../components/ui');

async function render() {
  let tree!: ReturnType<typeof TR.create>;
  await TR.act(async () => { tree = TR.create(<MemoriesScreen />); });
  await TR.act(async () => {});
  return tree;
}

function statDaysText(tree: ReturnType<typeof TR.create>) {
  const { Text } = require('react-native');
  const texts = tree.root.findAllByType(Text).map((n) => n.props.children).flat();
  // statValue 다음에 statLabel('memories.statDaysTogether')이 오는 레이아웃이므로,
  // 라벨 바로 앞의 값을 찾는다.
  const idx = texts.indexOf('memories.statDaysTogether');
  return texts[idx - 1];
}

describe('추억 화면 함께한 날 재조회 깜빡임', () => {
  it('삭제 후 재조회 중에도 "함께한 날" 숫자가 대시(—)로 사라지지 않는다', async () => {
    const tree = await render();
    const firstValue = statDaysText(tree);
    expect(firstValue).not.toBe('—');

    jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      const destructive = buttons?.find((b) => b.style === 'destructive');
      destructive?.onPress?.();
    });

    const card = tree.root.findAllByType(SwipeableCard as any)[0];
    await TR.act(async () => { card.props.onDelete(); });
    // 삭제 → 재조회(loadMemories) 체인이 profiles 재조회 직전까지 진행되도록 몇 틱 흘려보낸다.
    await TR.act(async () => {});
    await TR.act(async () => {});

    // 두 번째 profiles 조회는 아직 응답하지 않은 상태(resolveSecondProfile 미호출).
    const duringReloadValue = statDaysText(tree);
    expect(duringReloadValue).not.toBe('—');
    expect(duringReloadValue).toBe(firstValue);

    await TR.act(async () => { resolveSecondProfile({ data: { couple_id: 'c1', anniversary_date: '2024-01-01' } }); });
    const finalValue = statDaysText(tree);
    expect(finalValue).not.toBe('—');

    // FlatList가 예약하는 셀 렌더 갱신 타이머를 흘려보내 act 경고를 방지한다.
    await TR.act(() => new Promise((resolve) => setTimeout(resolve, 60)));
  });
});
