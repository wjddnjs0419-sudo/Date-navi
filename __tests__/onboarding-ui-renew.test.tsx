import React from 'react';
import { Text } from 'react-native';
import { ChevronRight } from 'lucide-react-native';

// 온보딩 UI 전면 교체(ui/onboarding) — 목업 1:1 대조에서 나온 실제 델타를 고정한다.
// type: 옵션마다 선두 아이콘 원 + 우측 chevron. anniversary: 일수 노트에 마스코트 일러스트.
// connected: 커플 체크 마스코트 일러스트 + 이모지 제거.

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => false }),
    useLocalSearchParams: () => ({}),
    useFocusEffect: (cb: () => void) => React.useEffect(() => { cb(); }, []),
  };
});

jest.mock('../lib/analytics', () => ({ logEvent: jest.fn() }));

jest.mock('expo-linking', () => ({ createURL: () => 'datenavi://x' }));

// coupleConnect/common 문자열은 키 이름을 그대로 돌려주는 Proxy 로 대체한다.
jest.mock('../lib/i18n', () => {
  const stringProxy = new Proxy({}, { get: (_t: unknown, p: string | symbol) => (typeof p === 'string' ? p : '') });
  return {
    useI18n: () => ({
      language: 'ko',
      t: (key: string, vars?: Record<string, unknown>) =>
        vars ? `${key}:${JSON.stringify(vars)}` : key,
      strings: { coupleConnect: stringProxy, common: stringProxy },
    }),
  };
});

// couple-connect 의 비동기 로드를 통과시키는 체이너블 supabase 목. 로직은 그대로 두고
// 미연결('none') 분기가 렌더되도록 profile.couple_id 를 비운다.
jest.mock('../lib/supabase', () => {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    update: () => builder,
    insert: () => builder,
    single: () => Promise.resolve({ data: { id: 'u1' }, error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
  };
  return {
    supabase: {
      auth: {
        getUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }),
        signOut: () => Promise.resolve(),
        refreshSession: () => Promise.resolve(),
      },
      from: () => builder,
      rpc: () => Promise.resolve({ data: null, error: null }),
    },
  };
});

type TestNode = { props: Record<string, any>; type: unknown };
type TestRendererInstance = {
  root: {
    findByProps: (props: Record<string, unknown>) => TestNode;
    findAllByProps: (props: Record<string, unknown>) => TestNode[];
    findAllByType: (type: unknown) => TestNode[];
  };
};
const TestRenderer = require('react-test-renderer') as {
  act: (cb: () => void | Promise<void>) => void | Promise<void>;
  create: (el: React.ReactElement) => TestRendererInstance;
};
const { act, create } = TestRenderer;

function render(Comp: React.ComponentType): TestRendererInstance {
  let renderer!: TestRendererInstance;
  act(() => { renderer = create(<Comp />); });
  return renderer;
}

async function renderAsync(Comp: React.ComponentType): Promise<TestRendererInstance> {
  let renderer!: TestRendererInstance;
  await act(async () => { renderer = create(<Comp />); });
  return renderer;
}

describe('onboarding UI 전면 교체 — 목업 델타', () => {
  it('type: 옵션 5개마다 선두 일러스트 아이콘 원과 우측 chevron 을 그린다', () => {
    const TypeScreen = require('../app/onboarding/type').default as React.ComponentType;
    const r = render(TypeScreen);
    const chevrons = r.root.findAllByType(ChevronRight);
    expect(chevrons.length).toBe(5);
  });

  it('anniversary: 일수 노트에 mascot-heart-single 일러스트를 얹는다', () => {
    const AnniversaryScreen = require('../app/onboarding/anniversary').default as React.ComponentType;
    const r = render(AnniversaryScreen);
    const mascot = r.root.findAllByProps({ name: 'mascot-heart-single' });
    expect(mascot.length).toBeGreaterThan(0);
  });

  it('connected: 커플 체크 마스코트 일러스트를 그리고 이모지 텍스트가 없다', () => {
    const ConnectedScreen = require('../app/onboarding/connected').default as React.ComponentType;
    const r = render(ConnectedScreen);
    const mascot = r.root.findAllByProps({ name: 'mascot-heart-couple-check' });
    expect(mascot.length).toBeGreaterThan(0);

    const emojiNodes = r.root
      .findAllByType(Text)
      .filter((n) => typeof n.props.children === 'string' && /[\u{1F300}-\u{1FAFF}☀-➿]/u.test(n.props.children));
    expect(emojiNodes).toHaveLength(0);
  });

  it('couple-connect: 미연결 상태의 초대 카드에 커플 마스코트 일러스트를 얹는다', async () => {
    const CoupleConnectScreen = require('../app/onboarding/couple-connect').default as React.ComponentType;
    const r = await renderAsync(CoupleConnectScreen);
    const mascot = r.root.findAllByProps({ name: 'mascot-heart-couple' });
    expect(mascot.length).toBeGreaterThan(0);
  });
});
