import { View, XStack, Separator, ScrollView } from 'tamagui';

// import { TamaHero, TamaCard } from '@kbve/expo-bbq';

function HomeCards() {
	return <XStack $sm={{ flexDirection: 'column' }}></XStack>;
}

export const TabOneScreen = () => {
	return (
		<ScrollView>
			<View flex={1} items="center">
				<Separator marginInline={15} />
				<HomeCards />
			</View>
		</ScrollView>
	);
}

export default TabOneScreen;