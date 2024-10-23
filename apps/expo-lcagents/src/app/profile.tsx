import React from 'react';
import { ScrollView } from 'react-native';
import { YStack, XStack, SizableText, Separator } from 'tamagui';
import { TamaProfile, LottieAnimation } from '@kbve/expo-bbq';
import { useNavigation } from 'expo-router';

const Profile = () => {
	const navigation = useNavigation();

	// Memoizing Lottie animation JSON
	const lottieProfileAnimation = React.useMemo(
		() => require('../../assets/json/profile.json'),
		[],
	);

	// Memoizing navigation update function
	const updateNavigationOptions = React.useCallback(() => {
		navigation.setOptions({
			title: 'Profile',
			headerBackTitle: 'Back',
		});
	}, [navigation]);

	React.useEffect(() => {
		updateNavigationOptions();
	}, [updateNavigationOptions]);

	const MemoizedLottieAnimation = React.memo(LottieAnimation);

	return (
		<ScrollView contentContainerStyle={{ flexGrow: 1 }}>
			<XStack
				f={1}
				jc="center"
				ai="center"
				padding="$1"
				flexDirection='column'
				
				$gtMd={{
					flexDirection: 'row', // Row layout for large screens
					justifyContent: 'space-between',
					maxWidth: '90%',
					gap: '$6',
				}}
				$gtLg={{
					flexDirection: 'row', // For screens greater than large
					justifyContent: 'space-between',
					maxWidth: '80%',
					gap: '$8',
				}}
				>
				{/* Lottie Animation Section */}
				<YStack
					jc="center"
					ai="center"
					$sm={{ width: '50%', display: 'block'}}
					
					$gtLg={{
						flex: 1,
						maxWidth: '100%', // Slightly smaller maxWidth on extra-large screens
					}}>
					<MemoizedLottieAnimation
						lottieJSON={lottieProfileAnimation}
						style={{
							width: '100%',
							height: 'auto',
							aspectRatio: 1,
							maxWidth: 800,
						}}
					/>
				</YStack>

				{/* Profile Information Section */}
				<YStack
					jc="center"
					ai="center"
					$sm={{ width: '100%' }} // Full width on small screens with spacing
					$gtLg={{
						flex: 1,
						maxWidth: '40%', // Slightly smaller on extra-large screens
						paddingLeft: '$8', // More padding on extra-large screens
					}}>
					<SizableText
						size="$4"
						theme="alt2"
						$gtLg={{ size: '$6' }}>
						LC Agents Profile - Powered by KBVE
					</SizableText>
					<Separator
						borderColor="cyan"
						paddingVertical="$2"
						alignSelf='stretch'
						$gtLg={{
							paddingVertical: '$5', 
						}}
					/>
					<TamaProfile
						supabaseUrl="https://supabase.kbve.com"
						supabaseAnonKey="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogImFub24iLAogICJpc3MiOiAic3VwYWJhc2UiLAogICJpYXQiOiAxNzI0NTM2ODAwLAogICJleHAiOiAxODgyMzAzMjAwCn0._fmEmblm0afeLoPXxt8wP2mYpa9gzU-ufx3v8oRTFGg"
					/>
				</YStack>
			</XStack>
		</ScrollView>
	);
};

export default Profile;
