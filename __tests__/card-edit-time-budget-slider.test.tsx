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

beforeEach(() => {
  mockUpdate.mockClear();
  mockBack.mockClear();
});

describe('후보 수정 화면 — 시간·예산 제거', () => {
  it('예상 시간·예산 슬라이더를 렌더하지 않는다', async () => {
    const tree = await render();
    expect(tree.root.findAllByType(StepSlider)).toHaveLength(0);
  });

  it('기존 시간·예산 값을 수정 화면에 표시하지 않는다', async () => {
    const tree = await render();
    const text = tree.root.findAllByType(require('react-native').Text)
      .map((node: any) => node.props.children)
      .flat(Infinity)
      .join(' ');
    expect(text).not.toContain('예상 시간');
    expect(text).not.toContain('1인 예산');
    expect(text).not.toContain('2~3시간');
    expect(text).not.toContain('30,000원');
  });

  it('저장 시 시간·예산 컬럼을 갱신하지 않는다', async () => {
    const tree = await render();
    const saveBtn = tree.root.findAllByType(BigButton)[0];
    await TR.act(async () => { saveBtn.props.onPress(); });

    const payload = (mockUpdate.mock.calls as unknown[][])[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('estimated_time');
    expect(payload).not.toHaveProperty('estimated_budget');
  });
});
