import React from 'react';
import { Coffee, Footprints, Palette, Sparkles, Utensils, Wine, Zap } from 'lucide-react-native';
import { COURSE_CATEGORIES, type CourseCategory } from '../lib/course-draft';

type TestNode = { props: Record<string, any> };
type TestRendererInstance = {
  root: { findAllByType: (type: unknown) => TestNode[] };
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

function render(category: CourseCategory) {
  let renderer!: TestRendererInstance;
  act(() => {
    renderer = create(
      <CourseStepEditor
        step={{ id: 'step-1', category }}
        index={0}
        total={2}
        categoryLabels={categoryLabels}
        dispatch={jest.fn()}
        t={t}
      />,
    );
  });
  return renderer;
}

describe('CourseStepEditor category icons', () => {
  it('renders exactly one icon per category button, for every category', () => {
    const renderer = render('meal');
    expect(renderer.root.findAllByType(Utensils)).toHaveLength(1);
    expect(renderer.root.findAllByType(Coffee)).toHaveLength(1);
    expect(renderer.root.findAllByType(Wine)).toHaveLength(1);
    expect(renderer.root.findAllByType(Zap)).toHaveLength(1);
    expect(renderer.root.findAllByType(Palette)).toHaveLength(1);
    expect(renderer.root.findAllByType(Footprints)).toHaveLength(1);
    expect(renderer.root.findAllByType(Sparkles)).toHaveLength(1);
  });

  it('colors the selected category icon with the deep pink accent', () => {
    const renderer = render('cafe');
    const [coffeeIcon] = renderer.root.findAllByType(Coffee);
    const [utensilsIcon] = renderer.root.findAllByType(Utensils);
    expect(coffeeIcon.props.color).toBe('#C24B57');
    expect(utensilsIcon.props.color).not.toBe('#C24B57');
  });
});
