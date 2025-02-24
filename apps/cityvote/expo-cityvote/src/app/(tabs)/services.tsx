import React from 'react';
import { View, Text, XStack, ScrollView } from 'tamagui';

import * as Linking from 'expo-linking';
// import { Linking } from 'react-native';
import { router } from 'expo-router';

const handleUpworkButton = () => {
	const url = 'https://www.example.com'; // Your URL here
	Linking.openURL(url).catch((err) =>
		console.error('Failed to open URL:', err),
	);
};

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
	const handleButtonOnePress = () => {
		router.navigate('/contact'); // Replace '/your-target-route' with the path you want to navigate to
	};

	return (
		<ScrollView>
			<View flex={1} alignItems="center">

				<ServiceSection />
			</View>
		</ScrollView>
	);
};

export default ServiceScreen;
