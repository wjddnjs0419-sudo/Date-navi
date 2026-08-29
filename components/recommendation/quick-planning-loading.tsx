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
import { C, DS } from '../../constants/theme';
import { ProgressStepper } from '../ui';
import { AppIcon, type AppIconName } from '../iconography';
import { Illustration, type IllustrationName } from '../illustration';
import { useOptionalSafeAreaInsets } from '../../lib/use-optional-safe-area-insets';

const STAGE_ASSETS: readonly IllustrationName[] = [
  'mascot-heart-loading-preference',
  'mascot-heart-loading-places',
  'mascot-heart-loading-route',
  'mascot-heart-loading-finish',
];

const STAGE_ICONS: readonly AppIconName[] = ['search', 'mapPin', 'route', 'heart'];
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
const STAGE_TRANSITION_DURATION = DS.motion.stage;

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
  const insets = useOptionalSafeAreaInsets();
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
      duration: DS.motion.progress,
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
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
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
          <ProgressStepper
            testID="quick-planning-stepper"
            steps={labels.map((label, index) => ({ label, icon: STAGE_ICONS[index] }))}
            current={stageIndex + 1}
            accessibilityLabel={heading.replace('\n', ' ')}
            accessible={false}
          />

          <View style={styles.conditionsCard} testID="quick-planning-conditions">
            <Text style={styles.conditionsTitle}>{conditionsLabel}</Text>
            <View style={styles.conditionMetaRow} testID="quick-planning-condition-meta">
              <View style={styles.conditionGroup}>
                <AppIcon name="mapPin" size={18} color={C.textSub} strokeWidth={1.5} />
                <Text style={styles.conditionValue} numberOfLines={1}>{conditions.location}</Text>
              </View>
              <View style={[styles.conditionGroup, styles.conditionTimeGroup]}>
                <AppIcon name="calendar" size={18} color={C.textSub} strokeWidth={1.5} />
                <Text style={styles.conditionValue} numberOfLines={1}>{conditions.time}</Text>
              </View>
            </View>
            <View style={styles.conditionGroup}>
              <AppIcon name="heart" size={18} color={C.textSub} strokeWidth={1.5} />
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
    paddingHorizontal: DS.spacing.screen,
    paddingTop: DS.exception.quickPlanningLoading.compositionTop,
    paddingBottom: DS.exception.quickPlanningLoading.compositionBottom,
  },
  heading: {
    width: '100%',
    ...DS.typography.heading,
    color: C.text,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: DS.exception.quickPlanningLoading.subtitleTop,
    ...DS.typography.bodyCompact,
    color: C.textSub,
    textAlign: 'center',
  },
  mascotStage: { width: '100%', height: 155, marginTop: DS.exception.quickPlanningLoading.mascotTop, position: 'relative' },
  mascot: { position: 'absolute' },
  bubble: {
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: DS.exception.quickPlanningLoading.bubbleTop,
    borderRadius: DS.radius.input,
    borderWidth: 1,
    borderColor: C.pinkBorder,
    backgroundColor: C.pinkLight,
    paddingHorizontal: DS.exception.quickPlanningLoading.bubblePaddingHorizontal,
  },
  bubbleText: {
    ...DS.typography.body,
    color: C.pinkDeep,
    textAlign: 'center',
  },
  bubbleTextStack: { ...StyleSheet.absoluteFillObject, justifyContent: 'center' },
  bubbleTextLayer: { position: 'absolute', left: DS.exception.quickPlanningLoading.bubblePaddingHorizontal, right: DS.exception.quickPlanningLoading.bubblePaddingHorizontal },
  progressSemantics: { width: '100%', marginTop: DS.exception.quickPlanningLoading.progressTop },
  conditionsCard: {
    height: 104,
    width: '100%',
    justifyContent: 'flex-start',
    marginTop: DS.exception.quickPlanningLoading.conditionsTop,
    paddingHorizontal: DS.spacing.lg,
    paddingVertical: DS.spacing.lg,
    gap: DS.exception.quickPlanningLoading.conditionsGap,
    borderRadius: DS.radius.card,
    borderWidth: 1,
    borderColor: C.borderLight,
    backgroundColor: C.white,
  },
  conditionsTitle: { ...DS.typography.cardTitle, color: C.text },
  conditionMetaRow: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: DS.exception.quickPlanningLoading.conditionMetaGap },
  conditionGroup: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: DS.exception.quickPlanningLoading.conditionGroupGap },
  conditionTimeGroup: { flex: 1 },
  conditionValue: { flexShrink: 1, ...DS.typography.bodySmall, color: C.textSub },
  statusRow: { height: DS.exception.quickPlanningLoading.statusHeight, width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: DS.exception.quickPlanningLoading.statusTop },
  statusTextStack: { flex: 1, height: DS.exception.quickPlanningLoading.statusHeight, position: 'relative' },
  statusText: { ...DS.typography.bodyCompact, color: C.pink },
  statusTextLayer: { position: 'absolute', left: 0, top: 0 },
  percentText: { ...DS.typography.bodyLarge, color: C.pink, fontWeight: '600' },
  track: { width: '100%', height: 8, overflow: 'hidden', marginTop: DS.spacing.md, borderRadius: DS.radius.full, backgroundColor: C.pinkLight },
  fill: { height: '100%', borderRadius: DS.radius.full, backgroundColor: C.pink },
});
