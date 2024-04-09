import { Link, Tabs } from 'expo-router';
import { Pressable } from 'react-native';
import { Text } from 'tamagui';
import {
	Home,
	HelpingHand,
	DollarSign,
	Fish,
	MenuSquare,
} from '@tamagui/lucide-icons';

export default function TabLayout() {
	return (
		<Tabs
			screenOptions={{
				tabBarActiveTintColor: 'cyan',
			}}>
			<Tabs.Screen
				name="index"
				options={{
					title: 'LC',
					tabBarIcon: ({ color }) => <Home color="cyan" />,
					headerLeft: () => (
						<Link href="/menu" asChild>
							<Pressable>
								<MenuSquare color="cyan" padding="$4" />
							</Pressable>
						</Link>
					),
				}}
			/>
			<Tabs.Screen
				name="support"
				options={{
					title: 'Support',
					tabBarIcon: ({ color }) => <HelpingHand color="cyan" />,
					headerLeft: () => (
						<Link href="/menu" asChild>
							<Pressable>
								<MenuSquare color="cyan" padding="$4" />
							</Pressable>
						</Link>
					),
				}}
			/>
			<Tabs.Screen
				name="services"
				options={{
					title: 'Services',
					tabBarIcon: ({ color }) => <DollarSign color="cyan" />,
					headerLeft: () => (
						<Link href="/menu" asChild>
							<Pressable>
								<MenuSquare color="cyan" padding="$4" />
							</Pressable>
						</Link>
					),
				}}
			/>
			<Tabs.Screen
				name="about"
				options={{
					title: 'About',
					tabBarIcon: ({ color }) => <Fish color="cyan" />,
					headerLeft: () => (
						<Link href="/menu" asChild>
							<Pressable>
								<MenuSquare color="cyan" padding="$4" />
							</Pressable>
						</Link>
					),
				}}
			/>
     
		</Tabs>
	);
}
