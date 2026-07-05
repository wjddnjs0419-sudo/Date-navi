import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, Sparkles, Heart, Mail, Image as ImageIcon } from 'lucide-react-native';
import { C } from '../../constants/theme';
import { useI18n } from '../../lib/i18n';

export default function TabsLayout() {
  // 홈 인디케이터가 있는 기기는 인셋만큼 탭바를 키워 라벨이 가려지지 않게 하고,
  // 인셋이 없는 기기(SE·Android)는 최소 12로 유지해 콘텐츠 높이(50)를 동일하게 맞춘다.
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
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
        name="soft-message"
        options={{
          title: t('tabs.softMessage'),
          tabBarIcon: ({ focused, color }) => (
            <Mail size={20} color={color} strokeWidth={focused ? 2.4 : 1.8} />
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
