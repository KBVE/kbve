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


import { NavBar } from '../_nav';

export const TabLayout = () => {
	return (
		<Tabs
			screenOptions={{
				tabBarActiveTintColor: 'cyan',
			}}>
			<Tabs.Screen
				name="index"
				options={{
					title: 'LC',
					tabBarIcon: ({ color }) => <Home />,
					headerLeft: () => (
						<NavBar />
					),
				}}
			/>
			<Tabs.Screen
				name="support"
				options={{
					title: 'Support',
					tabBarIcon: ({ color }) => <HelpingHand  />,
					headerLeft: () => (
						<NavBar />
					),
				}}
			/>
			<Tabs.Screen
				name="services"
				options={{
					title: 'Services',
					tabBarIcon: ({ color }) => <DollarSign />,
					headerLeft: () => (
						<NavBar />
					),
				}}
			/>
			<Tabs.Screen
				name="about"
				options={{
					title: 'About',
					tabBarIcon: ({ color }) => <Fish />,
					headerLeft: () => (
						<NavBar />
					),
				}}
			/>
     
		</Tabs>
	);
}

export default TabLayout