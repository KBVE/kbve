import React from 'react';
import { View, Text, XStack, ScrollView } from 'tamagui';

import { TamaHero, TamaCard } from '@kbve/expo-bbq';

import * as Linking from 'expo-linking';
import { router } from 'expo-router';



function SupportSection() {
  return (
    <XStack $sm={{ flexDirection: 'column' }} paddingHorizontal="$4" space>
    <Text>
      This is the Project Page! TODO: Load Different Projects! Minor
      Change to Trigger Pipeline Round 5. Force Deployment! Side note,
      need to add a couple buttons here.
    </Text>
  </XStack>
  )
}


const SupportScreen = () => {

	return (
		<ScrollView>
			<View flex={1} alignItems="center">
				<TamaHero
					backgroundImageUri="https://images.unsplash.com/photo-1549103636-a863536a8a81?q=80&w=2056&auto=format&fit=crop"
					title="Support @ L & C"
					description="L & C Agency"
					buttonOneText="Contact"
					buttonTwoText="Discord"
					// onButtonOnePress={handleButtonOnePress}
					// onButtonTwoPress={handleUpworkButton}
				/>

				<SupportSection />
			</View>
		</ScrollView>
	);
}

export default SupportScreen;