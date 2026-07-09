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
	return (
		<View
			style={[
				styles.wrap,
				{ left: screenX, top: screenY, width: NODE_W, height: NODE_H },
			]}>
			<Surface>
				<Stack>
					<Text>{node.backend}</Text>
					<Text>{node.ref}</Text>
					<View style={styles.row}>
						<Pressable
							onPress={() => onRun(node.id)}
							accessibilityLabel="run node">
							<Text>▶</Text>
						</Pressable>
						<Badge tone={TONE[node.status]} label={node.status} />
					</View>
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
