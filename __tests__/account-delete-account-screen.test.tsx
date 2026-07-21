import React from 'react';

const mockBack = jest.fn();
const mockInvoke = jest.fn(async (..._args: unknown[]) => ({ error: null }));
const mockSignOut = jest.fn(async () => ({ error: null }));

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
}));

jest.mock('../lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts?.returnObjects) {
        return ['함께한 데이트 기록과 사진', '둘 다 끌린 후보 목록', '상대방과의 커플 연결', '닉네임과 계정 정보'];
      }
      return key;
    },
  }),
}));

jest.mock('../lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
    auth: { signOut: () => mockSignOut() },
  },
}));

const TestRenderer = require('react-test-renderer') as {
  act: (cb: () => void | Promise<void>) => void | Promise<void>;
  create: (el: React.ReactElement) => {
    root: {
      findByType: (t: unknown) => { props: Record<string, any> };
      findAllByType: (t: unknown) => { props: Record<string, any> }[];
      findByProps: (p: Record<string, unknown>) => { props: Record<string, any> };
    };
  };
};
const { act, create } = TestRenderer;

const DeleteAccountScreen = require('../app/account/delete-account').default as
  typeof import('../app/account/delete-account').default;
const { BigButton, ListGroup } = require('../components/ui') as typeof import('../components/ui');

describe('account/delete-account screen', () => {
  it('requires agreement before the delete button calls the edge function', async () => {
    let instance!: ReturnType<typeof create>;
    act(() => { instance = create(<DeleteAccountScreen />); });

    expect(instance.root.findAllByType(ListGroup).length).toBeGreaterThan(0);

    const deleteBtn = instance.root.findByType(BigButton);
    await act(async () => { await deleteBtn.props.onPress(); });
    expect(mockInvoke).not.toHaveBeenCalled();

    const agreeRow = instance.root.findByProps({ testID: 'delete-agree-row' });
    act(() => { agreeRow.props.onPress(); });

    const updatedDeleteBtn = instance.root.findByType(BigButton);
    await act(async () => { await updatedDeleteBtn.props.onPress(); });
    expect(mockInvoke).toHaveBeenCalledWith('delete-account', { body: {} });
  });
});
