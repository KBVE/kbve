import React from 'react';
import { View, Text, XStack, ScrollView } from 'tamagui';
import { TamaHero, useBBQ } from '@kbve/expo-bbq';

function ServiceSection() {
	return (
		<XStack $sm={{ flexDirection: 'column' }} paddingHorizontal="$4" space>
			<Text>
				This is the Project Page! TODO: Load Different Projects! Minor
				Change to Trigger Pipeline Round 5. Force Deployment! Side note,
				need to add a couple buttons here.
			</Text>
		</XStack>
	);
}

const ServiceScreen = () => {
	const router = useBBQ();

	const handleButtonOnePress = () => {
		router.go('/contact');
	};

	const handleButtonTwoPress = () => {
		router.go('/support');
	};

	return (
		<ScrollView>
			<View flex={1} alignItems="center">
				<TamaHero
					backgroundImageUri="https://images.unsplash.com/photo-1618419164408-8fe110b99646?q=80&w=2056&auto=format&fit=crop"
					title="Services"
					description="L & C Agency"
					buttonOneText="Contact"
					buttonTwoText="Support"
					onButtonOnePress={handleButtonOnePress}
					onButtonTwoPress={handleButtonTwoPress}
				/>

				<ServiceSection />
			</View>
		</ScrollView>
	);
};

export default ServiceScreen;
