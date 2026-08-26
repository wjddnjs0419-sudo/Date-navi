import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Calendar, Heart, MapPin, Search } from 'lucide-react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { C } from '../../constants/colors';
import { Illustration, type IllustrationName } from '../illustration';

const STAGE_ASSETS: readonly IllustrationName[] = [
  'mascot-heart-loading-preference',
  'mascot-heart-loading-places',
  'mascot-heart-loading-route',
  'mascot-heart-loading-finish',
];

function FigmaRouteIcon({ size = 18, color = C.textSub }: { size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Path
        d="M4.5 16.5C5.74264 16.5 6.75 15.4926 6.75 14.25C6.75 13.0074 5.74264 12 4.5 12C3.25736 12 2.25 13.0074 2.25 14.25C2.25 15.4926 3.25736 16.5 4.5 16.5Z"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M6.75 14.25H13.125C13.8212 14.25 14.4889 13.9734 14.9812 13.4812C15.4734 12.9889 15.75 12.3212 15.75 11.625C15.75 10.9288 15.4734 10.2611 14.9812 9.76884C14.4889 9.27656 13.8212 9 13.125 9H4.875C4.17881 9 3.51113 8.72344 3.01884 8.23116C2.52656 7.73887 2.25 7.07119 2.25 6.375C2.25 5.67881 2.52656 5.01113 3.01884 4.51884C3.51113 4.02656 4.17881 3.75 4.875 3.75H11.25"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M13.5 6C14.7426 6 15.75 4.99264 15.75 3.75C15.75 2.50736 14.7426 1.5 13.5 1.5C12.2574 1.5 11.25 2.50736 11.25 3.75C11.25 4.99264 12.2574 6 13.5 6Z"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const STAGE_ICONS = [Search, MapPin, FigmaRouteIcon, Heart] as const;
const STAGE_MASCOT_SLOTS = [
  { left: 97, top: 25, width: 155, height: 130 },
  { left: 79, top: 23, width: 192, height: 132 },
  { left: 87, top: 23, width: 176, height: 132 },
  { left: 93, top: 0, width: 171, height: 155 },
] as const;
const BUBBLE_WIDTHS = {
  ko: [118, 148, 105, 131],
  en: [150, 148, 125, 131],
} as const;
const STAGE_TRANSITION_DURATION = 360;

export type QuickPlanningLoadingConditions = {
  location: string;
  time: string;
  mood: string;
};

export type QuickPlanningLoadingLanguage = 'ko' | 'en';

/** Figma reference checkpoints: 24%, 52%, 76%, and 100%. */
export function getQuickPlanningStageIndex(progressPercent: number): number {
  const progress = Math.min(100, Math.max(0, progressPercent));
  if (progress < 25) return 0;
  if (progress < 53) return 1;
  if (progress < 77) return 2;
  return 3;
}

function clampProgress(progressPercent: number) {
  return Math.min(100, Math.max(0, Math.round(progressPercent)));
}

export function QuickPlanningLoading({
  heading,
  subtitle,
  stageLabels,
  bubbleMessages,
  statusMessages,
  progressPercent,
  conditions,
  conditionsLabel,
  language,
}: {
  heading: string;
  subtitle: string;
  stageLabels: string[];
  bubbleMessages: string[];
  statusMessages: string[];
  progressPercent: number;
  conditions: QuickPlanningLoadingConditions;
  conditionsLabel: string;
  language: QuickPlanningLoadingLanguage;
}) {
  const progress = clampProgress(progressPercent);
  const [displayedProgress, setDisplayedProgress] = useState(progress);
  const stageIndex = getQuickPlanningStageIndex(displayedProgress);
  const mascotOpacity = useRef(
    STAGE_ASSETS.map((_, index) => new Animated.Value(index === stageIndex ? 1 : 0)),
  ).current;
  const mascotScale = useRef(
    STAGE_ASSETS.map((_, index) => new Animated.Value(index === stageIndex ? 1 : 0.98)),
  ).current;
  const textOpacity = useRef(
    STAGE_ASSETS.map((_, index) => new Animated.Value(index === stageIndex ? 1 : 0)),
  ).current;
  const animatedProgress = useRef(new Animated.Value(progress)).current;
  const [reduceMotion, setReduceMotion] = useState(false);
  const previousStage = useRef<number | null>(null);
  const previousStatus = useRef(statusMessages[stageIndex] ?? '');

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(enabled => {
      if (mounted) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const outgoing = mascotOpacity.map((opacity, index) =>
      Animated.timing(opacity, {
        toValue: index === stageIndex ? 1 : 0,
        duration: reduceMotion ? 0 : STAGE_TRANSITION_DURATION,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    );
    const scales = mascotScale.map((scale, index) =>
      Animated.timing(scale, {
        toValue: index === stageIndex ? 1 : 0.98,
        duration: reduceMotion ? 0 : STAGE_TRANSITION_DURATION,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    );
    const text = textOpacity.map((opacity, index) =>
      Animated.timing(opacity, {
        toValue: index === stageIndex ? 1 : 0,
        duration: reduceMotion ? 0 : STAGE_TRANSITION_DURATION,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    );
    const transition = Animated.parallel([...outgoing, ...scales, ...text]);
    transition.start();
    return () => transition.stop();
  }, [mascotOpacity, mascotScale, reduceMotion, stageIndex, textOpacity]);

  useEffect(() => {
    if (previousStage.current !== null && previousStage.current !== stageIndex) {
      const nextStatus = statusMessages[stageIndex] ?? '';
      if (nextStatus !== previousStatus.current) {
        AccessibilityInfo.announceForAccessibility(nextStatus);
        previousStatus.current = nextStatus;
      }
    }
    previousStage.current = stageIndex;
  }, [stageIndex, statusMessages]);

  useEffect(() => {
    const listenerId = animatedProgress.addListener(({ value }) => {
      setDisplayedProgress(Math.round(value));
    });
    return () => animatedProgress.removeListener(listenerId);
  }, [animatedProgress]);

  useEffect(() => {
    if (reduceMotion) {
      animatedProgress.setValue(progress);
      setDisplayedProgress(progress);
      return;
    }
    Animated.timing(animatedProgress, {
      toValue: progress,
      duration: 400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [animatedProgress, progress, reduceMotion]);

  const labels = stageLabels.slice(0, STAGE_ASSETS.length);
  const bubbleWidth = BUBBLE_WIDTHS[language][stageIndex];
  const fillWidth = animatedProgress.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        accessibilityLabel={heading.replace('\n', ' ')}
      >
        <Text style={styles.heading}>{heading}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        <View style={styles.mascotStage} accessibilityElementsHidden>
          {STAGE_ASSETS.map((asset, index) => {
            const slot = STAGE_MASCOT_SLOTS[index];
            return (
              <Animated.View
                key={asset}
                testID={`quick-planning-mascot-${index}`}
                style={[
                  styles.mascot,
                  slot,
                  { opacity: mascotOpacity[index], transform: [{ scale: mascotScale[index] }] },
                ]}
              >
                <Illustration name={asset} width={slot.width} height={slot.height} accessible={false} />
              </Animated.View>
            );
          })}
        </View>

        <View style={[styles.bubble, { width: bubbleWidth }]} accessibilityElementsHidden>
          <View style={styles.bubbleTextStack} pointerEvents="none">
            {bubbleMessages.slice(0, STAGE_ASSETS.length).map((message, index) => (
              <Animated.Text
                key={`${message}-${index}`}
                style={[styles.bubbleText, styles.bubbleTextLayer, { opacity: textOpacity[index] }]}
              >
                {message}
              </Animated.Text>
            ))}
          </View>
        </View>

        <View
          style={styles.progressSemantics}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={heading.replace('\n', ' ')}
          accessibilityValue={{ min: 0, max: 100, now: displayedProgress, text: `${labels[stageIndex] ?? ''} ${displayedProgress}%` }}
        >
          <View style={styles.stepper} testID="quick-planning-stepper">
            {labels.map((label, index) => {
              const Icon = STAGE_ICONS[index];
              const active = index === stageIndex;
              const reached = index < stageIndex;
              return (
                <View key={`${label}-${index}`} style={styles.stepItem}>
                  {index < labels.length - 1 && (
                    <View style={[styles.connector, index < stageIndex ? styles.connectorActive : styles.connectorInactive]} />
                  )}
                  <View style={[styles.stepCircle, (active || reached) && styles.stepCircleActive]}>
                    <Icon size={18} color={active || reached ? C.pinkDeep : C.textSub} strokeWidth={1.5} />
                  </View>
                  <Text style={[styles.stepLabel, active && styles.stepLabelActive]} numberOfLines={1}>{label}</Text>
                </View>
              );
            })}
          </View>

          <View style={styles.conditionsCard} testID="quick-planning-conditions">
            <Text style={styles.conditionsTitle}>{conditionsLabel}</Text>
            <View style={styles.conditionMetaRow} testID="quick-planning-condition-meta">
              <View style={styles.conditionGroup}>
                <MapPin size={18} color={C.textSub} strokeWidth={1.5} />
                <Text style={styles.conditionValue} numberOfLines={1}>{conditions.location}</Text>
              </View>
              <View style={[styles.conditionGroup, styles.conditionTimeGroup]}>
                <Calendar size={18} color={C.textSub} strokeWidth={1.5} />
                <Text style={styles.conditionValue} numberOfLines={1}>{conditions.time}</Text>
              </View>
            </View>
            <View style={styles.conditionGroup}>
              <Heart size={18} color={C.textSub} strokeWidth={1.5} />
              <Text style={styles.conditionValue} numberOfLines={1}>{conditions.mood}</Text>
            </View>
          </View>

          <View style={styles.statusRow} accessibilityLiveRegion="polite">
            <View style={styles.statusTextStack} pointerEvents="none">
              {statusMessages.slice(0, STAGE_ASSETS.length).map((message, index) => (
                <Animated.Text
                  key={`${message}-${index}`}
                  style={[styles.statusText, styles.statusTextLayer, { opacity: textOpacity[index] }]}
                >
                  {message}
                </Animated.Text>
              ))}
            </View>
            <Text style={styles.percentText}>{displayedProgress}%</Text>
          </View>
          <View style={styles.track} testID="quick-planning-progress-track">
            <Animated.View style={[styles.fill, { width: fillWidth }]} testID="quick-planning-progress-fill" />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 72,
    paddingBottom: 32,
  },
  heading: {
    width: '100%',
    fontFamily: 'Inter',
    color: C.text,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 30,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 6,
    fontFamily: 'Inter',
    color: C.textSub,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 20,
    textAlign: 'center',
  },
  mascotStage: { width: '100%', height: 155, marginTop: 7, position: 'relative' },
  mascot: { position: 'absolute' },
  bubble: {
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.pinkBorder,
    backgroundColor: '#FFEDEF',
    paddingHorizontal: 10,
  },
  bubbleText: {
    fontFamily: 'Inter',
    color: C.pinkDeep,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 22,
    textAlign: 'center',
  },
  bubbleTextStack: { ...StyleSheet.absoluteFillObject, justifyContent: 'center' },
  bubbleTextLayer: { position: 'absolute', left: 10, right: 10 },
  progressSemantics: { width: '100%', marginTop: 24 },
  stepper: { width: '100%', height: 76, flexDirection: 'row' },
  stepItem: { flex: 1, alignItems: 'center', position: 'relative' },
  connector: { position: 'absolute', top: 21, left: '50%', width: '100%', height: 2 },
  connectorActive: { backgroundColor: C.pink },
  connectorInactive: { backgroundColor: C.borderLight },
  stepCircle: {
    zIndex: 1,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.borderLight,
    backgroundColor: C.white,
  },
  stepCircleActive: { borderColor: C.pink, backgroundColor: '#FFEDEF' },
  stepLabel: {
    maxWidth: 82,
    marginTop: 6,
    fontFamily: 'Inter',
    color: C.textSub,
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 16,
    textAlign: 'center',
  },
  stepLabelActive: { color: C.pinkDeep },
  conditionsCard: {
    height: 104,
    width: '100%',
    justifyContent: 'flex-start',
    marginTop: 24,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 8,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.borderLight,
    backgroundColor: C.white,
    shadowColor: C.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 7,
    elevation: 3,
  },
  conditionsTitle: { fontFamily: 'Inter', color: C.text, fontSize: 15, fontWeight: '700', lineHeight: 20 },
  conditionMetaRow: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 16 },
  conditionGroup: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 4 },
  conditionTimeGroup: { flex: 1 },
  conditionValue: { flexShrink: 1, fontFamily: 'Inter', color: C.textSub, fontSize: 12, fontWeight: '500', lineHeight: 18 },
  statusRow: { height: 20, width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24 },
  statusTextStack: { flex: 1, height: 20, position: 'relative' },
  statusText: { fontFamily: 'Inter', color: C.pink, fontSize: 13, fontWeight: '500', lineHeight: 20 },
  statusTextLayer: { position: 'absolute', left: 0, top: 0 },
  percentText: { fontFamily: 'Inter', color: C.pink, fontSize: 16, fontWeight: '600', lineHeight: 24 },
  track: { width: '100%', height: 8, overflow: 'hidden', marginTop: 12, borderRadius: 999, backgroundColor: '#FFEDEF' },
  fill: { height: '100%', borderRadius: 999, backgroundColor: C.pink },
});
