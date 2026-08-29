import React from 'react';
import { StyleSheet } from 'react-native';
import { Coffee, Footprints, Palette, Utensils, Wine, Zap } from '../components/iconography';
import { C, DS } from '../constants/theme';
import { COURSE_CATEGORIES, type CourseCategory, type CourseDraftStep } from '../lib/course-draft';

type TestNode = { props: Record<string, any>; type: unknown };
type TestRendererInstance = { root: { findAllByType: (type: unknown) => TestNode[]; findAll: (predicate: (node: TestNode) => boolean) => TestNode[] } };
const TestRenderer = require('react-test-renderer') as { act: (callback: () => void) => void; create: (element: React.ReactElement) => TestRendererInstance };
const { act, create } = TestRenderer;
const { CourseStepEditor } = require('../components/recommendation/course-step-editor') as {
  CourseStepEditor: React.ComponentType<any>;
};

const categoryLabels = Object.fromEntries(COURSE_CATEGORIES.map((category) => [category, category])) as Record<CourseCategory, string>;
const t = (key: string) => key;

function render(steps: CourseDraftStep[], extra: Record<string, any> = {}) {
  let renderer!: TestRendererInstance;
  act(() => {
    renderer = create(
      <CourseStepEditor
        steps={steps}
        categoryLabels={categoryLabels}
        expandedStepId={steps[0]?.id ?? null}
        onToggleCategory={extra.onToggleCategory ?? jest.fn()}
        onSelectPreference={extra.onSelectPreference ?? jest.fn()}
        onToggleStep={() => undefined}
        language="ko"
        t={t}
        {...extra}
      />,
    );
  });
  return renderer;
}

function byTestID(renderer: TestRendererInstance, testID: string): TestNode | undefined {
  return renderer.root.findAll((node) => node.props?.testID === testID)[0];
}

