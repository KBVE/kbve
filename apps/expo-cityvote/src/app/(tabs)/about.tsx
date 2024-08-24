import React from 'react';
import { View, Text, XStack, ScrollView } from 'tamagui';

import { TamaHero, TamaCard } from '@kbve/expo-bbq';

import * as Linking from 'expo-linking';
// import { Linking } from 'react-native';
import { router } from 'expo-router';

const handleUpworkButton = () => {
	const url = 'https://api.cityvote.com/'; 
	Linking.openURL(url).catch((err) =>
		console.error('Failed to open URL:', err),
	);
};

function AboutSection() {
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

const AboutScreen = () => {
	const handleButtonOnePress = () => {
		router.navigate('/contact'); // Replace '/your-target-route' with the path you want to navigate to
	};

	return (
		<ScrollView>
			<View flex={1} alignItems="center">
				<TamaHero
					backgroundImageUri="https://images.unsplash.com/photo-1524803504179-6d7ae4d283f7?q=80&w=2056&auto=format&fit=crop"
					title="About L & C"
					description="L & C Agency"
					buttonOneText="Contact"
					buttonTwoText="Support"
					onButtonOnePress={handleButtonOnePress}
					onButtonTwoPress={handleUpworkButton}
				/>

				<AboutSection />
			</View>
		</ScrollView>
	);
};

export default AboutScreen;
