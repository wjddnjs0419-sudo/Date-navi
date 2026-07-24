import React from 'react';

const mockMaybeSingle = jest.fn(async () => ({
  data: {
    title: '성수 데이트', summary: '', estimated_time: '2~3시간', estimated_budget: '30,000원',
    mode: 'feeling', steps: null,
  },
}));
const mockUpdate = jest.fn(() => ({ eq: async () => ({ error: null }) }));
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'c1' }),
  useRouter: () => ({ back: mockBack }),
  useFocusEffect: (cb: () => void | (() => void)) => require('react').useEffect(() => cb(), []),
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
  const { ko } = require('../locales');
  const resolve = (obj: any, key: string) => key.split('.').reduce((o: any, k: string) => (o == null ? o : o[k]), obj);
  const t = (key: string, vars?: Record<string, unknown>) => {
    let s = resolve(ko, key);
    if (typeof s !== 'string') return key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{{${k}}}`, String(v));
    return s;
  };
  return { useI18n: () => ({ t }) };
});

jest.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }),
      update: mockUpdate,
    }),
  },
}));

const { StepSlider } = require('../components/recommendation/step-slider');
const { BigButton } = require('../components/ui');
const EditCardScreen = require('../app/card/edit/[id]').default;

const TR = require('react-test-renderer') as {
  act: (cb: () => void | Promise<void>) => Promise<void>;
  create: (el: React.ReactElement) => { root: { findAllByType: (t: unknown) => { props: any }[] } };
};

async function render() {
  let tree!: ReturnType<typeof TR.create>;
  await TR.act(async () => { tree = TR.create(<EditCardScreen />); });
  await TR.act(async () => {});
  return tree;
}

function sliders(tree: ReturnType<typeof TR.create>) {
  return tree.root.findAllByType(StepSlider);
}

beforeEach(() => {
  mockUpdate.mockClear();
  mockBack.mockClear();
});

describe('후보 수정 화면 — 시간·예산 슬라이더', () => {
  it('예상 시간·예산을 StepSlider 두 개로 렌더한다', async () => {
    const tree = await render();
    expect(sliders(tree).length).toBe(2);
  });

  it('기존 텍스트값(2~3시간 / 30,000원)을 슬라이더 값으로 파싱해 불러온다', async () => {
    const tree = await render();
    const [time, budget] = sliders(tree);
    expect(time.props.value).toBe(2);
    expect(budget.props.value).toBe(30000);
  });

  it('슬라이더를 조정해 저장하면 1인 기준 포맷 텍스트로 업데이트한다', async () => {
    const tree = await render();
    const [time, budget] = sliders(tree);
    await TR.act(async () => { time.props.onChange(4); });
    await TR.act(async () => { budget.props.onChange(50000); });

    const saveBtn = tree.root.findAllByType(BigButton)[0];
    await TR.act(async () => { saveBtn.props.onPress(); });

    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      estimated_time: '4시간',
      estimated_budget: '50,000원',
    }));
  });
});
