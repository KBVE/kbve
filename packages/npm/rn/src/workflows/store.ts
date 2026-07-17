import type { Backend, WorkflowNode, WorkflowsState } from './types';

export interface WorkflowsStore {
	get: () => WorkflowsState;
	subscribe: (fn: () => void) => () => void;
	addNode: (p: {
		backend: Backend;
		ref: string;
		x: number;
		y: number;
	}) => string;
	moveNode: (id: string, x: number, y: number) => void;
	setStatus: (
		id: string,
		status: WorkflowNode['status'],
		result?: string | null,
	) => void;
	nodes: () => WorkflowNode[];
}

let counter = 0;
function nextId(): string {
	counter += 1;
	return `n${counter}`;
}

export function createWorkflowsStore(): WorkflowsStore {
	let state: WorkflowsState = { nodes: {}, order: [] };
	const listeners = new Set<() => void>();

	const emit = () => {
		for (const fn of listeners) fn();
	};

	return {
		get: () => state,
		subscribe: (fn) => {
			listeners.add(fn);
			return () => listeners.delete(fn);
		},
		addNode: ({ backend, ref, x, y }) => {
			const id = nextId();
			const node: WorkflowNode = {
				id,
				backend,
				ref,
				x,
				y,
				status: 'idle',
				result: null,
			};
			state = {
				nodes: { ...state.nodes, [id]: node },
				order: [...state.order, id],
			};
			emit();
			return id;
		},
		moveNode: (id, x, y) => {
			const prev = state.nodes[id];
			if (!prev) return;
			state = {
				...state,
				nodes: { ...state.nodes, [id]: { ...prev, x, y } },
			};
			emit();
		},
		setStatus: (id, status, result = null) => {
			const prev = state.nodes[id];
			if (!prev) return;
			state = {
				...state,
				nodes: { ...state.nodes, [id]: { ...prev, status, result } },
			};
			emit();
		},
		nodes: () => state.order.map((id) => state.nodes[id]),
	};
}
