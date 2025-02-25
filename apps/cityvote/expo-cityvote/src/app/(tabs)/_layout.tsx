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
import NavBar from '../_nav';

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
          tabBarIcon: () => (
            <Home  />
          ),
          headerLeft: () => <NavBar />,
        }}
      />
      <Tabs.Screen
        name="support"
        options={{
          title: 'Support',
          tabBarIcon: () => (
            <HelpingHand  />
          ),
          headerLeft: () => <NavBar />,
        }}
      />
      <Tabs.Screen
        name="services"
        options={{
          title: 'Services',
          tabBarIcon: () => (
            <DollarSign  />
          ),
          headerLeft: () => <NavBar />,
        }}
      />
      <Tabs.Screen
        name="about"
        options={{
          title: 'About',
          tabBarIcon: () => (
            <Fish />
          ),
          headerLeft: () => <NavBar />,
        }}
      />
      <Tabs.Screen
        name="projects"
        options={{
          title: 'Projects',
          tabBarIcon: () => (
            <PackagePlus  />
          ),
          headerLeft: () => <NavBar />,
        }}
      />
    </Tabs>
  );
}