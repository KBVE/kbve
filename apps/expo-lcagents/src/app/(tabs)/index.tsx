import {
	View,
	XStack,
	Separator,
	ScrollView,
} from 'tamagui';

import { TamaHero, TamaCard } from "@kbve/expo-bbq";

function HomeCards() {
	return (
		<XStack $sm={{ flexDirection: 'column' }} paddingHorizontal="$4" space>
			<TamaCard
				title="Projects"
				paragraph="Check out our cool projects"
				buttonText="Read More!"
				animation="bouncy"
				size="$4"
				width={250}
				height={300}
				scale={0.9}
				hoverStyle={{ scale: 0.925 }}
				pressStyle={{ scale: 0.875 }}
			/>

			<TamaCard
				title="Projects"
				paragraph="Check out our cool projects"
				buttonText="Read More!"
				animation="bouncy"
				size="$4"
				width={250}
				height={300}
				scale={0.9}
				hoverStyle={{ scale: 0.925 }}
				pressStyle={{ scale: 0.875 }}
        linker="/projects"
			/>
		</XStack>
	);
}



export default function TabOneScreen() {
	return (
		<ScrollView>
			<View flex={1} alignItems="center">
				<TamaHero
					backgroundImageUri="https://images.unsplash.com/photo-1711029028695-6db032f5c476?q=80&w=2056&auto=format&fit=crop"
					title="L & C Agents LLC"
					description="L & C Agency"
					buttonOneText="Contact"
					buttonTwoText="Support"
				/>
				<Separator marginVertical={15} />
				<HomeCards />
			</View>
		</ScrollView>
	);
}
