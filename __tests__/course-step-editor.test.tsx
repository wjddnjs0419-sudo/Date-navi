import React from 'react';
import { Coffee, Footprints, Palette, Sparkles, Utensils, Wine, Zap } from 'lucide-react-native';
import { COURSE_CATEGORIES, type CourseCategory } from '../lib/course-draft';

type TestNode = { props: Record<string, any> };
type TestRendererInstance = {
  root: {
    findAllByType: (type: unknown) => TestNode[];
    findAll: (predicate: (node: TestNode) => boolean) => TestNode[];
  };
};
const TestRenderer = require('react-test-renderer') as {
  act: (callback: () => void) => void;
  create: (element: React.ReactElement) => TestRendererInstance;
};
const { act, create } = TestRenderer;
const { CourseStepEditor } = require('../components/recommendation/course-step-editor') as typeof import('../components/recommendation/course-step-editor');

const categoryLabels = Object.fromEntries(
  COURSE_CATEGORIES.map((category) => [category, category]),
) as Record<CourseCategory, string>;

const t = (key: string, values?: Record<string, unknown>) => (
  values ? `${key}:${JSON.stringify(values)}` : key
);

type Step = { id: string; category: CourseCategory; pin?: { kakaoPlaceId: string; name: string; address: string } };

function render(step: Step, extra: { dispatch?: jest.Mock; onRequestPick?: jest.Mock } = {}) {
  let renderer!: TestRendererInstance;
  act(() => {
    renderer = create(
      <CourseStepEditor
        step={step}
        index={0}
        total={2}
        categoryLabels={categoryLabels}
        dispatch={extra.dispatch ?? jest.fn()}
        onRequestPick={extra.onRequestPick ?? jest.fn()}
        t={t}
      />,
    );
  });
  return renderer;
}

function byTestID(renderer: TestRendererInstance, testID: string): TestNode | undefined {
  return renderer.root.findAll((node) => node.props?.testID === testID)[0];
}

describe('CourseStepEditor category icons', () => {
  it('renders exactly one icon per category button, for every category', () => {
    const renderer = render({ id: 'step-1', category: 'meal' });
    expect(renderer.root.findAllByType(Utensils)).toHaveLength(1);
    expect(renderer.root.findAllByType(Coffee)).toHaveLength(1);
    expect(renderer.root.findAllByType(Wine)).toHaveLength(1);
    expect(renderer.root.findAllByType(Zap)).toHaveLength(1);
    expect(renderer.root.findAllByType(Palette)).toHaveLength(1);
    expect(renderer.root.findAllByType(Footprints)).toHaveLength(1);
    expect(renderer.root.findAllByType(Sparkles)).toHaveLength(1);
  });

  it('colors the selected category icon with the deep pink accent', () => {
    const renderer = render({ id: 'step-1', category: 'cafe' });
    const [coffeeIcon] = renderer.root.findAllByType(Coffee);
    const [utensilsIcon] = renderer.root.findAllByType(Utensils);
    expect(coffeeIcon.props.color).toBe('#C24B57');
    expect(utensilsIcon.props.color).not.toBe('#C24B57');
  });
});

describe('CourseStepEditor 직접 지정 세그먼트', () => {
  it('기본은 카테고리 탭이라 카테고리 칩을 보여준다', () => {
    const renderer = render({ id: 'step-1', category: 'meal' });
    expect(byTestID(renderer, 'course-step-tab-category')).toBeDefined();
    expect(byTestID(renderer, 'course-step-tab-pin')).toBeDefined();
    expect(renderer.root.findAllByType(Utensils)).toHaveLength(1);
    expect(byTestID(renderer, 'course-step-pick-entry')).toBeUndefined();
  });

  it('직접 지정 탭을 누르면 카테고리 칩 대신 검색 진입 행을 보여주고, 누르면 onRequestPick 호출', () => {
    const onRequestPick = jest.fn();
    const renderer = render({ id: 'step-1', category: 'meal' }, { onRequestPick });
    act(() => { byTestID(renderer, 'course-step-tab-pin')!.props.onPress(); });

    expect(renderer.root.findAllByType(Utensils)).toHaveLength(0);
    const entry = byTestID(renderer, 'course-step-pick-entry');
    expect(entry).toBeDefined();
    act(() => { entry!.props.onPress(); });
    expect(onRequestPick).toHaveBeenCalledWith('step-1');
  });

  it('핀이 지정되면 장소명·주소와 지우기를 보여주고, 지우기는 clearStepPin을 디스패치한다', () => {
    const dispatch = jest.fn();
    const renderer = render(
      { id: 'step-1', category: 'meal', pin: { kakaoPlaceId: 'k1', name: '블루보틀 성수', address: '서울 성동구 아차산로 7' } },
      { dispatch },
    );
    const clear = byTestID(renderer, 'course-step-pin-clear');
    expect(clear).toBeDefined();
    act(() => { clear!.props.onPress(); });
    expect(dispatch).toHaveBeenCalledWith({ type: 'clearStepPin', stepId: 'step-1' });
  });

  it('핀 상태에서 카테고리 탭을 누르는 순간 핀을 지운다(UI=제출 상태 일치)', () => {
    const dispatch = jest.fn();
    const renderer = render(
      { id: 'step-1', category: 'meal', pin: { kakaoPlaceId: 'k1', name: '블루보틀', address: '서울' } },
      { dispatch },
    );
    act(() => { byTestID(renderer, 'course-step-tab-category')!.props.onPress(); });
    expect(dispatch).toHaveBeenCalledWith({ type: 'clearStepPin', stepId: 'step-1' });
  });

  it('핀 상태에서 카테고리 탭으로 돌아가 칩을 고르면 핀을 지우고 카테고리를 설정한다(상호배타)', () => {
    const dispatch = jest.fn();
    const renderer = render(
      { id: 'step-1', category: 'meal', pin: { kakaoPlaceId: 'k1', name: '블루보틀', address: '서울' } },
      { dispatch },
    );
    act(() => { byTestID(renderer, 'course-step-tab-category')!.props.onPress(); });
    const [coffeeButton] = renderer.root.findAll((n) => n.props?.testID === 'course-step-category-cafe');
    act(() => { coffeeButton.props.onPress(); });

    expect(dispatch).toHaveBeenCalledWith({ type: 'clearStepPin', stepId: 'step-1' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'setStepCategory', stepId: 'step-1', category: 'cafe' });
  });
});
