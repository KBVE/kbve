import { View } from 'react-native';
import { Stack, Surface, Text, Badge, Gradient, tokens } from '@kbve/rn/ui';

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
		<Surface
			padded
			style={{ flex: 1, minWidth: 160, gap: tokens.space.xs }}>
			<Stack direction="row" justify="space-between" align="center">
				<Text variant="caption" tone="muted">
					{label}
				</Text>
				<Badge label={delta} tone="success" />
			</Stack>
			<Text variant="title" weight="bold">
				{value}
			</Text>
		</Surface>
	);
}

export function Overview({ username }: { username: string }) {
	return (
		<Stack gap="lg">
			{/* Hero */}
			<Gradient
				name="hero"
				style={{
					borderRadius: tokens.radius.xl,
					padding: tokens.space.xl,
				}}>
				<Text
					variant="title"
					weight="bold"
					style={{ color: tokens.color.onPrimary }}>
					Hello {username}!
				</Text>
				<Text
					variant="caption"
					style={{ color: tokens.color.onPrimary, opacity: 0.85 }}>
					You have new matches. Your profile is trending up this week.
				</Text>
			</Gradient>

			{/* Chart placeholder */}
			<Surface padded style={{ gap: tokens.space.sm }}>
				<Stack direction="row" justify="space-between" align="center">
					<Text variant="label">Activity</Text>
					<Text variant="caption" tone="faint">
						last 30 days
					</Text>
				</Stack>
				<Gradient
					colors={[tokens.color.surfaceAlt, tokens.color.primaryDeep]}
					style={{ height: 180, borderRadius: tokens.radius.lg }}
				/>
				<Text variant="caption" tone="faint">
					Chart coming soon.
				</Text>
			</Surface>

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
