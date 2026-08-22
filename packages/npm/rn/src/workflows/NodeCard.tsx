import { Pressable, StyleSheet, View } from 'react-native';
import { Badge, Stack, Surface, Text } from '../dash/_ui';
import type { BadgeTone } from '../dash/_ui';
import type { WorkflowNode } from './types';
import { NODE_W, NODE_H } from './geometry';

const TONE: Record<WorkflowNode['status'], BadgeTone> = {
	idle: 'neutral',
	running: 'primary',
	ok: 'success',
	err: 'danger',
};

export function NodeCard({
	node,
	screenX,
	screenY,
	onRun,
}: {
	node: WorkflowNode;
	screenX: number;
	screenY: number;
	onRun: (id: string) => void;
}) {
	const done = node.status === 'ok' || node.status === 'err';
	return (
		<View
			style={[
				styles.wrap,
				{ left: screenX, top: screenY, width: NODE_W, height: NODE_H },
			]}>
			<Surface>
				<Stack>
					<Text variant="label">{node.label ?? node.ref}</Text>
					<Text variant="caption" numberOfLines={1}>
						{node.backend} · {node.ref}
					</Text>
					<View style={styles.row}>
						<Pressable
							onPress={() => onRun(node.id)}
							accessibilityLabel="run node">
							<Text>▶</Text>
						</Pressable>
						<Badge tone={TONE[node.status]} label={node.status} />
					</View>
					{done && node.result ? (
						<Text variant="caption" numberOfLines={2}>
							{node.result}
						</Text>
					) : null}
				</Stack>
			</Surface>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: { position: 'absolute' },
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
	},
});
