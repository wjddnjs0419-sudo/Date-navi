import { useEffect, useMemo, useRef, useState } from 'react';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Calendar, Check, Clock3, Zap } from 'lucide-react-native';
import {
  Modal,
  Pressable,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { C, R, SP } from '../../constants/theme';
import {
  getQuickMeetingTime,
  type CourseMeetingTime,
  type CourseQuickMeetingTime,
} from '../../lib/course-draft';
import type { RecommendationLanguage } from '../../shared/recommendation/contracts';

type Translate = (key: string, values?: Record<string, unknown>) => string;

type Props = {
  value?: CourseMeetingTime;
  onChange: (value: CourseMeetingTime) => void;
  language: RecommendationLanguage;
  t: Translate;
};

function pad(value: number) {
  return String(value).padStart(2, '0');
}

export function formatMeetingTime(value: CourseMeetingTime | undefined, language: RecommendationLanguage, t: Translate) {
  if (!value || value.kind === 'now') return t('course.time.now.title');
  if (value.kind === 'tonight') return t('course.time.tonight.title');
  const date = new Date(value.startsAt);
  return language === 'en'
    ? `${date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
    : `${date.getMonth() + 1}월 ${date.getDate()}일 ${date.toLocaleDateString('ko-KR', { weekday: 'long' })} · ${date.getHours() >= 12 ? '오후' : '오전'} ${date.getHours() % 12 || 12}:${pad(date.getMinutes())}`;
}

function formatCustomDate(value: string, language: RecommendationLanguage) {
  const date = new Date(value);
  return language === 'en'
    ? date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : `${date.getMonth() + 1}월 ${date.getDate()}일 ${date.toLocaleDateString('ko-KR', { weekday: 'long' })}`;
}

function formatCustomClock(value: string, language: RecommendationLanguage) {
  const date = new Date(value);
  return language === 'en'
    ? date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : `${date.getHours() >= 12 ? '오후' : '오전'} ${date.getHours() % 12 || 12}:${pad(date.getMinutes())}`;
}

export const MEETING_TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => index * 30);
const TIME_CHIP_WIDTH = 58;
const TIME_CHIP_GAP = 0;

function isSameCalendarDate(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function nextHalfHourMinutes(now: Date) {
  const currentMinutes = (now.getHours() * 60) + now.getMinutes() + (now.getSeconds() > 0 ? 1 : 0);
  return Math.ceil(currentMinutes / 30) * 30;
}

export function getMeetingTimeOptions(date: Date, now = new Date()) {
  if (!isSameCalendarDate(date, now)) return MEETING_TIME_OPTIONS;
  const firstAvailable = nextHalfHourMinutes(now);
  return MEETING_TIME_OPTIONS.filter((minutes) => minutes >= firstAvailable);
}

export function getDefaultMeetingDate(now = new Date()) {
  const next = new Date(now);
  const minutes = nextHalfHourMinutes(now);
  next.setSeconds(0, 0);
  if (minutes >= 24 * 60) {
    next.setDate(next.getDate() + 1);
    next.setHours(0, 0, 0, 0);
  } else {
    next.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  }
  return next;
}

function dateForMeetingTime(value?: CourseMeetingTime): Date {
  return value?.kind === 'custom' ? new Date(value.startsAt) : getDefaultMeetingDate();
}

function withDatePart(base: Date, selected: Date) {
  const next = new Date(base);
  next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
  next.setSeconds(0, 0);
  return next;
}

function formatTimeChip(minutes: number) {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

export function CourseTimeSelector({ value, onChange, language, t }: Props) {
  const [sheetVisible, setSheetVisible] = useState(false);
  const [androidPickerMode, setAndroidPickerMode] = useState<'date' | 'time' | null>(null);
  const [draftDate, setDraftDate] = useState(() => dateForMeetingTime(value));
  const timeScrollRef = useRef<ScrollView>(null);

  const customSelected = value?.kind === 'custom';
  const meetingTimeOptions = useMemo(() => getMeetingTimeOptions(draftDate), [draftDate]);
  const quickOptions: Array<{ key: CourseQuickMeetingTime; label: string; testID: string }> = useMemo(() => [
    { key: 'today-18', label: t('course.time.quick.today18'), testID: 'course-quick-time-today-18' },
    { key: 'today-19', label: t('course.time.quick.today19'), testID: 'course-quick-time-today-19' },
    { key: 'weekend-afternoon', label: t('course.time.quick.weekendAfternoon'), testID: 'course-quick-time-weekend-afternoon' },
    { key: 'this-weekend', label: t('course.time.quick.thisWeekend'), testID: 'course-quick-time-this-weekend' },
  ], [t]);

  function openCustomSheet() {
    const nextDate = dateForMeetingTime(value);
    const options = getMeetingTimeOptions(nextDate);
    const selectedMinutes = nextDate.getHours() * 60 + nextDate.getMinutes();
    if (options.length > 0 && !options.includes(selectedMinutes)) {
      nextDate.setHours(Math.floor(options[0] / 60), options[0] % 60, 0, 0);
    }
    setDraftDate(nextDate);
    setAndroidPickerMode(Platform.OS === 'android' ? 'date' : null);
    setSheetVisible(true);
  }

  function onNativeDateChange(event: DateTimePickerEvent, date?: Date) {
    if (event.type === 'dismissed' || !date) {
      setAndroidPickerMode(null);
      return;
    }
    if (Platform.OS === 'ios') {
      setDraftDate((current) => {
        const next = withDatePart(current, date);
        const options = getMeetingTimeOptions(next);
        const selectedMinutes = next.getHours() * 60 + next.getMinutes();
        if (options.length > 0 && !options.includes(selectedMinutes)) {
          next.setHours(Math.floor(options[0] / 60), options[0] % 60, 0, 0);
        }
        return next;
      });
      return;
    }
    setDraftDate(date);
    if (Platform.OS === 'android' && androidPickerMode === 'date') {
      setAndroidPickerMode('time');
    } else if (Platform.OS === 'android' && androidPickerMode === 'time') {
      setAndroidPickerMode(null);
    }
  }

  function applyCustom() {
    onChange({ kind: 'custom', startsAt: draftDate.toISOString() });
    setSheetVisible(false);
  }

  function selectTime(minutes: number) {
    setDraftDate((current) => {
      const next = new Date(current);
      next.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
      return next;
    });
  }

  useEffect(() => {
    if (!sheetVisible) return undefined;
    const selectedIndex = meetingTimeOptions.indexOf(draftDate.getHours() * 60 + draftDate.getMinutes());
    if (selectedIndex < 0) return undefined;
    const timer = setTimeout(() => {
      timeScrollRef.current?.scrollTo({
        x: Math.max(0, (selectedIndex - 1) * (TIME_CHIP_WIDTH + TIME_CHIP_GAP)),
        animated: false,
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [draftDate, meetingTimeOptions, sheetVisible]);

  const selectedTimeMinutes = draftDate.getHours() * 60 + draftDate.getMinutes();

  return (
    <View style={styles.container} testID="course-time-selector">
      <View style={styles.choiceList}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ selected: value?.kind === 'now' }}
          onPress={() => onChange({ kind: 'now' })}
          style={[styles.choice, value?.kind === 'now' && styles.choiceSelected]}
          testID="course-meeting-time-now"
        >
          <View style={styles.choiceTitle}><Zap size={18} color={value?.kind === 'now' ? C.pinkDeep : C.textSub} /><Text style={styles.choiceTitleText}>{t('course.time.now.title')}</Text></View>
          <Text style={styles.choiceDescription}>{t('course.time.now.description')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ selected: value?.kind === 'tonight' }}
          onPress={() => onChange({ kind: 'tonight' })}
          style={[styles.choice, value?.kind === 'tonight' && styles.choiceSelected]}
          testID="course-meeting-time-tonight"
        >
          <View style={styles.choiceTitle}><Clock3 size={18} color={value?.kind === 'tonight' ? C.pinkDeep : C.textSub} /><Text style={styles.choiceTitleText}>{t('course.time.tonight.title')}</Text></View>
          <Text style={styles.choiceDescription}>{t('course.time.tonight.description')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ selected: customSelected }}
          onPress={openCustomSheet}
          style={[styles.choice, customSelected && styles.choiceSelected]}
          testID="course-meeting-time-custom"
        >
          <View style={styles.choiceTitle}><Calendar size={18} color={customSelected ? C.pinkDeep : C.textSub} /><Text style={styles.choiceTitleText}>{t('course.time.custom.title')}</Text></View>
          {customSelected && value.kind === 'custom' ? (
            <View style={styles.customValue}>
              <Text style={styles.choiceDescriptionStrong}>{formatCustomDate(value.startsAt, language)}</Text>
              <Text style={styles.choiceDescriptionAccent}>{formatCustomClock(value.startsAt, language)}</Text>
              <Text style={styles.choiceDescription}>{t('course.time.custom.selectedDescription')}</Text>
            </View>
          ) : <Text style={styles.choiceDescription}>{t('course.time.custom.description')}</Text>}
          {customSelected && <Check size={22} color={C.pink} style={styles.choiceCheck} />}
        </TouchableOpacity>
      </View>

      <Text style={styles.quickTitle}>{t('course.time.quick.title')}</Text>
      <View style={styles.quickWrap}>
        {quickOptions.map((option) => (
          <TouchableOpacity
            key={option.key}
            accessibilityRole="button"
            onPress={() => onChange(getQuickMeetingTime(option.key))}
            style={styles.quickChip}
            testID={option.testID}
          >
            <Text style={styles.quickText}>{option.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Modal visible={sheetVisible} transparent animationType="slide" onRequestClose={() => setSheetVisible(false)}>
        <View style={styles.modalWrap}>
          <Pressable testID="course-time-sheet-backdrop" style={styles.backdrop} onPress={() => setSheetVisible(false)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{t('course.time.custom.sheetTitle')}</Text>
            </View>
            {Platform.OS === 'ios' ? (
              <DateTimePicker
                value={draftDate}
                mode="date"
                display="inline"
                minimumDate={new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())}
                onChange={onNativeDateChange}
                locale={language === 'en' ? 'en-US' : 'ko-KR'}
                accentColor={C.pink}
                style={styles.picker}
                testID="course-native-datetime-picker"
              />
            ) : androidPickerMode ? (
              <DateTimePicker
                value={draftDate}
                mode={androidPickerMode}
                display={androidPickerMode === 'date' ? 'calendar' : 'clock'}
                minimumDate={new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())}
                onChange={onNativeDateChange}
                minuteInterval={30}
                is24Hour
                style={styles.picker}
                testID="course-native-datetime-picker"
              />
            ) : null}
            <View style={styles.timeSection}>
              <Text style={styles.timeLabel}>{t('course.time.custom.timeLabel')}</Text>
              <ScrollView
                ref={timeScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.timeChipContent}
                testID="course-time-chip-scroll"
              >
                {meetingTimeOptions.map((minutes) => {
                  const selected = selectedTimeMinutes === minutes;
                  return (
                    <TouchableOpacity
                      key={minutes}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => selectTime(minutes)}
                      style={[styles.timeChip, selected && styles.timeChipSelected]}
                      testID={`course-time-chip-${formatTimeChip(minutes).replace(':', '-')}`}
                    >
                      <Text style={[styles.timeChipText, selected && styles.timeChipTextSelected]}>{formatTimeChip(minutes)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
            <TouchableOpacity style={styles.applyButton} onPress={applyCustom} testID="course-time-apply">
              <Text style={styles.applyText}>{t('course.time.custom.apply')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: SP.md },
  choiceList: { gap: SP.sm },
  choice: { minHeight: 78, borderRadius: R.btn, borderWidth: 1, borderColor: C.pinkBorder, backgroundColor: C.white, padding: SP.lg, gap: SP.xs },
  choiceSelected: { backgroundColor: C.pinkLight, borderColor: C.pink },
  choiceTitle: { flexDirection: 'row', alignItems: 'center', gap: SP.sm },
  choiceTitleText: { color: C.text, fontSize: 15, fontWeight: '700' },
  choiceDescription: { color: C.textSub, fontSize: 12 },
  customValue: { gap: 2 },
  choiceDescriptionStrong: { color: C.text, fontSize: 13, fontWeight: '700' },
  choiceDescriptionAccent: { color: C.pinkDeep, fontSize: 12, fontWeight: '600' },
  choiceCheck: { position: 'absolute', right: SP.lg, top: 32 },
  quickTitle: { color: C.text, fontSize: 12, fontWeight: '700', marginTop: SP.lg },
  quickWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.sm },
  quickChip: { minHeight: 34, borderRadius: 17, borderWidth: 1, borderColor: C.pinkBorder, backgroundColor: C.white, justifyContent: 'center', paddingHorizontal: SP.md },
  quickText: { color: C.text, fontSize: 12, fontWeight: '600' },
  modalWrap: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(31, 31, 36, 0.28)' },
  sheet: { backgroundColor: C.white, borderTopLeftRadius: R.hero, borderTopRightRadius: R.hero, paddingHorizontal: SP.xl, paddingTop: SP.sm, paddingBottom: SP.lg },
  handle: { width: 44, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: SP.md },
  sheetHeader: { minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SP.md },
  sheetTitle: { color: C.text, fontSize: 15, fontWeight: '700' },
  picker: { width: '100%' },
  timeSection: { gap: SP.sm, marginTop: SP.lg },
  timeLabel: { color: C.text, fontSize: 12, lineHeight: 15, fontWeight: '700' },
  timeChipContent: { gap: TIME_CHIP_GAP, paddingRight: SP.sm },
  timeChip: { width: TIME_CHIP_WIDTH, minWidth: TIME_CHIP_WIDTH, flexShrink: 0, height: 30, borderRadius: 20, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 0 },
  timeChipSelected: { backgroundColor: C.pink, borderRadius: R.xl },
  timeChipText: { width: '100%', color: C.text, fontSize: 12, lineHeight: 18, fontWeight: '500', textAlign: 'center', fontVariant: ['tabular-nums'] },
  timeChipTextSelected: { color: C.white },
  applyButton: { minHeight: 52, borderRadius: R.btn, backgroundColor: C.pink, alignItems: 'center', justifyContent: 'center', marginTop: SP.lg },
  applyText: { color: C.white, fontSize: 15, fontWeight: '700' },
});
