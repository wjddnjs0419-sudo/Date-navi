import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Coffee, Footprints, Smile, Utensils } from 'lucide-react-native';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RecommendationLocation } from '../shared/recommendation/contracts';

const mockRouterReplace = jest.fn();
const mockRouterBack = jest.fn();
const mockPrepareRecommendationRequest = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockRouterBack, replace: mockRouterReplace, push: jest.fn() }),
}));

jest.mock('../lib/i18n', () => ({
  useI18n: () => ({ language: 'ko', t: (key: string) => key }),
}));

jest.mock('../lib/analytics', () => ({
  logEvent: jest.fn(),
}));

jest.mock('../components/recommendation/recommendation-session-provider', () => ({
  useRecommendationSessionStore: () => ({ prepareRecommendationRequest: mockPrepareRecommendationRequest }),
}));

jest.mock('../components/recommendation/use-personal-step-tag-catalog', () => ({
  usePersonalStepTagCatalog: () => ({ suggestionsFor: () => [], addSuggestion: jest.fn(), removeSuggestion: jest.fn() }),
}));

jest.mock('../components/recommendation/location-selector', () => {
  const ReactModule = require('react') as typeof React;
  const { View: NativeView } = require('react-native') as typeof import('react-native');
  return { LocationSelector: (props: Record<string, unknown>) => ReactModule.createElement(NativeView, { ...props, testID: 'location-selector' }) };
});

jest.mock('../lib/recommendationIdentity', () => ({ createRecommendationRequestId: () => 'req-course-flow-001' }));

type TestNode = { props: Record<string, any>; type: unknown };
type TestRendererInstance = { root: { findByProps: (props: Record<string, unknown>) => TestNode; findAllByType: (type: unknown) => TestNode[]; findAll: (predicate: (node: TestNode) => boolean) => TestNode[] } };
const TestRenderer = require('react-test-renderer') as { act: (callback: () => void) => void; create: (element: React.ReactElement) => TestRendererInstance };
const { act, create } = TestRenderer;
const CourseScreen = require('../app/mode-flow/course').default as typeof import('../app/mode-flow/course').default;

const location: RecommendationLocation = {
  source: 'kakao', kakaoPlaceId: 'origin-1', label: '서울숲', latitude: 37.5444, longitude: 127.0374, kind: 'landmark',
};

function render() {
  let renderer!: TestRendererInstance;
  act(() => { renderer = create(<CourseScreen />); });
  return renderer;
}

