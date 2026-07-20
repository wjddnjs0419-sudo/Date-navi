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
  it('renders one icon per real category, without the removed "let AI decide" chip', () => {
    const renderer = render({ id: 'step-1', category: 'meal' });
    expect(renderer.root.findAllByType(Utensils)).toHaveLength(1);
    expect(renderer.root.findAllByType(Coffee)).toHaveLength(1);
    expect(renderer.root.findAllByType(Wine)).toHaveLength(1);
    expect(renderer.root.findAllByType(Zap)).toHaveLength(1);
    expect(renderer.root.findAllByType(Palette)).toHaveLength(1);
    expect(renderer.root.findAllByType(Footprints)).toHaveLength(1);
    // "AI가 결정"(ai_decide) 칩은 AI 추천 토글과 겹쳐 제거됨.
    expect(renderer.root.findAllByType(Sparkles)).toHaveLength(0);
    expect(byTestID(renderer, 'course-step-category-ai_decide')).toBeUndefined();
  });

  it('colors the selected category icon with the deep pink accent', () => {
    const renderer = render({ id: 'step-1', category: 'cafe' });
    const [coffeeIcon] = renderer.root.findAllByType(Coffee);
    const [utensilsIcon] = renderer.root.findAllByType(Utensils);
    expect(coffeeIcon.props.color).toBe('#C24B57');
    expect(utensilsIcon.props.color).not.toBe('#C24B57');
  });
});

describe('CourseStepEditor AI/직접 토글 (옵션 B)', () => {
  it('기본은 AI 추천 모드: 토글 + 카테고리 칩만, 검색 진입 없음', () => {
    const renderer = render({ id: 'step-1', category: 'meal' });
    expect(byTestID(renderer, 'course-step-tab-ai')).toBeDefined();
    expect(byTestID(renderer, 'course-step-tab-pick')).toBeDefined();
    expect(renderer.root.findAllByType(Utensils)).toHaveLength(1);
    expect(byTestID(renderer, 'course-step-pick-entry')).toBeUndefined();
  });

  it('내가 직접 탭을 눌러도 카테고리 칩은 그대로 보이고 검색 진입 행이 추가된다', () => {
    const onRequestPick = jest.fn();
    const renderer = render({ id: 'step-1', category: 'meal' }, { onRequestPick });
    act(() => { byTestID(renderer, 'course-step-tab-pick')!.props.onPress(); });

    // 옵션 B: 두 모드 모두 카테고리 칩 유지.
    expect(renderer.root.findAllByType(Utensils)).toHaveLength(1);
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

  it('AI 추천 토글을 누르면 핀을 지운다(AI가 고르므로)', () => {
    const dispatch = jest.fn();
    const renderer = render(
      { id: 'step-1', category: 'meal', pin: { kakaoPlaceId: 'k1', name: '블루보틀', address: '서울' } },
      { dispatch },
    );
    act(() => { byTestID(renderer, 'course-step-tab-ai')!.props.onPress(); });
    expect(dispatch).toHaveBeenCalledWith({ type: 'clearStepPin', stepId: 'step-1' });
  });

  it('카테고리 칩 선택은 핀을 지우지 않는다(공존)', () => {
    const dispatch = jest.fn();
    const renderer = render(
      { id: 'step-1', category: 'meal', pin: { kakaoPlaceId: 'k1', name: '블루보틀', address: '서울' } },
      { dispatch },
    );
    const [cafeButton] = renderer.root.findAll((n) => n.props?.testID === 'course-step-category-cafe');
    act(() => { cafeButton.props.onPress(); });

    expect(dispatch).toHaveBeenCalledWith({ type: 'setStepCategory', stepId: 'step-1', category: 'cafe' });
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'clearStepPin', stepId: 'step-1' });
  });

  it('선택된 카테고리 칩을 다시 누르면 해제되어 ai_decide로 돌아간다(선택 사항)', () => {
    const dispatch = jest.fn();
    const renderer = render({ id: 'step-1', category: 'cafe' }, { dispatch });
    const [cafeButton] = renderer.root.findAll((n) => n.props?.testID === 'course-step-category-cafe');
    act(() => { cafeButton.props.onPress(); });
    expect(dispatch).toHaveBeenCalledWith({ type: 'setStepCategory', stepId: 'step-1', category: 'ai_decide' });
  });
});
