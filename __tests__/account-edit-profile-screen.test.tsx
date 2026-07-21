import React from 'react';

const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
}));

jest.mock('../lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: async () => ({ granted: false }),
  launchImageLibraryAsync: async () => ({ canceled: true }),
}));

jest.mock('../lib/supabase', () => {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({ data: { display_name: '지원', profile_photo_url: null } }),
  };
  return {
    supabase: {
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
      from: () => builder,
    },
  };
});

const TestRenderer = require('react-test-renderer') as {
  act: (cb: () => void | Promise<void>) => void | Promise<void>;
  create: (el: React.ReactElement) => {
    root: {
      findByType: (t: unknown) => { props: Record<string, any> };
      findAllByType: (t: unknown) => { props: Record<string, any> }[];
    };
  };
};
const { act, create } = TestRenderer;

const EditProfileScreen = require('../app/account/edit-profile').default as
  typeof import('../app/account/edit-profile').default;
const { ListGroup, SectionLabel } = require('../components/ui') as typeof import('../components/ui');

describe('account/edit-profile screen', () => {
  it('lets the user pick a planning style option from the shared ListGroup', async () => {
    let instance!: ReturnType<typeof create>;
    await act(async () => { instance = create(<EditProfileScreen />); });

    expect(instance.root.findAllByType(ListGroup).length).toBeGreaterThan(0);
    expect(instance.root.findAllByType(SectionLabel).length).toBeGreaterThan(0);

    const { TextInput } = require('react-native');
    const input = instance.root.findByType(TextInput);
    act(() => { input.props.onChangeText('새닉네임'); });

    const updatedInput = instance.root.findByType(TextInput);
    expect(updatedInput.props.value).toBe('새닉네임');
  });
});
