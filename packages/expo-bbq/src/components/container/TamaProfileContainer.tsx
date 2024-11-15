import React, { Suspense, useCallback } from 'react';
import { TamaProfileCard } from '../card/TamaProfileCard';
import { useMemory } from '../../core/useMemory';
import { Spinner as SkeletonLoader, YStack, Button } from 'tamagui';
import { type IUserCardsPublic } from '../../type';

export const TamaProfileContainer = ({
	username,
	supabase,
}: {
	username: string;
	supabase: any;
}) => {
	const fetchProfileData =
		useCallback(async (): Promise<IUserCardsPublic> => {
			const { data, error } = await supabase
				.from('user_cards_public')
				.select('username, bio, socials, style')
				.eq('username', username)
				.single();

			if (error) {
				console.error('Error fetching profile:', error);
				return { username: '', socials: '', style: '', bio: '' };
			}
			return data;
		}, [supabase, username]);

	const { LazyLoadedComponent: MemoizedProfileCard, refreshData } = useMemory(
		`profile_${username}`,
		fetchProfileData,
		TamaProfileCard,
		SkeletonLoader,
		{
			onAction: (actionState: string, content: string) =>
				console.log(`Action: ${actionState}, Content: ${content}`),
		},
	);

	return (
		<YStack space="$4" padding="$4" alignItems="center">
			<Suspense fallback={<SkeletonLoader />}>
				<MemoizedProfileCard />
			</Suspense>
			<Button onPress={refreshData}>Refresh Profile</Button>
		</YStack>
	);
};

export default TamaProfileContainer;
