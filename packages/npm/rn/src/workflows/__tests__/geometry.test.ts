import { describe, it, expect } from 'vitest';
import { screenToWorld, nodeAtPoint, NODE_W, NODE_H } from '../geometry';
import type { WorkflowNode } from '../types';

const mk = (id: string, x: number, y: number): WorkflowNode => ({
	id,
	backend: 'edge',
	ref: 'r',
	x,
	y,
	status: 'idle',
	result: null,
});

describe('geometry', () => {
	it('screenToWorld inverts pan and scale', () => {
		const w = screenToWorld(120, 80, { tx: 20, ty: 10, scale: 2 });
		expect(w.x).toBe(50);
		expect(w.y).toBe(35);
	});

	it('nodeAtPoint hits inside a node box', () => {
		const nodes = [mk('a', 0, 0)];
		const hit = nodeAtPoint(nodes, 10, 10);
		expect(hit?.id).toBe('a');
	});

	it('nodeAtPoint misses outside every node', () => {
		const nodes = [mk('a', 0, 0)];
		expect(nodeAtPoint(nodes, NODE_W + 5, NODE_H + 5)).toBeNull();
	});

	it('nodeAtPoint returns topmost (last) on overlap', () => {
		const nodes = [mk('a', 0, 0), mk('b', 10, 10)];
		expect(nodeAtPoint(nodes, 15, 15)?.id).toBe('b');
	});
});
