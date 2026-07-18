import { WorkflowDefSchema } from './generated/workflow-schema';
import type { WorkflowDef } from './generated/workflow-schema';

export const WORKFLOWS: readonly WorkflowDef[] = [
	{
		key: 'poem',
		backend: 'windmill',
		path: 'f/web/poem',
		tier: 'user',
		surface: 'web',
		label: 'Poem',
	},
].map((w) => WorkflowDefSchema.parse(w));

export function workflowByKey(key: string): WorkflowDef | undefined {
	return WORKFLOWS.find((w) => w.key === key);
}
