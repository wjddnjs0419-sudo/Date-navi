import { Tabs } from 'expo-router';
import { Home, Sparkles, Heart, Mail, Image as ImageIcon } from 'lucide-react-native';
import { C } from '../../constants/colors';

export default function TabsLayout() {
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
          height: 84,
          paddingBottom: 24,
          paddingTop: 10,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '500' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '홈',
          tabBarIcon: ({ focused, color }) => (
            <Home size={20} color={color} strokeWidth={focused ? 2.4 : 1.8} />
          ),
        }}
      />
      <Tabs.Screen
        name="mode"
        options={{
          title: '모드',
          tabBarIcon: ({ focused, color }) => (
            <Sparkles size={20} color={color} strokeWidth={focused ? 2.4 : 1.8} />
          ),
        }}
      />
      <Tabs.Screen
        name="candidates"
        options={{
          title: '우리 후보',
          tabBarIcon: ({ focused, color }) => (
            <Heart size={20} color={color} strokeWidth={focused ? 2.4 : 1.8} />
          ),
        }}
      />
      <Tabs.Screen
        name="soft-message"
        options={{
          title: '마음 전하기',
          tabBarIcon: ({ focused, color }) => (
            <Mail size={20} color={color} strokeWidth={focused ? 2.4 : 1.8} />
          ),
        }}
      />
      <Tabs.Screen
        name="memories"
        options={{
          title: '추억',
          tabBarIcon: ({ focused, color }) => (
            <ImageIcon size={20} color={color} strokeWidth={focused ? 2.4 : 1.8} />
          ),
        }}
      />
    </Tabs>
  );
}
