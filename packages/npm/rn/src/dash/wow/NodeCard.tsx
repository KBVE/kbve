import { StyleSheet, View } from 'react-native';
import { Badge, Stack, Surface, Text, tokens } from '../_ui';
import { tickLabel, tickTone } from './wowMetrics';
import type { WowNodeItem } from './wowMetrics';

const TONE_COLOR: Record<string, string> = {
	success: tokens.color.success,
	warning: tokens.color.warning,
	danger: tokens.color.danger,
	neutral: tokens.color.textMuted,
};

const ms = (v: number | null) => (v != null ? `${Math.round(v)}ms` : '—');

function Metric({
	label,
	value,
	color,
}: {
	label: string;
	value: string;
	color?: string;
}) {
	return (
		<View style={styles.metric}>
			<Text variant="caption" tone="muted">
				{label}
			</Text>
			<Text variant="label" style={color ? { color } : undefined}>
				{value}
			</Text>
		</View>
	);
}

export function NodeCard({ item }: { item: WowNodeItem }) {
	const tone = tickTone(item.tickP95);
	const accent = TONE_COLOR[tone];
	return (
		<Surface style={styles.card}>
			<Stack gap="sm">
				<Stack
					direction="row"
					justify="space-between"
					align="center"
					gap="sm">
					<Stack gap="xs" style={styles.title}>
						<Text variant="label">{item.id}</Text>
						<Badge
							label={item.role}
							tone={
								item.role === 'worldserver'
									? 'primary'
									: 'neutral'
							}
						/>
					</Stack>
					<Badge
						label={item.up ? 'up' : 'down'}
						tone={item.up ? 'success' : 'danger'}
					/>
				</Stack>
				<Stack direction="row" gap="sm">
					<Metric
						label="CONNECTIONS"
						value={
							item.connections != null
								? String(Math.round(item.connections))
								: '—'
						}
					/>
					<Metric
						label="TICK P95"
						value={ms(item.tickP95)}
						color={accent}
					/>
				</Stack>
				<Stack direction="row" gap="sm">
					<Metric label="TICK P99" value={ms(item.tickP99)} />
					<Metric label="TICK MAX" value={ms(item.tickMax)} />
				</Stack>
				<Stack direction="row" gap="sm">
					<Metric label="TICK MEAN" value={ms(item.tickMean)} />
					<Metric label="TICK MEDIAN" value={ms(item.tickMedian)} />
				</Stack>
				<Badge label={`tick ${tickLabel(item.tickP95)}`} tone={tone} />
			</Stack>
		</Surface>
	);
}

const styles = StyleSheet.create({
	card: { padding: tokens.space.md },
	title: { flexShrink: 1 },
	metric: {
		flex: 1,
		borderWidth: 1,
		borderColor: tokens.color.border,
		borderRadius: tokens.radius.sm,
		padding: tokens.space.sm,
		gap: 2,
	},
});
