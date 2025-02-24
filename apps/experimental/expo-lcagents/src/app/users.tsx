import React, { useMemo, useCallback, useEffect } from 'react';
import { YStack, XStack, SizableText, Separator, ScrollView } from 'tamagui';
import {
	LottieAnimation,
	createSupabaseClient,
	TamaProfileContainer,
} from '@kbve/expo-bbq';
import { useNavigation, useLocalSearchParams } from 'expo-router';

const Users = () => {
	const navigation = useNavigation();

	const { username = 'h0lybyte' } = useLocalSearchParams<{
        username?: string;
    }>();

	const supabaseUrl = 'https://supabase.kbve.com';
	const supabaseAnonKey =
		'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogImFub24iLAogICJpc3MiOiAic3VwYWJhc2UiLAogICJpYXQiOiAxNzI0NTM2ODAwLAogICJleHAiOiAxODgyMzAzMjAwCn0._fmEmblm0afeLoPXxt8wP2mYpa9gzU-ufx3v8oRTFGg';

	const supabase = useMemo(
		() => createSupabaseClient(supabaseUrl, supabaseAnonKey),
		[supabaseUrl, supabaseAnonKey],
	);

	const lottieProfileAnimation = useMemo(
		() => require('../../assets/json/profile.json'),
		[],
	);

	const updateNavigationOptions = useCallback(() => {
		navigation.setOptions({
			title: 'KBVE Users',
			headerBackTitle: 'Back',
		});
	}, [navigation]);

	useEffect(() => {
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
				flexDirection="column"
				$gtMd={{
					flexDirection: 'row',
					justifyContent: 'space-between',
					maxWidth: '90%',
					gap: '$6',
				}}
				$gtLg={{
					flexDirection: 'row',
					justifyContent: 'space-between',
					maxWidth: '80%',
					gap: '$8',
				}}>
				<YStack
					jc="center"
					ai="center"
					$sm={{ width: '50%', display: 'block' }}
					$gtLg={{
						flex: 1,
						maxWidth: '100%',
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

				<YStack
					jc="center"
					ai="center"
					$sm={{ width: '100%' }}
					$gtLg={{
						flex: 1,
						maxWidth: '40%',
						paddingLeft: '$8',
					}}>
					<SizableText size="$4" theme="alt1" $gtLg={{ size: '$6' }}>
						KBVE Users
					</SizableText>
					<Separator
						borderColor="cyan"
						paddingVertical="$2"
						alignSelf="stretch"
						$gtLg={{
							paddingVertical: '$5',
						}}
					/>

					<TamaProfileContainer
						username={username}
						supabase={supabase}
					/>
				</YStack>
			</XStack>
		</ScrollView>
	);
};

export default Users;
