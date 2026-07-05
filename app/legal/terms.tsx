import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { C } from '../../constants/colors';
import { useI18n } from '../../lib/i18n';

export default function TermsScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const sections = t('legal.terms.sections', { returnObjects: true }) as { title: string; body: string }[];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('legal.terms.title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.updated}>{t('legal.terms.updated')}</Text>

        {sections.map((section) => (
          <View key={section.title}>
            <Text style={styles.section}>{section.title}</Text>
            <Text style={styles.body}>{section.body}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.white },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backText: { fontSize: 24, color: '#333' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: C.ink },
  headerSpacer: { width: 32 },
  scroll: { flex: 1 },
  content: { padding: 24, paddingBottom: 60 },
  updated: { fontSize: 12, color: C.coolGrayLight, marginBottom: 24 },
  section: { fontSize: 16, fontWeight: '700', color: C.ink, marginTop: 20, marginBottom: 8 },
  body: { fontSize: 14, color: C.coolGray, lineHeight: 22 },
});
