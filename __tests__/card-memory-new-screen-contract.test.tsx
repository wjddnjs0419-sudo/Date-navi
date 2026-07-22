import React from 'react';
import { TouchableOpacity, Text } from 'react-native';

const mockInsert = jest.fn(async () => ({ error: null }));
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, back: jest.fn() }),
  useFocusEffect: (cb: () => void) => require('react').useEffect(() => { cb(); }, []),
}));

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: async () => ({ granted: true }),
  launchImageLibraryAsync: async () => ({ canceled: false, assets: [{ base64: 'abc123' }] }),
}));

jest.mock('base64-arraybuffer', () => ({
  decode: () => new ArrayBuffer(0),
}));

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

jest.mock('../components/illustration', () => {
  const { View } = require('react-native');
  return { Illustration: View, MINI_ILLUSTRATION_WIDTH: 130 };
});

jest.mock('../lib/i18n', () => {
  const ko = require('../locales/ko/review.json').review;
  const common = { cancel: '취소', error: '오류', saving: '저장 중', coupleRequired: '커플과 연결하면 사용할 수 있어요. 설정이나 홈에서 연결해보세요.' };
  const memory = {
    newHeading: '새 추억 남기기',
    newSub: '사진과 함께 그날의 기억을 남겨보세요.',
    addPhotoCta: '사진 추가하기',
    titleLabel: '제목',
    titlePlaceholder: '예: 한강 피크닉',
    photoPermTitle: '사진 접근 권한 필요',
    photoPermMessage: '추억 사진을 등록하려면 설정에서 사진 접근을 허용해주세요.',
    openSettingsCta: '설정 열기',
    photoUploadError: '사진 업로드 중 문제가 생겼어요.',
    photoRequiredError: '사진을 추가해주세요.',
  };
  return {
    useI18n: () => ({
      strings: { review: ko, common, card: { memory } },
    }),
  };
});

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: (table: string) => {
      if (table === 'date_planner_profiles') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { couple_id: 'c1' } }) }) }) };
      }
      if (table === 'date_memories') {
        return { insert: mockInsert };
      }
      return {};
    },
    storage: {
      from: (bucket: string) => {
        if (bucket === 'memories') {
          return {
            upload: async () => ({ error: null }),
            getPublicUrl: () => ({ data: { publicUrl: 'https://example.com/photo.jpg' } }),
          };
        }
        return {};
      },
    },
  },
}));

const TR = require('react-test-renderer') as {
  act: (cb: () => void | Promise<void>) => Promise<void>;
  create: (el: React.ReactElement) => { root: { findAllByType: (t: unknown) => { props: any }[] } };
};

const NewMemoryScreen = require('../app/card/memory/new').default;

async function render() {
  let tree!: ReturnType<typeof TR.create>;
  await TR.act(async () => { tree = TR.create(<NewMemoryScreen />); });
  await TR.act(async () => {});
  return tree;
}

async function pickPhoto(tree: ReturnType<typeof TR.create>) {
  // index 0 is BackBar's back button; the photo placeholder is the next TouchableOpacity.
  const photoBtn = tree.root.findAllByType(TouchableOpacity)[1];
  await TR.act(async () => { photoBtn.props.onPress(); });
  await TR.act(async () => {});
}

beforeEach(() => {
  mockInsert.mockClear();
  mockReplace.mockClear();
});

describe('추억 남기기 화면 — 별점 바', () => {
  it('전체 별점 라벨과 별 5개를 렌더한다', async () => {
    const tree = await render();
    const txt = tree.root.findAllByType(Text).map((n) => n.props.children).flat(Infinity).join(' ');
    expect(txt).toContain('전체 별점');
    const stars = tree.root.findAllByType(TouchableOpacity).filter((n) => String(n.props.testID ?? '').startsWith('new-memory-star-'));
    expect(stars.length).toBe(5);
  });

  it('사진 없이 저장하면 사진 필수 에러를 띄우고 insert하지 않는다', async () => {
    const { Alert } = require('react-native');
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const tree = await render();

    const saveBtn = tree.root.findAllByType(require('../components/ui').BigButton)[0];
    await TR.act(async () => { saveBtn.props.onPress(); });

    expect(Alert.alert).toHaveBeenCalledWith('', '사진을 추가해주세요.');
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('사진은 등록했지만 별점을 선택하지 않으면 별점 에러를 띄우고 insert하지 않는다', async () => {
    const { Alert } = require('react-native');
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const tree = await render();
    await pickPhoto(tree);

    const saveBtn = tree.root.findAllByType(require('../components/ui').BigButton)[0];
    await TR.act(async () => { saveBtn.props.onPress(); });

    expect(Alert.alert).toHaveBeenCalledWith('', '별점을 선택해주세요.');
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('사진 등록 후 별 3번째를 누르면 rating=3, want_again=false, card_id=null로 저장한다', async () => {
    const tree = await render();
    await pickPhoto(tree);

    const stars = tree.root.findAllByType(TouchableOpacity).filter((n) => String(n.props.testID ?? '').startsWith('new-memory-star-'));
    await TR.act(async () => { stars[2].props.onPress(); }); // 0-indexed → 3점

    const saveBtn = tree.root.findAllByType(require('../components/ui').BigButton)[0];
    await TR.act(async () => { saveBtn.props.onPress(); });

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ rating: 3, want_again: false, card_id: null }));
  });

  it('사진 등록 후 별 5번째를 누르면 want_again=true로 저장한다', async () => {
    const tree = await render();
    await pickPhoto(tree);

    const stars = tree.root.findAllByType(TouchableOpacity).filter((n) => String(n.props.testID ?? '').startsWith('new-memory-star-'));
    await TR.act(async () => { stars[4].props.onPress(); }); // 5점

    const saveBtn = tree.root.findAllByType(require('../components/ui').BigButton)[0];
    await TR.act(async () => { saveBtn.props.onPress(); });

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ rating: 5, want_again: true }));
  });
});
