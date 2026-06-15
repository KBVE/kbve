import { View } from 'react-native';
import { Stack, Text, Badge, tokens } from '@kbve/rn/ui';
import { Panel } from '../ui/Panel';

function StatCard({
	label,
	value,
	delta,
}: {
	label: string;
	value: string;
	delta: string;
}) {
	return (
		<Panel style={{ flex: 1, minWidth: 160, gap: tokens.space.xs }}>
			<Stack direction="row" justify="space-between" align="center">
				<Text variant="caption" tone="muted">
					{label}
				</Text>
				<Badge label={delta} tone="success" />
			</Stack>
			<Text variant="title" weight="bold">
				{value}
			</Text>
		</Panel>
	);
}

export function Overview({ username }: { username: string }) {
	return (
		<Stack gap="lg">
			{/* Hero */}
			<Panel gradient="hero" glow radius={24} pad={28}>
				<Stack gap="xs">
					<Text variant="title" weight="bold">
						Hello {username}!
					</Text>
					<Text variant="body" tone="muted">
						You have new matches. Your profile is trending up this
						week.
					</Text>
				</Stack>
			</Panel>

			{/* Chart placeholder */}
			<Panel>
				<Stack direction="row" justify="space-between" align="center">
					<Text variant="label">Activity</Text>
					<Text variant="caption" tone="faint">
						last 30 days
					</Text>
				</Stack>
				<div
					style={{
						height: 180,
						borderRadius: 14,
						marginTop: tokens.space.sm,
						background:
							'linear-gradient(180deg, rgba(201,165,106,0.20), rgba(201,165,106,0.02))',
						maskImage:
							'radial-gradient(140% 90% at 50% 120%, #000 40%, transparent 75%)',
						WebkitMaskImage:
							'radial-gradient(140% 90% at 50% 120%, #000 40%, transparent 75%)',
					}}
				/>
			</Panel>

			{/* Stats */}
			<View
				style={{
					flexDirection: 'row',
					flexWrap: 'wrap',
					gap: tokens.space.md,
				}}>
				<StatCard label="Applications" value="23" delta="+8%" />
				<StatCard label="Matches" value="46" delta="+15%" />
				<StatCard label="Responses" value="12" delta="+4%" />
			</View>
		</Stack>
	);
}
