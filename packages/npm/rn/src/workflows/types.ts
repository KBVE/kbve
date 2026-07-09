export type Backend = 'edge' | 'firecracker' | 'windmill';
export type NodeStatus = 'idle' | 'running' | 'ok' | 'err';

export interface WorkflowNode {
	id: string;
	backend: Backend;
	ref: string;
	x: number;
	y: number;
	status: NodeStatus;
	result: string | null;
}

export interface WorkflowsState {
	nodes: Record<string, WorkflowNode>;
	order: string[];
}
