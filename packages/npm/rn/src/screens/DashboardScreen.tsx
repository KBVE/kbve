import { ScrollView, StyleSheet, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Screen } from '../ui/primitives/Screen';
import { Text } from '../ui/primitives/Text';
import { Badge } from '../ui/primitives/Badge';
import { Button } from '../ui/primitives/Button';
import { MenuList } from '../ui/menus/MenuList';
import { tokens } from '../ui/theme';
import type { MenuSectionModel } from '../ui/models';
import { useAuth, useAuthActions } from '../auth/useAuth';
import { useStaff } from '../auth/useStaff';

const open = (url: string) => void WebBrowser.openBrowserAsync(url);

const STAFF_TOOLS = [
	{
		id: 'argo',
		label: 'ArgoCD',
		description: 'Deployments',
		url: 'https://kbve.com/dashboard/argo/',
	},
	{
		id: 'forgejo',
		label: 'Forgejo',
		description: 'Git repositories',
		url: 'https://kbve.com/dashboard/forgejo/',
	},
	{
		id: 'grafana',
		label: 'Grafana',
		description: 'Metrics & alerts',
		url: 'https://kbve.com/dashboard/grafana/',
	},
	{
		id: 'clickhouse',
		label: 'ClickHouse',
		description: 'Analytics',
		url: 'https://kbve.com/dashboard/clickhouse/',
	},
	{
		id: 'vm',
		label: 'Virtual Machines',
		description: 'KubeVirt',
		url: 'https://kbve.com/dashboard/vm/',
	},
	{
		id: 'agents',
		label: 'Agents',
		description: 'Discord agents',
		url: 'https://kbve.com/dashboard/agents/',
	},
];

export function DashboardScreen() {
	const auth = useAuth();
	const { signOut } = useAuthActions();
	const staff = useStaff();
	const username = auth.username ?? 'you';

	const sections: MenuSectionModel[] = [
		{
			id: 'account',
			title: 'Account',
			items: [
				{
					id: 'profile',
					label: 'Profile',
					description: `@${username}`,
					trailingText: '↗',
					onPress: () => open(`https://kbve.com/@${username}`),
				},
				{
					id: 'settings',
					label: 'Settings',
					description: 'Account & security',
					trailingText: '↗',
					onPress: () => open('https://kbve.com/profile'),
				},
			],
		},
		...(staff.isStaff
			? [
					{
						id: 'staff',
						title: 'Staff',
						items: STAFF_TOOLS.map((tool) => ({
							id: tool.id,
							label: tool.label,
							description: tool.description,
							trailingText: '↗',
							onPress: () => open(tool.url),
						})),
					},
				]
			: []),
	];

	return (
		<Screen padded={false}>
			<ScrollView contentContainerStyle={styles.content}>
				<View style={styles.header}>
					<View style={styles.titleRow}>
						<Text variant="display">Dashboard</Text>
						{staff.isStaff ? (
							<Badge label="STAFF" tone="primary" />
						) : null}
					</View>
					<Text variant="body" tone="muted">
						Signed in as{' '}
						{auth.username ?? auth.user?.email ?? 'unknown'}
					</Text>
				</View>

				<MenuList sections={sections} />

				<Button
					title="Sign out"
					variant="ghost"
					onPress={signOut}
					style={styles.signout}
				/>
			</ScrollView>
		</Screen>
	);
}

const styles = StyleSheet.create({
	content: { padding: tokens.space.lg, gap: tokens.space.lg },
	header: { gap: tokens.space.xs },
	titleRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: tokens.space.sm,
	},
	signout: { marginTop: tokens.space.sm },
});
