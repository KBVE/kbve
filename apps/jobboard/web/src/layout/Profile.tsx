import { View } from 'react-native';
import { Stack, Text, Badge, Avatar, tokens } from '@kbve/rn/ui';
import { useApiResource } from '@kbve/rn/auth';
import { Skeleton } from '../components/ui';
import { Coins, Gem } from 'lucide-react';
import { Panel } from '../ui/Panel';

function fmt(n: number): string {
	return n.toLocaleString();
}

export function WalletCard() {
	const { data, loading, error } = useApiResource((api) =>
		api.wallet.balance(),
	);
	return (
		<Panel gradient="accent" glow style={{ gap: tokens.space.md }}>
			<Text variant="label" tone="muted">
				Wallet
			</Text>
			{error ? (
				<Text variant="caption" tone="danger">
					{error}
				</Text>
			) : loading || !data ? (
				<Stack direction="row" gap="lg">
					<Skeleton width={90} height={28} />
					<Skeleton width={90} height={28} />
				</Stack>
			) : (
				<Stack direction="row" gap="xl">
					<Stack direction="row" gap="sm" align="center">
						<Coins size={20} color={tokens.color.primary} />
						<Stack gap="xs">
							<Text variant="title" weight="bold">
								{fmt(data.credits)}
							</Text>
							<Text variant="caption" tone="faint">
								Credits
							</Text>
						</Stack>
					</Stack>
					<Stack direction="row" gap="sm" align="center">
						<Gem size={20} color={tokens.color.primary} />
						<Stack gap="xs">
							<Text variant="title" weight="bold">
								{fmt(data.khash)}
							</Text>
							<Text variant="caption" tone="faint">
								Khash
							</Text>
						</Stack>
					</Stack>
				</Stack>
			)}
		</Panel>
	);
}

export function Profile() {
	const { data, loading, error } = useApiResource((api) => api.profile.me());
	const avatarUri = data?.providers?.find((p) => p.avatar_url)?.avatar_url;

	return (
		<Stack gap="lg">
			<Panel pad={24}>
				{error ? (
					<Text tone="danger">{error}</Text>
				) : loading || !data ? (
					<Stack direction="row" gap="md" align="center">
						<Skeleton width={64} height={64} radius={32} />
						<Stack gap="xs" style={{ flex: 1 }}>
							<Skeleton width={160} height={22} />
							<Skeleton width={120} />
						</Stack>
					</Stack>
				) : (
					<View
						style={{
							flexDirection: 'row',
							alignItems: 'center',
							gap: tokens.space.lg,
						}}>
						<Avatar
							name={data.username}
							uri={avatarUri ?? undefined}
							size={64}
						/>
						<Stack gap="xs" style={{ flex: 1 }}>
							<Text variant="title" weight="bold">
								@{data.username}
							</Text>
							<View
								style={{
									flexDirection: 'row',
									flexWrap: 'wrap',
									gap: tokens.space.xs,
								}}>
								{data.providers?.map((p) => (
									<Badge
										key={p.provider}
										label={p.provider}
									/>
								))}
							</View>
						</Stack>
					</View>
				)}
			</Panel>

			<WalletCard />
		</Stack>
	);
}
