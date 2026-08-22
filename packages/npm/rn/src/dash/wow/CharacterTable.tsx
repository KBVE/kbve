import { StyleSheet, View } from 'react-native';
import { Badge, Stack, Surface, Text, tokens } from '../_ui';
import { className, factionOf, mapName, raceName, zoneName } from './labels';
import type { WowCharacter } from './wowStream';

export function CharacterTable({
	characters,
}: {
	characters: readonly WowCharacter[];
}) {
	return (
		<Surface style={styles.card}>
			<Stack gap="sm">
				<Text variant="caption" tone="muted">
					Online characters ({characters.length})
				</Text>
				{characters.length === 0 ? (
					<Text variant="caption" tone="faint">
						Nobody is online.
					</Text>
				) : (
					<Stack gap="xs">
						<View style={styles.headRow}>
							<Text variant="caption" tone="faint" style={styles.name}>
								NAME
							</Text>
							<Text variant="caption" tone="faint" style={styles.cell}>
								LVL
							</Text>
							<Text variant="caption" tone="faint" style={styles.wide}>
								CLASS / RACE
							</Text>
							<Text variant="caption" tone="faint" style={styles.wide}>
								LOCATION
							</Text>
						</View>
						{characters.map((c) => (
							<View key={c.guid} style={styles.row}>
								<View style={styles.name}>
									<Text variant="label">{c.name}</Text>
									<Text variant="caption" tone="faint">
										{c.accountName}
									</Text>
								</View>
								<Text variant="label" style={styles.cell}>
									{c.level}
								</Text>
								<View style={styles.wide}>
									<Text variant="caption">
										{className(c.classId)}
									</Text>
									<Text variant="caption" tone="muted">
										{raceName(c.raceId)}
									</Text>
								</View>
								<View style={styles.wide}>
									<Text variant="caption">
										{zoneName(c.zoneId)}
									</Text>
									<Text variant="caption" tone="muted">
										{mapName(c.mapId)}
									</Text>
								</View>
								<Badge
									label={factionOf(c.raceId)}
									tone={
										factionOf(c.raceId) === 'Alliance'
											? 'primary'
											: 'danger'
									}
								/>
							</View>
						))}
					</Stack>
				)}
			</Stack>
		</Surface>
	);
}

const styles = StyleSheet.create({
	card: { padding: tokens.space.md },
	headRow: { flexDirection: 'row', gap: tokens.space.sm },
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: tokens.space.sm,
		borderTopWidth: 1,
		borderTopColor: tokens.color.border,
		paddingTop: tokens.space.xs,
	},
	name: { flexGrow: 1, flexBasis: 140 },
	cell: { width: 40 },
	wide: { flexGrow: 1, flexBasis: 120 },
});
