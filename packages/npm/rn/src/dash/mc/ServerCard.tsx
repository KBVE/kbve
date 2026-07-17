import { StyleSheet, View } from 'react-native';
import { Badge, Stack, Surface, Text, tokens } from '../_ui';
import { serverMeta } from './labels';
import type { McServerItem } from './mcStream';
import type { RconExecFn } from './rconExec';
import { RconConsole } from './RconConsole';

export function ServerCard({
	item,
	exec,
}: {
	item: McServerItem;
	exec: RconExecFn;
}) {
	const meta = serverMeta(item.name);
	const showPlayers = item.name !== 'velocity';
	return (
		<Surface style={styles.card}>
			<Stack gap="sm">
				<Stack
					direction="row"
					justify="space-between"
					align="center"
					gap="sm">
					<Stack gap="xs" style={styles.title}>
						<Text variant="label">{meta.label}</Text>
						{meta.role ? (
							<Text variant="caption" tone="muted">
								{meta.role}
							</Text>
						) : null}
					</Stack>
					<Badge
						label={item.reachable ? 'online' : 'unreachable'}
						tone={item.reachable ? 'success' : 'neutral'}
					/>
				</Stack>
				<Stack direction="row" gap="sm">
					<View style={styles.metric}>
						<Text variant="caption" tone="muted">
							ONLINE
						</Text>
						<Text variant="label">
							{item.online} / {item.max}
						</Text>
					</View>
					<View style={styles.metric}>
						<Text variant="caption" tone="muted">
							ENDPOINT
						</Text>
						<Text variant="label">
							RCON_MC_{item.name.toUpperCase()}
						</Text>
					</View>
				</Stack>
				{showPlayers && (
					<Stack gap="xs">
						<Text variant="caption" tone="muted">
							Players ({item.players.length})
						</Text>
						{item.players.length === 0 ? (
							<Text variant="caption" tone="faint">
								No players online.
							</Text>
						) : (
							<Stack direction="row" gap="xs" wrap>
								{item.players.map((p) => (
									<Badge
										key={p.uuid ?? p.name}
										label={p.name}
										tone="primary"
									/>
								))}
							</Stack>
						)}
					</Stack>
				)}
				<RconConsole server={item.name} exec={exec} />
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