describe('five-step course screen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 7, 26, 12, 0, 0));
    mockRouterReplace.mockClear();
    mockRouterBack.mockClear();
    mockPrepareRecommendationRequest.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps Korean and English course locale keys in parity', () => {
    const ko = JSON.parse(readFileSync(join(__dirname, '../locales/ko/course.json'), 'utf8')).course;
    const en = JSON.parse(readFileSync(join(__dirname, '../locales/en/course.json'), 'utf8')).course;
    const keys = (value: unknown, prefix = ''): string[] => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return [prefix];
      return Object.entries(value).flatMap(([key, child]) => keys(child, prefix ? `${prefix}.${key}` : key));
    };
    expect(keys(ko).sort()).toEqual(keys(en).sort());
  });

  it('disables the first CTA until two categories are selected', () => {
    const renderer = render();
    expect(renderer.root.findByProps({ testID: 'course-flow-next' }).props.disabled).toBe(true);

    act(() => { renderer.root.findByProps({ testID: 'course-category-cafe' }).props.onPress(); });
    expect(renderer.root.findByProps({ testID: 'course-flow-next' }).props.disabled).toBe(false);
  });

  it('keeps the initial category selection compact without an expanded step card', () => {
    const renderer = render();
    expect(renderer.root.findByProps({ testID: 'course-category-meal' }).props.accessibilityState.selected).toBe(true);
    expect(renderer.root.findAll((node) => node.props?.testID === 'course-step-row-course-step-1')).toHaveLength(0);
  });

  it('closes an expanded step when its up chevron is pressed again', () => {
    const renderer = render();
    act(() => { renderer.root.findByProps({ testID: 'course-category-cafe' }).props.onPress(); });
    expect(renderer.root.findAll((node) => node.props?.testID === 'course-preference-cafe-아무거나')).not.toHaveLength(0);

    act(() => { renderer.root.findByProps({ testID: 'course-step-row-course-step-2' }).props.onPress(); });
    expect(renderer.root.findAll((node) => node.props?.testID === 'course-preference-cafe-아무거나')).toHaveLength(0);
  });

  it('advances inside the same route through location, time, mood, and review steps', () => {
    const renderer = render();
    act(() => { renderer.root.findByProps({ testID: 'course-category-cafe' }).props.onPress(); });
    act(() => { renderer.root.findByProps({ testID: 'course-flow-next' }).props.onPress(); });
    expect(renderer.root.findByProps({ testID: 'course-flow-step-2' })).toBeDefined();

    const locationSelector = renderer.root.findByProps({ testID: 'location-selector' });
    expect(renderer.root.findByProps({ testID: 'course-flow-next' }).props.disabled).toBe(true);
    act(() => { locationSelector.props.onChange(location); });
    act(() => { renderer.root.findByProps({ testID: 'course-flow-next' }).props.onPress(); });
    expect(renderer.root.findByProps({ testID: 'course-flow-step-3' })).toBeDefined();

    act(() => { renderer.root.findByProps({ testID: 'course-meeting-time-tonight' }).props.onPress(); });
    act(() => { renderer.root.findByProps({ testID: 'course-flow-next' }).props.onPress(); });
    expect(renderer.root.findByProps({ testID: 'course-flow-step-4' })).toBeDefined();
    expect(renderer.root.findAll((node) => typeof node.type === 'string' && node.props?.testID === 'course-mood-row')).toHaveLength(2);
    expect(renderer.root.findAllByType(Smile)).not.toHaveLength(0);

    act(() => { renderer.root.findByProps({ testID: 'course-mood-emotional' }).props.onPress(); });
    act(() => { renderer.root.findByProps({ testID: 'course-flow-next' }).props.onPress(); });
    expect(renderer.root.findByProps({ testID: 'course-flow-step-5' })).toBeDefined();
    expect(renderer.root.findAllByType(Text).map((node) => node.props.children)).toContain('course.review.title');
  });

  it('opens an inline native date picker with horizontal time chips inside the dimmed sheet', () => {
    const renderer = render();
    act(() => { renderer.root.findByProps({ testID: 'course-category-cafe' }).props.onPress(); });
    act(() => { renderer.root.findByProps({ testID: 'course-flow-next' }).props.onPress(); });
    act(() => { renderer.root.findByProps({ testID: 'location-selector' }).props.onChange(location); });
    act(() => { renderer.root.findByProps({ testID: 'course-flow-next' }).props.onPress(); });
    act(() => { renderer.root.findByProps({ testID: 'course-meeting-time-custom' }).props.onPress(); });

    const nativePicker = renderer.root.findByProps({ testID: 'course-native-datetime-picker' });
    expect(nativePicker.props.mode).toBe('date');
    expect(nativePicker.props.display).toBe('inline');
    const timeScroll = renderer.root.findByProps({ testID: 'course-time-chip-scroll' });
    expect(timeScroll.props.horizontal).toBe(true);
    expect(renderer.root.findByProps({ testID: 'course-time-chip-18-30' })).toBeDefined();
    const selectedChip = renderer.root.findByProps({ testID: 'course-time-chip-12-00' });
    const unselectedChip = renderer.root.findByProps({ testID: 'course-time-chip-12-30' });
    expect(StyleSheet.flatten(selectedChip.props.style)).toEqual(expect.objectContaining({ backgroundColor: '#F26B7A', borderRadius: 20 }));
    expect(StyleSheet.flatten(unselectedChip.props.style)).toEqual(expect.objectContaining({ backgroundColor: '#ffffff' }));
    const selectedText = renderer.root.findAllByType(Text).find((node) => node.props.children === '12:00');
    const unselectedText = renderer.root.findAllByType(Text).find((node) => node.props.children === '12:30');
    expect(StyleSheet.flatten(selectedText?.props.style)).toEqual(expect.objectContaining({ color: '#ffffff' }));
    expect(StyleSheet.flatten(unselectedText?.props.style)).toEqual(expect.objectContaining({ color: '#3A2E2E' }));
    expect(StyleSheet.flatten(selectedChip.props.style)).toEqual(expect.objectContaining({ width: 58, minWidth: 58, flexShrink: 0 }));
    expect(StyleSheet.flatten(selectedText?.props.style)).toEqual(expect.objectContaining({ width: '100%', textAlign: 'center', fontVariant: ['tabular-nums'] }));
    expect(renderer.root.findByProps({ testID: 'course-time-apply' })).toBeDefined();
    expect(renderer.root.findAll((node) => node.props?.testID === 'course-time-sheet-close')).toHaveLength(0);
  });

  it('builds a recommendation only from the review CTA', () => {
    const renderer = render();
    act(() => { renderer.root.findByProps({ testID: 'course-category-cafe' }).props.onPress(); });
    act(() => { renderer.root.findByProps({ testID: 'course-flow-next' }).props.onPress(); });
    act(() => { renderer.root.findByProps({ testID: 'location-selector' }).props.onChange(location); });
    act(() => { renderer.root.findByProps({ testID: 'course-flow-next' }).props.onPress(); });
    act(() => { renderer.root.findByProps({ testID: 'course-meeting-time-custom' }).props.onPress(); });
    act(() => { renderer.root.findByProps({ testID: 'course-quick-time-today-18' }).props.onPress(); });
    act(() => { renderer.root.findByProps({ testID: 'course-flow-next' }).props.onPress(); });
    act(() => { renderer.root.findByProps({ testID: 'course-mood-emotional' }).props.onPress(); });
    act(() => { renderer.root.findByProps({ testID: 'course-flow-next' }).props.onPress(); });
    act(() => { renderer.root.findByProps({ testID: 'course-review-generate' }).props.onPress(); });

    expect(mockPrepareRecommendationRequest).toHaveBeenCalledTimes(1);
    expect(mockRouterReplace).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/mode-flow/generating' }));
    expect(mockPrepareRecommendationRequest.mock.calls[0][0]).toMatchObject({
      requestId: 'req-course-flow-001', location, courseSteps: expect.any(Array),
    });
    expect(renderer.root.findAll((node) => node.props?.children === 'course.review.back')).toHaveLength(0);
    expect(renderer.root.findAllByType(Utensils)).toHaveLength(1);
    expect(renderer.root.findAllByType(Coffee)).toHaveLength(1);
    expect(renderer.root.findAllByType(Footprints)).toHaveLength(0);
  });
});
