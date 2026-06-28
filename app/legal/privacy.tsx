import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useI18n } from '../../lib/i18n';

export default function PrivacyScreen() {
  const router = useRouter();
  const { language } = useI18n();

  const copy = language === 'ko'
    ? {
        title: '개인정보처리방침',
        updated: '최종 수정일: 2026년 5월 23일',
        sections: [
          {
            title: '1. 수집하는 개인정보',
            body: [
              'DateMate는 서비스 제공을 위해 아래 정보를 수집합니다.',
              '- 이메일 주소 (회원가입 및 로그인)',
              '- 닉네임 (서비스 내 표시명)',
              '- 커플 취향 정보 (선호 분위기, 피하고 싶은 조건 등)',
              '- 데이트 카드 및 반응 기록',
              '- 서비스 이용 이벤트 로그',
            ],
          },
          {
            title: '2. 개인정보 이용 목적',
            body: [
              '수집한 정보는 다음 목적으로만 이용합니다.',
              '- 커플 매칭 및 데이트 추천 서비스 제공',
              '- AI 기반 맞춤 데이트 후보 생성',
              '- 서비스 품질 개선 및 이용 통계',
            ],
          },
          {
            title: '3. 개인정보 보관 기간',
            body: [
              '회원 탈퇴 시 모든 개인정보를 즉시 삭제합니다.',
              '단, 관계 법령에 따라 보관이 필요한 경우에는 해당 기간 동안 보관합니다.',
            ],
          },
          {
            title: '4. 제3자 제공',
            body: [
              '사용자의 개인정보를 제3자에게 제공하지 않습니다.',
              '단, 데이트 후보 생성을 위해 Anthropic Claude AI API를 활용합니다.',
              '입력값 (컨디션, 예산 등 조건 정보)이 API에 전달되며, 이름·이메일 등 식별 정보는 전달되지 않습니다.',
            ],
          },
          {
            title: '5. 사용자 권리',
            body: [
              '사용자는 언제든지 본인의 개인정보 조회, 수정, 삭제를 요청할 수 있습니다.',
              '커플 연결 해제 시 공유 데이터를 삭제하는 옵션을 제공합니다.',
            ],
          },
          {
            title: '6. 문의',
            body: ['개인정보 관련 문의사항은 아래로 연락해주세요.', '이메일: jake051096@gmail.com'],
          },
        ],
      }
    : {
        title: 'Privacy Policy',
        updated: 'Last updated: May 23, 2026',
        sections: [
          {
            title: '1. Information we collect',
            body: [
              'DateMate collects the following data to provide the service:',
              '- Email address (sign up and login)',
              '- Nickname (display name inside the app)',
              '- Couple preference data (favorite vibes, avoid conditions, and more)',
              '- Date cards and reaction history',
              '- Service usage event logs',
            ],
          },
          {
            title: '2. How we use your information',
            body: [
              'We only use the collected information for the following purposes:',
              '- Couple matching and date recommendation features',
              '- AI-powered personalized date suggestions',
              '- Service quality improvements and usage analytics',
            ],
          },
          {
            title: '3. Retention period',
            body: [
              'When you delete your account, we remove your personal information immediately.',
              'If local laws require us to retain some data, we keep it for the required period.',
            ],
          },
          {
            title: '4. Third-party sharing',
            body: [
              'We do not share your personal information with third parties.',
              'However, we use the Anthropic Claude AI API to generate date suggestions.',
              'Only the input conditions (such as energy and budget) are sent. Identifiers such as name or email are not sent.',
            ],
          },
          {
            title: '5. Your rights',
            body: [
              'You may request access, correction, or deletion of your personal information at any time.',
              'We also provide an option to delete shared data when you disconnect the couple link.',
            ],
          },
          {
            title: '6. Contact',
            body: ['For privacy-related questions, please contact us at:', 'Email: jake051096@gmail.com'],
          },
        ],
      };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{copy.title}</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.updated}>{copy.updated}</Text>

        {copy.sections.map((section) => (
          <View key={section.title}>
            <Text style={styles.section}>{section.title}</Text>
            <Text style={styles.body}>
              {section.body.join('\n')}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backText: { fontSize: 24, color: '#333' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A1A' },
  scroll: { flex: 1 },
  content: { padding: 24, paddingBottom: 60 },
  updated: { fontSize: 12, color: '#9CA3AF', marginBottom: 24 },
  section: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', marginTop: 20, marginBottom: 8 },
  body: { fontSize: 14, color: '#6B7280', lineHeight: 22 },
});
