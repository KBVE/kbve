import { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas, Rect, Group } from '@shopify/react-native-skia';
import {
	Gesture,
	GestureDetector,
	GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { createWorkflowsStore } from './store';
import {
	NODE_W,
	NODE_H,
	nodeAtPoint,
	screenToWorld,
	type Viewport,
} from './geometry';
import { invokeNode, type ServiceConfig } from './workflowsService';
import { NodeCard } from './NodeCard';

export function WorkflowsCanvas({ config }: { config: ServiceConfig }) {
	const store = useMemo(() => createWorkflowsStore(), []);
	const state = useSyncExternalStore(store.subscribe, store.get);
	const [vp, setVp] = useState<Viewport>({ tx: 0, ty: 0, scale: 1 });
	const drag = useRef<{
		id: string | null;
		startX: number;
		startY: number;
		nodeX: number;
		nodeY: number;
	}>({
		id: null,
		startX: 0,
		startY: 0,
		nodeX: 0,
		nodeY: 0,
	});

	if (state.order.length === 0) {
		store.addNode({ backend: 'edge', ref: 'health', x: 40, y: 40 });
		store.addNode({
			backend: 'windmill',
			ref: 'u/admin/hello',
			x: 260,
			y: 40,
		});
		store.addNode({ backend: 'firecracker', ref: 'ping', x: 150, y: 180 });
	}

	const nodes = store.nodes();

	const onRun = async (id: string) => {
		const n = store.get().nodes[id];
		if (!n) return;
		store.setStatus(id, 'running');
		try {
			const r = await invokeNode(n.backend, n.ref, config);
			store.setStatus(id, r.ok ? 'ok' : 'err', r.body);
		} catch (e) {
			store.setStatus(id, 'err', String(e));
		}
	};

	const pan = Gesture.Pan()
		.onBegin((e) => {
			const w = screenToWorld(e.x, e.y, vp);
			const hit = nodeAtPoint(store.nodes(), w.x, w.y);
			drag.current = hit
				? {
						id: hit.id,
						startX: e.x,
						startY: e.y,
						nodeX: hit.x,
						nodeY: hit.y,
					}
				: {
						id: null,
						startX: e.x,
						startY: e.y,
						nodeX: vp.tx,
						nodeY: vp.ty,
					};
		})
		.onUpdate((e) => {
			const dx = e.x - drag.current.startX;
			const dy = e.y - drag.current.startY;
			if (drag.current.id) {
				store.moveNode(
					drag.current.id,
					drag.current.nodeX + dx / vp.scale,
					drag.current.nodeY + dy / vp.scale,
				);
			} else {
				setVp((v) => ({
					...v,
					tx: drag.current.nodeX + dx,
					ty: drag.current.nodeY + dy,
				}));
			}
		});

	return (
		<GestureHandlerRootView style={styles.root}>
			<GestureDetector gesture={pan}>
				<View style={styles.root}>
					<Canvas style={StyleSheet.absoluteFill}>
						<Group
							transform={[
								{ translateX: vp.tx },
								{ translateY: vp.ty },
								{ scale: vp.scale },
							]}>
							{nodes.map((n) => (
								<Rect
									key={n.id}
									x={n.x}
									y={n.y}
									width={NODE_W}
									height={NODE_H}
									color="#1e293b"
								/>
							))}
						</Group>
					</Canvas>
					{nodes.map((n) => (
						<NodeCard
							key={n.id}
							node={n}
							screenX={n.x * vp.scale + vp.tx}
							screenY={n.y * vp.scale + vp.ty}
							onRun={onRun}
						/>
					))}
				</View>
			</GestureDetector>
		</GestureHandlerRootView>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1 },
});
