import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { C, DS, G, SP } from '../../constants/theme';
import { CourseStepList, Header, ScreenHeading, SoftCard } from '../../components/ui';
import { useI18n } from '../../lib/i18n';
import { supabase } from '../../lib/supabase';
import {
  normalizeCourseShareToken,
  parseCourseShareDto,
  type CourseShareDto,
} from '../../lib/course-share';

type LoadState = 'loading' | 'ready' | 'missing';

export default function PublicCourseScreen() {
  const { shareToken } = useLocalSearchParams<{ shareToken?: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const [course, setCourse] = useState<CourseShareDto | null>(null);
  const [state, setState] = useState<LoadState>('loading');

  useEffect(() => {
    let disposed = false;
    const token = normalizeCourseShareToken(shareToken);

    if (!token) {
      setCourse(null);
      setState('missing');
      return () => { disposed = true; };
    }

    setState('loading');
    void (async () => {
      const { data, error } = await supabase.rpc('get_public_shared_course', {
        p_share_token: token,
      });
      if (disposed) return;

      const parsed = error ? null : parseCourseShareDto(data);
      setCourse(parsed);
      setState(parsed ? 'ready' : 'missing');
    })();

    return () => { disposed = true; };
  }, [shareToken]);

  return (
    <SafeAreaView style={G.screen} edges={['top']}>
      <Header onBack={() => router.back()} />
      <ScreenHeading
        title={t('share.public.heading')}
        subtitle={t('share.public.subText')}
      />
      {state === 'loading' ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={C.pink} />
          <Text style={styles.stateText}>{t('share.public.loading')}</Text>
        </View>
      ) : state === 'missing' || !course ? (
        <View style={styles.centerState}>
          <Text style={styles.stateText}>{t('share.public.notFound')}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <SoftCard style={styles.card}>
            <Text style={styles.title}>{course.title}</Text>
            {!!course.summary && <Text style={styles.summary}>{course.summary}</Text>}
            <View style={styles.stepsWrap}>
              <CourseStepList steps={course.steps} summary={course.summary} />
            </View>
            {(!!course.estimated_time || !!course.estimated_budget) && (
              <View style={styles.metaRow}>
                {!!course.estimated_time && <Text style={styles.meta}>{course.estimated_time}</Text>}
                {!!course.estimated_budget && <Text style={styles.meta}>{course.estimated_budget}</Text>}
              </View>
            )}
          </SoftCard>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SP.md, padding: SP.screen },
  stateText: { ...DS.typography.body, color: C.textSub, textAlign: 'center' },
  content: { paddingHorizontal: SP.screen, paddingTop: SP.xxl, paddingBottom: SP.xxxl },
  card: { padding: SP.lg },
  title: { ...DS.typography.heading, color: C.text },
  summary: { ...DS.typography.body, color: C.textSub, marginTop: SP.sm },
  stepsWrap: { marginTop: SP.lg },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.sm, marginTop: SP.lg },
  meta: {
    ...DS.typography.bodyCompact,
    color: C.textSub,
    backgroundColor: C.pinkLight,
    borderRadius: DS.radius.full,
    paddingHorizontal: SP.md,
    paddingVertical: SP.xs,
  },
});
