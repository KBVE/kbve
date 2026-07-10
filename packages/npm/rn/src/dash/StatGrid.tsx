import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Stack, Text, tokens } from './_ui';
import type { StatModel } from './types';

const TONE_COLOR: Record<string, string> = {
	primary: tokens.color.primary,
	success: tokens.color.success,
	danger: tokens.color.danger,
	warning: tokens.color.warning,
	neutral: tokens.color.textMuted,
};

function StatCard({ stat }: { stat: StatModel }) {
	const accent = TONE_COLOR[stat.tone ?? 'neutral'] ?? tokens.color.textMuted;
	const body = (
		<Stack gap="xs" style={styles.card}>
			<Text variant="caption" tone="muted">
				{stat.label}
			</Text>
			<Text variant="title" style={{ color: accent }}>
				{stat.value}
			</Text>
		</Stack>
	);
	if (!stat.onPress) return body;
	return (
		<Pressable onPress={stat.onPress} style={styles.pressable}>
			{body}
		</Pressable>
	);
}

export const StatGrid = memo(function StatGrid({
	stats,
}: {
	stats: readonly StatModel[];
}) {
	if (!stats.length) return null;
	return (
		<View style={styles.grid}>
			{stats.map((stat) => (
				<StatCard key={stat.id} stat={stat} />
			))}
		</View>
	);
});

const styles = StyleSheet.create({
	grid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: tokens.space.sm,
	},
	card: {
		minWidth: 120,
		flexGrow: 1,
		padding: tokens.space.md,
		backgroundColor: tokens.color.surface,
		borderRadius: tokens.radius.lg,
		borderWidth: 1,
		borderColor: tokens.color.border,
	},
	pressable: { minWidth: 120, flexGrow: 1 },
});
