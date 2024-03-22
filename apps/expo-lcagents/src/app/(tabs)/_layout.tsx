import { Link, Tabs } from 'expo-router'
import { Pressable } from 'react-native'
import { Text } from 'tamagui'
import { Home, HelpingHand, DollarSign, Fish, MenuSquare} from '@tamagui/lucide-icons'


export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: 'white',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'LC Agents App Example',
          tabBarIcon: ({ color }) =>  <Home color="cyan" />,
          headerRight: () => (
            <Link href="/modal" asChild>
              <Pressable>
                <MenuSquare color="cyan"  padding="$4" />
              </Pressable>
            </Link>
          ),
        }}
      />
      <Tabs.Screen
        name="two"
        options={{
          title: 'Support',
          tabBarIcon: ({ color }) => <HelpingHand color="cyan" />,
          headerRight: () => (
            <Link href="/modal" asChild>
              <Pressable>
                <MenuSquare color="cyan" padding="$4" />
              </Pressable>
            </Link>
          ),
        }}
      />
      <Tabs.Screen
        name="three"
        options={{
          title: 'Services',
          tabBarIcon: ({ color }) => <DollarSign color="cyan" />,
          headerRight: () => (
            <Link href="/modal" asChild>
              <Pressable>
                <MenuSquare color="cyan" padding="$4" />
              </Pressable>
            </Link>
          ),
        }}
      />
        <Tabs.Screen
        name="four"
        options={{
          title: 'Fish&Chip',
          tabBarIcon: ({ color }) => <Fish color="cyan" />,
          headerRight: () => (
            <Link href="/modal" asChild>
              <Pressable>
                <MenuSquare color="cyan" padding="$4" />
              </Pressable>
            </Link>
          ),
        }}
      />
    </Tabs>
  )
}