describe('CourseStepEditor redesigned category and preference input', () => {
  it('renders the six selectable categories and no AI-decide category', () => {
    const renderer = render([{ id: 'meal-1', category: 'meal' }]);
    expect(renderer.root.findAllByType(Utensils)).toHaveLength(2);
    expect(renderer.root.findAllByType(Coffee)).toHaveLength(1);
    expect(renderer.root.findAllByType(Wine)).toHaveLength(1);
    expect(renderer.root.findAllByType(Zap)).toHaveLength(1);
    expect(renderer.root.findAllByType(Palette)).toHaveLength(1);
    expect(renderer.root.findAllByType(Footprints)).toHaveLength(1);
    expect(byTestID(renderer, 'course-category-ai_decide')).toBeUndefined();
  });

  it('renders categories in the Figma three-column order', () => {
    const renderer = render([{ id: 'meal-1', category: 'meal' }]);
    const categoryTestIDs = Array.from(new Set(
      renderer.root
        .findAll((node) => typeof node.props?.testID === 'string' && node.props.testID.startsWith('course-category-'))
        .map((node) => node.props.testID),
    ));
    expect(categoryTestIDs).toEqual([
      'course-category-meal',
      'course-category-cafe',
      'course-category-walk',
      'course-category-culture',
      'course-category-activity',
      'course-category-drinks',
    ]);
  });

  it('delegates category selection while preserving the selected step order in the parent', () => {
    const onToggleCategory = jest.fn();
    const renderer = render([{ id: 'meal-1', category: 'meal' }], { onToggleCategory });
    act(() => { byTestID(renderer, 'course-category-cafe')!.props.onPress(); });
    expect(onToggleCategory).toHaveBeenCalledWith('cafe');
    expect(byTestID(renderer, 'course-category-meal')!.props.accessibilityState.selected).toBe(true);
  });

  it('shows the meal preference mapping and treats Anything as no intent tag', () => {
    const onSelectPreference = jest.fn();
    const renderer = render([{ id: 'meal-1', category: 'meal' }], { onSelectPreference });
    expect(byTestID(renderer, 'course-preference-meal-한식')).toBeDefined();
    expect(byTestID(renderer, 'course-preference-meal-아무거나')).toBeDefined();

    act(() => { byTestID(renderer, 'course-preference-meal-한식')!.props.onPress(); });
    expect(onSelectPreference).toHaveBeenCalledWith('meal-1', '한식');
    act(() => { byTestID(renderer, 'course-preference-meal-아무거나')!.props.onPress(); });
    expect(onSelectPreference).toHaveBeenCalledWith('meal-1', undefined);
  });

  it('renders collapsed rows for non-expanded steps with their selected preference summary', () => {
    const renderer = render([
      { id: 'meal-1', category: 'meal', intentTags: ['고기'] },
      { id: 'cafe-1', category: 'cafe', intentTags: ['디저트'] },
    ]);
    expect(byTestID(renderer, 'course-step-row-cafe-1')).toBeDefined();
    expect(byTestID(renderer, 'course-step-preference-cafe-1')).toBeDefined();
  });

  it('restores the previous default keyword lists for non-meal categories', () => {
    const renderer = render([{ id: 'cafe-1', category: 'cafe' }]);
    expect(byTestID(renderer, 'course-preference-cafe-루프탑 카페')).toBeDefined();
    expect(byTestID(renderer, 'course-preference-cafe-디저트')).toBeDefined();
    expect(byTestID(renderer, 'course-preference-cafe-북카페')).toBeDefined();
    expect(byTestID(renderer, 'course-preference-cafe-조용한')).toBeUndefined();
  });

  it('keeps only one selected keyword and provides an add input without the auto-expand helper', () => {
    const onSelectPreference = jest.fn();
    const onAddSuggestedTag = jest.fn();
    const renderer = render([{ id: 'meal-1', category: 'meal' }], {
      onSelectPreference,
      onAddSuggestedTag,
    });
    const input = byTestID(renderer, 'course-preference-input-meal-1');
    expect(input).toBeDefined();
    expect(byTestID(renderer, 'course-preference-auto-expand-meal-1')).toBeUndefined();

    act(() => { input!.props.onChangeText('김치찜'); });
    act(() => { byTestID(renderer, 'course-preference-add-meal-1')!.props.onPress(); });
    expect(onSelectPreference).toHaveBeenCalledWith('meal-1', '김치찜');
    expect(onAddSuggestedTag).toHaveBeenCalledWith('김치찜');
  });

  it('keeps an overflow keyword out of reusable chips while applying it to the current recommendation', () => {
    const onSelectPreference = jest.fn();
    const renderer = render([{ id: 'meal-1', category: 'meal' }], {
      onSelectPreference,
      personalTagCount: 20,
      personalTagLimit: 20,
    });
    const input = byTestID(renderer, 'course-preference-input-meal-1');

    act(() => { input!.props.onChangeText('새로운 메뉴'); });
    act(() => { byTestID(renderer, 'course-preference-add-meal-1')!.props.onPress(); });

    expect(onSelectPreference).toHaveBeenCalledWith('meal-1', '새로운 메뉴');
    expect(byTestID(renderer, 'course-preference-meal-새로운 메뉴')).toBeUndefined();
    expect(byTestID(renderer, 'course-preference-limit-meal-1')).toBeDefined();
  });

  it('puts an x action on keyword chips so a default or custom keyword can be removed', () => {
    const onRemoveSuggestedTag = jest.fn();
    const renderer = render([{ id: 'cafe-1', category: 'cafe' }], { onRemoveSuggestedTag });
    const removeButton = byTestID(renderer, 'course-preference-remove-cafe-루프탑 카페');
    expect(removeButton).toBeDefined();
    expect(StyleSheet.flatten(removeButton?.props.style)).toEqual(expect.objectContaining({
      top: -DS.spacing.lg,
      right: -DS.spacing.lg,
      width: DS.spacing.touch,
      height: DS.spacing.touch,
    }));
    const removeIcon = renderer.root.findAll((node) => {
      const style = StyleSheet.flatten(node.props?.style);
      return typeof node.type === 'string'
        && style?.width === DS.spacing.xxl
        && style?.height === DS.spacing.xxl
        && style?.borderRadius === DS.radius.full
        && style?.backgroundColor === C.closeSurface;
    })[0];
    expect(removeIcon).toBeDefined();

    act(() => { removeButton!.props.onPress(); });
    expect(onRemoveSuggestedTag).toHaveBeenCalledWith('루프탑 카페');
    expect(byTestID(renderer, 'course-preference-cafe-루프탑 카페')).toBeUndefined();
  });

  it('keeps the expanded step card white while using the brand selected treatment for keywords', () => {
    const renderer = render([{ id: 'meal-1', category: 'meal' }]);
    const card = byTestID(renderer, 'course-step-card-meal-1');
    const anything = byTestID(renderer, 'course-preference-meal-아무거나');

    expect(StyleSheet.flatten(card?.props.style)).toEqual(expect.objectContaining({ backgroundColor: C.white }));
    expect(StyleSheet.flatten(anything?.props.style)).toEqual(expect.objectContaining({
      backgroundColor: C.pinkLight,
      borderColor: C.pink,
      borderWidth: 1.5,
    }));
  });
});
