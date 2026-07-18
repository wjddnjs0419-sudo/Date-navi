import { Tabs, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, Sparkles, Heart, Image as ImageIcon } from 'lucide-react-native';
import { C } from '../../constants/theme';
import { useI18n } from '../../lib/i18n';
import { ENABLED_DATE_MODE_IDS, PRIMARY_DATE_MODE_ROUTE } from '../../lib/dateModes';

export default function TabsLayout() {
  // 홈 인디케이터가 있는 기기는 인셋만큼 탭바를 키워 라벨이 가려지지 않게 하고,
  // 인셋이 없는 기기(SE·Android)는 최소 12로 유지해 콘텐츠 높이(50)를 동일하게 맞춘다.
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const router = useRouter();
  const bottomPad = Math.max(insets.bottom, 12);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.text,
        tabBarInactiveTintColor: C.textLight,
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: '#EFE5DA',
          backgroundColor: 'rgba(255,255,255,0.97)',
          height: 60 + bottomPad,
          paddingBottom: bottomPad,
          paddingTop: 10,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '500' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ focused, color }) => (
            <Home size={20} color={color} strokeWidth={focused ? 2.4 : 1.8} />
          ),
        }}
      />
      <Tabs.Screen
        name="mode"
        options={{
          title: t('tabs.mode'),
          tabBarIcon: ({ focused, color }) => (
            <Sparkles size={20} color={color} strokeWidth={focused ? 2.4 : 1.8} />
          ),
        }}
        // 활성 모드가 1개면 선택 화면을 건너뛰고 그 모드로 직행한다 (복원 시 자동 해제).
        listeners={
          ENABLED_DATE_MODE_IDS.length === 1
            ? {
                tabPress: (e) => {
                  e.preventDefault();
                  // navigate는 동일 라우트 연속 진입을 dedupe해 더블탭 중복 스택을 막는다.
                  router.navigate(PRIMARY_DATE_MODE_ROUTE as any);
                },
              }
            : undefined
        }
      />
      <Tabs.Screen
        name="candidates"
        options={{
          title: t('tabs.candidates'),
          tabBarIcon: ({ focused, color }) => (
            <Heart size={20} color={color} strokeWidth={focused ? 2.4 : 1.8} />
          ),
        }}
      />
      <Tabs.Screen
        name="memories"
        options={{
          title: t('tabs.memories'),
          tabBarIcon: ({ focused, color }) => (
            <ImageIcon size={20} color={color} strokeWidth={focused ? 2.4 : 1.8} />
          ),
        }}
      />
    </Tabs>
  );
}
