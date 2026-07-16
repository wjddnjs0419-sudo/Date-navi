import React from 'react';

jest.mock('../lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

type TestNode = { props: Record<string, any>; type: unknown };
type TestRendererInstance = {
  root: {
    findByProps: (props: Record<string, unknown>) => TestNode;
    findAllByProps: (props: Record<string, unknown>) => TestNode[];
  };
};
const TestRenderer = require('react-test-renderer') as {
  act: (callback: () => void | Promise<void>) => void | Promise<void>;
  create: (element: React.ReactElement) => TestRendererInstance;
};
const { act, create } = TestRenderer;
const { StepActionSheet } = require('../components/recommendation/step-action-sheet') as
  typeof import('../components/recommendation/step-action-sheet');

function renderSheet(overrides: Partial<React.ComponentProps<typeof StepActionSheet>> = {}) {
  const props: React.ComponentProps<typeof StepActionSheet> = {
    visible: true,
    placeName: '한강 카페',
    locked: false,
    canDelete: true,
    onLockToggle: jest.fn(),
    onReplace: jest.fn(),
    onDelete: jest.fn(),
    onClose: jest.fn(),
    ...overrides,
  };
  let instance!: TestRendererInstance;
  act(() => {
    instance = create(<StepActionSheet {...props} />);
  });
  return { instance, props };
}

describe('StepActionSheet', () => {
  it('shows the target step place name as its title', () => {
    const { instance } = renderSheet({ placeName: '한강 카페' });
    const title = instance.root.findByProps({ testID: 'step-action-sheet-title' });
    expect(title.props.children).toBe('한강 카페');
  });

  it('closes when the backdrop is tapped', () => {
    const { instance, props } = renderSheet();
    act(() => {
      instance.root.findByProps({ testID: 'step-action-sheet-backdrop' }).props.onPress();
    });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('invokes lock toggle for an unlocked step and labels the row "lock"', () => {
    const { instance, props } = renderSheet({ locked: false });
    const row = instance.root.findByProps({ testID: 'step-action-lock-toggle' });
    const label = instance.root.findByProps({ testID: 'step-action-lock-toggle-label' });
    expect(label.props.children).toBe('modeFlow.courseResult.lock');
    act(() => { row.props.onPress(); });
    expect(props.onLockToggle).toHaveBeenCalledTimes(1);
  });

  it('labels the row "unlock" for an already-locked step', () => {
    const { instance } = renderSheet({ locked: true });
    const label = instance.root.findByProps({ testID: 'step-action-lock-toggle-label' });
    expect(label.props.children).toBe('modeFlow.courseResult.unlock');
  });

  it('invokes replace for an unlocked step', () => {
    const { instance, props } = renderSheet({ locked: false });
    const row = instance.root.findByProps({ testID: 'step-action-replace' });
    expect(row.props.disabled).toBe(false);
    act(() => { row.props.onPress(); });
    expect(props.onReplace).toHaveBeenCalledTimes(1);
  });

  it('disables replace for a locked step', () => {
    const { instance } = renderSheet({ locked: true });
    const row = instance.root.findByProps({ testID: 'step-action-replace' });
    expect(row.props.disabled).toBe(true);
  });

  it('invokes delete and shows the normal label when at least three steps remain', () => {
    const { instance, props } = renderSheet({ locked: false, canDelete: true });
    const row = instance.root.findByProps({ testID: 'step-action-delete' });
    const label = instance.root.findByProps({ testID: 'step-action-delete-label' });
    expect(row.props.disabled).toBe(false);
    expect(label.props.children).toBe('modeFlow.courseResult.delete');
    act(() => { row.props.onPress(); });
    expect(props.onDelete).toHaveBeenCalledTimes(1);
  });

  it('disables delete and switches to the minimum-steps label when only two steps remain', () => {
    const { instance } = renderSheet({ locked: false, canDelete: false });
    const row = instance.root.findByProps({ testID: 'step-action-delete' });
    const label = instance.root.findByProps({ testID: 'step-action-delete-label' });
    expect(row.props.disabled).toBe(true);
    expect(label.props.children).toBe('modeFlow.courseResult.deleteMin');
  });

  it('disables delete for a locked step even when enough steps remain', () => {
    const { instance } = renderSheet({ locked: true, canDelete: true });
    const row = instance.root.findByProps({ testID: 'step-action-delete' });
    expect(row.props.disabled).toBe(true);
  });
});
