import React from 'react';
import { TouchableOpacity, Image } from 'react-native';

const mockPush = jest.fn();
const mockUpsert = jest.fn(async (_row: Record<string, unknown>, _opts?: unknown) => ({ error: null }));
const mockUpload = jest.fn(async () => ({ error: null }));
const { Alert } = require('react-native') as typeof import('react-native');
const mockAlert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

const picker = {
  granted: true,
  result: { canceled: false, assets: [{ base64: 'abc123' }] } as
    | { canceled: true; assets?: undefined }
    | { canceled: false; assets: { base64?: string }[] },
};

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: async () => ({ granted: picker.granted }),
  launchImageLibraryAsync: async () => picker.result,
}));

jest.mock('base64-arraybuffer', () => ({ decode: () => new ArrayBuffer(0) }));

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

jest.mock('../lib/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { display_name: '수민' } }) }) }),
      upsert: mockUpsert,
    }),
    storage: {
      from: () => ({
        upload: mockUpload,
        getPublicUrl: () => ({ data: { publicUrl: 'https://example.com/avatar.jpg' } }),
      }),
    },
  },
}));

const TR = require('react-test-renderer') as {
  act: (cb: () => void | Promise<void>) => Promise<void>;
  create: (el: React.ReactElement) => { root: { findAllByType: (t: unknown) => { props: any }[] } };
};

const PhotoScreen = require('../app/onboarding/photo').default;

async function render() {
  let tree!: ReturnType<typeof TR.create>;
  await TR.act(async () => { tree = TR.create(<PhotoScreen />); });
  await TR.act(async () => {});
  return tree;
}

// BackBar의 뒤로가기가 0번, 아바타 위 카메라 버튼이 1번이다.
async function pressCamera(tree: ReturnType<typeof TR.create>) {
  const cameraBtn = tree.root.findAllByType(TouchableOpacity)[1];
  await TR.act(async () => { cameraBtn.props.onPress(); });
  await TR.act(async () => {});
}

beforeEach(() => {
  picker.granted = true;
  picker.result = { canceled: false, assets: [{ base64: 'abc123' }] };
  mockPush.mockClear();
  mockUpsert.mockClear();
  mockUpload.mockClear();
  mockAlert.mockClear();
});

describe('온보딩 프로필 사진 화면', () => {
  it('사진을 고르면 avatars 버킷에 올리고 프로필에 URL을 저장한다', async () => {
    const tree = await render();
    await pressCamera(tree);

    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockUpsert.mock.calls[0][0]).toMatchObject({
      user_id: 'u1',
      profile_photo_url: 'https://example.com/avatar.jpg',
    });
  });

  it('업로드에 성공하면 이니셜 대신 고른 사진을 보여준다', async () => {
    const tree = await render();
    expect(tree.root.findAllByType(Image)).toHaveLength(0);

    await pressCamera(tree);

    const images = tree.root.findAllByType(Image);
    expect(images).toHaveLength(1);
    expect(images[0].props.source).toEqual({ uri: 'https://example.com/avatar.jpg' });
  });

  it('갤러리 권한이 없으면 안내만 하고 업로드하지 않는다', async () => {
    picker.granted = false;
    const tree = await render();
    await pressCamera(tree);

    expect(mockAlert).toHaveBeenCalledTimes(1);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('사진 선택을 취소하면 아무것도 저장하지 않는다', async () => {
    picker.result = { canceled: true };
    const tree = await render();
    await pressCamera(tree);

    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockAlert).not.toHaveBeenCalled();
  });

  it('사진 없이도 다음 단계로 넘어갈 수 있다', async () => {
    const tree = await render();
    const nextBtn = tree.root.findAllByType(TouchableOpacity).slice(-1)[0];
    await TR.act(async () => { nextBtn.props.onPress(); });
    expect(mockPush).toHaveBeenCalledWith('/onboarding/anniversary');
  });
});
