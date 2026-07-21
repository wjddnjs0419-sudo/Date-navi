import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C } from '../../constants/colors';
import { G, SP, T } from '../../constants/theme';
import { BackBar } from '../../components/ui';
import { useI18n } from '../../lib/i18n';

export default function PrivacyScreen() {
  const { t } = useI18n();
  const sections = t('legal.privacy.sections', { returnObjects: true }) as { title: string; body: string }[];

  return (
    <SafeAreaView style={G.screen} edges={['top']}>
      <View style={styles.header}>
        <BackBar largeTouchTarget />
        <Text style={[T.h1, styles.headerTitle]}>{t('legal.privacy.title')}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.updated}>{t('legal.privacy.updated')}</Text>

        {sections.map((section) => (
          <View key={section.title}>
            <Text style={styles.section}>{section.title}</Text>
            <Text style={styles.body}>
              {section.body}
            </Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: SP.xl, paddingTop: SP.md },
  headerTitle: { marginTop: SP.sm },
  scroll: { flex: 1 },
  content: { paddingHorizontal: SP.xl, paddingTop: SP.lg, paddingBottom: 60 },
  updated: { fontSize: 12, color: C.textMuted, marginBottom: SP.xxl },
  section: { fontSize: 16, fontWeight: '700', color: C.text, marginTop: SP.xxl, marginBottom: SP.sm },
  body: { fontSize: 14, color: C.textSub, lineHeight: 22 },
});
