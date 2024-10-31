import React from 'react';
import { YStack, XStack, SizableText, ScrollView, Button } from 'tamagui';
import { TamaHero, TamaCard, useBBQ, MiniCard } from '@kbve/expo-bbq';

const AboutScreen = () => {
	const bbq = useBBQ();

	const handlePress = async (route: string, params?: Record<string, any>) => {
		bbq.go(route, params);
	};

	return (
		<ScrollView contentContainerStyle={{ flexGrow: 1 }}>
			<XStack
				flexDirection="column"
				alignItems="center"
				justifyContent="center"
				gap="$6"
				paddingVertical="$4"
				$gtLg={{
					flexDirection: 'row',
					justifyContent: 'space-evenly',
					maxWidth: '80%',
					gap: '$8',
				}}>
				<YStack alignItems="center" gap="$4">
					<TamaHero
						backgroundImageUri="https://images.unsplash.com/photo-1524803504179-6d7ae4d283f7?q=80&w=400&auto=format&fit=crop"
						title="About L & C"
						description="L & C Agency"
						buttonOneText="Contact"
						buttonTwoText="Support"
						onButtonOnePress={() => handlePress('/contact')}
						onButtonTwoPress={() => handlePress('/support')}
					/>
				</YStack>

				<YStack alignItems="center" gap="$4" paddingHorizontal="$4">
					
					<MiniCard
						title="Our Projects"
						description="We specialize in innovative solutions across a variety of industries. Here are some of our latest projects."
						info={{ content: "Discover our approach to solving industry challenges." }}
						help={{ content: "Need help with a project? Contact us for more details." }}
						image="https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?q=80&w=800&auto=format&fit=crop"
					/>

					<XStack
						gap="$4"
						marginTop="$6"
						flexDirection="row"
						flexWrap="wrap"
						justifyContent="center">
						<TamaCard
							title="Project A"
							paragraph="A description of Project A, emphasizing its features and impact."
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
						<TamaCard
							title="Project B"
							paragraph="A description of Project B, highlighting its goals and achievements."
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

					<SizableText size="$4" textAlign="center" color="$gray11">
						Reach out to us for a new project today!
					</SizableText>

				</YStack>
			</XStack>
		</ScrollView>
	);
};

export default AboutScreen;
