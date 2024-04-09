import { View, XStack, Separator, ScrollView } from 'tamagui';

import { TamaHero, TamaCard } from '@kbve/expo-bbq';

function HomeCards() {
	return (
		<XStack $sm={{ flexDirection: 'column' }} paddingHorizontal="$4" space>
			<TamaCard
				title="Consulting"
				paragraph="Discover innovative solutions with LaMorte Consults, a versatile consulting firm specializing in groundbreaking construction projects and cutting-edge website design."
				buttonText="Read More!"
				animation="bouncy"
				size="$2"
				width={300}
				height={300}
				scale={0.9}
				hoverStyle={{ scale: 0.925 }}
				pressStyle={{ scale: 0.875 }}
				linker="/consulting"
				image="https://images.unsplash.com/photo-1493612276216-ee3925520721?q=80&w=300&auto=format&fit=crop"
			/>

			<TamaCard
				title="About Us"
				paragraph="Check out our cool projects"
				buttonText="Read More!"
				animation="bouncy"
				size="$4"
				width={300}
				height={300}
				scale={0.9}
				hoverStyle={{ scale: 0.925 }}
				pressStyle={{ scale: 0.875 }}
				linker="/about"
				image="https://images.unsplash.com/photo-1509391366360-2e959784a276?q=80&w=300&auto=format&fit=crop"

			/>

			<TamaCard
				title="Support"
				paragraph="First in Class Support! Skill issue?"
				buttonText="Read More!"
				animation="bouncy"
				size="$4"
				width={300}
				height={300}
				scale={0.9}
				hoverStyle={{ scale: 0.925 }}
				pressStyle={{ scale: 0.875 }}
				linker="/projects"
				image="https://images.unsplash.com/photo-1711117479774-5102ba0eee19?q=80&w=300&auto=format&fit=crop"
			/>

			<TamaCard
				title="Projects"
				paragraph="Check out our cool projects"
				buttonText="Read More!"
				animation="bouncy"
				size="$4"
				width={300}
				height={300}
				scale={0.9}
				hoverStyle={{ scale: 0.925 }}
				pressStyle={{ scale: 0.875 }}
				linker="/projects"
				image="https://images.unsplash.com/photo-1541976844346-f18aeac57b06?q=80&w=300&auto=format&fit=crop"
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
					title="LaMorte Consults LLC"
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
