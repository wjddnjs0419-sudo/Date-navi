import React from 'react';
import { Text } from 'react-native';

// 다른 컨슈머 테스트와 동일하게 strings 구조를 최소 스텁으로 목킹한다.
jest.mock('../lib/i18n', () => ({
  useI18n: () => ({
    language: 'ko',
    t: (key: string) => key,
    strings: {
      card: {
        confirmButton: '이번 데이트로 정할까요? →',
        partnerWaiting: '⏳ 상대방 반응을 기다리는 중...',
        reactionLabels: { love: { emoji: '🔥', label: '완전 끌려' } },
      },
    },
  }),
}));

const { CandidateHeroCard, shouldUnreactOnTap } = require('../app/card/[id]') as typeof import('../app/card/[id]');

const TR = require('react-test-renderer') as {
  create: (el: React.ReactElement) => {
    root: {
      findAllByType: (t: unknown) => { props: any }[];
      findAllByProps: (p: object) => { props: any }[];
    };
  };
  act: (cb: () => void) => void;
};

function texts(tree: ReturnType<typeof TR.create>) {
  return tree.root.findAllByType(Text).map((n) => n.props.children).flat().join(' ');
}

describe('CandidateHeroCard', () => {
  it('renders the place row when a place is attached', () => {
    let tree!: ReturnType<typeof TR.create>;
    TR.act(() => {
      tree = TR.create(
        <CandidateHeroCard
          placeName="어반나이프"
          placeAddress="서울 성동구"
          myLove={false}
          onToggleLove={() => {}}
          onConfirm={() => {}}
        />,
      );
    });
    expect(texts(tree)).toContain('어반나이프');
    expect(texts(tree)).toContain('서울 성동구');
  });

  it('omits the place row when no place is attached', () => {
    let tree!: ReturnType<typeof TR.create>;
    TR.act(() => {
      tree = TR.create(<CandidateHeroCard myLove={false} onToggleLove={() => {}} onConfirm={() => {}} />);
    });
    expect(texts(tree)).not.toContain('서울 성동구');
  });

  it('calls onToggleLove when the heart button is pressed', () => {
    const onToggleLove = jest.fn();
    let tree!: ReturnType<typeof TR.create>;
    TR.act(() => {
      tree = TR.create(<CandidateHeroCard myLove={false} onToggleLove={onToggleLove} onConfirm={() => {}} />);
    });
    const heartBtn = tree.root.findAllByProps({ accessibilityLabel: '완전 끌려' })[0];
    TR.act(() => { heartBtn.props.onPress(); });
    expect(onToggleLove).toHaveBeenCalledTimes(1);
  });

  it('shows the partner reaction text when present, else the waiting text', () => {
    let tree!: ReturnType<typeof TR.create>;
    TR.act(() => {
      tree = TR.create(
        <CandidateHeroCard
          myLove={false}
          onToggleLove={() => {}}
          onConfirm={() => {}}
          partnerReactionLabel="상대방 반응: 🔥 완전 끌려"
        />,
      );
    });
    expect(texts(tree)).toContain('상대방 반응: 🔥 완전 끌려');

    TR.act(() => {
      tree = TR.create(<CandidateHeroCard myLove={false} onToggleLove={() => {}} onConfirm={() => {}} />);
    });
    expect(texts(tree)).toContain('⏳ 상대방 반응을 기다리는 중...');
  });

  it('calls onConfirm when the CTA is pressed', () => {
    const onConfirm = jest.fn();
    let tree!: ReturnType<typeof TR.create>;
    TR.act(() => {
      tree = TR.create(<CandidateHeroCard myLove={false} onToggleLove={() => {}} onConfirm={onConfirm} />);
    });
    const cta = tree.root.findAllByProps({ accessibilityLabel: '이번 데이트로 정할까요? →' })[0];
    TR.act(() => { cta.props.onPress(); });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('shouldUnreactOnTap', () => {
  it('unreacts when tapping the already-selected reaction', () => {
    expect(shouldUnreactOnTap('love', 'love')).toBe(true);
    expect(shouldUnreactOnTap('burden', 'burden')).toBe(true);
  });
  it('does not unreact when tapping a different or first reaction', () => {
    expect(shouldUnreactOnTap('love', 'like')).toBe(false);
    expect(shouldUnreactOnTap(null, 'love')).toBe(false);
  });
});
