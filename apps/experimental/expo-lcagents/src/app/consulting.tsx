import React, { useMemo, useCallback, useEffect } from 'react';
import {
	YStack,
	XStack,
	SizableText,
	ScrollView,
} from 'tamagui';
import { InstaCard, LottieAnimation } from '@kbve/expo-bbq';
import { useNavigation } from 'expo-router';

const Consulting = () => {
	const navigation = useNavigation();

	const postData = {
		username: 'john_doe',
		location: 'San Francisco',
		avatarUrl: 'https://example.com/avatar.jpg',
		postImageUrl:
			'https://images.unsplash.com/photo-1729326688022-865844a8baa9?q=80&w=800&auto=format&fit=crop&ixlib=rb-4.0.3&',
		likes: [
			{ avatarUrl: 'https://example.com/like1.jpg', name: 'alice' },
			{ avatarUrl: 'https://example.com/like2.jpg', name: 'bob' },
		],
		caption: 'This is a great day!',
	};

	const postId = '01JAYT7NKZPW7BXYKDHDWDHMVC';

	const handleAction = (actionState: string, content: string) => {
		console.log(`Action: ${actionState}, Content: ${content}`);
		//
	};

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
				flexDirection="column"
				paddingVertical="$4"
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
				
					$sm={{ width: '50%', display: 'block' }}
					$gtLg={{
						flex: 1,
						flexGrow: 1,
						// maxWidth: '33%',
						paddingLeft: '$8',
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
				</YStack>

				<YStack
					jc="center"
					ai="center"
					gap="$4"
					$gtLg={{
						flex: 1,
						flexDirection: 'row',
						flexWrap: 'wrap',
						gap: "$5",
						// maxWidth: '33%', 
						
					}}>
					<InstaCard
						username={postData.username}
						location={postData.location}
						avatarUrl={postData.avatarUrl}
						postImageUrl={postData.postImageUrl}
						likes={postData.likes}
						caption={postData.caption}
						ulid={postId}
						onAction={handleAction} 
					/>
					<InstaCard
						username={postData.username}
						location={postData.location}
						avatarUrl={postData.avatarUrl}
						postImageUrl={postData.postImageUrl}
						likes={postData.likes}
						caption={postData.caption}
						ulid={postId}
						onAction={handleAction}
					/>
					<InstaCard
						username={postData.username}
						location={postData.location}
						avatarUrl={postData.avatarUrl}
						postImageUrl={postData.postImageUrl}
						likes={postData.likes}
						caption={postData.caption}
						ulid={postId}
						onAction={handleAction}
					/>
				</YStack>
			</XStack>
			<XStack>
				
			</XStack>
		</ScrollView>
	);
};

export default Consulting;
