import { describe, it, expect } from 'vitest';
import { createWorkflowsStore } from '../store';

describe('workflows store', () => {
	it('adds a node with defaults', () => {
		const s = createWorkflowsStore();
		const id = s.addNode({ backend: 'edge', ref: 'health', x: 10, y: 20 });
		const n = s.get().nodes[id];
		expect(n.status).toBe('idle');
		expect(n.result).toBeNull();
		expect(s.get().order).toEqual([id]);
	});

	it('moves a node', () => {
		const s = createWorkflowsStore();
		const id = s.addNode({ backend: 'windmill', ref: 'u/x/f', x: 0, y: 0 });
		s.moveNode(id, 100, 50);
		expect(s.get().nodes[id].x).toBe(100);
		expect(s.get().nodes[id].y).toBe(50);
	});

	it('sets status and result', () => {
		const s = createWorkflowsStore();
		const id = s.addNode({ backend: 'edge', ref: 'health', x: 0, y: 0 });
		s.setStatus(id, 'ok', '{"ok":true}');
		expect(s.get().nodes[id].status).toBe('ok');
		expect(s.get().nodes[id].result).toBe('{"ok":true}');
	});

	it('notifies subscribers on change', () => {
		const s = createWorkflowsStore();
		let calls = 0;
		s.subscribe(() => {
			calls++;
		});
		s.addNode({ backend: 'edge', ref: 'health', x: 0, y: 0 });
		expect(calls).toBe(1);
	});
});
