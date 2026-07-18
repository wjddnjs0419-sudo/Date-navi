import React from 'react';
import { useRevalidatingLoad } from '../lib/useRevalidatingLoad';

const TestRenderer = require('react-test-renderer') as {
  act: (cb: () => void | Promise<void>) => Promise<void>;
  create: (el: React.ReactElement) => unknown;
};
const { act, create } = TestRenderer;

type Load = ReturnType<typeof useRevalidatingLoad>;

function Harness({ onRender }: { onRender: (l: Load) => void }) {
  const load = useRevalidatingLoad();
  onRender(load);
  return null;
}

async function mount() {
  let latest!: Load;
  await act(async () => {
    create(<Harness onRender={(l) => { latest = l; }} />);
  });
  return () => latest;
}

describe('useRevalidatingLoad — stale-while-revalidate 로딩 게이트', () => {
  it('최초엔 loading=true로 시작한다', async () => {
    const get = await mount();
    expect(get().loading).toBe(true);
  });

  it('begin→end 한 사이클 뒤 loading=false가 된다', async () => {
    const get = await mount();
    await act(async () => { get().begin(); });
    expect(get().loading).toBe(true);
    await act(async () => { get().end(); });
    expect(get().loading).toBe(false);
  });

  it('최초 로드 완료 후 begin()은 다시 loading=true로 만들지 않는다 (재포커스 조용히 갱신)', async () => {
    const get = await mount();
    await act(async () => { get().begin(); });
    await act(async () => { get().end(); });
    expect(get().loading).toBe(false);

    // 재포커스 시작
    await act(async () => { get().begin(); });
    expect(get().loading).toBe(false);

    // 재조회 완료
    await act(async () => { get().end(); });
    expect(get().loading).toBe(false);
  });
});
