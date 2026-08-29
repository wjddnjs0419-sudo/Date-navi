import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { C } from '../../constants/colors';
import { DS, G, SP } from '../../constants/theme';
import { Header, ScreenHeading } from '../../components/ui';
import { useI18n } from '../../lib/i18n';

export default function PrivacyScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const sections = t('legal.privacy.sections', { returnObjects: true }) as { title: string; body: string }[];

  return (
    <SafeAreaView style={G.screen} edges={['top']}>
      <Header onBack={() => router.back()} />
      <ScreenHeading title={t('legal.privacy.title')} />

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
  scroll: { flex: 1 },
  content: { paddingHorizontal: SP.screen, paddingTop: SP.xxl, paddingBottom: SP.tab },
  updated: { ...DS.typography.bodySmall, color: C.textMuted, marginBottom: SP.xxl },
  section: { ...DS.typography.bodyLarge, fontWeight: '700', color: C.text, marginTop: SP.xxl, marginBottom: SP.sm },
  body: { ...DS.typography.body, color: C.textSub },
});
