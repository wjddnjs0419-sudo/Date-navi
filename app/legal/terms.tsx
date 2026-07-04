import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { C } from '../../constants/colors';
import { useI18n } from '../../lib/i18n';

export default function TermsScreen() {
  const router = useRouter();
  const { language } = useI18n();

  const copy = language === 'ko'
    ? {
        title: '이용약관',
        updated: '최종 수정일: 2026년 5월 23일',
        sections: [
          {
            title: '1. 서비스 개요',
            body: 'DateMate(이하 \'서비스\')는 커플의 데이트 계획 부담을 줄이고, 서로의 취향을 편하게 표현하도록 돕는 앱입니다.',
          },
          {
            title: '2. 서비스 이용',
            body: '- 만 14세 이상의 누구나 가입할 수 있습니다.\n- 1인 1계정 원칙입니다.\n- 가입 시 제공한 정보는 사실과 일치해야 합니다.',
          },
          {
            title: '3. 금지 행위',
            body: '아래 행위는 금지됩니다.\n\n- 타인의 정보를 도용하거나 허위 정보로 가입하는 행위\n- 서비스를 이용해 타인에게 피해를 주는 행위\n- 서비스의 정상적인 운영을 방해하는 행위\n- 영리 목적의 상업적 이용',
          },
          {
            title: '4. AI 추천 면책',
            body: '서비스가 제공하는 데이트 후보 및 추천 문장은 AI가 생성한 참고 자료입니다.\n추천 결과의 정확성, 안전성에 대해 서비스는 보증하지 않으며, 최종 판단은 사용자에게 있습니다.',
          },
          {
            title: '5. 서비스 변경 및 중단',
            body: '서비스는 운영 정책에 따라 사전 공지 후 기능을 변경하거나 종료할 수 있습니다.',
          },
          {
            title: '6. 계정 해지',
            body: '사용자는 언제든지 계정을 삭제할 수 있습니다.\n계정 삭제 시 모든 데이터가 즉시 삭제됩니다.',
          },
          {
            title: '7. 문의',
            body: '서비스 이용 관련 문의사항은 아래로 연락해주세요.\n\n이메일: jake051096@gmail.com',
          },
        ],
      }
    : {
        title: 'Terms of Service',
        updated: 'Last updated: May 23, 2026',
        sections: [
          {
            title: '1. Service overview',
            body: 'DateMate is an app that helps couples reduce the burden of planning dates and express their preferences more comfortably.',
          },
          {
            title: '2. Using the service',
            body: '- Anyone aged 14 or older can sign up.\n- One account per person.\n- The information you provide when signing up must be accurate.',
          },
          {
            title: '3. Prohibited behavior',
            body: 'The following behavior is not allowed:\n\n- Using someone else’s information or signing up with false information\n- Using the service to harm others\n- Interfering with the normal operation of the service\n- Using the service for commercial purposes',
          },
          {
            title: '4. AI recommendation disclaimer',
            body: 'The date suggestions and message recommendations provided by the service are AI-generated references.\nWe do not guarantee the accuracy or safety of the recommendations, and the final decision is up to the user.',
          },
          {
            title: '5. Service changes and suspension',
            body: 'We may change or discontinue features after prior notice according to our operating policies.',
          },
          {
            title: '6. Account deletion',
            body: 'You may delete your account at any time.\nWhen the account is deleted, all data is removed immediately.',
          },
          {
            title: '7. Contact',
            body: 'For questions about using the service, please contact us at:\n\nEmail: jake051096@gmail.com',
          },
        ],
      };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{copy.title}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.updated}>{copy.updated}</Text>

        {copy.sections.map((section) => (
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
