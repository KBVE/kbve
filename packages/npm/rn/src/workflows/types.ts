import type {
	BackendValue,
	NodeStatusValue,
	SurfaceValue,
} from './generated/workflow-schema';

export type Backend = BackendValue;
export type NodeStatus = NodeStatusValue;
export type Surface = SurfaceValue;

export type {
	WorkflowDef,
	WorkflowTierValue,
	SurfaceValue,
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
