import { Tabs } from 'expo-router';
import {
	Home,
	HelpingHand,
	DollarSign,
	Fish} from '@tamagui/lucide-icons';


import NavBar  from '../_nav';

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
					tabBarIcon: () => <Home />,
					headerLeft: () => (
						<NavBar />
					),
				}}
			/>
			<Tabs.Screen
				name="support"
				options={{
					title: 'Support',
					tabBarIcon: () => <HelpingHand  />,
					headerLeft: () => (
						<NavBar />
					),
				}}
			/>
			<Tabs.Screen
				name="services"
				options={{
					title: 'Services',
					tabBarIcon: () => <DollarSign />,
					headerLeft: () => (
						<NavBar />
					),
				}}
			/>
			<Tabs.Screen
				name="about"
				options={{
					title: 'About',
					tabBarIcon: () => <Fish />,
					headerLeft: () => (
						<NavBar />
					),
				}}
			/>
     
		</Tabs>
	);
}

export default TabLayout