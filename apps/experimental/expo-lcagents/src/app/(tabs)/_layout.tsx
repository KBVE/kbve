import { Link, Tabs } from 'expo-router';
import { Pressable } from 'react-native';
import { Text, useTheme } from 'tamagui';
import {
  Home,
  HelpingHand,
  DollarSign,
  Fish,
  PackagePlus,
  MenuSquare,
} from '@tamagui/lucide-icons';
import { NavBar } from '../_nav';

export default function TabLayout() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: 'cyan',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'LC',
          tabBarIcon: ({ color }) => (
            <Home color={color === 'cyan' ? theme.cyan10 : theme.gray10} />
          ),
          headerLeft: () => <NavBar />,
        }}
      />
      <Tabs.Screen
        name="support"
        options={{
          title: 'Support',
          tabBarIcon: ({ color }) => (
            <HelpingHand color={color === 'cyan' ? theme.cyan10 : theme.gray10} />
          ),
          headerLeft: () => <NavBar />,
        }}
      />
      <Tabs.Screen
        name="services"
        options={{
          title: 'Services',
          tabBarIcon: ({ color }) => (
            <DollarSign color={color === 'cyan' ? theme.cyan10 : theme.gray10} />
          ),
          headerLeft: () => <NavBar />,
        }}
      />
      <Tabs.Screen
        name="about"
        options={{
          title: 'About',
          tabBarIcon: ({ color }) => (
            <Fish color={color === 'cyan' ? theme.cyan10 : theme.gray10} />
          ),
          headerLeft: () => <NavBar />,
        }}
      />
      <Tabs.Screen
        name="projects"
        options={{
          title: 'Projects',
          tabBarIcon: ({ color }) => (
            <PackagePlus color={color === 'cyan' ? theme.cyan10 : theme.gray10} />
          ),
          headerLeft: () => <NavBar />,
        }}
      />
    </Tabs>
  );
}