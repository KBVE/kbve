import type { WorkflowNode } from './types';

export interface Viewport {
	tx: number;
	ty: number;
	scale: number;
}

export const NODE_W = 160;
export const NODE_H = 64;

export function screenToWorld(
	px: number,
	py: number,
	vp: Viewport,
): { x: number; y: number } {
	return { x: (px - vp.tx) / vp.scale, y: (py - vp.ty) / vp.scale };
}

export function nodeAtPoint(
	nodes: WorkflowNode[],
	worldX: number,
	worldY: number,
): WorkflowNode | null {
	for (let i = nodes.length - 1; i >= 0; i--) {
		const n = nodes[i];
		if (
			worldX >= n.x &&
			worldX <= n.x + NODE_W &&
			worldY >= n.y &&
			worldY <= n.y + NODE_H
		) {
			return n;
		}
	}
	return null;
}
