import { View, XStack, Separator, ScrollView } from 'tamagui';

// import { TamaHero, TamaCard } from '@kbve/expo-bbq';

function HomeCards() {
	return (
		<XStack $sm={{ flexDirection: 'column' }} paddingHorizontal="$4" space>
			
		</XStack>
	);
}

export default function TabOneScreen() {
	return (
		<ScrollView>
			<View flex={1} alignItems="center">
				
				<Separator marginVertical={15} />
				<HomeCards />
			</View>
		</ScrollView>
	);
}
