import React from 'react';
import { View, Text, XStack, ScrollView } from 'tamagui';

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
				

				<SupportSection />
			</View>
		</ScrollView>
	);
}

export default SupportScreen;