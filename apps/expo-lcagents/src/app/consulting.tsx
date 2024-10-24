import React, { useMemo, useCallback, useEffect } from 'react';
import {
	YStack,
	XStack,
	SizableText,
	Separator,
	ScrollView,
	View,
} from 'tamagui';
import { InstaCard, LottieAnimation } from '@kbve/expo-bbq';
import { useNavigation, useRouter } from 'expo-router';

const Consulting = () => {
	const navigation = useNavigation();
	const router = useRouter();

	// Memoizing navigation update function
	const updateNavigationOptions = useCallback(() => {
		navigation.setOptions({
			title: 'Consulting',
			headerBackTitle: 'Back',
		});
	}, [navigation]);

	useEffect(() => {
		updateNavigationOptions();
	}, [updateNavigationOptions]);

	const lottieConsultingAnimation = useMemo(
		() => require('../../assets/json/consult.json'),
		[],
	);

	const MemoizedLottieAnimation = React.memo(LottieAnimation);

	return (
		<ScrollView contentContainerStyle={{ flexGrow: 1 }}>
			<XStack
				f={1}
				jc="center"
				ai="center"
				padding="$1"
				flexDirection="column"
				
				$gtLg={{
					flexDirection: 'row', // For screens greater than large
					justifyContent: 'space-between',
					maxWidth: '80%',
					gap: '$8',
				}}>
				{/* Lottie Animation Section */}
				<YStack
					jc="center"
					ai="center"
          gap="$2"
          rowGap="$2"
					$sm={{ width: '50%', display: 'block' }}
					$gtLg={{
						flex: 1,
						maxWidth: '33%', // Slightly smaller maxWidth on extra-large screens
            paddingLeft: "$8"
					}}>
					<MemoizedLottieAnimation
						lottieJSON={lottieConsultingAnimation}
						style={{
							width: '100%',
							height: 'auto',
							aspectRatio: 1,
							maxWidth: 800,
						}}
					/>
					<SizableText size={'$3'} theme="alt2">
						Welcome to the Consultants of LC Agents
					</SizableText>
					<InstaCard />
					<InstaCard />
					<InstaCard />
				</YStack>
        <Separator alignSelf="stretch"  marginVertical={15} />
				<YStack
					jc="center"
					ai="center"
					$sm={{ width: '100%' }} // Full width on small screens with spacing
					gap={'$2'}
					$gtLg={{
						flex: 1,
						maxWidth: '33%', // Slightly smaller on extra-large screens
					}}>
					<InstaCard />
					<InstaCard />
					<InstaCard />
				</YStack>
        <Separator alignSelf="stretch"  marginVertical={15}  />
				<YStack
					jc="center"
					ai="center"
					$sm={{ width: '100%' }} // Full width on small screens with spacing
					gap={'$2'}
					$gtLg={{
						flex: 1,
						maxWidth: '33%', // Slightly smaller on extra-large screens
					}}>
					<InstaCard />
					<InstaCard />
					<InstaCard />
				</YStack>
			</XStack>
		</ScrollView>
	);
};

export default Consulting;
