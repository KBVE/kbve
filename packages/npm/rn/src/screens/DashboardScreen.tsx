import { ScrollView, StyleSheet, View } from 'react-native';
import { Screen } from '../ui/primitives/Screen';
import { Text } from '../ui/primitives/Text';
import { Badge } from '../ui/primitives/Badge';
import { Button } from '../ui/primitives/Button';
import { Surface } from '../ui/primitives/Surface';
import { Avatar } from '../ui/primitives/Avatar';
import { Skeleton } from '../ui/feedback/Skeleton';
import { MenuList } from '../ui/menus/MenuList';
import { tokens } from '../ui/theme';
import type { MenuSectionModel } from '../ui/models';
import { useAuth, useAuthActions } from '../auth/useAuth';
import { useApi } from '../auth/useApi';
import { usePersistentResource } from '../store';
import { useStaff } from '../auth/useStaff';
import { openExternal } from '../platform/openExternal';

const open = (url: string) => openExternal(url);

function Stat({ label, value }: { label: string; value?: number }) {
	return (
		<View style={styles.stat}>
			<Text variant="title" tone="primary">
				{value !== undefined ? value.toLocaleString() : '—'}
			</Text>
			<Text variant="caption" tone="muted">
				{label}
			</Text>
		</View>
	);
}

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
	const api = useApi();
	const username = auth.username ?? 'you';

	const wallet = usePersistentResource(
		'wallet:balance',
		async () => {
			const res = await api.wallet.balance();
			if (!res.ok || !res.data) {
				throw new Error(res.error ?? 'Wallet unavailable');
			}
			return res.data;
		},
		{ ttlMs: 30_000 },
	);

	const profile = usePersistentResource('profile:me', async () => {
		const res = await api.profile.me();
		if (!res.ok || !res.data) {
			throw new Error(res.error ?? 'Profile unavailable');
		}
		return res.data;
	});

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
						<Avatar
							name={profile.data?.username ?? username}
							size={44}
						/>
						<View style={styles.identity}>
							<View style={styles.titleRow}>
								<Text variant="subtitle">
									@{profile.data?.username ?? username}
								</Text>
								{staff.isStaff ? (
									<Badge label="STAFF" tone="primary" />
								) : null}
							</View>
							<Text variant="caption" tone="muted">
								{auth.user?.email ?? 'Signed in'}
							</Text>
						</View>
					</View>
				</View>

				<Surface>
					<Text variant="label" tone="muted">
						Wallet
					</Text>
					{wallet.error ? (
						<Text variant="caption" tone="danger">
							{wallet.error}
						</Text>
					) : wallet.loading && !wallet.data ? (
						<Skeleton width="60%" height={28} />
					) : (
						<View style={styles.wallet}>
							<Stat
								label="Credits"
								value={wallet.data?.credits}
							/>
							<Stat label="Khash" value={wallet.data?.khash} />
						</View>
					)}
				</Surface>

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
	identity: { gap: 2 },
	wallet: {
		flexDirection: 'row',
		gap: tokens.space.xl,
		marginTop: tokens.space.sm,
	},
	stat: { gap: 2 },
	signout: { marginTop: tokens.space.sm },
});
