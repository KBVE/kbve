import type {
	BackendValue,
	NodeStatusValue,
} from './generated/workflow-schema';

export type Backend = BackendValue;
export type NodeStatus = NodeStatusValue;

export type {
	WorkflowDef,
	WorkflowTierValue,
} from './generated/workflow-schema';

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
