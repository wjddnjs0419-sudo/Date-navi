import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RecommendationLocation } from '../shared/recommendation/contracts';

const mockRouterReplace = jest.fn();
const mockPrepareRecommendationRequest = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: mockRouterReplace }),
}));

jest.mock('../lib/i18n', () => ({
  useI18n: () => ({
    language: 'ko',
    t: (key: string, values?: Record<string, string>) => (
      values?.categories ? `${key}:${values.categories}` : key
    ),
    strings: {
      course: {
        modeLabel: 'course.modeLabel',
        title: 'course.title',
        ideaLabel: 'course.ideaLabel',
        ideaPlaceholder: 'course.ideaPlaceholder',
        ideaHint: 'course.ideaHint',
        durationLabel: 'course.durationLabel',
        durationOptions: [],
        generateButton: 'course.generateButton',
        errorEmpty: 'course.errorEmpty',
      },
    },
  }),
}));

jest.mock('../components/recommendation/recommendation-session-provider', () => ({
  useRecommendationSessionStore: () => ({
    prepareRecommendationRequest: mockPrepareRecommendationRequest,
  }),
}));

jest.mock('../lib/recommendationIdentity', () => ({
  createRecommendationRequestId: () => 'req-course-screen-001',
}));

jest.mock('../components/recommendation/location-selector', () => {
  const ReactModule = require('react') as typeof React;
  const { View } = require('react-native') as typeof import('react-native');
  return {
    LocationSelector: (props: Record<string, unknown>) => ReactModule.createElement(View, {
      ...props,
      testID: 'location-selector',
    }),
  };
});

type TestNode = { props: Record<string, any> };
type TestRendererInstance = {
  root: {
    findByProps: (props: Record<string, unknown>) => TestNode;
    findAllByProps: (props: Record<string, unknown>) => TestNode[];
    findAllByType: (type: unknown) => TestNode[];
  };
};
const TestRenderer = require('react-test-renderer') as {
  act: (callback: () => void | Promise<void>) => void | Promise<void>;
  create: (element: React.ReactElement) => TestRendererInstance;
};
const { act, create } = TestRenderer;
const CourseScreen = require('../app/mode-flow/course').default as typeof import('../app/mode-flow/course').default;

const location: RecommendationLocation = {
  source: 'kakao',
  kakaoPlaceId: 'origin-1',
  label: '서울숲',
  latitude: 37.5444,
  longitude: 127.0374,
  kind: 'landmark',
};

function nestedKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => nestedKeys(child, prefix ? `${prefix}.${key}` : key));
}

describe('structured course screen', () => {
  beforeEach(() => {
    mockRouterReplace.mockClear();
    mockPrepareRecommendationRequest.mockClear();
  });

  it('keeps every course string and accessibility label in ko/en parity', () => {
    const ko = JSON.parse(readFileSync(join(__dirname, '../locales/ko.json'), 'utf8')).course;
    const en = JSON.parse(readFileSync(join(__dirname, '../locales/en.json'), 'utf8')).course;

    expect(nestedKeys(ko).sort()).toEqual(nestedKeys(en).sort());
    expect(nestedKeys(ko)).toEqual(expect.arrayContaining([
      'steps.categories.meal',
      'walking.options.any',
      'budget.label',
      'moods.options.comfortable',
      'additional.maxLength',
      'validation.location_required',
      'validation.exclusion_conflict',
      'accessibility.addStep',
      'accessibility.moveStepUp',
      'accessibility.moveStepDown',
      'accessibility.removeStep',
      'accessibility.generate',
    ]));
  });

  it('renders two default steps and enforces the two-to-four step controls', () => {
    let renderer!: TestRendererInstance;
    act(() => { renderer = create(<CourseScreen />); });

    const steps = () => renderer.root.findAllByType(View).filter((node) => node.props.testID === 'course-step');
    const removeButtons = () => renderer.root.findAllByType(TouchableOpacity).filter(
      (node) => node.props.testID === 'course-remove-step',
    );
    expect(steps()).toHaveLength(2);
    expect(removeButtons().every((node) => node.props.disabled)).toBe(true);

    const add = renderer.root.findByProps({ testID: 'course-add-step' });
    act(() => add.props.onPress());
    act(() => add.props.onPress());

    expect(steps()).toHaveLength(4);
    expect(renderer.root.findByProps({ testID: 'course-add-step' }).props.disabled).toBe(true);
    expect(removeButtons().every((node) => !node.props.disabled)).toBe(true);
  });

  it('requires location, blocks a parsed conflict, and hands a valid draft to generating by requestId only', () => {
    let renderer!: TestRendererInstance;
    act(() => { renderer = create(<CourseScreen />); });
    const generate = () => renderer.root.findByProps({ accessibilityLabel: 'course.accessibility.generate' });

    expect(generate().props.disabled).toBe(true);
    const locationSelector = renderer.root.findByProps({ testID: 'location-selector' });
    expect(locationSelector.props.required).toBe(true);
    act(() => locationSelector.props.onChange(location));
    act(() => renderer.root.findByProps({ accessibilityRole: 'checkbox' }).props.onPress());
    expect(generate().props.disabled).toBe(false);

    const additional = renderer.root.findByProps({ accessibilityLabel: 'course.accessibility.additionalRequest' });
    act(() => additional.props.onChangeText('avoid cafes'));
    expect(renderer.root.findAllByType(Text).filter((node) => node.props.testID === 'course-conflict')).toHaveLength(1);
    expect(generate().props.disabled).toBe(true);

    act(() => additional.props.onChangeText(''));
    expect(generate().props.disabled).toBe(false);
    act(() => generate().props.onPress());

    expect(mockRouterReplace).toHaveBeenCalledTimes(1);
    const route = mockRouterReplace.mock.calls[0][0];
    expect(route.params).toEqual({ requestId: 'req-course-screen-001' });
    expect(mockPrepareRecommendationRequest).toHaveBeenCalledTimes(1);
    const request = mockPrepareRecommendationRequest.mock.calls[0][0];
    expect(request.requestId).toBe('req-course-screen-001');
    expect(request.location).toEqual(location);
    expect(request.courseSteps).toHaveLength(2);
    expect(request.additionalRequest).toBeUndefined();
  });
});
