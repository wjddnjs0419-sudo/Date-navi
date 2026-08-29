import { Tabs, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, DS } from '../../constants/theme';
import { BottomTab } from '../../components/ui';
import { useI18n } from '../../lib/i18n';
import { ENABLED_DATE_MODE_IDS, PRIMARY_DATE_MODE_ROUTE } from '../../lib/dateModes';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const router = useRouter();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.pink,
        tabBarInactiveTintColor: C.textLight,
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: DS.color.tabBorder,
          backgroundColor: DS.color.tabSurface,
          height: DS.spacing.tab + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: DS.spacing.sm,
        },
        tabBarLabelStyle: { ...DS.typography.caption },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ focused, color }) => <BottomTab icon="home" focused={focused} color={color} />,
        }}
      />
      <Tabs.Screen
        name="mode"
        options={{
          title: t('tabs.mode'),
          tabBarIcon: ({ focused, color }) => <BottomTab icon="sparkles" focused={focused} color={color} />,
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
          tabBarIcon: ({ focused, color }) => <BottomTab icon="heart" focused={focused} color={color} />,
        }}
      />
      <Tabs.Screen
        name="memories"
        options={{
          title: t('tabs.memories'),
          tabBarIcon: ({ focused, color }) => <BottomTab icon="image" focused={focused} color={color} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: t('tabs.account'),
          tabBarIcon: ({ focused, color }) => <BottomTab icon="user" focused={focused} color={color} />,
        }}
      />
    </Tabs>
  );
}
