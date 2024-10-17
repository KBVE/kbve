import React from 'react';
import { View, Text, XStack, ScrollView } from 'tamagui';

import { TamaHero, TamaSimpleCardList} from '@kbve/expo-bbq';
import { Star, Moon } from '@tamagui/lucide-icons';


const cardData = [
	{
	  ulid: "01F8MECHZX3TBDSZ7XRADM79XE",
	  title: "First Class Support",
	  subTitle: "Twinkles",
	  icon: <Star color="yellow" />,
	  text: "This is a shining star",
	  img: "https://images.unsplash.com/photo-1551806235-6692cbfc690b?q=80&w=1635&auto=format&fit=crop",
	  route: "/star",
	},
	{
	  ulid: "01F8MECHZX3TBDSZ7XRADM79XF",
	  title: "Moon",
	  subTitle: "Glows",
	  icon: <Moon color="blue" />,
	  text: "This is a glowing moon",
	  img: "https://example.com/moon.jpg",
	  route: "/moon",
	},
  ];
  
function SupportSection() {
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

const SupportScreen = () => {

	function handleCardPress(route: string) {
		console.log(`Navigating to ${route}`);
		// Implement your navigation logic here, such as using a router to navigate
	}

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

				<View style={{ width: '100%', paddingHorizontal: 10 }}>
					<TamaSimpleCardList data={cardData} onCardPress={handleCardPress} />
				</View>

			</View>
		</ScrollView>
	);
};

export default SupportScreen;
