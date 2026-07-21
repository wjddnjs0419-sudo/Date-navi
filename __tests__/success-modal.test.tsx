import React from 'react';
import { Text } from 'react-native';

// SuccessModal 은 리스타일 후 CTA 라벨에 i18n 을 쓰므로, 컨슈머 테스트와 동일하게 목킹한다.
// (현재 코드에서는 사용되지 않으므로 무해하며, 계약 테스트가 리스타일 전후 모두 통과하도록 보장한다.)
jest.mock('../lib/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

import { SuccessModal } from '../components/ui';

const TR = require('react-test-renderer') as {
  create: (el: React.ReactElement) => {
    root: { findAllByType: (t: unknown) => { props: any }[] };
    unmount: () => void;
  };
  act: (cb: () => void) => void;
};

// 계약: props 시그니처 { visible, message, onHide } 와 동작(메시지 노출 + 자동 닫힘)을 고정한다.
// 이 계약은 세 컨슈머(share/send, mode-flow/course-result, card/confirm)가 의존하므로 리스타일이 깨선 안 된다.
describe('SuccessModal 계약', () => {
  it('visible 상태에서 message 텍스트를 렌더한다', () => {
    let tree!: ReturnType<typeof TR.create>;
    TR.act(() => {
      tree = TR.create(
        <SuccessModal visible message="저장했어요!" onHide={() => {}} />,
      );
    });
    const texts = tree.root.findAllByType(Text).map((n) => n.props.children);
    expect(texts).toContain('저장했어요!');
    TR.act(() => { tree.unmount(); });
  });

  it('일정 시간 뒤 onHide 를 호출해 자동으로 닫힌다', () => {
    jest.useFakeTimers();
    const onHide = jest.fn();
    let tree!: ReturnType<typeof TR.create>;
    TR.act(() => {
      tree = TR.create(
        <SuccessModal visible message="저장했어요!" onHide={onHide} />,
      );
    });
    expect(onHide).not.toHaveBeenCalled();
    TR.act(() => { jest.advanceTimersByTime(1500); });
    expect(onHide).toHaveBeenCalledTimes(1);
    TR.act(() => { tree.unmount(); });
    jest.useRealTimers();
  });
});
