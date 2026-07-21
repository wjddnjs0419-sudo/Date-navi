import React from 'react';
import { Text } from 'react-native';

// pickers.tsx 는 useI18n().t 로 확인/취소 라벨을 그린다. 다른 컨슈머 테스트와 동일하게
// t: (key) => key 로 목킹해, 리스타일 전후 계약 테스트가 동일하게 통과하도록 고정한다.
jest.mock('../lib/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

import { PickerSheet, WheelPicker, type PickerOption } from '../components/pickers';

const TR = require('react-test-renderer') as {
  create: (el: React.ReactElement) => {
    root: {
      findAllByType: (t: unknown) => { props: any }[];
      findAllByProps: (p: object) => { props: any }[];
    };
    unmount: () => void;
  };
  act: (cb: () => void) => void;
};

const OPTIONS: PickerOption[] = [
  { label: '2021년', value: '2021' },
  { label: '2022년', value: '2022' },
  { label: '2023년', value: '2023' },
  { label: '2024년', value: '2024' },
  { label: '2025년', value: '2025' },
];

// 계약: PickerSheet({ visible, title, children, onCancel, onConfirm, confirmLabel?, centered? })
// + WheelPicker({ options, value, onChange, style? }). 네 컨슈머(anniversary/couple-connect/confirm/settings)가
// 이 시그니처·동작에 의존하므로 리스타일이 깨선 안 된다.
describe('pickers 계약', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function renderSheet(props: {
    visible?: boolean;
    onConfirm?: () => void;
    onCancel?: () => void;
    confirmLabel?: string;
  } = {}) {
    let tree!: ReturnType<typeof TR.create>;
    TR.act(() => {
      tree = TR.create(
        <PickerSheet
          visible={props.visible ?? true}
          title="연애 시작일"
          onCancel={props.onCancel ?? (() => {})}
          onConfirm={props.onConfirm ?? (() => {})}
          confirmLabel={props.confirmLabel ?? '확인'}
        >
          <WheelPicker options={OPTIONS} value="2023" onChange={() => {}} />
        </PickerSheet>,
      );
    });
    return tree;
  }

  it('열린 상태에서 제목·옵션 라벨·확인 버튼을 렌더한다', () => {
    const tree = renderSheet();
    const texts = tree.root.findAllByType(Text).flatMap((n) => {
      const c = n.props.children;
      return Array.isArray(c) ? c : [c];
    });
    expect(texts).toContain('연애 시작일');
    for (const opt of OPTIONS) expect(texts).toContain(opt.label);
    expect(texts).toContain('확인');
    TR.act(() => { tree.unmount(); });
  });

  it('확인 버튼을 누르면 onConfirm 을 호출한다', () => {
    const onConfirm = jest.fn();
    const tree = renderSheet({ onConfirm });
    // 확인 라벨을 담은 버튼 컨트롤을 찾아 누른다(다른 액션 컨트롤과 구분).
    const buttons = tree.root.findAllByProps({ accessibilityRole: 'button' }) as any[];
    const confirmBtn = buttons.find((b) =>
      b.findAllByType(Text).some((t: any) => t.props.children === '확인'),
    );
    expect(confirmBtn).toBeTruthy();
    TR.act(() => { confirmBtn.props.onPress(); });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    TR.act(() => { tree.unmount(); });
  });
});
