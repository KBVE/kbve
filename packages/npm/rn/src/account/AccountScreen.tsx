import { ScrollView, StyleSheet } from 'react-native';
import { Screen } from '../ui/primitives/Screen';
import { Stack } from '../ui/primitives/Stack';
import { MenuList } from '../ui/menus/MenuList';
import { tokens } from '../ui/theme';
import type { MenuSectionModel } from '../ui/models';
import { useAuth, useAuthActions } from '../auth/useAuth';
import { ProfileHeader } from './ProfileHeader';
import { WalletSection } from './WalletSection';
import { StorageSection } from './StorageSection';
import { DeviceSection } from './DeviceSection';
import { HealthSection } from './HealthSection';

export interface AccountScreenProps {
	onOpenUrl?: (url: string) => void;
}

export function AccountScreen({ onOpenUrl }: AccountScreenProps) {
	const auth = useAuth();
	const actions = useAuthActions();
	const open = (url: string) => onOpenUrl?.(url);

	const username = auth.username ?? '';

	const menu: MenuSectionModel[] = [
		{
			id: 'account',
			title: 'Account',
			items: [
				{
					id: 'profile',
					label: 'View public profile',
					trailingText: username ? `@${username}` : undefined,
					onPress: () =>
						open(
							`https://kbve.com/${username ? `@${username}` : ''}`,
						),
				},
				{
					id: 'legal',
					label: 'Legal & privacy',
					onPress: () => open('https://kbve.com/legal/'),
				},
				{
					id: 'signout',
					label: 'Sign out',
					destructive: true,
					onPress: () => actions.signOut(),
				},
			],
		},
	];

	return (
		<Screen padded={false}>
			<ScrollView contentContainerStyle={styles.content}>
				<Stack gap="lg">
					<ProfileHeader />
					<WalletSection />
					<DeviceSection />
					<HealthSection />
					<StorageSection />
					<MenuList sections={menu} />
				</Stack>
			</ScrollView>
		</Screen>
	);
}

const styles = StyleSheet.create({
	content: {
		padding: tokens.space.xl,
		gap: tokens.space.lg,
	},
});
