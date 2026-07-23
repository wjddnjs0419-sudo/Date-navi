import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Text } from 'react-native';

// 다른 컨슈머 테스트와 동일하게 strings 구조를 최소 스텁으로 목킹한다.
jest.mock('../lib/i18n', () => ({
  useI18n: () => ({
    language: 'ko',
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key} ${JSON.stringify(params)}` : key,
    strings: {
      card: {
        confirmButton: '이번 데이트로 정할까요? →',
        partnerWaiting: '⏳ 상대방 반응을 기다리는 중...',
        reactionLabels: { love: { emoji: '🔥', label: '완전 끌려' } },
      },
    },
  }),
}));

const { CandidateActionBar, CardLoveToggle, shouldUnreactOnTap, visibleTags } = require('../app/card/[id]') as typeof import('../app/card/[id]');

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

describe('CandidateActionBar', () => {
  it('shows the partner reaction text when present, else the waiting text', () => {
    let tree!: ReturnType<typeof TR.create>;
    TR.act(() => {
      tree = TR.create(<CandidateActionBar onConfirm={() => {}} partnerReactionLabel="상대방 반응: 🔥 완전 끌려" />);
    });
    expect(texts(tree)).toContain('상대방 반응: 🔥 완전 끌려');

    TR.act(() => {
      tree = TR.create(<CandidateActionBar onConfirm={() => {}} />);
    });
    expect(texts(tree)).toContain('⏳ 상대방 반응을 기다리는 중...');
  });

  it('calls onConfirm when the CTA is pressed', () => {
    const onConfirm = jest.fn();
    let tree!: ReturnType<typeof TR.create>;
    TR.act(() => {
      tree = TR.create(<CandidateActionBar onConfirm={onConfirm} />);
    });
    const cta = tree.root.findAllByProps({ accessibilityLabel: '이번 데이트로 정할까요? →' })[0];
    TR.act(() => { cta.props.onPress(); });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('carries no hero card — no heart button, no place row, no course summary', () => {
    let tree!: ReturnType<typeof TR.create>;
    TR.act(() => {
      tree = TR.create(<CandidateActionBar onConfirm={() => {}} />);
    });
    expect(tree.root.findAllByProps({ accessibilityLabel: '완전 끌려' })).toHaveLength(0);
    expect(texts(tree)).not.toContain('card.heroCourseCount');
  });
});

describe('card detail layout order', () => {
  const source = readFileSync(join(process.cwd(), 'app/card/[id].tsx'), 'utf8');
  const body = source.slice(source.indexOf('<ScrollView'));

  it('drops the hero card component entirely', () => {
    expect(source).not.toContain('CandidateHeroCard');
    expect(source).not.toContain('heroCourseCount');
  });

  it('places the course/place block above the action bar, which sits after the tags', () => {
    const course = body.indexOf('<CourseStepList');
    const tags = body.indexOf('styles.tagRow');
    const actionBar = body.indexOf('<CandidateActionBar');
    expect(course).toBeGreaterThan(-1);
    expect(actionBar).toBeGreaterThan(-1);
    expect(course).toBeLessThan(tags);
    expect(tags).toBeLessThan(actionBar);
  });

  // 추천 이유는 카드를 고를 때 읽는 문장이지, 이미 연 카드에서 또 볼 내용은 아니다.
  it('drops the why-recommended box from the detail screen', () => {
    expect(source).not.toContain('whyBox');
    expect(source).not.toContain('why_recommended');
    expect(source).not.toContain('MessageCircle');
  });

  it('keeps the place row on the screen for single-place cards', () => {
    expect(body).toMatch(/<PlaceRow[\s\S]{0,200}card\.place_name/);
  });

  it('puts the love toggle on the title row, above the course block', () => {
    const titleRow = body.indexOf('styles.titleRow');
    const heart = body.indexOf('<CardLoveToggle');
    const course = body.indexOf('<CourseStepList');
    expect(titleRow).toBeGreaterThan(-1);
    expect(heart).toBeGreaterThan(titleRow);
    expect(heart).toBeLessThan(course);
  });
});

describe('visibleTags', () => {
  it('hides tags that merely repeat a course step label', () => {
    expect(visibleTags(['카페', '분위기좋은', '산책'], [{ label: '카페' }, { label: '산책' }]))
      .toEqual(['분위기좋은']);
  });

  it('keeps every tag when there are no steps', () => {
    expect(visibleTags(['카페', '산책'], [])).toEqual(['카페', '산책']);
  });

  it('ignores case and surrounding whitespace when matching', () => {
    expect(visibleTags([' Cafe ', '전시'], [{ label: 'cafe' }])).toEqual(['전시']);
  });

  it('tolerates a missing tag list', () => {
    expect(visibleTags(null, [{ label: '카페' }])).toEqual([]);
  });
});

describe('card detail tag row', () => {
  const source = readFileSync(join(process.cwd(), 'app/card/[id].tsx'), 'utf8');

  it('renders the filtered tags rather than the raw card tags', () => {
    expect(source).toMatch(/visibleTags\(card\.tags[\s\S]{0,200}styles\.tagRow/);
    expect(source).not.toMatch(/styles\.tagRow[\s\S]{0,80}\(card\.tags \?\? \[\]\)/);
  });

  it('skips the tag row entirely when filtering leaves nothing', () => {
    expect(source).toMatch(/tags\.length > 0 \?[\s\S]{0,200}styles\.tagRow/);
  });
});

describe('CardLoveToggle', () => {
  it('calls onToggle when tapped, whichever state it is in', () => {
    const onToggle = jest.fn();
    let tree!: ReturnType<typeof TR.create>;
    TR.act(() => { tree = TR.create(<CardLoveToggle active={false} onToggle={onToggle} />); });
    const btn = tree.root.findAllByProps({ accessibilityLabel: '완전 끌려' })[0];
    TR.act(() => { btn.props.onPress(); });
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('marks itself selected for assistive tech when the card is loved', () => {
    let tree!: ReturnType<typeof TR.create>;
    TR.act(() => { tree = TR.create(<CardLoveToggle active onToggle={() => {}} />); });
    const btn = tree.root.findAllByProps({ accessibilityLabel: '완전 끌려' })[0];
    expect(btn.props.accessibilityState).toEqual({ selected: true });
  });

  it('stays tappable — the reaction paints optimistically, so there is nothing to wait on', () => {
    let tree!: ReturnType<typeof TR.create>;
    TR.act(() => { tree = TR.create(<CardLoveToggle active={false} onToggle={() => {}} />); });
    const btn = tree.root.findAllByProps({ accessibilityLabel: '완전 끌려' })[0];
    expect(btn.props.disabled).toBeFalsy();
  });
});

describe('burden condition flow removal', () => {
  const source = readFileSync(join(process.cwd(), 'app/card/[id].tsx'), 'utf8');

  it('drops the condition picker and its regeneration path', () => {
    expect(source).not.toContain('CONDITION_TAGS');
    expect(source).not.toContain('CONDITION_ICONS');
    expect(source).not.toContain('handleGenerateAlt');
    expect(source).not.toContain('conditionBox');
    expect(source).not.toContain('regenerateWithCondition');
  });

  it('stops reading and writing condition_tag', () => {
    expect(source).not.toContain('condition_tag');
    expect(source).not.toContain('ConditionTag');
  });

  it('no longer pulls in the card generation pipeline', () => {
    expect(source).not.toContain('generateDateCards');
  });
});

describe('reaction grid icons', () => {
  const source = readFileSync(join(process.cwd(), 'app/card/[id].tsx'), 'utf8');
  const { REACTION_ICONS } = require('../app/card/[id]') as typeof import('../app/card/[id]');
  const lucide = require('lucide-react-native');

  it('gives every reaction a lucide icon instead of an emoji glyph', () => {
    expect(REACTION_ICONS.love).toBe(lucide.Flame);
    expect(REACTION_ICONS.like).toBe(lucide.Smile);
    expect(REACTION_ICONS.burden).toBe(lucide.Meh);
    expect(REACTION_ICONS.next_time).toBe(lucide.Clock);
  });

  it('no longer renders the emoji text node in the grid', () => {
    expect(source).not.toContain('reactionEmoji');
    expect(source).not.toMatch(/reactionLabels\[r\.type\]\.emoji/);
  });

  it('keeps the emoji in the partner sentence — plain text, not an icon slot', () => {
    expect(source).toMatch(/partnerReaction\([\s\S]{0,120}\.emoji\)/);
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
