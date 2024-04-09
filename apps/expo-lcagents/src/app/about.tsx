import React from 'react';
import { View, Text, XStack, ScrollView } from 'tamagui';

import { TamaHero, TamaCard } from '@kbve/expo-bbq';

function AboutSection() {
	return (
		<XStack
			$sm={{ flexDirection: 'column' }}
			paddingHorizontal="$4"
			space></XStack>
	);
}

const About = () => {
	return (
		<ScrollView>
			<View flex={1} alignItems="center">
				<Text>
					This is the Project Page! TODO: Load Different Projects!
					Minor Change to Trigger Pipeline Round 5. Force Deployment!
					Side note, need to add a couple buttons here.
				</Text>
			</View>
		</ScrollView>
	);
};

export default About;
